import { Database, HardDrive, Layers, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";

export function AdvancedConfigCard({
  values,
  onChange,
}: {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Card 1: Armazenamento & Banco de Dados */}
      <div className="rounded-2xl border border-accent/30 bg-surface p-4 sm:p-5 shadow-soft space-y-4 relative focus-within:z-30">
        {/* Header */}
        <div className="flex items-center gap-2.5 pb-2 border-b border-line">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-soft">
            <HardDrive className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-ink flex items-center gap-1.5">
              <span>Armazenamento & Banco de Dados</span>
              <span className="rounded bg-accent/15 px-1.5 py-0.2 font-mono text-[9.5px] font-semibold text-accent">
                Sistema
              </span>
            </h3>
            <p className="text-[11px] text-ink-soft">
              Diretórios de persistência de áudios, banco de dados SQLite local e limites de upload.
            </p>
          </div>
        </div>

        {/* Pasta de Dados */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              Diretório de Dados (Uploads & Modelos):
            </label>
            <span className="rounded border border-warn-line bg-warn-bg px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-warn-fg">
              Requer Reinício
            </span>
          </div>
          <input
            type="text"
            value={values["data_dir"] || "~/.hinoter-lite/data"}
            onChange={(e) => onChange("data_dir", e.target.value)}
            placeholder="~/.hinoter-lite/data"
            className="w-full rounded-xl border border-line bg-surface2 px-3.5 py-2.5 text-xs font-mono text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Database URL */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1">
              <Database className="h-3.5 w-3.5 text-accent" />
              <span>URL do Banco de Dados (SQLite):</span>
            </label>
            <span className="rounded border border-warn-line bg-warn-bg px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-warn-fg">
              Requer Reinício
            </span>
          </div>
          <input
            type="text"
            value={values["database_url"] || ""}
            onChange={(e) => onChange("database_url", e.target.value)}
            placeholder="sqlite+aiosqlite:///~/.hinoter-lite/data/hinoter.db (vazio = padrão)"
            className="w-full rounded-xl border border-line bg-surface2 px-3.5 py-2.5 text-xs font-mono text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <p className="text-[10px] text-ink-faint">
            Deixe em branco para usar o banco SQLite embutido no diretório de dados.
          </p>
        </div>

        {/* Limite de Upload */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              Limite Máximo de Upload por Arquivo (MB):
            </label>
            <span className="text-[10px] font-mono text-accent font-bold">
              {values["max_upload_mb"] || "300"} MB
            </span>
          </div>
          <input
            type="number"
            min={10}
            max={5000}
            value={values["max_upload_mb"] || "300"}
            onChange={(e) => onChange("max_upload_mb", e.target.value)}
            className="w-full rounded-xl border border-line bg-surface2 px-3.5 py-2.5 text-xs font-mono text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <p className="text-[10px] text-ink-faint">
            Arquivos de áudio ou PDFs maiores que este tamanho serão recusados no upload.
          </p>
        </div>
      </div>

      {/* Card 2: Pipeline de Inteligência & Chunking de Texto */}
      <div className="rounded-2xl border border-accent/30 bg-surface p-4 sm:p-5 shadow-soft space-y-4 relative focus-within:z-30">
        {/* Header */}
        <div className="flex items-center gap-2.5 pb-2 border-b border-line">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-soft">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-ink flex items-center gap-1.5">
              <span>Pipeline de Resumo & Limites de Contexto (Tokens)</span>
              <span className="rounded bg-accent/15 px-1.5 py-0.2 font-mono text-[9.5px] font-semibold text-accent">
                Chunking
              </span>
            </h3>
            <p className="text-[11px] text-ink-soft">
              Parâmetros de fragmentação de transcrições longas e resiliência de chamadas à API.
            </p>
          </div>
        </div>

        {/* Limite de Tokens por Chunk */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              <span>Limite de Tokens por Fragmento (Chunking):</span>
            </label>
            <span className="text-[10px] font-mono text-accent font-bold">
              {values["llm_chunk_token_limit"] || "12000"} tokens
            </span>
          </div>
          <input
            type="number"
            min={1000}
            max={100000}
            step={1000}
            value={values["llm_chunk_token_limit"] || "12000"}
            onChange={(e) => onChange("llm_chunk_token_limit", e.target.value)}
            className="w-full rounded-xl border border-line bg-surface2 px-3.5 py-2.5 text-xs font-mono text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <p className="text-[10px] text-ink-faint">
            Transcrições que ultrapassarem este tamanho serão divididas em blocos e sintetizadas em mapa mental hierárquico.
          </p>
        </div>

        {/* Resiliência e Tentativas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-line/60">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1">
              <RefreshCw className="h-3.5 w-3.5 text-accent" />
              <span>Tentativas (Retries):</span>
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={values["llm_max_retries"] || "3"}
              onChange={(e) => onChange("llm_max_retries", e.target.value)}
              className="w-full rounded-xl border border-line bg-surface2 px-3.5 py-2 text-xs font-mono text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5 text-accent" />
              <span>Delay Base (Segundos):</span>
            </label>
            <input
              type="number"
              min={0.5}
              max={10}
              step={0.5}
              value={values["llm_retry_base_delay"] || "2.0"}
              onChange={(e) => onChange("llm_retry_base_delay", e.target.value)}
              className="w-full rounded-xl border border-line bg-surface2 px-3.5 py-2 text-xs font-mono text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
