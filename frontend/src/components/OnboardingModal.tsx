import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Globe2,
  Lock,
  Rocket,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { Select } from "./ui/select";
import { Button } from "./ui/button";
import { useSettings, useUpdateSettings, buildPatch } from "@/hooks/useSettings";
import { useHealth } from "@/hooks/queries";
import { LLMConfigCard } from "./LLMConfigCard";
import { languageOptions } from "@/lib/languages";
import { cn } from "@/lib/utils";

const LOCAL_WHISPER_MODELS = [
  { value: "large-v3", label: "large-v3 (Recomendado)", badge: "Máxima Fidelidade", description: "Padrão oficial do HiNoter para máxima precisão na fala" },
  { value: "large-v3-turbo", label: "large-v3-turbo", badge: "Rápido & Fiel", description: "Versão otimizada e mais veloz do modelo large" },
  { value: "medium", label: "medium", badge: "Equilibrado", description: "Excelente para PCs com 6GB a 8GB de RAM" },
  { value: "small", label: "small", badge: "Leve", description: "Rápido em CPUs ou placas integradas" },
  { value: "base", label: "base", badge: "Ágil", description: "Baixo consumo de recursos" },
  { value: "tiny", label: "tiny", badge: "Ultraleve", description: "Ideal para testes instantâneos" },
];

