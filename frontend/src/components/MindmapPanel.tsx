import { memo, useMemo, useState } from "react";
import {
  BrainCircuit,
  Check,
  Copy,
  Download,
  GitFork,
  ListTree,
  Maximize2,
  Minimize2,
  RefreshCw,
  Sparkles,
  Compass,
  Workflow,
} from "lucide-react";
import { useGenerateMindmap } from "@/hooks/queries";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import type { MindmapNode, Recording } from "@/types";
import { RadialMindmapCanvas } from "./mindmap/RadialMindmapCanvas";
import { HorizontalTreeCanvas } from "./mindmap/HorizontalTreeCanvas";

export const MindmapPanel = memo(function MindmapPanel({
  recording,
}: {
  recording: Recording;
}) {
  const [viewMode, setViewMode] = useState<"radial" | "horizontal" | "outline" | "mermaid">("radial");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateMindmapMutation = useGenerateMindmap();

  // Parse mindmap from recording
  const mindmapData: MindmapNode | null = useMemo(() => {
    if (recording.mindmap_json) {
      try {
        const parsed = JSON.parse(recording.mindmap_json);
        if (parsed && typeof parsed === "object" && parsed.name) {
          return parsed as MindmapNode;
        }
      } catch {}
    }

    // Fallback: Infer tree structure from summary markdown headers & bullets
    if (recording.summary_markdown) {
      return parseMarkdownToMindmap(recording.title, recording.summary_markdown);
    }

    return null;
  }, [recording.mindmap_json, recording.summary_markdown, recording.title]);

  const handleGenerate = () => {
    generateMindmapMutation.mutate(recording.id);
  };

  const mermaidCode = useMemo(() => {
    if (!mindmapData) return "";
    return generateMermaidMindmap(mindmapData);
  }, [mindmapData]);

  const handleCopyMermaid = async () => {
    if (!mermaidCode) return;
    try {
      await navigator.clipboard.writeText(mermaidCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownloadMermaid = () => {
    if (!mermaidCode) return;
    const blob = new Blob([mermaidCode], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${recording.title || "mapa-mental"}-mindmap.mmd`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!mindmapData) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 rounded-3xl border-2 border-dashed border-accent/30 bg-surface/80 p-8 sm:p-12 text-center animate-fade-in shadow-soft">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-accent text-white shadow-soft">
          <BrainCircuit className="h-8 w-8" />
        </div>
        <div className="max-w-md space-y-2">
          <h3 className="font-serif text-xl font-bold text-ink">
            Gerar Mapa Mental Conceitual
          </h3>
          <p className="text-xs sm:text-sm text-ink-soft leading-relaxed">
            Estruture automaticamente os tópicos, argumentos, fórmulas e conexões da sua gravação em uma árvore visual interativa.
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={handleGenerate}
          loading={generateMindmapMutation.isPending}
          className="rounded-2xl px-6 font-semibold"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Gerar Mapa Mental com IA
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:gap-4 rounded-2xl sm:rounded-3xl border border-line bg-surface/85 p-3 sm:p-6 shadow-soft transition-all",
        isFullscreen && "fixed inset-2 sm:inset-4 z-50 overflow-hidden bg-paper shadow-2xl p-3 sm:p-6 border-accent/40",
      )}
    >
      {/* Mindmap Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 border-b border-line pb-3 sm:pb-4">
        {/* Left: Title & Mode Switcher */}
        <div className="flex items-center justify-between sm:justify-start gap-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 mr-1 shrink-0">
            <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-accent/15 text-accent font-bold text-sm sm:text-base">
              {recording.icon || "🧠"}
            </span>
            <span className="text-xs sm:text-sm font-bold text-ink hidden xs:inline">
              Mapa Mental
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface2 p-1 overflow-x-auto no-scrollbar touch-pan-x shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("radial")}
              className={cn(
                "flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-2.5 py-1.5 text-xs font-semibold transition-all touch-tap whitespace-nowrap",
                viewMode === "radial"
                  ? "bg-accent text-white shadow-xs"
                  : "text-ink-soft hover:text-ink",
              )}
            >
              <Compass className="h-3.5 w-3.5" />
              <span>Radial 360°</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("horizontal")}
              className={cn(
                "flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-2.5 py-1.5 text-xs font-semibold transition-all touch-tap whitespace-nowrap",
                viewMode === "horizontal"
                  ? "bg-accent text-white shadow-xs"
                  : "text-ink-soft hover:text-ink",
              )}
            >
              <Workflow className="h-3.5 w-3.5" />
              <span>Árvore</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("outline")}
              className={cn(
                "flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-2.5 py-1.5 text-xs font-semibold transition-all touch-tap whitespace-nowrap",
                viewMode === "outline"
                  ? "bg-accent text-white shadow-xs"
                  : "text-ink-soft hover:text-ink",
              )}
            >
              <ListTree className="h-3.5 w-3.5" />
              <span>Lista</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("mermaid")}
              className={cn(
                "flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-2.5 py-1.5 text-xs font-semibold transition-all touch-tap whitespace-nowrap",
                viewMode === "mermaid"
                  ? "bg-accent text-white shadow-xs"
                  : "text-ink-soft hover:text-ink",
              )}
            >
              <GitFork className="h-3.5 w-3.5" />
              <span>Mermaid</span>
            </button>
          </div>
        </div>

        {/* Right: Controls & Actions */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant="surface"
            size="sm"
            onClick={handleGenerate}
            loading={generateMindmapMutation.isPending}
            className="text-xs h-8 sm:h-9"
            title="Regenerar Mapa Mental com IA"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            <span className="hidden xs:inline">Regenerar</span>
          </Button>

          <Button
            variant="surface"
            size="sm"
            onClick={() => setIsFullscreen((v) => !v)}
            className="text-xs h-8 sm:h-9"
            title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Mindmap Canvas / Views */}
      <div className={cn("relative w-full overflow-hidden rounded-2xl", isFullscreen && "flex-1")}>
        {viewMode === "radial" && (
          <RadialMindmapCanvas
            data={mindmapData}
            title={recording.title}
            icon={recording.icon || "🧠"}
          />
        )}

        {viewMode === "horizontal" && (
          <HorizontalTreeCanvas
            data={mindmapData}
            title={recording.title}
            icon={recording.icon || "🧠"}
          />
        )}

        {viewMode === "outline" && (
          <div className="max-w-3xl mx-auto space-y-4 p-4 sm:p-6 bg-paper/60 rounded-2xl border border-line">
            <div className="flex items-center gap-2 border-b border-line pb-3">
              <span className="text-xl">{recording.icon || "📚"}</span>
              <h3 className="font-serif text-lg font-bold text-ink">{mindmapData.name}</h3>
            </div>
            <ul className="space-y-4 pt-2">
              {(mindmapData.subbranches ?? []).map((branch, idx) => (
                <MindmapOutlineItem key={idx} node={branch} index={idx} />
              ))}
            </ul>
          </div>
        )}

        {viewMode === "mermaid" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-soft">
                Código Mermaid Mindmap (Compatível com Notion, Obsidian e Markdown):
              </span>
              <div className="flex items-center gap-2">
                <Button variant="surface" size="sm" onClick={handleCopyMermaid} className="text-xs">
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                      <span className="text-emerald-600 font-semibold">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Copiar
                    </>
                  )}
                </Button>
                <Button variant="surface" size="sm" onClick={handleDownloadMermaid} className="text-xs">
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Baixar .mmd
                </Button>
              </div>
            </div>
            <pre className="rounded-2xl border border-line bg-night p-4 font-mono text-xs text-night-text overflow-x-auto leading-relaxed">
              {mermaidCode}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
});

function MindmapOutlineItem({ node, index }: { node: MindmapNode; index: number }) {
  const subs = node.subbranches ?? [];
  return (
    <li className="rounded-2xl border border-line bg-surface p-4 shadow-soft space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/15 font-mono text-xs font-bold text-accent">
          {index + 1}
        </span>
        <h4 className="font-serif text-[15px] font-bold text-ink">{node.name}</h4>
      </div>
      {subs.length > 0 && (
        <ul className="pl-8 space-y-1.5 list-disc marker:text-accent">
          {subs.map((sub, sIdx) => (
            <li key={sIdx} className="text-xs sm:text-[13px] text-ink-soft leading-relaxed">
              {sub.name}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function parseMarkdownToMindmap(title: string, md: string): MindmapNode {
  const lines = md.split("\n");
  const branches: MindmapNode[] = [];
  let currentBranch: MindmapNode | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("### ") || trimmed.startsWith("## ")) {
      const headerText = trimmed.replace(/^#{2,3}\s+/, "").trim();
      currentBranch = { name: headerText, subbranches: [] };
      branches.push(currentBranch);
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const bulletText = trimmed.replace(/^[-*]\s+/, "").trim();
      if (currentBranch) {
        currentBranch.subbranches = currentBranch.subbranches || [];
        currentBranch.subbranches.push({ name: bulletText, subbranches: [] });
      }
    }
  }

  return {
    name: title || "Resumo",
    subbranches: branches.length > 0 ? branches : [{ name: "Tópicos Principais", subbranches: [] }],
  };
}

function generateMermaidMindmap(root: MindmapNode): string {
  const sanitize = (text: string) => text.replace(/["()]/g, "'").trim();
  const lines: string[] = ["mindmap", `  root(("${sanitize(root.name)}"))`];

  for (const b of root.subbranches || []) {
    lines.push(`    ["${sanitize(b.name)}"]`);
    for (const sub of b.subbranches || []) {
      lines.push(`      ("${sanitize(sub.name)}")`);
    }
  }

  return lines.join("\n");
}
