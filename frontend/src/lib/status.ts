import type { NotionExportStatus, RecordingStatus } from "@/types";

export type StatusTone = "neutral" | "accent" | "success" | "danger" | "warn";

export interface StatusMeta {
  label: string;
  tone: StatusTone;
  pulse?: boolean;
  /** descrição curta de contexto para tooltips/aria */
  description?: string;
}

export const STATUS_META: Record<RecordingStatus, StatusMeta> = {
  DRAFT: { label: "Rascunho", tone: "neutral", description: "Salvo para processar sob demanda." },
  QUEUED: { label: "Na fila", tone: "warn", description: "Aguardando vaga na fila de transcrição (1 por vez)." },
  TRANSCRIBING: { label: "Transcrevendo", tone: "accent", pulse: true, description: "Whisper local em execução." },
  SUMMARIZING: { label: "Resumindo", tone: "accent", pulse: true, description: "Gerando resumo estruturado via OpenRouter." },
  COMPLETED: { label: "Concluída", tone: "success", description: "Transcrição e resumo prontos." },
  FAILED: { label: "Falha", tone: "danger", description: "Ocorreu um erro; use Tentar novamente." },
};

export const NOTION_STATUS_META: Record<NotionExportStatus, StatusMeta> = {
  NOT_EXPORTED: { label: "Não exportado", tone: "neutral" },
  EXPORTING: { label: "Exportando", tone: "accent", pulse: true },
  EXPORTED: { label: "Exportado", tone: "success" },
  FAILED: { label: "Exportação falhou", tone: "danger" },
};

export const ACTIVE_STATUSES: RecordingStatus[] = ["QUEUED", "TRANSCRIBING", "SUMMARIZING"];

export function isActive(status: RecordingStatus | undefined): boolean {
  return !!status && ACTIVE_STATUSES.includes(status);
}