export function OnboardingModal({
  open,
  onClose,
  isReview = false,
}: {
  open: boolean;
  onClose: () => void;
  isReview?: boolean;
}) {
  const { data: settingsData } = useSettings();
  const updateSettings = useUpdateSettings();
  const health = useHealth();
  const device = health.data?.device;

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [revealNotionKey, setRevealNotionKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Inicializa com configurações atuais do backend
  useEffect(() => {
    if (open && settingsData?.settings) {
      const init: Record<string, string> = {};
      for (const item of settingsData.settings) {
        init[item.key] = item.secret ? "" : String(item.value ?? "");
      }
      setValues((prev) => ({ ...init, ...prev }));
    }
  }, [open, settingsData]);

  if (!open) return null;

  const setValue = (key: string, val: string) => {
    setValues((p) => ({ ...p, [key]: val }));
    setTouched((p) => new Set(p).add(key));
  };

  // Valores atuais
  const currentProvider = values["llm_provider"] || "openrouter";
  const currentModel = values["llm_model"] || values["openrouter_model"] || "anthropic/claude-3.5-sonnet";

  const currentTransProvider = values["transcription_provider"] || "local";
  const currentWhisperModel = values["whisper_model"] || "large-v3";
  const currentLanguage = values["whisper_language"] || "";

  const currentNotionKey = values["notion_api_key"] || "";
  const currentNotionDb = values["notion_database_id"] || "";

  const isNotionConfigured = Boolean(
    settingsData?.keys_status?.["notion_api_key"]?.configured ||
    currentNotionKey
  );

  const handleFinish = async () => {
    setIsSaving(true);
    try {
      const items = settingsData?.settings ?? [];
      const patch = buildPatch(items, values, touched);
      if (Object.keys(patch).length > 0) {
        await updateSettings.mutateAsync(patch);
      }
      localStorage.setItem("hinoter_onboarding_completed", "true");
      setStep(4);
    } catch (err) {
      console.error("Erro ao salvar configurações do onboarding:", err);
      localStorage.setItem("hinoter_onboarding_completed", "true");
      setStep(4);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompleteAndClose = () => {
    localStorage.setItem("hinoter_onboarding_completed", "true");
    onClose();
  };

  const languageSelectOptions = [
    { value: "", label: "Detecção Automática (Auto-detect)" },
    ...languageOptions.map((opt) => ({
      value: opt.value,
      label: opt.label,
    })),
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-md p-3 sm:p-4 animate-fade-in"
    >
      <div className="relative w-full max-w-xl max-h-[94vh] flex flex-col overflow-hidden rounded-3xl border border-line bg-paper shadow-2xl animate-scale-in">
        {/* Header com Stepper */}
        <div className="border-b border-line bg-surface px-5 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent text-white shadow-soft">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-serif font-bold text-ink flex items-center gap-2">
                  <span>{isReview ? "Revisão de Configurações" : "Configuração Inicial"}</span>
                  <span className="rounded-md bg-accent/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-accent">
                    {step === 4 ? "Concluído" : `Passo ${step} de 3`}
                  </span>
                </h2>
                <p className="text-xs text-ink-soft">
                  {step === 1 && "Configure o provedor de inteligência artificial para resumos e chat."}
                  {step === 2 && "Defina o motor padrão de reconhecimento de voz e transcrição."}
                  {step === 3 && "Integre com seu workspace do Notion para exportações com 1 clique."}
                  {step === 4 && "Tudo pronto! Suas configurações foram salvas com sucesso."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCompleteAndClose}
              className="rounded-xl p-1.5 text-ink-faint hover:bg-subtle hover:text-ink transition-colors touch-tap"
              title="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Stepper visual */}
          {step !== 4 && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-2 text-left transition-all",
                  step === 1
                    ? "border-accent bg-accent/10 shadow-soft"
                    : "border-line bg-surface2/50 opacity-70 hover:opacity-100",
                )}
              >
                <div
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    step > 1 ? "bg-success text-white" : step === 1 ? "bg-accent text-white" : "bg-ink/10 text-ink-soft",
                  )}
                >
                  {step > 1 ? <Check className="h-3 w-3" /> : "1"}
                </div>
                <div className="truncate text-xs font-semibold text-ink">1. IA & Texto</div>
              </button>

              <button
                type="button"
                onClick={() => setStep(2)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-2 text-left transition-all",
                  step === 2
                    ? "border-accent bg-accent/10 shadow-soft"
                    : "border-line bg-surface2/50 opacity-70 hover:opacity-100",
                )}
              >
                <div
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    step > 2 ? "bg-success text-white" : step === 2 ? "bg-accent text-white" : "bg-ink/10 text-ink-soft",
                  )}
                >
                  {step > 2 ? <Check className="h-3 w-3" /> : "2"}
                </div>
                <div className="truncate text-xs font-semibold text-ink">2. Transcrição</div>
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-2 text-left transition-all",
                  step === 3
                    ? "border-accent bg-accent/10 shadow-soft"
                    : "border-line bg-surface2/50 opacity-70 hover:opacity-100",
                )}
              >
                <div
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    step === 3 ? "bg-accent text-white" : "bg-ink/10 text-ink-soft",
                  )}
                >
                  3
                </div>
                <div className="truncate text-xs font-semibold text-ink">3. Notion</div>
              </button>
            </div>
          )}
        </div>

        {/* Conteúdo dos Passos */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* PASSO 1: IA & Texto */}
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <LLMConfigCard
                values={values}
                onChange={setValue}
                settings={settingsData}
              />
            </div>
          )}

          {/* PASSO 2: Transcrição */}
          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <label className="text-xs font-bold uppercase tracking-wider text-ink-soft block">
                Escolha o Motor Padrão de Transcrição:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Whisper Local */}
                <button
                  type="button"
                  onClick={() => setValue("transcription_provider", "local")}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all",
                    currentTransProvider === "local"
                      ? "border-accent bg-accent-soft/40 shadow-soft"
                      : "border-line bg-surface hover:border-accent/40",
                  )}
                >
                  <div className="flex items-center gap-2 font-bold text-sm text-ink">
                    <Cpu className="h-4 w-4 text-accent" />
                    <span>Whisper Local</span>
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent">
                      Offline
                    </span>
                  </div>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    Processamento offline no computador. 100% privado, ilimitado e sem custos de API.
                  </p>
                </button>

                {/* Whisper Nuvem */}
                <button
                  type="button"
                  onClick={() => setValue("transcription_provider", "openrouter")}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all",
                    currentTransProvider === "openrouter"
                      ? "border-accent bg-accent-soft/40 shadow-soft"
                      : "border-line bg-surface hover:border-accent/40",
                  )}
                >
                  <div className="flex items-center gap-2 font-bold text-sm text-ink">
                    <Zap className="h-4 w-4 text-accent" />
                    <span>Whisper Nuvem</span>
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent">
                      OpenRouter
                    </span>
                  </div>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    Modelo <strong>whisper-large-v3-turbo</strong> na nuvem. Ultra-rápido e sem uso da CPU/GPU local.
                  </p>
                </button>
              </div>

              {/* Hardware detectado se for Local */}
              {currentTransProvider === "local" && device && (
                <div className="flex items-center justify-between rounded-xl bg-surface2 border border-line px-3.5 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-accent" />
                    <span className="font-medium text-ink">
                      Aceleração detectada: {device.gpu_name ?? device.device}
                    </span>
                  </div>
                  <span className="text-[10.5px] font-semibold text-success-fg">● Pronto</span>
                </div>
              )}

              {/* Modelo Whisper Local */}
              {currentTransProvider === "local" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                      Tamanho do Modelo Whisper Local:
                    </label>
                    <span className="text-[10.5px] text-accent font-semibold">Padrão: large-v3</span>
                  </div>
                  <Select
                    value={currentWhisperModel}
                    onChange={(val) => setValue("whisper_model", val)}
                    options={LOCAL_WHISPER_MODELS}
                  />
                </div>
              )}

              {/* Idioma Principal */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1.5">
                  <Globe2 className="h-3.5 w-3.5 text-accent" />
                  <span>Idioma Principal da Fala:</span>
                </label>
                <Select
                  value={currentLanguage}
                  onChange={(val) => setValue("whisper_language", val)}
                  options={languageSelectOptions}
                  searchable={true}
                  searchPlaceholder="Buscar idioma..."
                />
              </div>
            </div>
          )}

          {/* PASSO 3: Notion */}
          {step === 3 && (
            <div className="space-y-4 animate-fade-in">
              <div className="rounded-2xl border border-line bg-surface p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-soft">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-ink">Exportação Direta para o Notion</h3>
                    <p className="text-xs text-ink-soft">
                      Opcional. Permite exportar resumos e tarefas direto para seu workspace.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1">
                      <Lock className="h-3.5 w-3.5 text-accent" />
                      <span>Token Secreto de Integração:</span>
                    </label>
                    <a
                      href="https://www.notion.so/my-integrations"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
                    >
                      <span>Criar integração no Notion</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  {isNotionConfigured && (
                    <div className="flex items-center gap-1.5 rounded-xl bg-success-bg border border-success-line px-3 py-1.5 text-xs text-success-fg font-medium">
                      <ShieldCheck className="h-4 w-4 text-success shrink-0" />
                      <span>Token salvo no banco</span>
                    </div>
                  )}

                  <div className="relative">
                    <input
                      type={revealNotionKey ? "text" : "password"}
                      value={currentNotionKey}
                      onChange={(e) => setValue("notion_api_key", e.target.value)}
                      placeholder={isNotionConfigured ? "•••••••• (Token salvo)" : "secret_..."}
                      className="w-full rounded-xl border border-line bg-surface2 px-3.5 pr-10 py-2.5 text-xs font-mono text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <button
                      type="button"
                      onClick={() => setRevealNotionKey((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-faint hover:text-ink transition-colors"
                    >
                      {revealNotionKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                    ID da Database (Banco de Dados do Notion):
                  </label>
                  <input
                    type="text"
                    value={currentNotionDb}
                    onChange={(e) => setValue("notion_database_id", e.target.value)}
                    placeholder="Ex: 32 caracteres da URL da sua tabela do Notion"
                    className="w-full rounded-xl border border-line bg-surface2 px-3.5 py-2.5 text-xs font-mono text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>
            </div>
          )}

          {/* PASSO 4: Concluído */}
          {step === 4 && (
            <div className="py-6 text-center space-y-4 animate-scale-in">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-success text-white shadow-lg">
                <CheckCircle2 className="h-9 w-9 animate-bounce" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-xl font-bold text-ink">
                  Configurações Salvas com Sucesso!
                </h3>
                <p className="text-xs sm:text-sm text-ink-soft max-w-md mx-auto">
                  Sua aplicação está pronta para uso. Todos os fluxos de gravação e importação utilizarão suas preferências automaticamente.
                </p>
              </div>

              <div className="rounded-2xl border border-line bg-surface p-4 text-left text-xs space-y-2 max-w-md mx-auto">
                <div className="flex items-center justify-between">
                  <span className="text-ink-soft">Provedor IA:</span>
                  <span className="font-semibold text-ink uppercase">{currentProvider} ({currentModel})</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-soft">Motor de Transcrição:</span>
                  <span className="font-semibold text-ink">
                    {currentTransProvider === "local" ? `Whisper Local (${currentWhisperModel})` : "Whisper Nuvem (OpenRouter)"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-soft">Idioma Padrão:</span>
                  <span className="font-semibold text-ink">
                    {currentLanguage ? languageOptions.find((l) => l.value === currentLanguage)?.label : "Auto-detect"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer com Botões de Navegação e Pular */}
        <div className="flex items-center justify-between border-t border-line bg-surface px-5 py-3.5 shrink-0">
          {step === 4 ? (
            <Button onClick={handleCompleteAndClose} className="w-full">
              <Rocket className="mr-2 h-4 w-4" />
              Começar a Usar o HiNoter
            </Button>
          ) : (
            <>
              <div>
                {step > 1 ? (
                  <Button
                    variant="surface"
                    size="sm"
                    onClick={() => setStep((s) => (s - 1) as any)}
                    disabled={isSaving}
                  >
                    <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                    Voltar
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCompleteAndClose}
                    className="text-ink-faint hover:text-ink"
                  >
                    Pular Tudo
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {step < 3 ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep((s) => (s + 1) as any)}
                      className="text-ink-soft hover:text-ink"
                    >
                      Pular etapa
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setStep((s) => (s + 1) as any)}
                    >
                      <span>Avançar</span>
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleFinish}
                      disabled={isSaving}
                      className="text-ink-soft hover:text-ink"
                    >
                      Pular etapa
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleFinish}
                      loading={isSaving}
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      <span>Concluir Configuração</span>
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
