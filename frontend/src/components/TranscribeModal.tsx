import { useState } from "react";
import { Cloud, Cpu, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useTranscribeRecording } from "@/hooks/queries";
import { useSettings } from "@/hooks/useSettings";
import { QuickTranscriptionSettingsModal } from "./QuickTranscriptionSettingsModal";
import { Button } from "./ui/button";

export function TranscribeModal({
  recordingId,
  open,
  onClose,
}: {
  recordingId: string;
  open: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}) {
  const { data: settingsData } = useSettings();
  const currentTransProvider = (settingsData?.settings.find((s) => s.key === "transcription_provider")?.value as string) || "local";
  const currentWhisperModel = (settingsData?.settings.find((s) => s.key === "whisper_model")?.value as string) || "large-v3";
  const currentLanguage = (settingsData?.settings.find((s) => s.key === "whisper_language")?.value as string) || "";

  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const transcribeMutation = useTranscribeRecording();

  if (!open) return null;

  const handleStartTranscribe = async () => {
    try {
      await transcribeMutation.mutateAsync({
        id: recordingId,
        provider: currentTransProvider as any,
        whisperModel: currentTransProvider === "openrouter" ? "openai/whisper-large-v3-turbo" : currentWhisperModel,
        language: currentLanguage || undefined,
      });
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-line bg-paper p-6 shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-ink">Transcrever Novamente</h3>
              <p className="text-xs text-ink-soft">Gere uma nova versão de transcrição usando o motor padrão.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint hover:bg-surface2 hover:text-ink transition-colors touch-tap"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Options / Central Engine Info */}
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-4 space-y-2.5 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {currentTransProvider === "openrouter" ? (
                  <Cloud className="h-4 w-4 text-accent" />
                ) : (
                  <Cpu className="h-4 w-4 text-accent" />
                )}
                <span className="text-xs font-bold text-ink">
                  Motor de transcrição: {currentTransProvider === "openrouter" ? "Whisper via OpenRouter" : `Whisper Local (${currentWhisperModel})`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setQuickSettingsOpen(true)}
                className="text-xs font-semibold text-accent hover:underline inline-flex items-center gap-1 touch-tap"
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span>Alterar configuração</span>
              </button>
            </div>
            <p className="text-[11.5px] text-ink-soft leading-relaxed">
              Esta transcrição será processada usando sua <strong>configuração padrão</strong> do sistema ({currentTransProvider === "openrouter" ? "Nuvem OpenRouter" : `Whisper Local ${currentWhisperModel}`} · {currentLanguage ? currentLanguage : "Auto-detect"}).
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-line">
          <Button variant="surface" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleStartTranscribe}
            loading={transcribeMutation.isPending}
            className="shadow-soft"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            Iniciar Nova Transcrição
          </Button>
        </div>
      </div>

      {/* Modal de Configuração Rápida In-Place */}
      <QuickTranscriptionSettingsModal
        open={quickSettingsOpen}
        onClose={() => setQuickSettingsOpen(false)}
        defaultTab="transcription"
      />
    </div>
  );
}
