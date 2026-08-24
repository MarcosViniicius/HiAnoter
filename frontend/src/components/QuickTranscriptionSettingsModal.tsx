import { useEffect, useState } from "react";
import { Check, CheckCircle2, Mic, Settings2, Sparkles, X } from "lucide-react";
import { useSettings, useUpdateSettings, buildPatch } from "@/hooks/useSettings";
import { TranscriptionConfigCard } from "./TranscriptionConfigCard";
import { LLMConfigCard } from "./LLMConfigCard";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

export function QuickTranscriptionSettingsModal({
  open,
  onClose,
  defaultTab = "transcription",
}: {
  open: boolean;
  onClose: () => void;
  defaultTab?: "transcription" | "llm";
}) {
  const { data: settingsData, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  const [activeTab, setActiveTab] = useState<"transcription" | "llm">(defaultTab);
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [savedOk, setSavedOk] = useState(false);

  const items = settingsData?.settings ?? [];

  useEffect(() => {
    if (open && items.length > 0) {
      const initial: Record<string, string> = {};
      for (const item of items) {
        initial[item.key] = item.secret ? "" : String(item.value ?? "");
      }
      setValues(initial);
      setTouched(new Set());
      setSavedOk(false);
      setActiveTab(defaultTab);
    }
  }, [open, items, defaultTab]);

  if (!open) return null;

  const setValue = (key: string, val: string) => {
    setValues((p) => ({ ...p, [key]: val }));
    setTouched((p) => new Set(p).add(key));
  };

  const handleSave = () => {
    updateSettings.mutate(buildPatch(items, values, touched), {
      onSuccess: () => {
        setSavedOk(true);
        setTimeout(() => {
          setSavedOk(false);
          onClose();
        }, 500);
      },
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md p-3 sm:p-4 animate-fade-in"
    >
      <div className="relative w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden rounded-3xl border border-line bg-paper shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-soft">
              <Settings2 className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-ink flex items-center gap-2">
                <span>Configuração Rápida</span>
                <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-accent">
                  Padrão Global
                </span>
              </h3>
              <p className="text-[11px] text-ink-soft">
                Altere suas preferências sem fechar ou perder o fluxo atual.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-ink-faint hover:bg-subtle hover:text-ink transition-colors touch-tap"
            title="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab switchers */}
        <div className="flex border-b border-line bg-surface2/50 px-4 pt-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("transcription")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-all",
              activeTab === "transcription"
                ? "border-accent text-accent-deep bg-surface rounded-t-lg shadow-sm"
                : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            <Mic className="h-3.5 w-3.5" />
            <span>Reconhecimento de Voz (Whisper)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("llm")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-all",
              activeTab === "llm"
                ? "border-accent text-accent-deep bg-surface rounded-t-lg shadow-sm"
                : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Inteligência Artificial (IA)</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeTab === "transcription" && (
            <div className="animate-fade-in">
              <TranscriptionConfigCard
                values={values}
                onChange={setValue}
              />
            </div>
          )}

          {activeTab === "llm" && (
            <div className="animate-fade-in">
              <LLMConfigCard
                values={values}
                onChange={setValue}
                settings={settingsData}
              />
            </div>
          )}
        </div>

        {/* Feedback de sucesso */}
        {savedOk && (
          <div className="border-t border-success-line bg-success-bg px-5 py-2 text-xs font-semibold text-success-fg flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>Configurações atualizadas com sucesso!</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line bg-surface px-5 py-3 shrink-0">
          <Button
            variant="surface"
            size="sm"
            onClick={onClose}
            disabled={updateSettings.isPending}
          >
            Cancelar
          </Button>

          <Button
            size="sm"
            onClick={handleSave}
            loading={updateSettings.isPending}
            disabled={isLoading}
          >
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Salvar & Aplicar
          </Button>
        </div>
      </div>
    </div>
  );
}
