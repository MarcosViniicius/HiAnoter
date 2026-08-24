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

  const CANVAS_WIDTH = 2200;
  const CANVAS_HEIGHT = 1600;
  const HALF_W = CANVAS_WIDTH / 2;
  const HALF_H = CANVAS_HEIGHT / 2;

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Non-passive wheel handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? 1.08 : 0.92;
        setZoom((prev) => {
          const next = Math.min(2.5, Math.max(0.35, Number((prev * factor).toFixed(3))));
          zoomRef.current = next;
          return next;
        });
      } else {
        setPan((prev) => {
          const next = {
            x: prev.x - e.deltaX * 1.1,
            y: prev.y - e.deltaY * 1.1,
          };
          panRef.current = next;
          return next;
        });
      }
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Global window pointer listeners
  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (isPanningRef.current) {
        const dx = e.clientX - startPanPosRef.current.mouseX;
        const dy = e.clientY - startPanPosRef.current.mouseY;
        const newPan = {
          x: startPanPosRef.current.panX + dx,
          y: startPanPosRef.current.panY + dy,
        };
        panRef.current = newPan;
        setPan(newPan);
      }
    };

    const handleGlobalPointerUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanningState(false);
      }
    };

    window.addEventListener("pointermove", handleGlobalPointerMove, { passive: true });
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerUp);
    };
  }, []);

  // Compute Tree Layout (Left-to-Right centered around 0, 0)
  const layout = useMemo(() => {
    if (!data) return { nodes: [], connections: [] };

    const nodes: any[] = [];
    const connections: any[] = [];

    const rootX = -450;
    const rootY = 0;

    nodes.push({
      id: "root",
      x: rootX,
      y: rootY,
      node: data,
      color: "#0f766e",
      level: 0,
    });

    const mainBranches = data.subbranches || [];
    const totalMain = mainBranches.length;
    if (totalMain === 0) return { nodes, connections };

    const branchSpacingY = 160;
    const totalBranchHeight = (totalMain - 1) * branchSpacingY;
    const startY = rootY - totalBranchHeight / 2;

    mainBranches.forEach((branch, bIdx) => {
      const branchX = rootX + 350;
      const branchY = startY + bIdx * branchSpacingY;
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
        const subSpacingY = 56;
        const totalSubHeight = (subs.length - 1) * subSpacingY;
        const subStartY = branchY - totalSubHeight / 2;

        subs.forEach((sub, sIdx) => {
          const subX = branchX + 310;
          const subY = subStartY + sIdx * subSpacingY;
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
            to: { x: subX - 85, y: subY },
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

  const handleContainerPointerDown = (e: React.PointerEvent) => {
    isPanningRef.current = true;
    setIsPanningState(true);
    startPanPosRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
  };

  const handleExportPNG = () => {
    if (!svgRef.current) return;
    try {
      const svgElement = svgRef.current;
      const svgString = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);

      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = 2;
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
    <div className="relative flex flex-col w-full h-full min-h-[460px] sm:min-h-[580px] max-h-[820px] rounded-2xl sm:rounded-3xl border border-line bg-paper overflow-hidden select-none shadow-soft">
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
          title="Exportar Imagem PNG"
        >
          <Download className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" />
          <span>PNG</span>
        </Button>
      </div>

      <div className="absolute bottom-2.5 left-2.5 sm:bottom-4 sm:left-4 z-20 flex items-center gap-1.5 rounded-lg sm:rounded-xl bg-surface/90 backdrop-blur-xs border border-line/60 px-2.5 py-1 text-[10px] sm:text-[11px] text-ink-faint shadow-xs pointer-events-none">
        <Move className="h-3 w-3 text-accent shrink-0" />
        <span className="hidden xs:inline">Arraste para navegar · Scroll/Trackpad para mover</span>
        <span className="xs:hidden">Arraste para mover</span>
      </div>

      <div
        ref={containerRef}
        onPointerDown={handleContainerPointerDown}
        className={`w-full h-full min-h-[460px] sm:min-h-[580px] overflow-hidden touch-none ${
          isPanningState ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`${-HALF_W} ${-HALF_H} ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transformOrigin: "center center",
            willChange: "transform",
          }}
          className="overflow-visible w-full h-full"
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
                  strokeWidth={c.level === 1 ? 3 : 1.8}
                  strokeOpacity={0.75}
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
                    >
                      {n.node.name.length > 20 ? n.node.name.slice(0, 18) + "…" : n.node.name}
                    </text>
                  </g>
                );
              }

              return (
                <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
                  <rect
                    x="-85"
                    y="-20"
                    width="170"
                    height="40"
                    rx="12"
                    fill="#ffffff"
                    stroke={n.color}
                    strokeWidth="1.8"
                    strokeDasharray="4 2"
                  />
                  <circle cx="-70" cy="0" r="3.5" fill={n.color} />
                  <text
                    x="-60"
                    y="4"
                    textAnchor="start"
                    fill="#1e293b"
                    fontSize="11.5"
                    fontWeight="600"
                  >
                    {n.node.name.length > 18 ? n.node.name.slice(0, 16) + "…" : n.node.name}
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
