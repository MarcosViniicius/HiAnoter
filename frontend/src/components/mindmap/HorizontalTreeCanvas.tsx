import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Move,
} from "lucide-react";
import { Button } from "../ui/button";
import type { MindmapNode } from "@/types";

const DEFAULT_COLORS = [
  "#f97316", // Laranja vibrante
  "#10b981", // Verde esmeralda
  "#3b82f6", // Azul royal
  "#ef4444", // Vermelho coral
  "#8b5cf6", // Roxo púrpura
  "#f59e0b", // Âmbar
  "#06b6d4", // Ciano
  "#ec4899", // Rosa choque
  "#14b8a6", // Teal
  "#6366f1", // Índigo
];

export const HorizontalTreeCanvas = memo(function HorizontalTreeCanvas({
  data,
  title,
  icon = "🧠",
}: {
  data: MindmapNode;
  title?: string;
  icon?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanningState, setIsPanningState] = useState(false);

  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const isPanningRef = useRef(false);
  const startPanPosRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

  const CANVAS_WIDTH = 2400;
  const CANVAS_HEIGHT = 1800;
  const HALF_W = CANVAS_WIDTH / 2;
  const HALF_H = CANVAS_HEIGHT / 2;

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Non-passive wheel handler: scroll simples = zoom centrado no cursor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Scroll simples com a roda do mouse faz Zoom centrado no cursor
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const currentZoom = zoomRef.current;
      const newZoom = Math.min(2.8, Math.max(0.3, Number((currentZoom * factor).toFixed(3))));

      const rect = container.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;

      const currentPan = panRef.current;
      // Reposiciona o pan pra manter o ponto sob o cursor perfeitamente fixo
      const newPan = {
        x: cx - (cx - currentPan.x) * (newZoom / currentZoom),
        y: cy - (cy - currentPan.y) * (newZoom / currentZoom),
      };

      zoomRef.current = newZoom;
      panRef.current = newPan;
      setZoom(newZoom);
      setPan(newPan);

      if (svgRef.current) {
        svgRef.current.style.transform = `translate(${Math.round(newPan.x)}px, ${Math.round(newPan.y)}px) scale(${newZoom})`;
      }
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Pointer Drag Handlers with PointerCapture & Direct DOM transform
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    isPanningRef.current = true;
    setIsPanningState(true);
    startPanPosRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPanningRef.current) return;
    const dx = e.clientX - startPanPosRef.current.mouseX;
    const dy = e.clientY - startPanPosRef.current.mouseY;
    const newPan = {
      x: startPanPosRef.current.panX + dx,
      y: startPanPosRef.current.panY + dy,
    };
    panRef.current = newPan;

    // Mutate DOM transform directly avoiding GPU bitmap blur (uses 2D translate with rounded pixels)
    if (svgRef.current) {
      svgRef.current.style.transform = `translate(${Math.round(newPan.x)}px, ${Math.round(newPan.y)}px) scale(${zoomRef.current})`;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanningRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      isPanningRef.current = false;
      setIsPanningState(false);
      // Sync state once on gesture finish
      setPan(panRef.current);
    }
  };

  // Dynamic tree layout that calculates true bounding height for each branch
  const layout = useMemo(() => {
    if (!data) return { nodes: [], connections: [] };

    const nodes: any[] = [];
    const connections: any[] = [];

    const mainBranches = data.subbranches || [];
    const totalMain = mainBranches.length;

    const rootX = -500;
    const rootY = 0;

    nodes.push({
      id: "root",
      x: rootX,
      y: rootY,
      node: data,
      color: "#0f766e",
      level: 0,
    });

    if (totalMain === 0) return { nodes, connections };

    const SUB_NODE_HEIGHT = 44;
    const SUB_SPACING_Y = 56;
    const MIN_BRANCH_GAP = 28;

    // Calculate vertical height required for each branch based on its leaf nodes
    const branchHeights = mainBranches.map((branch) => {
      const subs = branch.subbranches || [];
      if (subs.length === 0) return 90;
      return Math.max(90, (subs.length - 1) * SUB_SPACING_Y + SUB_NODE_HEIGHT + 24);
    });

    const totalHeight = branchHeights.reduce((acc, h) => acc + h + MIN_BRANCH_GAP, -MIN_BRANCH_GAP);
    let currentY = rootY - totalHeight / 2;

    mainBranches.forEach((branch, bIdx) => {
      const bHeight = branchHeights[bIdx];
      const branchY = currentY + bHeight / 2;
      currentY += bHeight + MIN_BRANCH_GAP;

      const branchX = rootX + 370;
      const branchColor = branch.color || DEFAULT_COLORS[bIdx % DEFAULT_COLORS.length];
      const branchId = `branch-${bIdx}`;

      nodes.push({
        id: branchId,
        x: branchX,
        y: branchY,
        node: branch,
        color: branchColor,
        order: branch.order ?? bIdx + 1,
        level: 1,
      });

      connections.push({
        from: { x: rootX + 135, y: rootY },
        to: { x: branchX - 115, y: branchY },
        color: branchColor,
        level: 1,
      });

      const subs = branch.subbranches || [];
      if (subs.length > 0) {
        const subTotalH = (subs.length - 1) * SUB_SPACING_Y;
        const subStartY = branchY - subTotalH / 2;

        subs.forEach((sub, sIdx) => {
          const subX = branchX + 330;
          const subY = subStartY + sIdx * SUB_SPACING_Y;
          const subId = `sub-${bIdx}-${sIdx}`;

          nodes.push({
            id: subId,
            x: subX,
            y: subY,
            node: sub,
            color: sub.color || branchColor,
            level: 2,
          });

          connections.push({
            from: { x: branchX + 115, y: branchY },
            to: { x: subX - 90, y: subY },
            color: sub.color || branchColor,
            level: 2,
          });
        });
      }
    });

    return { nodes, connections };
  }, [data]);

  const handleZoom = (delta: number) => {
    setZoom((prev) => {
      const newZoom = Math.min(2.5, Math.max(0.35, Number((prev + delta).toFixed(2))));
      zoomRef.current = newZoom;
      return newZoom;
    });
  };

  const handleResetView = () => {
    setZoom(1);
    zoomRef.current = 1;
    setPan({ x: 0, y: 0 });
    panRef.current = { x: 0, y: 0 };
  };

  const handleExportPNG = () => {
    if (!svgRef.current) return;
    try {
      // Clona o SVG, força dimensões numéricas reais e reseta qualquer zoom/pan de tela
      const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("width", String(CANVAS_WIDTH));
      clone.setAttribute("height", String(CANVAS_HEIGHT));
      clone.style.transform = "none";
      clone.removeAttribute("style");

      const svgString = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);

      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = 3; // Ultra alta resolução 3x
        canvas.width = CANVAS_WIDTH * scale;
        canvas.height = CANVAS_HEIGHT * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.fillStyle = "#faf9f6";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        const pngUrl = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.href = pngUrl;
        downloadLink.download = `${title || "arvore-conceitual"}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(blobURL);
      };
      image.src = blobURL;
    } catch (err) {
      console.error("Erro ao exportar PNG:", err);
    }
  };

  return (
    <div className="relative flex flex-col w-full h-full min-h-[480px] sm:min-h-[620px] max-h-[820px] rounded-2xl sm:rounded-3xl border border-line bg-paper overflow-hidden select-none shadow-soft">
      {/* Controls */}
      <div className="absolute top-2.5 left-2.5 sm:top-4 sm:left-4 z-20 flex items-center gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl border border-line/80 bg-surface/95 backdrop-blur-md p-1 sm:p-1.5 shadow-raise">
        <div className="flex items-center gap-0.5 sm:gap-1 font-mono text-xs text-ink-soft">
          <button
            type="button"
            onClick={() => handleZoom(-0.15)}
            className="hover:bg-subtle rounded-lg p-1.5 transition-colors touch-tap"
            title="Diminuir Zoom"
          >
            <ZoomOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
          <span className="px-1.5 sm:px-2 font-bold min-w-[38px] sm:min-w-[44px] text-center text-ink text-[11px] sm:text-xs">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => handleZoom(0.15)}
            className="hover:bg-subtle rounded-lg p-1.5 transition-colors touch-tap"
            title="Aumentar Zoom"
          >
            <ZoomIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
          <button
            type="button"
            onClick={handleResetView}
            className="hover:bg-subtle rounded-lg p-1.5 transition-colors touch-tap"
            title="Resetar Zoom"
          >
            <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
        </div>

        <div className="h-3.5 sm:h-4 w-px bg-line" />

        <Button
          variant="surface"
          size="sm"
          onClick={handleExportPNG}
          className="h-6 sm:h-7 text-[11px] sm:text-xs px-2 sm:px-2.5 font-medium rounded-lg"
          title="Exportar Imagem PNG em Alta Resolução"
        >
          <Download className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" />
          <span>PNG</span>
        </Button>
      </div>

      <div className="absolute bottom-2.5 left-2.5 sm:bottom-4 sm:left-4 z-20 flex items-center gap-1.5 rounded-lg sm:rounded-xl bg-surface/90 backdrop-blur-xs border border-line/60 px-2.5 py-1 text-[10px] sm:text-[11px] text-ink-faint shadow-xs pointer-events-none">
        <Move className="h-3 w-3 text-accent shrink-0" />
        <span className="hidden xs:inline">Arraste para navegar · Scroll para Zoom</span>
        <span className="xs:hidden">Arraste para mover</span>
      </div>

      {/* Interactive Drag Canvas */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDragStart={(e) => e.preventDefault()}
        className={`w-full h-full min-h-[480px] sm:min-h-[620px] overflow-hidden touch-none select-none ${
          isPanningState ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`${-HALF_W} ${-HALF_H} ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          shapeRendering="geometricPrecision"
          textRendering="optimizeLegibility"
          style={{
            transform: `translate(${Math.round(pan.x)}px, ${Math.round(pan.y)}px) scale(${zoom})`,
            transformOrigin: "center center",
            userSelect: "none",
          }}
          className="overflow-visible w-full h-full pointer-events-none"
        >
          {/* Connections */}
          <g>
            {layout.connections.map((c, idx) => {
              const dx = c.to.x - c.from.x;
              const pathData = `M ${c.from.x} ${c.from.y} C ${c.from.x + dx * 0.5} ${c.from.y}, ${c.to.x - dx * 0.5} ${c.to.y}, ${c.to.x} ${c.to.y}`;
              return (
                <path
                  key={idx}
                  d={pathData}
                  fill="none"
                  stroke={c.color}
                  strokeWidth={c.level === 1 ? 3.2 : 2}
                  strokeOpacity={0.8}
                  strokeLinecap="round"
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {layout.nodes.map((n) => {
              if (n.level === 0) {
                return (
                  <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
                    <rect
                      x="-135"
                      y="-42"
                      width="270"
                      height="84"
                      rx="26"
                      fill="#0f766e"
                      stroke="#14b8a6"
                      strokeWidth="2.5"
                    />
                    <text
                      x="0"
                      y="-12"
                      textAnchor="middle"
                      fill="#5eead4"
                      fontSize="13"
                      fontWeight="bold"
                      className="pointer-events-none"
                    >
                      {icon} MAPA MENTAL
                    </text>
                    <text
                      x="0"
                      y="14"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="14"
                      fontWeight="800"
                      fontFamily="serif"
                      className="pointer-events-none"
                    >
                      {n.node.name.length > 24 ? n.node.name.slice(0, 22) + "…" : n.node.name}
                    </text>
                  </g>
                );
              }

              if (n.level === 1) {
                return (
                  <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
                    <rect
                      x="-115"
                      y="-32"
                      width="230"
                      height="64"
                      rx="18"
                      fill="#ffffff"
                      stroke={n.color}
                      strokeWidth="2.5"
                    />
                    {n.order !== undefined && (
                      <g transform="translate(-115, -32)">
                        <circle cx="0" cy="0" r="15" fill={n.color} stroke="#ffffff" strokeWidth="2" />
                        <text
                          x="0"
                          y="4.5"
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="12"
                          fontWeight="900"
                          className="pointer-events-none"
                        >
                          {n.order}
                        </text>
                      </g>
                    )}
                    <text
                      x="-85"
                      y="5"
                      textAnchor="start"
                      fill="#0f172a"
                      fontSize="13"
                      fontWeight="700"
                      fontFamily="serif"
                      className="pointer-events-none"
                    >
                      {n.node.name.length > 20 ? n.node.name.slice(0, 18) + "…" : n.node.name}
                    </text>
                  </g>
                );
              }

              return (
                <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
                  <rect
                    x="-90"
                    y="-22"
                    width="180"
                    height="44"
                    rx="12"
                    fill="#ffffff"
                    stroke={n.color}
                    strokeWidth="1.8"
                    strokeDasharray="4 2"
                  />
                  <circle cx="-75" cy="0" r="3.5" fill={n.color} />
                  <text
                    x="-64"
                    y="4.5"
                    textAnchor="start"
                    fill="#1e293b"
                    fontSize="11.5"
                    fontWeight="600"
                    className="pointer-events-none"
                  >
                    {n.node.name.length > 20 ? n.node.name.slice(0, 18) + "…" : n.node.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
});
