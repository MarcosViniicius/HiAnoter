import { useMemo, useState } from "react";
import { Check, Search, Settings as SettingsIcon, Trash2, X } from "lucide-react";
import { useRecordings, useDeleteRecordings, useDeleteAllRecordings, useHealth } from "@/hooks/queries";
import { StatusBadge } from "./StatusBadge";
import { Logomark } from "./Logo";
import { Skeleton } from "./ui/skeleton";
import { UploadZone } from "./UploadZone";
import { isActive } from "@/lib/status";
import { formatDate, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Recording } from "@/types";

export function Sidebar({
  selectedId,
  onSelect,
  onOpenSettings,
  onDeleted,
  onCloseMobile,
  className,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenSettings: () => void;
  onDeleted?: (ids: string[]) => void;
  onCloseMobile?: () => void;
  className?: string;
}) {
  const health = useHealth();
  const { data: recordings, isLoading, isFetching } = useRecordings();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "COMPLETED" | "ACTIVE" | "DRAFT">("ALL");
  const [manage, setManage] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const delSelected = useDeleteRecordings();
  const delAll = useDeleteAllRecordings();

  const filtered = useMemo(() => {
    let list = recordings ?? [];

    if (statusFilter === "COMPLETED") {
      list = list.filter((r) => r.status === "COMPLETED");
    } else if (statusFilter === "ACTIVE") {
      list = list.filter((r) => isActive(r.status));
    } else if (statusFilter === "DRAFT") {
      list = list.filter((r) => r.status === "DRAFT");
    }

    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.original_filename.toLowerCase().includes(q) ||
        (r.summary_preview && r.summary_preview.toLowerCase().includes(q)),
    );
  }, [recordings, query, statusFilter]);

  const totalCount = recordings?.length ?? 0;
  const activeCount = (recordings ?? []).filter((r) => isActive(r.status)).length;
  const completedCount = (recordings ?? []).filter((r) => r.status === "COMPLETED").length;
  const draftCount = (recordings ?? []).filter((r) => r.status === "DRAFT").length;

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleItemClick = (id: string) => {
    if (manage) {
      toggleCheck(id);
    } else {
      onSelect(id);
      onCloseMobile?.();
    }
  };

  const checkedList = (recordings ?? []).filter((r) => checked.has(r.id)).map((r) => r.id);

  const removeChecked = () => {
    const ids = checkedList;
    if (!ids.length) return;
    if (!window.confirm(`Excluir ${ids.length} gravação(ões)? Apaga o áudio e a transcrição (sem volta).`)) return;
    delSelected.mutate(ids, {
      onSuccess: () => {
        setChecked(new Set());
        setManage(false);
        onDeleted?.(ids);
      },
    });
  };

  const removeAll = () => {
    const all = recordings ?? [];
    if (!all.length) return;
    if (!window.confirm(`Excluir TODAS (${all.length}) gravações? Apaga áudio e transcrição (sem volta).`)) return;
    delAll.mutate(undefined, {
      onSuccess: () => {
        setChecked(new Set());
        setManage(false);
        onDeleted?.(all.map((r) => r.id));
      },
    });
  };

  return (
    <aside className={cn("flex h-full w-full shrink-0 flex-col border-r border-night-line bg-night text-night-text", className)}>
      {/* -------------------------------------------- brand */}
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <div className="flex items-center gap-2.5">
          <Logomark />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-serif text-[17px] font-semibold tracking-tight text-night-text">
                HiAnoter
              </span>
              <span className="rounded border border-night-line px-1 py-px text-[9px] font-semibold uppercase tracking-[0.14em] text-night-muted">
                Lite
              </span>
            </div>
            <p className="truncate text-[11px] text-night-faint">
              Transcrição local · Resumo · Notion
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setManage((m) => !m);
              setChecked(new Set());
            }}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg transition-colors touch-tap",
              manage
                ? "bg-accent/20 text-accent-onDark"
                : "text-night-faint hover:bg-night-soft hover:text-night-text",
            )}
            aria-label="Gerenciar gravações"
            title="Gerenciar (selecionar/excluir)"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={onOpenSettings}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-night-faint transition-colors hover:bg-night-soft hover:text-night-text touch-tap"
            aria-label="Abrir configurações"
            title="Configurações"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="flex h-9 w-9 md:hidden items-center justify-center rounded-lg text-night-faint transition-colors hover:bg-night-soft hover:text-night-text touch-tap ml-1"
              aria-label="Fechar barra lateral"
              title="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* -------------------------------------------- upload */}
      <div className="px-4 pb-3">
        <UploadZone onCreated={onSelect} />
      </div>

      {/* -------------------------------------------- search */}
      <div className="px-4 pb-2 space-y-2">
        <div className="flex items-center gap-2 rounded-xl border border-night-line bg-night-soft px-2.5 transition-colors focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/30">
          <Search className="h-3.5 w-3.5 text-night-faint shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar gravações…"
            className="h-8 w-full bg-transparent text-[13px] text-night-text placeholder:text-night-faint focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-night-faint hover:text-night-text p-1"
              title="Limpar busca"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5 pb-1">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={cn(
              "rounded-lg px-2 py-1 text-[11px] font-medium transition-colors shrink-0",
              statusFilter === "ALL"
                ? "bg-accent text-white font-semibold"
                : "bg-night-soft text-night-faint hover:text-night-text",
            )}
          >
            Todas ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("COMPLETED")}
            className={cn(
              "rounded-lg px-2 py-1 text-[11px] font-medium transition-colors shrink-0",
              statusFilter === "COMPLETED"
                ? "bg-accent text-white font-semibold"
                : "bg-night-soft text-night-faint hover:text-night-text",
            )}
          >
            Concluídas ({completedCount})
          </button>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter("ACTIVE")}
              className={cn(
                "rounded-lg px-2 py-1 text-[11px] font-medium transition-colors shrink-0",
                statusFilter === "ACTIVE"
                  ? "bg-accent text-white font-semibold"
                  : "bg-night-soft text-accent-onDark hover:text-white",
              )}
            >
              Em Andamento ({activeCount})
            </button>
          )}
          {draftCount > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter("DRAFT")}
              className={cn(
                "rounded-lg px-2 py-1 text-[11px] font-medium transition-colors shrink-0",
                statusFilter === "DRAFT"
                  ? "bg-accent text-white font-semibold"
                  : "bg-night-soft text-night-faint hover:text-night-text",
              )}
            >
              Rascunhos ({draftCount})
            </button>
          )}
        </div>
      </div>

      {/* -------------------------------------------- manage bar */}
      {manage && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2">
          <span className="flex-1 text-[12px] font-medium text-accent-onDark">
            {checked.size} selecionada{checked.size === 1 ? "" : "s"}
          </span>
          <button
            onClick={removeChecked}
            disabled={checked.size === 0 || delSelected.isPending}
            className="flex items-center gap-1 rounded-md bg-danger-fg px-2.5 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {delSelected.isPending ? "…" : `Excluir (${checked.size})`}
          </button>
          <button
            onClick={removeAll}
            disabled={delAll.isPending}
            className="rounded-md border border-danger-line px-2.5 py-1.5 text-[11px] font-semibold text-danger-fg transition-colors hover:bg-danger-bg"
            title="Excluir todas as gravações"
          >
            {delAll.isPending ? "…" : "Excluir todas"}
          </button>
          <button
            onClick={() => {
              setManage(false);
              setChecked(new Set());
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-night-faint hover:text-night-text"
            aria-label="Sair do gerenciamento"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* -------------------------------------------- list */}
      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 pb-4 pt-2">
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[74px] rounded-xl bg-night-soft" />
          ))}

        {!isLoading && filtered.length === 0 && (
          <div className="px-4 pt-8 text-center">
            <p className="text-[13px] text-night-faint">
              {query ? "Nenhuma gravação encontrada." : "Nenhuma gravação ainda."}
            </p>
          </div>
        )}

        {filtered.map((rec) => (
          <RecordingRow
            key={rec.id}
            rec={rec}
            selected={!manage && rec.id === selectedId}
            checkable={manage}
            checked={checked.has(rec.id)}
            onToggle={() => handleItemClick(rec.id)}
          />
        ))}
      </div>

      {/* -------------------------------------------- footer */}
      <div className="flex items-center justify-between border-t border-night-line px-5 py-3">
        <span className="text-[10px] uppercase tracking-[0.12em] text-night-faint">
          {isFetching ? "sincronizando…" : "tudo em dia"}
        </span>
        <span className="font-mono text-[10px] text-night-faint">
          {health.data ? `v${health.data.version}` : "v3"}
        </span>
      </div>
    </aside>
  );
}

