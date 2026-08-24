import { useState, useMemo } from "react";
import {
  ChevronDown,
  Cpu,
  Globe2,
  Mic,
  Sliders,
  Zap,
} from "lucide-react";
import { Select } from "./ui/select";
import { languageOptions } from "@/lib/languages";
import { useHealth } from "@/hooks/queries";
import { cn } from "@/lib/utils";

const TRANSCRIPTION_PROVIDERS = [
  {
    value: "local",
    label: "Whisper Local (Offline / No seu Computador)",
    badge: "100% Privado",
    description: "Execução direta na sua GPU ou CPU. Sem custos de API e com máxima privacidade.",
  },
  {
    value: "openrouter",
    label: "Nuvem (OpenRouter Audio API)",
    badge: "Sem Carga no PC",
    description: "Processamento de áudio ultra-rápido na nuvem via OpenRouter (whisper-large-v3-turbo).",
  },
];

const LOCAL_WHISPER_MODELS = [
  {
    value: "large-v3",
    label: "large-v3 (Flagship / Máxima Fidelidade)",
    badge: "Padrão",
    description: "Modelo oficial de referência da OpenAI. Maior precisão em pontuação e termos técnicos.",
  },
  {
    value: "large-v3-turbo",
    label: "large-v3-turbo (Rápido & Alta Qualidade)",
    badge: "Otimizado",
    description: "Versão turbo do large-v3. Velocidade 4x maior com fidelidade praticamente idêntica.",
  },
  {
    value: "medium",
    label: "medium (Equilibrado)",
    badge: "Equilibrado",
    description: "Ideal para computadores sem GPU dedicada ou placas com até 4GB de VRAM.",
  },
  {
    value: "small",
    label: "small (Leve e Ágil)",
    badge: "Leve",
    description: "Transcrição rápida em CPUs modestas.",
  },
  {
    value: "base",
    label: "base (Muito Rápido)",
    badge: "Básico",
    description: "Execução ultrarrápida, ideal para rascunhos imediatos.",
  },
  {
    value: "tiny",
    label: "tiny (Ultraleve)",
    badge: "Mínimo",
    description: "Consome menos de 500MB de RAM.",
  },
];

const DEVICE_OPTIONS = [
  {
    value: "auto",
    label: "Detecção Automática (GPU-First)",
    badge: "Recomendado",
    description: "Detecta NVIDIA CUDA, AMD ROCm/Vulkan, Apple Metal ou CPU automaticamente.",
  },
  {
    value: "cuda",
    label: "NVIDIA CUDA (RTX / GTX)",
    badge: "NVIDIA",
    description: "Aceleração em placas de vídeo NVIDIA via CUDA / Tensor Cores.",
  },
  {
    value: "rocm",
    label: "AMD Radeon ROCm / HIP",
    badge: "AMD ROCm",
    description: "Aceleração nativa em placas AMD Radeon RX 6000/7000/8000 via ROCm.",
  },
  {
    value: "vulkan",
    label: "AMD / Intel Vulkan Universal",
    badge: "Vulkan",
    description: "Aceleração gráfica universal para placas AMD, Intel Arc e iGPUs.",
  },
  {
    value: "cpu",
    label: "Processador CPU (Multi-thread)",
    badge: "CPU",
    description: "Executa nos núcleos do processador com quantização INT8.",
  },
];

const SPEED_PRESET_OPTIONS = [
  {
    value: "fast",
    label: "Rápido (Greedy / 1 Passagem)",
    badge: "Padrão",
    description: "Processamento direto em tempo recorde.",
  },
  {
    value: "balanced",
    label: "Equilibrado (Beam Search 2)",
    badge: "Equilibrado",
    description: "Duas hipóteses simultâneas para maior coerência.",
  },
  {
    value: "quality",
    label: "Qualidade Máxima (Beam 5 + Fallback)",
    badge: "Máxima Fidelidade",
    description: "Busca exaustiva e re-tentativas em áudios com ruído.",
  },
  {
    value: "custom",
    label: "Ajuste Personalizado Manual",
    badge: "Avançado",
    description: "Permite configurar Beam Size, Fallback de Temperatura e Threads.",
  },
];

