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
    // 1. Check if mindmap_json is a rich, valid mindmap (more than 1 branch)
    if (recording.mindmap_json) {
      try {
        const parsed = JSON.parse(recording.mindmap_json);
        if (
          parsed &&
          typeof parsed === "object" &&
          parsed.name &&
          Array.isArray(parsed.subbranches) &&
          parsed.subbranches.length > 1 &&
          parsed.name !== "Conteúdo"
        ) {
          return parsed as MindmapNode;
        }
      } catch {}
    }

    // 2. Infer rich tree structure from summary markdown headers, numbered sections & bullets
    if (recording.summary_markdown && recording.summary_markdown.trim()) {
      const parsedFromMd = parseMarkdownToMindmap(recording.title, recording.summary_markdown);
      if (parsedFromMd.subbranches && parsedFromMd.subbranches.length > 0) {
        return parsedFromMd;
      }
    }

    // 3. Fallback to whatever mindmap_json had if available
    if (recording.mindmap_json) {
      try {
        const parsed = JSON.parse(recording.mindmap_json);
        if (parsed && typeof parsed === "object" && parsed.name) {
          return parsed as MindmapNode;
        }
      } catch {}
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
    if (!trimmed) continue;

    // Check for Headings: ## ..., ### ..., # ..., or numbered sections like "1. Tese Central", "2. Definições", etc.
    const isHeading =
      /^#{1,4}\s+/.test(trimmed) ||
      /^\d+[\.\)]\s+[A-ZÀ-Úa-zà-ú]/.test(trimmed) ||
      /^\*\*\d+[\.\)]\s+/.test(trimmed) ||
      /^\*\*[A-ZÀ-Ú][^*]{3,40}\*\*:?$/.test(trimmed);

    if (isHeading) {
      // Clean header text
      let headerText = trimmed
        .replace(/^#{1,4}\s+/, "")
        .replace(/^\*\*/, "")
        .replace(/\*\*$/, "")
        .replace(/[:：]$/, "")
        .trim();

      // Skip generic summary titles
      const lower = headerText.toLowerCase();
      if (
        headerText.length > 1 &&
        !lower.includes("fichamento analítico") &&
        !lower.includes("resumo estruturado") &&
        !lower.includes("resumo anotado")
      ) {
        if (headerText.length > 45) {
          headerText = headerText.slice(0, 42) + "…";
        }
        currentBranch = { name: headerText, subbranches: [] };
        branches.push(currentBranch);
        continue;
      }
    }

    // Check for bullets: - ..., * ..., or numbered sub-items "1.1 ...", "a) ..."
    const isBullet =
      /^[-*•]\s+/.test(trimmed) ||
      /^\d+\.\d+\s+/.test(trimmed) ||
      /^[a-zA-Z][\.\)]\s+/.test(trimmed) ||
      /^\*\*[^*]+\*\*:/.test(trimmed);

    if (isBullet && currentBranch) {
      let bulletText = trimmed
        .replace(/^[-*•]\s+/, "")
        .replace(/^\d+\.\d+\s+/, "")
        .replace(/^[a-zA-Z][\.\)]\s+/, "")
        .replace(/\*\*/g, "")
        .trim();

      if (bulletText.length > 1) {
        if (bulletText.length > 40) {
          bulletText = bulletText.slice(0, 38) + "…";
        }
        currentBranch.subbranches = currentBranch.subbranches || [];
        if (currentBranch.subbranches.length < 8) {
          currentBranch.subbranches.push({ name: bulletText, subbranches: [] });
        }
      }
    } else if (!isHeading && currentBranch && currentBranch.subbranches && currentBranch.subbranches.length < 5) {
      // If there are key sentences under a heading that is not bulleted
      const sentences = trimmed.split(/[\.;]\s+/);
      for (const sent of sentences) {
        const cleanSent = sent.replace(/\*\*/g, "").trim();
        if (
          cleanSent.length > 10 &&
          cleanSent.length < 75 &&
          !cleanSent.startsWith("|") &&
          !cleanSent.startsWith("$$") &&
          !cleanSent.startsWith("```")
        ) {
          const name = cleanSent.length > 38 ? cleanSent.slice(0, 36) + "…" : cleanSent;
          currentBranch.subbranches.push({ name, subbranches: [] });
          break;
        }
      }
    }
  }

  // If still fewer than 2 branches, parse by paragraphs
  if (branches.length < 2 && md.length > 80) {
    const paragraphs = md.split(/\n\s*\n/).filter((p) => p.trim().length > 15);
    for (let i = 0; i < Math.min(paragraphs.length, 6); i++) {
      const firstLine = paragraphs[i].trim().split("\n")[0].replace(/[#*`_]/g, "").trim();
      if (firstLine && firstLine.length > 3) {
        branches.push({
          name: firstLine.length > 38 ? firstLine.slice(0, 36) + "…" : firstLine,
          subbranches: [],
        });
      }
    }
  }

  return {
    name: title || "Mapa Mental",
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
