import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  FileCheck2,
  FileSearch,
  FileSpreadsheet,
  Info,
  Layers,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SummaryStyle } from "@/types";

export interface StyleOption {
  id: SummaryStyle;
  title: string;
  badge: string;
  description: string;
  domain: string;
  icon: typeof Sparkles;
  preview: string;
}

export const SUMMARY_STYLES: StyleOption[] = [
  {
    id: "ABSTRACT",
    title: "Abstract Executivo",
    badge: "ANSI/NISO Z39.14",
    description:
      "Síntese concisa de 150–250 palavras com objetivos centrais, pontos-chave e encaminhamentos imediatos.",
    domain: "Corporativo, Decisões, Liderança",
    icon: FileSpreadsheet,
    preview:
      "# Resumo Executivo\nSíntese densa e factual das deliberações centrais...\n\n## Pontos-Chave e Deliberações\n- Decisão principal alinhada\n- Prazos e responsáveis definidos",
  },
  {
    id: "PLAIN_LANGUAGE",
    title: "Linguagem Simples (PLS)",
    badge: "Padrão Cochrane",
    description:
      "Texto desmistificado e direto, sem jargões complexos, ideal para comunicação clara e ampla compreensão.",
    domain: "Comunicação, Clientes, Geral",
    icon: BookOpen,
    preview:
      "# Resumo em Linguagem Simples\nExplicamos o assunto de forma direta, sem termos técnicos difíceis...\n\n## O Que Você Precisa Saber\n- Entenda a mudança em passos simples\n- Principais benefícios práticos",
  },
  {
    id: "STRUCTURED_IMRAD",
    title: "Abstract Estruturado (IMRaD)",
    badge: "Padrão Acadêmico/Técnico",
    description:
      "Formato formal organizado em: Contexto (Background), Métodos/Pautas, Resultados/Discussão e Conclusões.",
    domain: "Engenharia, Pesquisa, Técnico",
    icon: Layers,
    preview:
      "## 1. Contexto e Objetivos (Background)\n## 2. Metodologia e Pautas (Methods)\n## 3. Discussão e Resultados (Results)\n## 4. Conclusões e Encaminhamentos",
  },
  {
    id: "CRITICAL_APPRAISAL",
    title: "Avaliação Crítica & Riscos",
    badge: "Metodologia GRADE",
    description:
      "Auditoria analítica evidenciando riscos, potenciais vieses, premissas frágeis, lacunas e medidas de mitigação.",
    domain: "Auditoria, Riscos, Revisão Técnica",
    icon: FileSearch,
    preview:
      "# Avaliação Crítica e Qualidade\n## Riscos e Inconsistências\n- Premissa X não confirmada\n## Lacunas e Mitigações\n- Ação de contenção recomendada",
  },
  {
    id: "ANNOTATED",
    title: "Resumo Anotado / Sistemático",
    badge: "Revisão Sistemática",
    description:
      "Síntese detalhada cronológica e temática com carimbos de tempo, citações diretas e referência aos documentos anexos.",
    domain: "Workshops, Aulas, Documentação",
    icon: FileCheck2,
    preview:
      "# Resumo Anotado\n## Anotações Cronológicas e Citações\n- [05:20] 'Citação relevante'\n## Vínculo com Documentos Anexos\n- Relacionado ao slide 4",
  },
];

export function SummaryStyleSelector({
  value,
  onChange,
  className,
}: {
  value: SummaryStyle | string;
  onChange: (style: SummaryStyle) => void;
  className?: string;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const activeOption = SUMMARY_STYLES.find((s) => s.id === value) ?? SUMMARY_STYLES[0];

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <label className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
          Formato e Estilo Científico do Resumo
        </label>
        <span className="text-[11px] text-ink-faint">
          {activeOption.badge} · {activeOption.domain}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {SUMMARY_STYLES.map((style) => {
          const Icon = style.icon;
          const selected = style.id === value;

          return (
            <button
              key={style.id}
              type="button"
              onClick={() => onChange(style.id)}
              onMouseEnter={() => setHoveredId(style.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={cn(
                "group relative flex flex-col items-start rounded-xl border p-3.5 text-left transition-all duration-200 touch-tap active:scale-[0.99]",
                selected
                  ? "border-accent bg-accent-soft/70 shadow-sm ring-1 ring-accent"
                  : "border-line bg-surface hover:border-accent/40 hover:bg-surface2",
              )}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                      selected
                        ? "bg-accent text-white"
                        : "bg-subtle text-ink-soft group-hover:text-accent",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[13px] font-semibold text-ink">{style.title}</span>
                </div>
                {selected && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-accent animate-scale-in" />
                )}
              </div>

              <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
                {style.description}
              </p>

              <div className="mt-3 flex w-full items-center justify-between pt-2 border-t border-line/60 text-[10px]">
                <span className="font-mono font-medium text-accent-deep/90">
                  {style.badge}
                </span>
                <span className="text-ink-faint truncate max-w-[120px] sm:max-w-none">{style.domain}</span>
              </div>
            </button>
          );
        })}
      </div>

      {hoveredId && (
        <div className="rounded-lg border border-line bg-surface2/90 p-3 text-[12px] animate-fade-in">
          <div className="flex items-center gap-1.5 font-medium text-ink-soft mb-1">
            <Info className="h-3.5 w-3.5 text-accent" />
            Exemplo de estrutura ({SUMMARY_STYLES.find((s) => s.id === hoveredId)?.title}):
          </div>
          <pre className="font-mono text-[11px] text-ink-faint whitespace-pre-wrap bg-surface p-2 rounded border border-line">
            {SUMMARY_STYLES.find((s) => s.id === hoveredId)?.preview}
          </pre>
        </div>
      )}
    </div>
  );
}
