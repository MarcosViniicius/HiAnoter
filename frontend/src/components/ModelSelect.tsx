import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, RefreshCw, Search } from "lucide-react";
import { useOpenRouterModels } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import { Skeleton } from "./ui/skeleton";

function fmtContext(ctx: number | null): string {
  if (!ctx) return "";
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1)}M`;
  if (ctx >= 1_000) return `${(ctx / 1_000).toFixed(0)}k`;
  return String(ctx);
}

export function ModelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useOpenRouterModels(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const allModels = data?.models ?? [];

  const models = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? allModels.filter(
          (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
        )
      : allModels;
    return filtered.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 120);
  }, [allModels, query]);

  const exact = allModels.find((m) => m.id === value);
  const isCustom = !!value && !exact;
  const selectedLabel = exact ? exact.name : isCustom ? value : "Nenhum modelo";

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-1.5">
        <div
          className="relative flex-1 cursor-pointer rounded-lg border border-line bg-paper shadow-soft focus-within:border-accent"
          onClick={() => setOpen((o) => !o)}
        >
          <div className="flex h-9 items-center gap-2 px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
            <span className={cn("flex-1 truncate text-[13px]", isCustom ? "text-accent-deep" : value ? "text-ink" : "text-ink-faint")}>
              {selectedLabel}
              {isCustom && <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-accent-deep/80">personalizado</span>}
            </span>
            {isFetching ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-ink-faint" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-ink-faint" />
            )}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
            placeholder="Buscar modelo…"
            className="sr-only"
            aria-label="Buscar modelo no OpenRouter"
          />
        </div>

        <button
          onClick={() => refetch()}
          title="Atualizar lista de modelos"
          aria-label="Atualizar lista de modelos"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-faint transition-colors hover:border-accent/50 hover:text-accent"
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </button>
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-[65] mt-1.5 overflow-hidden rounded-lg border border-line bg-surface shadow-raise">
          <div className="border-b border-line px-3 py-2">
            <Search className="pointer-events-none absolute" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar modelo…  (ex: claude, gpt, gemini)"
              className="w-full bg-transparent px-6 text-[13px] text-ink placeholder:text-ink-faint2 focus:outline-none"
            />
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {isLoading && (
              <div className="space-y-1 p-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full rounded-md" />
                ))}
              </div>
            )}

            {isError && (
              <div className="px-3 py-4 text-center">
                <p className="text-[12px] text-danger-fg">{error?.message ?? "Falha ao carregar modelos."}</p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  Confirme a chave do OpenRouter em Configurações.
                </p>
              </div>
            )}

            {!isLoading && !isError && models.length === 0 && query.trim() !== "" && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(query.trim());
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-accent-deep hover:bg-accent-soft"
              >
                Usar modelo personalizado: <span className="font-mono">{query.trim()}</span>
              </button>
            )}

            {!isLoading && !isError && models.map((m) => (
              <button
                key={m.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(m.id);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-accent-soft/60",
                  m.id === value && "bg-accent-soft",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{m.name}</span>
                  <span className="block truncate font-mono text-[11px] text-ink-faint">{m.id}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[10px] text-ink-faint">
                  {fmtPricing(m.pricing) && (
                    <span className="font-mono tabular-nums">{fmtPricing(m.pricing)}</span>
                  )}
                  {m.context && <span className="font-mono tabular-nums">{fmtContext(m.context)}</span>}
                </span>
              </button>
            ))}

            {!isLoading && !isError && models.length === 0 && query.trim() === "" && (
              <div className="px-3 py-4 text-center text-[12px] text-ink-faint">
                Nenhum modelo disponível. Rode o refresh ou confira a chave.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtPricing(pricing: Record<string, string> | undefined): string | null {
  if (!pricing) return null;
  const prompt = pricing["prompt"];
  if (prompt == null) return null;
  const v = parseFloat(prompt);
  if (Number.isNaN(v)) return null;
  if (v === 0) return "grátis";
  return `$${(v * 1_000_000).toFixed(2)}/M`;
}