export function TranscriptionConfigCard({
  values,
  onChange,
}: {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const currentProvider = values["transcription_provider"] || "local";
  const currentModel = values["whisper_model"] || "large-v3";
  const currentLanguage = values["whisper_language"] || "";
  const currentDevice = values["whisper_device"] || "auto";
  const currentSpeedMode = values["whisper_mode"] || "fast";

  const health = useHealth();
  const device = health.data?.device;

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Formata opções de idioma para o seletor com pesquisa
  const languageSelectOptions = useMemo(() => {
    return [
      {
        value: "",
        label: "Detecção Automática (Auto-detect)",
        badge: "Auto",
        description: "O Whisper detectará automaticamente o idioma falado.",
      },
      ...languageOptions.map((lang) => ({
        value: lang.value,
        label: `${lang.label} (${lang.value})`,
        description: `Fixar reconhecimento em ${lang.label}`,
      })),
    ];
  }, []);

  return (
    <div className="rounded-2xl border border-accent/30 bg-surface p-4 sm:p-5 shadow-soft space-y-4 relative focus-within:z-30">
      {/* Header do Card */}
      <div className="flex items-center gap-2.5 pb-2 border-b border-line">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-soft">
          <Mic className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-ink flex items-center gap-1.5">
            <span>Motor de Reconhecimento de Voz & Transcrição</span>
            <span className="rounded bg-accent/15 px-1.5 py-0.2 font-mono text-[9.5px] font-semibold text-accent">
              Whisper
            </span>
          </h3>
          <p className="text-[11px] text-ink-soft">
            Aceleração em GPU/CPU para transcrever reuniões, áudios e gravações com alta precisão.
          </p>
        </div>
      </div>

      {/* 1. Provedor de Transcrição */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-ink-soft">
          1. Provedor de Transcrição:
        </label>
        <Select
          value={currentProvider}
          onChange={(val) => onChange("transcription_provider", val)}
          options={TRANSCRIPTION_PROVIDERS}
        />
      </div>

      {/* 2. Modelo Whisper */}
      {currentProvider === "local" ? (
        <div className="space-y-1.5 animate-fade-in">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              2. Modelo Whisper Local (Offline):
            </label>
            <span className="text-[10px] text-accent font-semibold">
              Padrão: large-v3
            </span>
          </div>
          <Select
            value={currentModel}
            onChange={(val) => onChange("whisper_model", val)}
            options={LOCAL_WHISPER_MODELS}
          />
        </div>
      ) : (
        <div className="space-y-1.5 animate-fade-in">
          <label className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            2. Modelo de Áudio na Nuvem (OpenRouter):
          </label>
          <input
            type="text"
            value={values["openrouter_whisper_model"] || "openai/whisper-large-v3-turbo"}
            onChange={(e) => onChange("openrouter_whisper_model", e.target.value)}
            placeholder="openai/whisper-large-v3-turbo"
            className="w-full rounded-xl border border-line bg-surface2 px-3.5 py-2.5 text-xs font-mono text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      )}

      {/* 3. Idioma de Transcrição */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1">
            <Globe2 className="h-3.5 w-3.5 text-accent" />
            <span>3. Idioma Principal do Áudio:</span>
          </label>
          <span className="text-[10px] text-ink-faint">Pesquisa em tempo real</span>
        </div>
        <Select
          value={currentLanguage}
          onChange={(val) => onChange("whisper_language", val)}
          options={languageSelectOptions}
          searchable={true}
          searchPlaceholder="Digite o idioma (ex: Português, English, Español)..."
        />
      </div>

      {/* 4. Aceleração de Hardware & Desempenho (Colapsável) */}
      <div className="pt-2 border-t border-line/60">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center justify-between w-full text-[11px] font-semibold text-ink-soft hover:text-ink transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-accent" />
            <span>Hardware, Aceleração (NVIDIA / AMD / Vulkan) & Velocidade</span>
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAdvanced && "rotate-180")} />
        </button>

        {showAdvanced && (
          <div className="mt-3.5 space-y-4 rounded-xl border border-line/60 bg-surface2/40 p-3.5 animate-fade-in">
            {/* Status do Hardware Detectado */}
            {device && (
              <div className="flex items-center justify-between rounded-xl bg-surface border border-line px-3 py-2 text-xs shadow-soft">
                <div className="flex items-center gap-2 truncate">
                  {device.device === "cuda" || device.device === "rocm" ? (
                    <Zap className="h-3.5 w-3.5 text-accent shrink-0" />
                  ) : device.device === "vulkan" || device.device === "metal" ? (
                    <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  ) : (
                    <Cpu className="h-3.5 w-3.5 text-ink-soft shrink-0" />
                  )}
                  <span className="font-medium text-ink truncate">
                    {device.device !== "cpu"
                      ? `${device.engine === "whisper-cpp" ? "whisper.cpp" : "faster-whisper"} · ${device.gpu_name ?? device.device}`
                      : `CPU · ${device.compute_type}`}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-success-fg shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  Detectado
                </span>
              </div>
            )}

            {/* Dispositivo */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-ink flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-accent" />
                <span>Dispositivo de Aceleração:</span>
              </label>
              <Select
                value={currentDevice}
                onChange={(val) => onChange("whisper_device", val)}
                options={DEVICE_OPTIONS}
              />
            </div>

            {/* Modo de Velocidade */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-ink flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-accent" />
                <span>Preset de Velocidade & Fidelidade:</span>
              </label>
              <Select
                value={currentSpeedMode}
                onChange={(val) => onChange("whisper_mode", val)}
                options={SPEED_PRESET_OPTIONS}
              />
            </div>

            {/* Se Modo for custom, mostra os knobs manuais */}
            {currentSpeedMode === "custom" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-line">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-ink-soft">Beam Size (1..5):</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={values["whisper_beam_size"] || "1"}
                    onChange={(e) => onChange("whisper_beam_size", e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-ink-soft">Threads CPU (0=Auto):</label>
                  <input
                    type="number"
                    min={0}
                    max={32}
                    value={values["whisper_cpu_threads"] || "0"}
                    onChange={(e) => onChange("whisper_cpu_threads", e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-ink-soft">Multi-pass Fallback:</label>
                  <Select
                    value={values["whisper_temperature_fallback"] === "true" || values["whisper_temperature_fallback"] === "1" ? "true" : "false"}
                    onChange={(val) => onChange("whisper_temperature_fallback", val)}
                    options={[
                      { value: "false", label: "Desligado (Rápido)" },
                      { value: "true", label: "Ligado (Multi-pass)" },
                    ]}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
