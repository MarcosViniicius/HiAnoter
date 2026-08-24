import { useState } from "react";
import {
  Maximize2,
  Pause,
  Play,
  Plus,
  Square,
  Trash2,
} from "lucide-react";
import { useLiveRecording } from "@/context/LiveRecordingContext";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export function LiveRecordingBar({ onFinalize }: { onFinalize?: () => void }) {
  const {
    status,
    durationSeconds,
    volumeLevel,
    attachedDocuments,
    sessionNotes,
    isStudioOpen,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    addLiveNote,
    openStudio,
  } = useLiveRecording();

  const [quickNoteText, setQuickNoteText] = useState("");
  const [showQuickNote, setShowQuickNote] = useState(false);

  // Floating bar should ONLY be visible when recording is active AND the studio modal is closed/minimized
  if (status === "idle" || isStudioOpen) return null;

  const isRecording = status === "recording";

  const handleQuickNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickNoteText.trim()) return;
    addLiveNote(quickNoteText.trim());
    setQuickNoteText("");
    setShowQuickNote(false);
  };

  return (
    <aside
      aria-label="Controles de gravação contínua"
      className="fixed bottom-3 sm:bottom-5 left-1/2 z-50 -translate-x-1/2 w-[95%] sm:w-[92%] max-w-2xl animate-fade-up"
    >
      <div className="relative overflow-hidden rounded-2xl border border-line bg-paper/95 p-2.5 sm:p-3.5 shadow-2xl backdrop-blur-md">
        {/* Top glow indicator */}
        <div
          className={cn(
            "absolute inset-x-0 top-0 h-1 transition-colors duration-300",
            isRecording ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]" : "bg-amber-500",
          )}
        />

        <div className="flex items-center justify-between gap-2 sm:gap-3">
          {/* Status & Timer */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={openStudio}
              className="flex items-center gap-2 rounded-xl bg-surface2 px-2 sm:px-2.5 py-1.5 transition-colors hover:bg-surface2/80 touch-tap"
              title="Abrir Estúdio de Gravação"
            >
              <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3">
                {isRecording && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                )}
                <span
                  className={cn(
                    "relative inline-flex h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full",
                    isRecording ? "bg-red-500" : "bg-amber-500",
                  )}
                />
              </span>
              <span className="font-mono text-xs sm:text-sm font-semibold tabular-nums text-ink">
                {formatDuration(durationSeconds)}
              </span>
            </button>

            {/* Live Audio Visualizer Bars */}
            <div className="hidden sm:flex items-center gap-1 h-5 px-1.5">
              {[0.4, 0.8, 1.2, 0.6, 1.0, 0.5, 0.9].map((scale, i) => {
                const heightPct = isRecording
                  ? Math.min(100, Math.max(15, Math.round(volumeLevel * scale)))
                  : 15;
                return (
                  <div
                    key={i}
                    className={cn(
                      "w-1 rounded-full transition-all duration-75",
                      isRecording ? "bg-red-500" : "bg-ink-faint",
                    )}
                    style={{ height: `${heightPct}%` }}
                  />
                );
              })}
            </div>

            {/* Context counters */}
            <div className="hidden md:flex items-center gap-1.5 text-xs text-ink-faint">
              {attachedDocuments.length > 0 && (
                <span className="rounded bg-subtle px-1.5 py-0.5 font-medium text-ink-soft">
                  {attachedDocuments.length} doc(s)
                </span>
              )}
              {sessionNotes.length > 0 && (
                <span className="rounded bg-subtle px-1.5 py-0.5 font-medium text-ink-soft">
                  {sessionNotes.length} nota(s)
                </span>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Quick Note Button */}
            <button
              type="button"
              onClick={() => setShowQuickNote((v) => !v)}
              className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 sm:px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-surface2 hover:text-ink touch-tap"
              title="Adicionar anotação instantânea com timestamp"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nota</span>
            </button>

            {/* Pause / Resume */}
            {isRecording ? (
              <button
                type="button"
                onClick={pauseRecording}
                className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 sm:px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface2 touch-tap"
                title="Pausar gravação"
              >
                <Pause className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Pausar</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={resumeRecording}
                className="flex items-center gap-1 rounded-lg bg-accent px-2 sm:px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-accent-deep touch-tap"
                title="Retomar gravação"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span className="hidden sm:inline">Retomar</span>
              </button>
            )}

            {/* Finalize Button */}
            <button
              type="button"
              onClick={() => {
                if (onFinalize) onFinalize();
                else openStudio();
              }}
              className="flex items-center gap-1 sm:gap-1.5 rounded-lg bg-red-600 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-white shadow-md transition-all hover:bg-red-700 touch-tap"
              title="Finalizar e compilar gravação"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>Finalizar</span>
            </button>

            {/* Expand studio */}
            <button
              type="button"
              onClick={openStudio}
              className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-subtle hover:text-ink touch-tap"
              title="Expandir Estúdio Completo"
            >
              <Maximize2 className="h-4 w-4" />
            </button>

            {/* Discard button */}
            <button
              type="button"
              onClick={() => {
                if (confirm("Deseja realmente cancelar e descartar a gravação atual?")) {
                  cancelRecording();
                }
              }}
              className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-danger-bg hover:text-danger-fg touch-tap"
              title="Descartar gravação"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Inline Quick Note Popover */}
        {showQuickNote && (
          <form onSubmit={handleQuickNoteSubmit} className="mt-2.5 sm:mt-3 flex items-center gap-2 border-t border-line/60 pt-2.5 animate-fade-in">
            <span className="font-mono text-xs text-ink-faint shrink-0">
              [{formatDuration(durationSeconds)}]
            </span>
            <input
              autoFocus
              value={quickNoteText}
              onChange={(e) => setQuickNoteText(e.target.value)}
              placeholder="Anotação rápida…"
              className="flex-1 min-w-0 rounded-lg border border-line bg-surface px-2.5 sm:px-3 py-1 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="submit"
              className="rounded-lg bg-accent px-2.5 sm:px-3 py-1 text-xs font-semibold text-white hover:bg-accent-deep shrink-0 touch-tap"
            >
              Salvar
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}
