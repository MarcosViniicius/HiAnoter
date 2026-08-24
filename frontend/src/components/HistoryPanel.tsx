
import {
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  History,
  RotateCcw,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { useRecordingHistory, useSelectVersion } from "@/hooks/queries";
import { Button } from "./ui/button";
import { formatDate, formatDuration, formatCost } from "@/lib/format";
import { SUMMARY_STYLES } from "./SummaryStyleSelector";
import type { Recording } from "@/types";

export function HistoryPanel({
  recording,
  onGenerateSummaryForVersion,
  onOpenTranscribeModal,
}: {
  recording: Recording;
  onGenerateSummaryForVersion?: (transcriptionId: string) => void;
  onOpenTranscribeModal?: () => void;
}) {
  const { data: history } = useRecordingHistory(recording.id);
  const selectVersion = useSelectVersion();

  const transcriptions = history?.transcriptions || recording.transcription_versions || [];
  const summaries = history?.summaries || recording.summary_versions || [];

  const handleSetActiveTranscription = (transcriptionId: string) => {
    selectVersion.mutate({
      id: recording.id,
      transcriptionId,
    });
  };

  const handleSetActiveSummary = (summaryId: string) => {
    selectVersion.mutate({
      id: recording.id,
      summaryId,
    });
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h3 className="text-base font-semibold text-ink flex items-center gap-2">
            <History className="h-5 w-5 text-accent" />
            Histórico de Processamentos
          </h3>
          <p className="text-xs text-ink-soft mt-0.5">
            Consulte versões anteriores de transcrições e resumos gerados para este áudio.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenTranscribeModal && (
            <Button variant="surface" size="sm" onClick={onOpenTranscribeModal} className="text-xs">
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Transcrever Novamente
            </Button>
          )}
        </div>
      </div>

      {/* Grid: Transcrições vs Resumos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna 1: Transcrições */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-ink flex items-center gap-1.5">
              <ScrollText className="h-4 w-4 text-accent" />
              Transcrições ({transcriptions.length})
            </h4>
          </div>

          {transcriptions.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface p-4 text-center text-xs text-ink-faint">
              Nenhuma versão de transcrição registrada.
            </div>
          ) : (
            <div className="space-y-3">
              {transcriptions.map((tv) => {
                const isActive = (history?.active_transcription_id || recording.active_transcription_id) === tv.id;
                return (
                  <div
                    key={tv.id}
                    className={`rounded-2xl border p-4 transition-all ${
                      isActive
                        ? "border-accent bg-accent-soft/40 shadow-soft"
                        : "border-line bg-surface hover:border-accent/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface2 font-mono text-xs font-bold text-ink">
                          v{tv.version_number}
                        </span>
                        {isActive && (
                          <span className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Ativa
                          </span>
                        )}
                        <span className="rounded-md bg-surface2 px-2 py-0.5 font-mono text-[10px] uppercase text-ink-soft">
                          {tv.engine === "openrouter" ? "Nuvem (OpenRouter)" : "Local Whisper"}
                        </span>
                      </div>

                      <span className="text-[11px] text-ink-faint flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(tv.created_at)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-soft">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-ink-faint" />
                        {formatDuration(tv.duration_seconds)}
                      </span>
                      <span className="flex items-center gap-1 font-mono text-[11px]">
                        <Cpu className="h-3.5 w-3.5 text-ink-faint" />
                        {tv.model_name}
                      </span>
                    </div>

                    {tv.raw_transcript && (
                      <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-ink-soft bg-surface2/50 rounded-lg p-2">
                        {tv.raw_transcript}
                      </p>
                    )}

                    <div className="mt-3.5 flex items-center justify-end gap-2 pt-2 border-t border-line/60">
                      {!isActive && (
                        <Button
                          variant="surface"
                          size="sm"
                          onClick={() => handleSetActiveTranscription(tv.id)}
                          loading={selectVersion.isPending}
                          className="text-xs"
                        >
                          Definir como Ativa
                        </Button>
                      )}
                      {onGenerateSummaryForVersion && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => onGenerateSummaryForVersion(tv.id)}
                          className="text-xs"
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          Gerar Resumo desta Versão
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Coluna 2: Resumos */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-ink flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-accent" />
              Resumos ({summaries.length})
            </h4>
          </div>

          {summaries.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface p-4 text-center text-xs text-ink-faint">
              Nenhum resumo gerado ainda. Clique na aba Resumo para criar o primeiro.
            </div>
          ) : (
            <div className="space-y-3">
              {summaries.map((sv) => {
                const isActive = (history?.active_summary_id || recording.active_summary_id) === sv.id;
                const styleObj = SUMMARY_STYLES.find((st) => st.id === sv.style);
                const sourceTv = transcriptions.find((t) => t.id === sv.transcription_version_id);

                return (
                  <div
                    key={sv.id}
                    className={`rounded-2xl border p-4 transition-all ${
                      isActive
                        ? "border-accent bg-accent-soft/40 shadow-soft"
                        : "border-line bg-surface hover:border-accent/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface2 font-mono text-xs font-bold text-ink">
                          v{sv.version_number}
                        </span>
                        {isActive && (
                          <span className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Ativo
                          </span>
                        )}
                        <span className="rounded-md bg-surface2 px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                          {styleObj?.title || sv.style}
                        </span>
                      </div>

                      <span className="text-[11px] text-ink-faint flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(sv.created_at)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-soft">
                      {sourceTv && (
                        <span className="rounded bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                          Transcrição v{sourceTv.version_number}
                        </span>
                      )}
                      {sv.llm_cost_usd != null && (
                        <span className="font-mono text-[11px] text-ink-faint">
                          {formatCost(sv.llm_cost_usd)}
                        </span>
                      )}
                    </div>

                    {sv.summary_markdown && (
                      <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-ink-soft bg-surface2/50 rounded-lg p-2">
                        {sv.summary_markdown.replace(/[#*`_]/g, "")}
                      </p>
                    )}

                    <div className="mt-3.5 flex items-center justify-end gap-2 pt-2 border-t border-line/60">
                      {!isActive && (
                        <Button
                          variant="surface"
                          size="sm"
                          onClick={() => handleSetActiveSummary(sv.id)}
                          loading={selectVersion.isPending}
                          className="text-xs"
                        >
                          Definir como Ativo
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
