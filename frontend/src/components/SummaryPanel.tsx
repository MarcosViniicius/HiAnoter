import { memo, useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  CheckSquare,
  Download,
  ExternalLink,
  FileCode,
  FileText,
  MessageSquareHeart,
  Printer,
  Sparkles,
  Wand2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { useExportNotion, useSummarizeRecording } from "@/hooks/queries";
import { SUMMARY_STYLES } from "./SummaryStyleSelector";
import { ReconfigureSummaryModal } from "./ReconfigureSummaryModal";
import { RecordingChatDrawer } from "./RecordingChatDrawer";
import { formatCost } from "@/lib/format";
import { normalizeMathMarkdown } from "@/lib/math";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import type { Recording } from "@/types";

export const SummaryPanel = memo(function SummaryPanel({
  recording,
  initialTranscriptionId,
  onOpenHistory,
  onOpenDocuments,
}: {
  recording: Recording;
  initialTranscriptionId?: string;
  onOpenHistory?: () => void;
  onOpenDocuments?: () => void;
}) {
  const [reconfigureOpen, setReconfigureOpen] = useState(Boolean(initialTranscriptionId && !recording.summary_markdown));
  const [chatOpen, setChatOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  const summarizeMutation = useSummarizeRecording();

  const activeSv = (recording.summary_versions ?? []).find(
    (sv) => sv.id === recording.active_summary_id,
  );
  const transcriptions = recording.transcription_versions ?? [];

  const markdown = recording.summary_markdown;
  const currentStyleMeta =
    SUMMARY_STYLES.find((s) => s.id === (recording.summary_style || "ABSTRACT")) ||
    SUMMARY_STYLES[0];

  const sourceTv = transcriptions.find(
    (t) => t.id === (activeSv?.transcription_version_id || recording.active_transcription_id),
  );

  const docsCount = recording.documents?.length ?? recording.documents_count ?? 0;

  // Normalize markdown to support all LaTeX formats ($...$, $$...$$, \[...\], \(...\), bare commands)
  const normalizedMarkdown = useMemo(
    () => normalizeMathMarkdown(markdown),
    [markdown],
  );

  const customMarkdownComponents = useMemo(
    () => ({
      code({ node, inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || "");
        const codeString = String(children).replace(/\n$/, "");
        if (inline) {
          return (
            <code
              className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[13px] text-ink-deep font-semibold"
              {...props}
            >
              {children}
            </code>
          );
        }
        return <CodeBlock language={match ? match[1] : undefined} code={codeString} />;
      },
      table({ children }: any) {
        return (
          <div className="my-4 overflow-x-auto rounded-2xl border border-line bg-surface shadow-soft">
            <table className="w-full text-left text-sm border-collapse">{children}</table>
          </div>
        );
      },
      th({ children }: any) {
        return (
          <th className="border-b border-line bg-surface2 px-4 py-2.5 font-bold text-ink">
            {children}
          </th>
        );
      },
      td({ children }: any) {
        return <td className="border-b border-line/60 px-4 py-2.5 text-ink-soft">{children}</td>;
      },
      blockquote({ children }: any) {
        return (
          <blockquote className="my-4 border-l-4 border-accent bg-accent-soft/30 px-4 py-2 italic text-ink-soft rounded-r-xl">
            {children}
          </blockquote>
        );
      },
    }),
    [],
  );

  const renderedMarkdown = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={customMarkdownComponents}
      >
        {normalizedMarkdown}
      </ReactMarkdown>
    ),
    [normalizedMarkdown, customMarkdownComponents],
  );

  const handleCopySummary = async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownloadMarkdown = () => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${recording.title || "resumo"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const toggleCheckItem = (idx: number) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const wordCount = useMemo(() => {
    return markdown ? markdown.split(/\s+/).filter(Boolean).length : 0;
  }, [markdown]);

  const readTimeMin = Math.max(1, Math.ceil(wordCount / 200));

  if (summarizeMutation.isPending) {
    return <SummaryGeneratingLoader style={recording.summary_style} />;
  }

  const isSummarizing = (recording.status || "").toUpperCase() === "SUMMARIZING" || summarizeMutation.isPending;

  if (!markdown) {
    return (
      <>
        <SummaryMissing
          recording={recording}
          onOpenReconfigure={() => setReconfigureOpen(true)}
          isLoading={summarizeMutation.isPending}
          isSummarizing={isSummarizing}
        />
        <ReconfigureSummaryModal
          open={reconfigureOpen}
          onClose={() => setReconfigureOpen(false)}
          recording={recording}
          initialTranscriptionId={initialTranscriptionId}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* Banner de geração em segundo plano se já existir um resumo anterior */}
      {isSummarizing && (
        <div className="rounded-2xl border border-accent/40 bg-accent-soft/40 p-4 flex items-center gap-3.5 shadow-soft animate-pulse">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-soft animate-spin">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-ink">
              Gerando nova versão do resumo ({currentStyleMeta.title})...
            </p>
            <p className="text-[11px] text-ink-soft">
              Você pode continuar lendo o resumo atual. Assim que o processamento for concluído, os dados atualizarão automaticamente em tempo real.
            </p>
          </div>
        </div>
      )}

      {/* Controles de estilo e contexto */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 rounded-2xl border border-line bg-surface p-3 sm:px-4 sm:py-3 no-print">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent shrink-0">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-xs sm:text-[13px] font-semibold text-ink">
            {currentStyleMeta.title}
          </span>
          <span className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[9.5px] sm:text-[10px] text-ink-faint">
            {currentStyleMeta.badge}
          </span>
          {activeSv && (
            <span className="rounded-lg bg-surface2 px-2 py-0.5 font-mono text-[11px] sm:text-xs font-bold text-ink">
              v{activeSv.version_number}
            </span>
          )}
          {sourceTv && (
            <span className="rounded bg-accent/10 px-2 py-0.5 text-[9.5px] sm:text-[10px] font-medium text-accent">
              Áudio v{sourceTv.version_number}
            </span>
          )}
          {docsCount > 0 && (
            <button
              type="button"
              onClick={onOpenDocuments}
              className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[9.5px] sm:text-[10px] font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
              title="Ver documentos anexos usados como contexto"
            >
              <span>📎 {docsCount} anexo(s)</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {recording.summary_versions && recording.summary_versions.length > 1 && (
            <Button
              variant="surface"
              size="sm"
              onClick={onOpenHistory}
              className="text-xs text-ink-soft h-8 sm:h-9"
            >
              Versões ({recording.summary_versions.length})
            </Button>
          )}
          <Button
            variant="surface"
            size="sm"
            onClick={() => setReconfigureOpen(true)}
            className="text-xs font-semibold text-accent border-accent/30 hover:bg-accent/10 h-8 sm:h-9"
            title="Reconfigurar modelo, documentos e observações para gerar novo resumo"
          >
            <Wand2 className="h-3.5 w-3.5 mr-1" />
            Novo Resumo
          </Button>
        </div>
      </div>

      {/* Modal de Reconfiguração do Resumo */}
      <ReconfigureSummaryModal
        open={reconfigureOpen}
        onClose={() => setReconfigureOpen(false)}
        recording={recording}
        initialTranscriptionId={initialTranscriptionId}
      />

      {/* folha do documento */}
      <section
        aria-label="Conteúdo do Resumo"
        className="rounded-2xl sm:rounded-3xl border border-line bg-paper p-3.5 sm:p-7 md:p-9 shadow-soft space-y-4 sm:space-y-6"
      >
        <header className="flex flex-col gap-3 sm:gap-4 border-b border-line pb-4 sm:pb-5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="font-mono text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-accent-deep">
                {currentStyleMeta.title} [{currentStyleMeta.badge}]
              </span>
              <span className="text-ink-faint">·</span>
              <span className="text-[11px] sm:text-xs text-ink-faint">
                {wordCount} palavras · ~{readTimeMin} min de leitura
              </span>
            </div>
            <h2 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-ink sm:text-3xl leading-snug">
              {recording.title}
            </h2>
          </div>

          {/* Quick Actions: Chat IA, Copiar & Baixar */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 no-print pt-1">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setChatOpen(true)}
              className="text-xs shadow-soft font-semibold min-h-[38px] sm:min-h-[36px] flex-1 sm:flex-initial justify-center"
              title="Abrir chat interativo com IA sobre esta aula"
            >
              <MessageSquareHeart className="h-4 w-4 mr-1.5" />
              Tirar Dúvidas com IA
            </Button>
            <Button
              variant="surface"
              size="sm"
              onClick={handleCopySummary}
              className="text-xs min-h-[38px] sm:min-h-[36px]"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                  <span className="text-emerald-600 font-semibold">Copiado!</span>
                </>
              ) : (
                "Copiar"
              )}
            </Button>
            <Button
              variant="surface"
              size="sm"
              onClick={handleDownloadMarkdown}
              className="text-xs min-h-[38px] sm:min-h-[36px]"
              title="Baixar resumo como arquivo Markdown (.md)"
            >
              <Download className="h-3.5 w-3.5 mr-1 text-ink-faint" />
              .md
            </Button>
            <Button
              variant="surface"
              size="sm"
              onClick={handlePrintPdf}
              className="text-xs min-h-[38px] sm:min-h-[36px]"
              title="Salvar ou imprimir como documento PDF"
            >
              <Printer className="h-3.5 w-3.5 mr-1 text-accent" />
              PDF
            </Button>
            {recording.llm_cost_usd != null && (
              <span
                className="hidden md:inline rounded-lg bg-subtle px-2 py-1 font-mono text-[11px] text-ink-faint"
                title="Custo estimado da chamada ao modelo LLM"
              >
                ≈ {formatCost(recording.llm_cost_usd)}
              </span>
            )}
          </div>
        </header>

        {/* markdown rendered with math / LaTeX */}
        <div className="summary-markdown-content prose max-w-none text-ink text-sm sm:text-[15px] leading-relaxed sm:leading-[1.85] font-sans">
          {renderedMarkdown}
        </div>

        {/* interactive action items */}
        {recording.action_items && recording.action_items.length > 0 && (
          <div className="mt-6 sm:mt-8 rounded-2xl border border-line bg-surface2/60 p-3.5 sm:p-5 shadow-sm">
            <h3 className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ink-soft">
              <span className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-accent" />
                Itens de Ação & Tarefas ({recording.action_items.length})
              </span>
              <span className="text-[11px] font-normal lowercase text-ink-faint no-print">
                (clique para marcar)
              </span>
            </h3>
            <ul className="space-y-2 sm:space-y-2.5">
              {recording.action_items.map((item, idx) => {
                const isChecked = Boolean(checkedItems[idx]);
                return (
                  <li
                    key={idx}
                    onClick={() => toggleCheckItem(idx)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl p-2 cursor-pointer transition-colors select-none",
                      isChecked
                        ? "bg-accent/5 text-ink-faint line-through"
                        : "hover:bg-surface text-ink",
                    )}
                  >
                    <button
                      type="button"
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        isChecked
                          ? "border-accent bg-accent text-white"
                          : "border-line bg-surface text-transparent",
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <span className="flex-1 text-[13.5px] leading-snug">{item}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* exportação */}
      <ExportPanel recording={recording} onPrintPdf={handlePrintPdf} />

      <RecordingChatDrawer
        recording={recording}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </div>
  );
});

function CodeBlock({ language, code }: { language?: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-4 rounded-2xl border border-line bg-surface2/90 overflow-hidden shadow-soft not-prose">
      <div className="flex items-center justify-between px-4 py-2 border-b border-line bg-surface text-xs text-ink-faint font-mono">
        <span className="font-semibold text-accent">{language || "código"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-ink-soft hover:text-ink transition-colors p-1"
          title="Copiar trecho de código"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <FileCode className="h-3.5 w-3.5" />}
          <span>{copied ? "Copiado!" : "Copiar"}</span>
        </button>
      </div>
      <pre className="p-4 overflow-x-auto font-mono text-[13px] leading-relaxed text-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function SummaryMissing({
  recording,
  onOpenReconfigure,
  isLoading,
  isSummarizing,
}: {
  recording: Recording;
  onOpenReconfigure: () => void;
  isLoading?: boolean;
  isSummarizing?: boolean;
}) {
  const msg = recording.summary_error_message;

  if (isSummarizing) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-accent/60 bg-accent-soft/30 p-8 sm:p-12 text-center animate-pulse">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-soft animate-spin">
          <Sparkles className="h-7 w-7" />
        </div>
        <div className="max-w-md space-y-2">
          <h3 className="text-lg font-bold text-ink">
            Sintetizando Resumo Analítico...
          </h3>
          <p className="text-xs sm:text-sm text-ink-soft leading-relaxed">
            O modelo está processando o conteúdo e documentos de apoio. Assim que concluir, o resumo estruturado aparecerá aqui em tempo real.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 rounded-3xl border-2 border-dashed border-accent/40 bg-accent-soft/20 p-6 sm:p-8 text-center animate-fade-in">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-soft">
        <Sparkles className="h-7 w-7" />
      </div>

      <div className="max-w-md mx-auto space-y-1.5">
        <h3 className="text-lg font-bold text-ink">
          Pronto para Gerar o Resumo Inteligente
        </h3>
        <p className="text-xs sm:text-sm text-ink-soft leading-relaxed">
          Configure os documentos de apoio, o modelo analítico e gere o resumo com suporte total a fórmulas matemáticas e códigos.
        </p>
        {msg && (
          <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-500/10 rounded-lg p-2.5">
            {msg}
          </p>
        )}
      </div>

      <div className="flex justify-center">
        <Button
          variant="primary"
          size="lg"
          onClick={onOpenReconfigure}
          loading={isLoading}
          className="shadow-depth font-bold"
        >
          <Wand2 className="h-4 w-4 mr-2" />
          Configurar e Gerar Resumo
        </Button>
      </div>
    </div>
  );
}

function ExportPanel({
  recording,
  onPrintPdf,
}: {
  recording: Recording;
  onPrintPdf: () => void;
}) {
  const exportMutation = useExportNotion();
  const exporting = exportMutation.isPending;

  return (
    <div className="space-y-4 rounded-3xl border border-line bg-surface p-5 sm:p-6 shadow-soft no-print">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
          Exportações & Downloads
        </h3>
        {recording.notion_page_url && (
          <a
            href={recording.notion_page_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span>Página no Notion</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
        {/* Baixar Markdown */}
        <button
          type="button"
          onClick={() => {
            const blob = new Blob([recording.summary_markdown || ""], {
              type: "text/markdown;charset=utf-8",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${recording.title || "resumo"}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }}
          className="flex items-center gap-2.5 rounded-xl border border-line bg-surface2 p-3 text-left hover:border-accent hover:bg-accent-soft/30 transition-all text-xs font-medium text-ink"
        >
          <FileText className="h-4 w-4 text-accent shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Baixar .MD</p>
            <p className="text-[10px] text-ink-faint">Markdown com LaTeX nativo</p>
          </div>
        </button>

        {/* Salvar como PDF */}
        <button
          type="button"
          onClick={onPrintPdf}
          className="flex items-center gap-2.5 rounded-xl border border-line bg-surface2 p-3 text-left hover:border-accent hover:bg-accent-soft/30 transition-all text-xs font-medium text-ink"
        >
          <Printer className="h-4 w-4 text-accent shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Salvar como PDF</p>
            <p className="text-[10px] text-ink-faint">Fórmulas renderizadas com KaTeX</p>
          </div>
        </button>

        {/* Baixar Legendas SRT */}
        <a
          href={`/api/recordings/${recording.id}/export/srt`}
          download={`${recording.title || "transcricao"}.srt`}
          className="flex items-center gap-2.5 rounded-xl border border-line bg-surface2 p-3 text-left hover:border-accent hover:bg-accent-soft/30 transition-all text-xs font-medium text-ink"
        >
          <FileCode className="h-4 w-4 text-emerald-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Legendas .SRT</p>
            <p className="text-[10px] text-ink-faint">Sincronizado para YouTube / VLC</p>
          </div>
        </a>

        {/* Baixar Legendas VTT */}
        <a
          href={`/api/recordings/${recording.id}/export/vtt`}
          download={`${recording.title || "transcricao"}.vtt`}
          className="flex items-center gap-2.5 rounded-xl border border-line bg-surface2 p-3 text-left hover:border-accent hover:bg-accent-soft/30 transition-all text-xs font-medium text-ink"
        >
          <Download className="h-4 w-4 text-sky-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Legendas .VTT</p>
            <p className="text-[10px] text-ink-faint">Padrão WebVTT para navegadores</p>
          </div>
        </a>
      </div>

      {/* Notion Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-line/60">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-ink">
            Sincronizar com Notion
          </p>
          <p className="text-[10px] sm:text-[11px] text-ink-faint">
            Envia o resumo e tarefas para seu workspace no Notion.
          </p>
        </div>
        <Button
          variant="surface"
          size="sm"
          onClick={() => exportMutation.mutate(recording.id)}
          loading={exporting}
          disabled={exporting}
          className="justify-center font-medium text-xs"
        >
          {!exporting && <ExternalLink className="h-3 w-3 mr-1" />}
          Exportar para o Notion
        </Button>
      </div>
    </div>
  );
}

function SummaryGeneratingLoader({ style }: { style?: string }) {
  const [stepIndex, setStepIndex] = useState(0);
  const steps = [
    "Conectando ao modelo de inteligência artificial…",
    "Analisando transcrição e documentos contextuais…",
    "Estruturando seções e refinando pontos essenciais…",
    "Formatando equações matemáticas (LaTeX) e códigos…",
    "Extraindo itens de ação e deliberações-chave…",
    "Finalizando formatação do resumo em Markdown…",
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex((i) => (i < steps.length - 1 ? i + 1 : i));
    }, 3000);
    return () => clearInterval(timer);
  }, [steps.length]);

  const styleMeta = SUMMARY_STYLES.find((s) => s.id === style) || SUMMARY_STYLES[0];

  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-accent/40 bg-accent-soft/30 p-8 sm:p-12 text-center shadow-soft animate-fade-in space-y-6 my-4">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-3xl bg-accent opacity-30" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-soft">
          <Sparkles className="h-7 w-7 animate-pulse" />
        </div>
      </div>

      <div className="max-w-md space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
          <Wand2 className="h-3.5 w-3.5 animate-spin" />
          Gerando Resumo: {styleMeta.title}
        </div>
        <h3 className="text-lg sm:text-xl font-bold text-ink">
          Processando Conteúdo com IA
        </h3>
        <p className="text-xs sm:text-sm text-ink-soft min-h-[22px] transition-all duration-300">
          {steps[stepIndex]}
        </p>
      </div>

      {/* Animated progress track */}
      <div className="w-full max-w-sm overflow-hidden rounded-full bg-accent/20 h-2">
        <div
          className="h-full bg-accent transition-all duration-700 ease-out"
          style={{ width: `${Math.min(95, (stepIndex + 1) * 20)}%` }}
        />
      </div>

      <p className="text-[11px] text-ink-faint">
        O modelo LLM está sintetizando a transcrição. Isso geralmente leva de 5 a 20 segundos.
      </p>
    </div>
  );
}