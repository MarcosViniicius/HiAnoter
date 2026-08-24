import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  BrainCircuit,
  Clock,
  FileAudio,
  FileText,
  History,
  Hourglass,
  Play,
  RefreshCw,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { useProcessRecording, useRecording, useRetryRecording } from "@/hooks/queries";
import { useRecordingLive } from "@/hooks/useRecordingLive";
import { StatusBadge } from "./StatusBadge";
import { Player } from "./Player";
import { SummaryPanel } from "./SummaryPanel";
import { TranscriptPanel } from "./TranscriptPanel";
import { HistoryPanel } from "./HistoryPanel";
import { TranscribeModal } from "./TranscribeModal";
import { ContextDocumentsPanel } from "./ContextDocumentsPanel";
import { MindmapPanel } from "./MindmapPanel";
import { SUMMARY_STYLES, SummaryStyleSelector } from "./SummaryStyleSelector";
import { Tabs, type TabDef } from "./ui/tabs";
import { ErrorBoundary } from "./ui/error-boundary";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Skeleton } from "./ui/skeleton";
import { formatDate, formatDuration } from "@/lib/format";
import type { Recording, SummaryStyle } from "@/types";

export function DetailView({
  recordingId,
  onBack,
  onOpenSettings,
}: {
  recordingId: string;
  onBack?: () => void;
  onOpenSettings?: () => void;
}) {
  const { data: recording, isLoading, error } = useRecording(recordingId);
  const status = (recording?.status || "").toUpperCase();
  useRecordingLive(recordingId, true);

  const isMaterialsSession = recording?.execution_mode === "MATERIALS";
  const hasSummary = Boolean(recording?.summary_markdown?.trim());
  const [tab, setTab] = useState<string>("resumo");
  const [targetTranscriptionId, setTargetTranscriptionId] = useState<string | undefined>(undefined);
  const [transcribeModalOpen, setTranscribeModalOpen] = useState(false);
  const autoSwitchedRef = useRef(false);

  const docsCount = recording?.documents?.length ?? recording?.documents_count ?? 0;

  const tabs: TabDef[] = useMemo(() => [
    { id: "resumo", label: "Resumo", icon: <FileText className="h-4 w-4" /> },
    { id: "mapa_mental", label: "Mapa Mental", icon: <BrainCircuit className="h-4 w-4" /> },
    { id: "transcricao", label: "Transcrição", icon: <ScrollText className="h-4 w-4" /> },
    { id: "historico", label: "Histórico", icon: <History className="h-4 w-4" /> },
    {
      id: "contexto",
      label: docsCount > 0 ? `Documentos (${docsCount})` : "Documentos",
      icon: <Sparkles className="h-4 w-4" />,
    },
  ], [docsCount]);

  // Mantém a aba Resumo como inicial por padrão, permitindo troca livre
  useEffect(() => {
    if (recording && !recording.summary_markdown?.trim() && recording.raw_transcript?.trim() && !autoSwitchedRef.current && recording.execution_mode !== "MATERIALS") {
      setTab("transcricao");
      autoSwitchedRef.current = true;
    }
  }, [recording?.id, recording?.summary_markdown, recording?.raw_transcript, recording?.execution_mode]);

  if (isLoading || !recording) return <DetailSkeleton onBack={onBack} />;
  if (error)
    return (
      <div className="flex h-full items-center justify-center px-4 py-8">
        <div className="max-w-sm text-center">
          <p className="text-sm text-ink-soft">
            Não foi possível carregar esta gravação. Ela pode ter sido apagada.
          </p>
          {onBack && (
            <Button variant="surface" size="sm" onClick={onBack} className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar para a lista
            </Button>
          )}
        </div>
      </div>
    );

  const isDraft = status === "DRAFT";
  const isFailed = status === "FAILED";
  const isInitialTranscribing = ["TRANSCRIBING", "QUEUED"].includes(status);
  const isInitialMaterialsSummarizing = status === "SUMMARIZING" && isMaterialsSession && !hasSummary;
  const hasAudio = Boolean(recording.duration_seconds > 0 && !isMaterialsSession);

  return (
    <div className="w-full max-w-4xl mx-auto px-2.5 py-3 sm:px-6 sm:py-6 lg:px-8 space-y-4 sm:space-y-6 animate-fade-in">
      <DetailHeader recording={recording} />

      <div className="space-y-4 sm:space-y-6">
        {/* Rascunho / Deferido */}
        {isDraft && <DraftState recording={recording} />}

        {/* Estados em andamento de áudio inicial ou sessão de materiais inicial */}
        {status === "TRANSCRIBING" && <Transcribing recording={recording} />}
        {status === "QUEUED" && <Queued />}
        {isInitialMaterialsSummarizing && <Summarizing recording={recording} />}
        {isFailed && <Failed recording={recording} />}

        {/* Conteúdo Concluído ou em fase de Resumo (Player + Abas Completas) */}
        {!isDraft && !isInitialTranscribing && !isFailed && (
          <div className="space-y-4 sm:space-y-6">
            {hasAudio && (
              <Player recordingId={recording.id} duration={recording.duration_seconds} />
            )}
            <Tabs
              tabs={tabs}
              value={tab}
              onChange={setTab}
              className="sticky top-0 z-sticky -mx-1 sm:-mx-2 bg-paper/95 px-1 sm:px-2 backdrop-blur-md pt-1"
            />
            <ErrorBoundary fallbackTitle="Erro ao exibir esta aba">
              {tab === "resumo" && (
                <div className="animate-fade-in">
                  <SummaryPanel
                    recording={recording}
                    initialTranscriptionId={targetTranscriptionId}
                    onOpenHistory={() => setTab("historico")}
                    onOpenDocuments={() => setTab("contexto")}
                  />
                </div>
              )}
              {tab === "mapa_mental" && (
                <div className="animate-fade-in">
                  <MindmapPanel recording={recording} />
                </div>
              )}
              {tab === "transcricao" && (
                <div className="animate-fade-in">
                  <TranscriptPanel
                    recording={recording}
                    onOpenHistory={() => setTab("historico")}
                  />
                </div>
              )}
              {tab === "historico" && (
                <div className="animate-fade-in">
                  <HistoryPanel
                    recording={recording}
                    onOpenTranscribeModal={() => setTranscribeModalOpen(true)}
                    onGenerateSummaryForVersion={(tvId) => {
                      setTargetTranscriptionId(tvId);
                      setTab("resumo");
                    }}
                  />
                </div>
              )}
              {tab === "contexto" && (
                <div className="animate-fade-in">
                  <ContextDocumentsPanel
                    recordingId={recording.id}
                    documents={recording.documents ?? []}
                  />
                </div>
              )}
            </ErrorBoundary>
          </div>
        )}

        {/* Painel de Documentos Visível em Andamento Inicial ou Falha */}
        {(isInitialTranscribing || isFailed) && (
          <ContextDocumentsPanel
            recordingId={recording.id}
            documents={recording.documents ?? []}
          />
        )}
      </div>

      <TranscribeModal
        recordingId={recording.id}
        open={transcribeModalOpen}
        onClose={() => setTranscribeModalOpen(false)}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- header */

function DetailHeader({
  recording,
}: {
  recording: Recording;
}) {
  const styleMeta =
    SUMMARY_STYLES.find((s) => s.id === (recording.summary_style || "ABSTRACT")) ??
    SUMMARY_STYLES[0];

  return (
    <header className="rounded-2xl sm:rounded-3xl border border-line bg-surface/85 p-3.5 sm:p-6 lg:p-7 shadow-soft backdrop-blur-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2.5">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <StatusBadge status={recording.status} withDescription />
          <span className="rounded-full border border-line bg-subtle/80 px-2 py-0.5 font-mono text-[10px] sm:text-[10.5px] font-semibold text-ink-soft">
            {styleMeta.title}
          </span>
          {recording.retry_count > 0 && (
            <span className="rounded-full bg-subtle px-2 py-0.5 font-mono text-[10px] sm:text-[10.5px] tabular-nums text-ink-soft">
              {recording.retry_count} tent.
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] sm:text-xs text-ink-faint">{formatDate(recording.created_at)}</span>
      </div>

      <h1 className="font-serif text-xl sm:text-2xl lg:text-[30px] font-bold leading-snug tracking-tight text-ink break-words flex items-start sm:items-center gap-2">
        {recording.icon && <span className="shrink-0 text-xl sm:text-2xl mt-0.5 sm:mt-0">{recording.icon}</span>}
        <span className="flex-1 min-w-0">{recording.title}</span>
      </h1>

      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 text-xs text-ink-soft pt-0.5">
        <span className="inline-flex items-center gap-1.5 rounded-lg sm:rounded-xl border border-line bg-surface2 px-2 py-1 max-w-full text-[11px] sm:text-xs">
          {recording.execution_mode === "MATERIALS" ? (
            <>
              <BookOpen className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span className="truncate">Estudo por Materiais</span>
            </>
          ) : (
            <>
              <FileAudio className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span className="truncate">{recording.original_filename}</span>
            </>
          )}
        </span>
        {recording.duration_seconds > 0 && (
          <span className="inline-flex items-center gap-1 rounded-lg sm:rounded-xl border border-line bg-surface2 px-2 py-1 font-mono font-semibold tabular-nums text-ink text-[11px] sm:text-xs">
            <Clock className="h-3 w-3 text-ink-faint" />
            {formatDuration(recording.duration_seconds)}
          </span>
        )}
        {(recording.documents?.length ?? recording.documents_count ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1 rounded-lg sm:rounded-xl border border-accent/20 bg-accent/5 px-2 py-1 font-medium text-accent text-[11px] sm:text-xs">
            <Sparkles className="h-3 w-3" />
            {recording.documents?.length ?? recording.documents_count} anexo(s)
          </span>
        )}
        {recording.llm_cost_usd != null && (
          <span className="rounded-xl border border-line bg-surface2 px-2.5 py-1 font-mono text-[11px] tabular-nums text-ink-faint">
            LLM ≈ US$ {recording.llm_cost_usd.toFixed(4)}
          </span>
        )}
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------- states */

function DraftState({ recording }: { recording: Recording }) {
  const processMutation = useProcessRecording();
  const [style, setStyle] = useState<SummaryStyle>(
    (recording.summary_style as SummaryStyle) || "ABSTRACT",
  );

  const handleStart = () => {
    processMutation.mutate({
      id: recording.id,
      summaryStyle: style,
    });
  };

  return (
    <section className="space-y-4 sm:space-y-5 rounded-2xl border border-line bg-surface p-4 sm:p-7 shadow-soft">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-subtle text-ink-soft">
              <Clock className="h-4 w-4" />
            </span>
            <h3 className="text-base font-semibold text-ink">Gravação em Rascunho</h3>
          </div>
          <p className="mt-1 text-xs sm:text-[13px] leading-relaxed text-ink-soft">
            O áudio e os documentos estão salvos no seu dispositivo. Escolha o formato desejado e
            inicie o processamento quando quiser.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={handleStart}
          loading={processMutation.isPending}
          className="w-full sm:w-auto shrink-0 font-medium justify-center"
        >
          <Play className="h-4 w-4 fill-current" />
          Processar Agora
        </Button>
      </div>

      <div className="pt-2 border-t border-line/60">
        <SummaryStyleSelector value={style} onChange={setStyle} />
      </div>

      <div className="pt-2 border-t border-line/60">
        <ContextDocumentsPanel
          recordingId={recording.id}
          documents={recording.documents ?? []}
        />
      </div>
    </section>
  );
}

function Transcribing({ recording }: { recording: Recording }) {
  const pct = recording.progress_pct ?? 0;
  const isCloud = recording.transcription_provider === "openrouter";
  const modelName = isCloud
    ? (recording.whisper_model || "openai/whisper-large-v3-turbo")
    : (recording.whisper_model || "Whisper Local");

  return (
    <section
      role="status"
      className="rounded-3xl border border-accent-line bg-accent-soft/40 p-6 sm:p-7 shadow-soft space-y-4 animate-fade-in"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-soft">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-2xl bg-accent opacity-40" />
            <Sparkles className="h-5 w-5 animate-pulse" />
          </span>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-ink flex items-center gap-2">
              <span>{isCloud ? "Transcrevendo via Nuvem" : "Transcrevendo Localmente"}</span>
              <span className="rounded-md bg-accent/20 px-2 py-0.5 font-mono text-[10px] sm:text-[11px] font-semibold text-accent-deep">
                {modelName}
              </span>
            </h3>
            <p className="text-xs text-ink-soft mt-0.5">
              {pct < 25
                ? "Lendo e preparando fluxo de áudio…"
                : pct < 85
                ? "Decodificando fala e alinhando pontuação com IA…"
                : "Finalizando transcrição e gerando marcadores de tempo…"}
            </p>
          </div>
        </div>

        <div className="flex items-baseline gap-1 self-end sm:self-center font-mono">
          <span className="text-2xl font-bold tabular-nums text-accent-deep">{pct}</span>
          <span className="text-xs text-accent-deep font-semibold">%</span>
        </div>
      </div>

      <Progress value={pct} tone="accent" className="h-2.5 rounded-full" />

      <div className="flex items-center justify-between pt-1 text-[11px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="flex h-2 w-2 rounded-full bg-accent animate-ping" />
          {isCloud ? "Processamento acelerado por OpenRouter" : "Processamento 100% privado no dispositivo"}
        </span>
        <span className="font-mono">{pct === 100 ? "Concluindo…" : "Em andamento"}</span>
      </div>
    </section>
  );
}

function Queued() {
  return (
    <section className="flex items-start gap-4 rounded-3xl border border-warn-line bg-warn-bg/60 p-5 sm:p-6 shadow-soft animate-fade-in">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-warn-fg/15 text-warn-fg shadow-sm">
        <Hourglass className="h-4 w-4 animate-spin" />
      </span>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-warn-fg">Aguardando na Fila de Processamento</h3>
          <span className="rounded-full bg-warn-fg/20 px-2 py-0.5 text-[10px] font-bold uppercase text-warn-fg">
            Fila Ativa
          </span>
        </div>
        <p className="text-xs sm:text-[13px] leading-relaxed text-warn-fg/90">
          Existe outra gravação sendo processada no momento. Assim que a atual finalizar, esta gravação iniciará a transcrição de forma 100% automática.
        </p>
      </div>
    </section>
  );
}

function Summarizing({ recording }: { recording?: Recording }) {
  const [stepIndex, setStepIndex] = useState(0);
  const steps = [
    "Conectando ao modelo de inteligência artificial…",
    "Analisando transcrição e documentos de apoio…",
    "Estruturando seções conceituais, fórmulas e códigos…",
    "Extraindo tarefas, deliberações e mapa mental…",
    "Finalizando formatação do resumo em Markdown…",
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex((i) => (i < steps.length - 1 ? i + 1 : i));
    }, 2800);
    return () => clearInterval(timer);
  }, [steps.length]);

  return (
    <section className="rounded-3xl border border-accent/40 bg-accent-soft/30 p-6 sm:p-8 shadow-soft animate-fade-in space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-soft">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-2xl bg-accent opacity-40" />
            <Sparkles className="h-5 w-5 animate-pulse" />
          </span>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-ink flex items-center gap-2">
              <span>Gerando Resumo Inteligente com IA</span>
              {recording?.summary_style && (
                <span className="rounded-md bg-accent/20 px-2 py-0.5 font-mono text-[10px] sm:text-[11px] font-semibold text-accent-deep">
                  {recording.summary_style}
                </span>
              )}
            </h3>
            <p className="text-xs text-ink-soft mt-0.5 min-h-[18px] transition-all duration-300">
              {steps[stepIndex]}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center font-mono text-xs font-semibold text-accent-deep">
          <span className="animate-pulse">Processando…</span>
        </div>
      </div>

      <div className="w-full overflow-hidden rounded-full bg-accent/20 h-2.5">
        <div
          className="h-full bg-accent transition-all duration-700 ease-out"
          style={{ width: `${Math.min(95, (stepIndex + 1) * 20)}%` }}
        />
      </div>

      <div className="flex items-center justify-between pt-1 text-[11px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="flex h-2 w-2 rounded-full bg-accent animate-ping" />
          Síntese com suporte a matemática e código em andamento
        </span>
        <span className="font-mono">Tempo estimado: 5-15s</span>
      </div>
    </section>
  );
}

function Failed({ recording }: { recording: Recording }) {
  const retry = useRetryRecording();
  return (
    <section className="rounded-2xl border border-danger-line bg-danger-bg p-5 sm:p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-fg/10 text-danger-fg">
          <AlertIcon />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm sm:text-[15px] font-semibold text-danger-fg">
            A gravação não pôde ser processada
          </p>
          <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-danger-fg/90">
            {recording.error_message || "Erro desconhecido durante o processamento."}
          </p>
          <Button
            className="mt-4 w-full sm:w-auto"
            variant="danger"
            onClick={() => retry.mutate(recording.id)}
            loading={retry.isPending}
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      </div>
    </section>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/* ---------------------------------------------------------------- loaders */

function DetailSkeleton({ onBack }: { onBack?: () => void }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-4 sm:px-8 sm:pt-8 sm:pb-16">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 md:hidden inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink shadow-soft"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Gravações</span>
        </button>
      )}
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="mt-4 h-8 w-3/5" />
      <Skeleton className="mt-3 h-4 w-1/3" />
      <div className="mt-8 space-y-4">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    </div>
  );
}