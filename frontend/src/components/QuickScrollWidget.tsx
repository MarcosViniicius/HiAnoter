import { useEffect, useState, useRef } from "react";
import { ArrowDown, ArrowUp, ChevronRight, ListOrdered, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

export function QuickScrollWidget() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isScrollable, setIsScrollable] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const tocRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      const scrollEl = document.getElementById("conteudo") || document.scrollingElement || document.documentElement;
      const scrollTop = scrollEl.scrollTop;
      const scrollHeight = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (scrollHeight > 120) {
        setIsScrollable(true);
        const pct = Math.min(100, Math.max(0, Math.round((scrollTop / scrollHeight) * 100)));
        setScrollProgress(pct);
      } else {
        setIsScrollable(false);
      }
    };

    const target = document.getElementById("conteudo") || window;
    target.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    handleScroll();

    return () => {
      target.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  // Scan for headings when TOC is opened
  useEffect(() => {
    if (!tocOpen) return;
    const container = document.getElementById("conteudo");
    if (!container) return;

    const elements = container.querySelectorAll("h1, h2, h3");
    const items: HeadingItem[] = [];
    elements.forEach((el, idx) => {
      const text = el.textContent?.trim() || "";
      if (!text || text.length > 90) return;
      let id = el.id;
      if (!id) {
        id = `heading-section-${idx}`;
        el.id = id;
      }
      const level = parseInt(el.tagName.replace("H", ""), 10) || 2;
      items.push({ id, text, level });
    });
    setHeadings(items);
  }, [tocOpen]);

  // Click outside to close TOC
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tocRef.current && !tocRef.current.contains(e.target as Node)) {
        setTocOpen(false);
      }
    };
    if (tocOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [tocOpen]);

  const scrollToTop = () => {
    const scrollEl = document.getElementById("conteudo");
    if (scrollEl) {
      scrollEl.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const scrollToBottom = () => {
    const scrollEl = document.getElementById("conteudo");
    if (scrollEl) {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
  };

  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setTocOpen(false);
    }
  };

  if (!isScrollable) return null;

  return (
    <div className="fixed right-3 bottom-5 sm:right-6 sm:bottom-6 z-40 flex flex-col items-end gap-2 pointer-events-auto select-none animate-fade-in">
      {/* TOC Popup Panel */}
      {tocOpen && (
        <div
          ref={tocRef}
          className="mb-1 w-72 sm:w-80 max-h-[60vh] flex flex-col rounded-2xl border border-line bg-surface/95 backdrop-blur-md p-3.5 shadow-2xl animate-scale-in text-ink"
        >
          <div className="flex items-center justify-between border-b border-line pb-2 mb-2">
            <span className="font-serif text-xs font-bold tracking-tight text-ink flex items-center gap-1.5">
              <ListOrdered className="h-3.5 w-3.5 text-accent" />
              Índice do Conteúdo
            </span>
            <button
              onClick={() => setTocOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-ink-faint hover:bg-surface2 hover:text-ink transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1 text-xs">
            {headings.length > 0 ? (
              headings.map((h, i) => (
                <button
                  key={`${h.id}-${i}`}
                  onClick={() => scrollToHeading(h.id)}
                  className={cn(
                    "flex items-center gap-1.5 w-full text-left rounded-lg px-2 py-1.5 transition-colors hover:bg-accent-soft hover:text-accent group",
                    h.level === 1 && "font-bold text-ink",
                    h.level === 2 && "pl-3 text-ink-soft",
                    h.level === 3 && "pl-5 text-ink-faint text-[11px]",
                  )}
                >
                  <ChevronRight className="h-3 w-3 text-ink-faint group-hover:text-accent shrink-0" />
                  <span className="truncate">{h.text}</span>
                </button>
              ))
            ) : (
              <p className="py-4 text-center text-xs text-ink-faint">
                Nenhum título estrutural encontrado nesta visualização.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Floating Travel / Scroll Pill */}
      <div className="flex items-center gap-1 rounded-2xl border border-line bg-surface/95 backdrop-blur-md p-1 sm:p-1.5 shadow-raise">
        {/* Top Button */}
        <button
          type="button"
          onClick={scrollToTop}
          className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl text-ink-soft hover:bg-accent-soft hover:text-accent active:scale-95 transition-all touch-tap"
          title="Ir para o topo da página"
          aria-label="Ir para o topo"
        >
          <ArrowUp className="h-4 w-4" />
        </button>

        {/* Scroll Progress & TOC Trigger */}
        <button
          type="button"
          onClick={() => setTocOpen((v) => !v)}
          className={cn(
            "flex h-8 sm:h-9 items-center gap-1.5 rounded-xl px-2 text-xs font-mono font-bold transition-all touch-tap",
            tocOpen
              ? "bg-accent text-white"
              : "bg-surface2 text-ink hover:bg-accent-soft hover:text-accent",
          )}
          title="Abrir índice de seções"
        >
          <ListOrdered className="h-3.5 w-3.5" />
          <span>{scrollProgress}%</span>
        </button>

        {/* Bottom Button */}
        <button
          type="button"
          onClick={scrollToBottom}
          className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl text-ink-soft hover:bg-accent-soft hover:text-accent active:scale-95 transition-all touch-tap"
          title="Ir para o final da página"
          aria-label="Ir para o final"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
