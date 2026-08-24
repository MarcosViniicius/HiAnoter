import { useEffect, useState, useMemo, useCallback } from "react";
import {
  AlertCircle,
  Bot,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { Select } from "./ui/select";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ModelInfo, SettingsResponse } from "@/types";

const BASE_PROVIDER_OPTIONS = [
  {
    value: "openrouter",
    label: "OpenRouter (Multi-Modelos)",
    defaultBadge: "Recomendado",
    description: "Claude 3.5, Llama 3, DeepSeek, GPT-4o e centenas de modelos em uma única chave.",
  },
  {
    value: "openai",
    label: "OpenAI Oficial",
    defaultBadge: "Oficial",
    description: "Modelos GPT-4o, GPT-4o-mini, o3-mini e o1 direto da OpenAI.",
  },
  {
    value: "gemini",
    label: "Google Gemini",
    defaultBadge: "Alta Velocidade",
    description: "Gemini 2.0 Flash e Gemini 1.5 Pro com até 2M tokens de contexto.",
  },
  {
    value: "custom",
    label: "Endpoint Personalizado / Local",
    defaultBadge: "Ollama / LM Studio",
    description: "Conecte a instâncias locais do Ollama, LM Studio, Groq, DeepSeek ou vLLM.",
  },
];

const PRESET_MODELS: Record<string, { value: string; label: string; badge?: string; description?: string }[]> = {
  openrouter: [
    { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", badge: "Melhor Síntese", description: "Qualidade textual e clareza excepcionais" },
    { value: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", badge: "Ultrarrápido", description: "Velocidade e economia extremas" },
    { value: "deepseek/deepseek-chat", label: "DeepSeek V3", badge: "Econômico", description: "Alta capacidade de raciocínio a baixo custo" },
    { value: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", badge: "Open-Source", description: "Excelente para resumos e instruções complexas" },
    { value: "openai/gpt-4o-mini", label: "GPT-4o Mini", badge: "Ágil", description: "Equilíbrio padrão da OpenAI" },
    { value: "openai/gpt-4o", label: "GPT-4o", badge: "Avançado", description: "Alta fidelidade analítica" },
  ],
  openai: [
    { value: "gpt-4o-mini", label: "gpt-4o-mini", badge: "Recomendado", description: "Rápido, econômico e de alta precisão" },
    { value: "gpt-4o", label: "gpt-4o", badge: "Mais Capaz", description: "Modelo flagship para raciocínio complexo" },
    { value: "o3-mini", label: "o3-mini", badge: "Raciocínio", description: "Otimizado para lógica, matemática e codificação" },
    { value: "o1-mini", label: "o1-mini", badge: "Raciocínio Rápido", description: "Resolução estruturada de problemas" },
    { value: "gpt-4-turbo", label: "gpt-4-turbo", badge: "Precisão", description: "Alta fidelidade para textos longos" },
  ],
  gemini: [
    { value: "gemini-2.0-flash", label: "gemini-2.0-flash", badge: "Recomendado", description: "Nova geração do Gemini, latência mínima" },
    { value: "gemini-1.5-pro", label: "gemini-1.5-pro", badge: "Contexto 2M", description: "Lida com livros e documentos inteiros" },
    { value: "gemini-1.5-flash", label: "gemini-1.5-flash", badge: "Econômico", description: "Ideal para resumos frequentes" },
    { value: "gemini-2.0-pro-exp-02-05", label: "gemini-2.0-pro-exp", badge: "Experimental", description: "Máxima capacidade analítica do Google" },
  ],
  custom: [
    { value: "llama3.2:latest", label: "llama3.2:latest", badge: "Local", description: "Modelo leve e veloz para Ollama" },
    { value: "deepseek-r1:latest", label: "deepseek-r1:latest", badge: "Raciocínio Local", description: "Capacidade de cadeia de pensamento" },
    { value: "qwen2.5:latest", label: "qwen2.5:latest", badge: "Multilíngue", description: "Forte desempenho em português" },
    { value: "mistral:latest", label: "mistral:latest", badge: "Geral", description: "Equilibrado para tarefas gerais" },
  ],
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  custom: "http://localhost:11434/v1",
};

const KEY_LINKS: Record<string, { label: string; url: string }> = {
  openrouter: { label: "Obter chave no OpenRouter", url: "https://openrouter.ai/keys" },
  openai: { label: "Obter chave na OpenAI", url: "https://platform.openai.com/api-keys" },
  gemini: { label: "Obter chave no Google AI Studio", url: "https://aistudio.google.com/app/apikey" },
  custom: { label: "Documentação do Ollama / LM Studio", url: "https://ollama.ai" },
};

export function LLMConfigCard({
  values,
  onChange,
  settings,
}: {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  settings?: SettingsResponse;
}) {
  const currentProvider = values["llm_provider"] || "openrouter";
  const [revealKey, setRevealKey] = useState(false);
  const [showAdvancedUrl, setShowAdvancedUrl] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<ModelInfo[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Status de configuração de cada provedor
  const providerKeyMap: Record<string, string> = {
    openrouter: "openrouter_api_key",
    openai: "openai_api_key",
    gemini: "gemini_api_key",
    custom: "llm_api_key",
  };

  const currentKeyName = providerKeyMap[currentProvider] || "llm_api_key";
  const keyStatus =
    settings?.keys_status?.[currentKeyName] ||
    (currentProvider === "openrouter"
      ? settings?.keys_status?.["llm_api_key"] || settings?.keys_status?.["openrouter_api_key"]
      : undefined);

  const isCurrentlyConfigured = Boolean(
    keyStatus?.configured ||
    settings?.configured_providers?.[currentProvider] ||
    settings?.settings.find((s) => s.key === currentKeyName)?.set ||
    (currentProvider === "openrouter" &&
      (settings?.settings.find((s) => s.key === "llm_api_key")?.set ||
        settings?.settings.find((s) => s.key === "openrouter_api_key")?.set)) ||
    values[currentKeyName]
  );

  // Opções dinâmicas de provedores com badges de status de configuração
  const providerOptions = useMemo(() => {
    return BASE_PROVIDER_OPTIONS.map((prov) => {
      const kName = providerKeyMap[prov.value];
      const isSet =
        prov.value === "custom"
          ? true
          : Boolean(
              settings?.configured_providers?.[prov.value] ||
              settings?.keys_status?.[kName]?.configured ||
              settings?.settings.find((s) => s.key === kName)?.set ||
              (prov.value === "openrouter" &&
                (settings?.settings.find((s) => s.key === "llm_api_key")?.set ||
                  settings?.settings.find((s) => s.key === "openrouter_api_key")?.set)) ||
              values[kName]
            );

      return {
        value: prov.value,
        label: prov.label,
        badge: isSet ? "● Configurada" : prov.defaultBadge,
        description: prov.description,
      };
    });
  }, [settings, values]);

  // Chave de API atual baseada no provedor
  const currentApiKey = useMemo(() => {
    if (currentProvider === "openai") return values["openai_api_key"] || "";
    if (currentProvider === "gemini") return values["gemini_api_key"] || "";
    if (currentProvider === "custom") return values["llm_api_key"] || "";
    return values["openrouter_api_key"] || values["llm_api_key"] || "";
  }, [currentProvider, values]);

  // Modelo atual
  const currentModel = useMemo(() => {
    if (values["llm_model"]) return values["llm_model"];
    if (currentProvider === "openrouter" && values["openrouter_model"]) return values["openrouter_model"];
    return PRESET_MODELS[currentProvider]?.[0]?.value || "";
  }, [currentProvider, values]);

  // Base URL atual
  const currentBaseUrl = useMemo(() => {
    if (values["llm_base_url"]) return values["llm_base_url"];
    if (currentProvider === "openrouter" && values["openrouter_base_url"]) return values["openrouter_base_url"];
    return DEFAULT_BASE_URLS[currentProvider] || "";
  }, [currentProvider, values]);

  // Função para buscar modelos ao vivo da API do provedor
  const handleFetchLiveModels = useCallback(async (force = false) => {
    setIsFetchingModels(true);
    setFetchError(null);
    try {
      const res = await api.models({
        provider: currentProvider,
        apiKey: currentApiKey,
        baseUrl: currentBaseUrl,
        force,
      });
      if (res.error) {
        setFetchError(res.error);
      }
      if (res.models && res.models.length > 0) {
        setFetchedModels(res.models);
      }
    } catch (err: any) {
      setFetchError(err?.message || "Falha ao sincronizar modelos com a API.");
    } finally {
      setIsFetchingModels(false);
    }
  }, [currentProvider, currentApiKey, currentBaseUrl]);

  // Auto-busca inicial de modelos quando o provedor ou chave existirem
  useEffect(() => {
    if (currentApiKey || isCurrentlyConfigured || currentProvider === "custom") {
      handleFetchLiveModels(false);
    }
  }, [currentProvider, currentApiKey, isCurrentlyConfigured, handleFetchLiveModels]);

  // Troca de provedor
  const handleProviderChange = (newProvider: string) => {
    onChange("llm_provider", newProvider);
    const defaultModel = PRESET_MODELS[newProvider]?.[0]?.value || "";
    onChange("llm_model", defaultModel);
    if (newProvider === "openrouter") {
      onChange("openrouter_model", defaultModel);
    }
    const defaultUrl = DEFAULT_BASE_URLS[newProvider] || "";
    onChange("llm_base_url", defaultUrl);
    if (newProvider === "openrouter") {
      onChange("openrouter_base_url", defaultUrl);
    }

    setFetchedModels([]);
    setFetchError(null);
  };

  // Atualização da chave de API
  const handleApiKeyChange = (newKey: string) => {
    onChange("llm_api_key", newKey);
    if (currentProvider === "openrouter") onChange("openrouter_api_key", newKey);
    else if (currentProvider === "openai") onChange("openai_api_key", newKey);
    else if (currentProvider === "gemini") onChange("gemini_api_key", newKey);
  };

  // Atualização do modelo
  const handleModelChange = (newModel: string) => {
    onChange("llm_model", newModel);
    if (currentProvider === "openrouter") {
      onChange("openrouter_model", newModel);
    }
  };

  // Atualização da Base URL
  const handleBaseUrlChange = (newUrl: string) => {
    onChange("llm_base_url", newUrl);
    if (currentProvider === "openrouter") {
      onChange("openrouter_base_url", newUrl);
    }
  };

  // Combina modelos pré-definidos com modelos buscados via API
  const modelOptions = useMemo(() => {
    const presets = PRESET_MODELS[currentProvider] || [];
    if (fetchedModels.length === 0) {
      return presets;
    }

    const map = new Map<string, { value: string; label: string; badge?: string; description?: string }>();
    for (const p of presets) {
      map.set(p.value, p);
    }
    for (const m of fetchedModels) {
      if (!map.has(m.id)) {
        map.set(m.id, {
          value: m.id,
          label: m.name || m.id,
          badge: m.context ? `${Math.round(m.context / 1000)}k ctx` : undefined,
          description: m.id,
        });
      }
    }
    return Array.from(map.values());
  }, [currentProvider, fetchedModels]);

  const keyLink = KEY_LINKS[currentProvider];

  return (
    <div className="rounded-2xl border border-accent/30 bg-surface p-4 sm:p-5 shadow-soft space-y-4 relative focus-within:z-30">
      {/* Header do Card */}
      <div className="flex items-center gap-2.5 pb-2 border-b border-line">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-soft">
          <Bot className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-ink flex items-center gap-1.5">
            <span>Inteligência Artificial (Geração & Chat)</span>
            <span className="rounded bg-accent/15 px-1.5 py-0.2 font-mono text-[9.5px] font-semibold text-accent">
              Multi-Provedores
            </span>
          </h3>
          <p className="text-[11px] text-ink-soft">
            Alterne entre provedores a qualquer momento. Suas chaves permanecem salvas e criptografadas no banco.
          </p>
        </div>
      </div>

      {/* 1. Selecionar Provedor */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            1. Provedor de Inteligência Artificial:
          </label>
          <span className="text-[10px] text-ink-faint">
            Chaves salvas individualmente
          </span>
        </div>
        <Select
          value={currentProvider}
          onChange={handleProviderChange}
          options={providerOptions}
        />
      </div>

      {/* 2. Chave de API */}
      <div className="space-y-1.5 animate-fade-in">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-accent" />
            <span>2. Chave de API ({BASE_PROVIDER_OPTIONS.find((p) => p.value === currentProvider)?.label.split(" ")[0]}):</span>
          </label>
          {keyLink && (
            <a
              href={keyLink.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
            >
              <span>{keyLink.label}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Banner de status criptografado da chave */}
        {isCurrentlyConfigured && (
          <div className="flex items-center justify-between rounded-xl bg-success-bg/60 border border-success-line px-3 py-1.5 text-[11px] text-success-fg">
            <div className="flex items-center gap-1.5 font-medium truncate">
              <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" />
              <span className="truncate">
                Chave salva no banco (Criptografada)
                {keyStatus?.masked && <span className="ml-1 font-mono font-bold text-[10.5px]">[{keyStatus.masked}]</span>}
              </span>
            </div>
            {keyStatus?.sha256 && (
              <span className="font-mono text-[9px] text-success-fg/80 hidden sm:inline" title={`Hash SHA-256: ${keyStatus.sha256}`}>
                SHA-256: {keyStatus.sha256.slice(0, 8)}…
              </span>
            )}
          </div>
        )}

        <div className="relative">
          <input
            type={revealKey ? "text" : "password"}
            value={currentApiKey}
            onChange={(e) => handleApiKeyChange(e.target.value)}
            placeholder={
              isCurrentlyConfigured
                ? "•••••••• (Chave salva e ativa — digite para alterar)"
                : currentProvider === "openrouter"
                ? "sk-or-v1-..."
                : currentProvider === "openai"
                ? "sk-proj-..."
                : currentProvider === "gemini"
                ? "AIzaSy..."
                : "Chave de autenticação (opcional para Ollama local)"
            }
            className="w-full rounded-xl border border-line bg-surface2 px-3.5 pr-10 py-2.5 text-xs font-mono text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={() => setRevealKey((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-faint hover:text-ink transition-colors"
            title={revealKey ? "Ocultar chave" : "Mostrar chave"}
          >
            {revealKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* 3. Seleção do Modelo com Busca e Digitação Direta */}
      <div className="space-y-1.5 animate-fade-in">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            3. Modelo de Linguagem (LLM):
          </label>
          <span className="text-[10px] text-ink-faint">
            Busca automática na API · Digitação livre
          </span>
        </div>

        <Select
          value={currentModel}
          onChange={handleModelChange}
          options={modelOptions}
          searchable={true}
          allowCustom={true}
          searchPlaceholder="Digite para buscar ou adicionar modelo (ex: gpt-4o, claude, llama)..."
          loading={isFetchingModels}
          onOpenChange={(isOpen) => {
            if (isOpen && fetchedModels.length === 0) {
              handleFetchLiveModels(true);
            }
          }}
        />

        {fetchError && (
          <p className="text-[11px] text-danger-fg mt-1 flex items-center gap-1">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span>{fetchError}</span>
          </p>
        )}
      </div>

      {/* 4. Endpoint Base (URL da API) */}
      <div className="pt-2 border-t border-line/60">
        <button
          type="button"
          onClick={() => setShowAdvancedUrl((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-soft hover:text-ink transition-colors"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAdvancedUrl && "rotate-180")} />
          <span>Endpoint Base da API ({currentBaseUrl})</span>
        </button>

        {showAdvancedUrl && (
          <div className="mt-2 space-y-1.5 animate-fade-in">
            <input
              type="url"
              value={currentBaseUrl}
              onChange={(e) => handleBaseUrlChange(e.target.value)}
              placeholder="https://openrouter.ai/api/v1 ou http://localhost:11434/v1"
              className="w-full rounded-xl border border-line bg-surface2 px-3.5 py-2 text-xs font-mono text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="text-[10px] text-ink-faint">
              Padrão para {currentProvider}: <code className="font-mono text-accent">{DEFAULT_BASE_URLS[currentProvider]}</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
