import { useEffect, useState } from "react";
import { CheckCircle2, RotateCcw, Settings as SettingsIcon, Sparkles, X } from "lucide-react";
import { buildPatch, useResetSettings, useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { LLMConfigCard } from "./LLMConfigCard";
import { TranscriptionConfigCard } from "./TranscriptionConfigCard";
import { NotionConfigCard } from "./NotionConfigCard";
import { AdvancedConfigCard } from "./AdvancedConfigCard";
import { AppearanceConfigCard } from "./AppearanceConfigCard";
import { OnboardingModal } from "./OnboardingModal";

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isLoading } = useSettings();
  const update = useUpdateSettings();
  const reset = useResetSettings();

  const [activeTab, setActiveTab] = useState<"principais" | "avancado">("principais");
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const items = data?.settings ?? [];

  useEffect(() => {
    if (open && items.length > 0 && Object.keys(values).length === 0) {
      const initial: Record<string, string> = {};
      for (const item of items) initial[item.key] = item.secret ? "" : String(item.value ?? "");
      setValues(initial);
    }
  }, [open, items, values]);

  useEffect(() => {
    if (!open) {
      setTouched(new Set());
      setNotice(null);
      setValues({});
      update.reset();
      reset.reset();
    }
  }, [open, update, reset]);

  if (!open) return null;

  const setValue = (key: string, val: string) => {
    setValues((p) => ({ ...p, [key]: val }));
    setTouched((p) => new Set(p).add(key));
  };

  const onSave = () => {
    setNotice(null);
    update.mutate(buildPatch(items, values, touched), {
      onSuccess: (res) => {
        setSavedOk(true);
        setTouched(new Set());
        setNotice(res.notice || "Configurações salvas com sucesso.");
        window.setTimeout(() => setSavedOk(false), 2400);
      },
    });
  };

  const onReset = () => {
    if (!window.confirm("Restaurar os padrões (desfaz os ajustes feitos no menu)?")) return;
    reset.mutate(undefined, {
      onSuccess: () => {
        setNotice("Padrões restaurados.");
        setTouched(new Set());
      },
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-[60]">
        <div
          className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden="true"
        />
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Configurações"
          className="absolute inset-y-0 right-0 flex w-full max-w-full sm:max-w-[540px] flex-col bg-surface shadow-depth animate-fade-in"
        >
          {/* Header */}
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-6 sm:py-4 pt-safe sm:pt-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
                <SettingsIcon className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-serif text-base sm:text-lg font-semibold tracking-tight text-ink">
                  Configurações
                </h2>
                <p className="text-[11px] text-ink-faint">salvas automaticamente em settings.json</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-subtle hover:text-ink touch-tap"
              aria-label="Fechar configurações"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          {/* Tab switcher: Principais vs Avançado */}
          <div className="flex border-b border-line bg-surface2/50 px-4 sm:px-6 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab("principais")}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-all",
                activeTab === "principais"
                  ? "border-accent text-accent-deep bg-surface rounded-t-lg shadow-sm"
                  : "border-transparent text-ink-soft hover:text-ink",
              )}
            >
              Configurações Principais
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("avancado")}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-all",
                activeTab === "avancado"
                  ? "border-accent text-accent-deep bg-surface rounded-t-lg shadow-sm"
                  : "border-transparent text-ink-soft hover:text-ink",
              )}
            >
              Avançado (Sistema & Limites)
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            {isLoading && (
              <div className="space-y-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
              </div>
            )}

            {!isLoading && activeTab === "principais" && (
              <div className="space-y-6 animate-fade-in">
                {/* Botão Refazer Onboarding */}
                <div className="flex items-center justify-between rounded-2xl border border-accent/30 bg-accent/5 p-3.5 shadow-soft">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-soft">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-ink">Configuração Guiada</h4>
                      <p className="text-[11px] text-ink-soft">Revise ou altere suas opções passo a passo</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="surface"
                    onClick={() => setOnboardingOpen(true)}
                    className="border border-accent/40 text-accent font-semibold hover:bg-accent hover:text-white text-xs h-8 shadow-sm"
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Refazer Onboarding
                  </Button>
                </div>

                <AppearanceConfigCard
                  values={values}
                  onChange={setValue}
                />
                <LLMConfigCard
                  values={values}
                  onChange={setValue}
                  settings={data}
                />
                <TranscriptionConfigCard
                  values={values}
                  onChange={setValue}
                />
                <NotionConfigCard
                  values={values}
                  onChange={setValue}
                  settings={data}
                />
              </div>
            )}

            {!isLoading && activeTab === "avancado" && (
              <AdvancedConfigCard
                values={values}
                onChange={setValue}
              />
            )}
          </div>

          {/* Feedback / Aviso */}
          {notice && (
            <div className="border-t border-line bg-surface2 px-4 py-2.5 sm:px-6 text-xs text-ink">
              {savedOk && (
                <span className="inline-flex items-center gap-1.5 font-medium text-success-fg">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  {notice}
                </span>
              )}
              {!savedOk && <span className="text-ink-soft">{notice}</span>}
            </div>
          )}

          {/* Footer */}
          <footer className="flex items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3 sm:px-6 pb-safe sm:pb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={isLoading || update.isPending || reset.isPending}
              className="text-ink-faint hover:text-ink"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Restaurar Padrões
            </Button>

            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <span className="hidden sm:inline truncate font-mono text-[10px] text-ink-faint" title={data?.file}>
                {data?.file}
              </span>
              <Button onClick={onSave} loading={update.isPending} disabled={isLoading || reset.isPending}>
                Salvar Configurações
              </Button>
            </div>
          </footer>
        </section>
      </div>

      {/* Modal de Onboarding / Revisão */}
      <OnboardingModal
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        isReview={true}
      />
    </>
  );
}