import { useMemo, useState } from "react";
import { Check, Copy, MessageSquareText, RotateCcw, Search, Sparkles } from "lucide-react";
import { EmptyState } from "./ui/empty-state";
import { Button } from "./ui/button";
import { formatTimestamp } from "@/lib/format";
import { TranscribeModal } from "./TranscribeModal";
import type { Recording } from "@/types";

export function TranscriptPanel({
  recording,
  onOpenHistory,
}: {
  recording: Recording;
  onOpenHistory?: () => void;
}) {
  const [transcribeModalOpen, setTranscribeModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const raw = (recording.raw_transcript ?? "").trim();
  const segments = recording.transcript_segments ?? [];
  const hasText = raw.length > 0 || segments.some((s) => (s.text ?? "").trim().length > 0);

  const activeTv = (recording.transcription_versions ?? []).find(
    (tv) => tv.id === recording.active_transcription_id,
  );

  const displayText = raw || segments.map((s) => s.text).join("\n");

  const wordCount = useMemo(() => {
    return displayText ? displayText.split(/\s+/).filter(Boolean).length : 0;
  }, [displayText]);

  const handleCopy = async () => {
    if (!displayText) return;
    try {
      await navigator.clipboard.writeText(displayText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return segments;
    const q = searchQuery.toLowerCase();
    return segments.filter((s) => (s.text || "").toLowerCase().includes(q));
  }, [segments, searchQuery]);

  if (!hasText) {
    return (
      <>
        <EmptyState
          icon={<MessageSquareText className="h-6 w-6" />}
          title="Transcrição indisponível"
          description="Este áudio ainda não tem transcrição. Clique abaixo para transcrever."
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => setTranscribeModalOpen(true)}
              className="mt-2"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              Transcrever Áudio
            </Button>
          }
        />
        <TranscribeModal
          recordingId={recording.id}
          open={transcribeModalOpen}
          onClose={() => setTranscribeModalOpen(false)}
        />
      </>
    );
  }

  return (
    <article className="max-w-3xl space-y-4">
      {/* Sub-header com versão ativa, métricas e ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-surface2 px-2 py-0.5 font-mono text-xs font-semibold text-ink">
            {activeTv ? `Transcrição v${activeTv.version_number}` : "Transcrição Ativa"}
          </span>
          {activeTv?.engine && (
            <span className="rounded-md bg-surface2 px-2 py-0.5 font-mono text-[10px] uppercase text-ink-soft">
              {activeTv.engine === "openrouter" ? "OpenRouter Nuvem" : "Local Whisper"}
            </span>
          )}
          <span className="rounded-md bg-subtle px-2 py-0.5 font-mono text-[10px] text-ink-faint">
            {wordCount} palavras
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="surface"
            size="sm"
            onClick={handleCopy}
            className="text-xs"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copiar Texto
              </>
            )}
          </Button>

          {onOpenHistory && (
            <Button variant="ghost" size="sm" onClick={onOpenHistory} className="text-xs">
              Histórico ({recording.transcription_versions?.length || 1})
            </Button>
          )}
          <Button
            variant="surface"
            size="sm"
            onClick={() => setTranscribeModalOpen(true)}
            className="text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Transcrever Novamente
          </Button>
        </div>
      </div>

      {/* Barra de busca interna na transcrição */}
      {segments.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-faint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar palavra ou termo nesta transcrição…"
            className="w-full rounded-xl border border-line bg-surface pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      )}

      {segments.length > 0 ? (
        <div className="space-y-0.5">
          {filteredSegments.map((seg, i) => (
            <div
              key={i}
              className="group flex gap-2.5 sm:gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-subtle/70"
            >
              <button
                type="button"
                className="mt-0.5 shrink-0 self-baseline rounded-md bg-subtle px-1.5 py-0.5 font-mono text-[10px] sm:text-[11px] tabular-nums text-ink-faint transition-colors hover:bg-accent-soft hover:text-accent-deep touch-tap"
                title="Pular áudio para este instante"
                onClick={() => seekTo(seg.start)}
              >
                {formatTimestamp(seg.start)}
              </button>
              <p className="min-w-0 flex-1 text-[14px] sm:text-[14.5px] leading-[1.85] text-ink break-words">
                {seg.text}
              </p>
            </div>
          ))}
          {filteredSegments.length === 0 && (
            <p className="text-center py-6 text-xs text-ink-faint italic">
              Nenhum trecho encontrado para "{searchQuery}".
            </p>
          )}
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-[14px] sm:text-[14.5px] leading-[1.85] text-ink break-words">
          {displayText}
        </p>
      )}

      <TranscribeModal
        recordingId={recording.id}
        open={transcribeModalOpen}
        onClose={() => setTranscribeModalOpen(false)}
      />
    </article>
  );
}

function seekTo(seconds: number) {
  const audio =
    document.querySelector<HTMLAudioElement>('audio[data-player="main-recording-player"]') ||
    document.querySelector<HTMLAudioElement>("audio");
  if (audio && Number.isFinite(seconds)) {
    audio.currentTime = seconds;
    void audio.play().catch(() => undefined);
  }
}