function RecordingRow({
  rec,
  selected,
  checkable,
  checked,
  onToggle,
}: {
  rec: Recording;
  selected: boolean;
  checkable: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const active = isActive(rec.status);
  return (
    <button
      onClick={onToggle}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group relative w-full rounded-xl px-3 py-2.5 text-left transition-colors duration-200",
        selected ? "bg-night-soft ring-1 ring-inset ring-accent/50" : "hover:bg-night-soft/60",
      )}
    >
      {selected && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent" />}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-[13px] font-medium transition-colors flex items-center gap-1.5",
              checked ? "text-accent-onDark" : selected ? "text-night-text" : "text-night-text/90 group-hover:text-night-text",
            )}
          >
            {rec.icon && <span className="shrink-0 text-xs">{rec.icon}</span>}
            <span className="truncate">{rec.title}</span>
          </p>
          <p className="mt-0.5 truncate text-[11px] text-night-faint">
            {rec.original_filename || "áudio"}
            {rec.duration_seconds > 0 ? ` · ${formatDuration(rec.duration_seconds)}` : ""}
            {rec.documents_count ? ` · ${rec.documents_count} doc(s)` : ""}
          </p>
        </div>
        {checkable ? (
          <span
            className={cn(
              "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
              checked ? "border-accent bg-accent text-white" : "border-night-line bg-night-soft text-transparent",
            )}
          >
            <Check className="h-3 w-3" />
          </span>
        ) : (
          <StatusBadge status={rec.status} className="shrink-0" />
        )}
      </div>

      {active && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-night-line">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${rec.progress_pct}%` }}
          />
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        {rec.summary_preview ? (
          <p className="min-w-0 flex-1 truncate text-[11px] text-night-faint/90">
            {rec.summary_preview}
          </p>
        ) : (
          <span className="flex-1" />
        )}
        {active ? (
          <MiniWave active className="shrink-0" />
        ) : (
          <span className="shrink-0 text-[10px] tabular-nums text-night-faint">
            {formatDate(rec.created_at)}
          </span>
        )}
      </div>
    </button>
  );
}

function MiniWave({ active, className }: { active: boolean; className?: string }) {
  const bars = [0.4, 0.75, 1, 0.55, 0.85, 0.5];
  return (
    <span aria-hidden="true" className={cn("flex h-3 items-end gap-[2px]", className)}>
      {bars.map((h, i) => (
        <span
          key={i}
          className={cn(
            "w-[2.5px] rounded-full",
            active ? "animate-wave bg-accent-onDark" : "bg-night-muted/70",
          )}
          style={{
            height: `${h * 100}%`,
            animationDelay: active ? `${i * 0.12}s` : undefined,
          }}
        />
      ))}
    </span>
  );
}