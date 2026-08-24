import { useState } from "react";
import { ExternalLink, Eye, EyeOff, FileText, Lock, ShieldCheck } from "lucide-react";
import type { SettingsResponse } from "@/types";

export function NotionConfigCard({
  values,
  onChange,
  settings,
}: {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  settings?: SettingsResponse;
}) {
  const [revealToken, setRevealToken] = useState(false);
  const notionApiKey = values["notion_api_key"] || "";
  const notionDatabaseId = values["notion_database_id"] || "";

  const keyStatus = settings?.keys_status?.["notion_api_key"];
  const isConfigured = Boolean(keyStatus?.configured || notionApiKey);

  return (
    <div className="rounded-2xl border border-accent/30 bg-surface p-4 sm:p-5 shadow-soft space-y-4 relative focus-within:z-30">
      {/* Header do Card */}
      <div className="flex items-center gap-2.5 pb-2 border-b border-line">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-soft">
          <FileText className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-ink flex items-center gap-1.5">
            <span>Integração Notion (Exportação Direta)</span>
            <span className="rounded bg-accent/15 px-1.5 py-0.2 font-mono text-[9.5px] font-semibold text-accent">
              Workspace
            </span>
          </h3>
          <p className="text-[11px] text-ink-soft">
            Exporte transcrições, resumos, planos de estudo e tarefas direto para seu banco de dados do Notion.
          </p>
        </div>
      </div>

      {/* 1. Integration Token */}
      <div className="space-y-1.5 animate-fade-in">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1">
            <Lock className="h-3.5 w-3.5 text-accent" />
            <span>Token Secreto de Integração (Internal Secret):</span>
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

        {/* Banner de status criptografado */}
        {isConfigured && (
          <div className="flex items-center justify-between rounded-xl bg-success-bg/60 border border-success-line px-3 py-1.5 text-[11px] text-success-fg">
            <div className="flex items-center gap-1.5 font-medium truncate">
              <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" />
              <span className="truncate">
                Token salvo no banco (Criptografado)
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
            type={revealToken ? "text" : "password"}
            value={notionApiKey}
            onChange={(e) => onChange("notion_api_key", e.target.value)}
            placeholder={isConfigured ? "•••••••• (Token salvo — digite para alterar)" : "secret_..."}
            className="w-full rounded-xl border border-line bg-surface2 px-3.5 pr-10 py-2.5 text-xs font-mono text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={() => setRevealToken((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-faint hover:text-ink transition-colors"
            title={revealToken ? "Ocultar token" : "Mostrar token"}
          >
            {revealToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* 2. Database ID */}
      <div className="space-y-1.5 animate-fade-in">
        <label className="text-xs font-bold uppercase tracking-wider text-ink-soft">
          ID da Database (Banco de Dados do Notion):
        </label>
        <input
          type="text"
          value={notionDatabaseId}
          onChange={(e) => onChange("notion_database_id", e.target.value)}
          placeholder="Ex: 32 caracteres hexadecimais da URL da sua tabela"
          className="w-full rounded-xl border border-line bg-surface2 px-3.5 py-2.5 text-xs font-mono text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <p className="text-[10px] text-ink-faint">
          Lembre-se de clicar em <strong>"Conectar a"</strong> na página da sua database no Notion e autorizar sua integração.
        </p>
      </div>
    </div>
  );
}
