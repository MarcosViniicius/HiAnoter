import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Move,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "../ui/button";
import type { MindmapNode } from "@/types";

interface NodePosition {
  id: string;
  x: number;
  y: number;
  node: MindmapNode;
  parentPos?: { x: number; y: number };
  color: string;
  order?: number;
  level: number;
  angle?: number;
}

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

export const RadialMindmapCanvas = memo(function RadialMindmapCanvas({
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

  // Pan & Zoom State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanningState, setIsPanningState] = useState(false);

  // Tracking Refs for 60fps window listeners
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const isPanningRef = useRef(false);
  const startPanPosRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

  // Collapsed Nodes State
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});

  // Canvas ViewBox Dimensions (Centered at 0, 0)
  const CANVAS_WIDTH = 2200;
  const CANVAS_HEIGHT = 1800;
  const HALF_W = CANVAS_WIDTH / 2;
  const HALF_H = CANVAS_HEIGHT / 2;

  // Sync refs with state
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Non-passive Wheel Handler for buttery smooth trackpad and mouse scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const factor = e.deltaY < 0 ? 1.08 : 0.92;
        setZoom((prev) => {
          const next = Math.min(2.5, Math.max(0.35, Number((prev * factor).toFixed(3))));
          zoomRef.current = next;
          return next;
        });
      } else {
        // Pan
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

  // Calculate Layout Positions (Radial 360 Distribution around 0, 0)
  const nodePositions = useMemo(() => {
    const positions: NodePosition[] = [];
    if (!data) return positions;

    // Root Node (at 0, 0)
    const rootPos: NodePosition = {
      id: "root",
      x: 0,
      y: 0,
      node: data,
      color: "#0f766e",
      level: 0,
    };
    positions.push(rootPos);

    const mainBranches = data.subbranches || [];
    const totalMain = mainBranches.length;
    if (totalMain === 0) return positions;

    const RADIUS_MAIN = Math.max(340, Math.min(480, 300 + totalMain * 20));

    mainBranches.forEach((branch, bIdx) => {
      const angle = (2 * Math.PI * bIdx) / totalMain - Math.PI / 2;
      const branchColor = branch.color || DEFAULT_COLORS[bIdx % DEFAULT_COLORS.length];
      const branchId = `branch-${bIdx}`;

      const baseX = RADIUS_MAIN * Math.cos(angle);
      const baseY = RADIUS_MAIN * Math.sin(angle);

      const branchPos: NodePosition = {
        id: branchId,
        x: baseX,
        y: baseY,
        node: branch,
        parentPos: { x: rootPos.x, y: rootPos.y },
        color: branchColor,
        order: branch.order ?? bIdx + 1,
        level: 1,
        angle,
      };
      positions.push(branchPos);

      // Sub-branches (if not collapsed)
      const isCollapsed = !!collapsedNodes[branchId];
      const subs = branch.subbranches || [];
      if (!isCollapsed && subs.length > 0) {
        const subCount = subs.length;
        const RADIUS_SUB = 195;
        const angleSpan = Math.min(Math.PI * 0.45, Math.PI / 3 + subCount * 0.1);

        subs.forEach((sub, sIdx) => {
          const subId = `sub-${bIdx}-${sIdx}`;
          const subOffsetAngle =
            subCount === 1 ? 0 : -angleSpan / 2 + (angleSpan * sIdx) / (subCount - 1);
          const subAngle = angle + subOffsetAngle;

          const subBaseX = branchPos.x + RADIUS_SUB * Math.cos(subAngle);
          const subBaseY = branchPos.y + RADIUS_SUB * Math.sin(subAngle);

          positions.push({
            id: subId,
            x: subBaseX,
            y: subBaseY,
            node: sub,
            parentPos: { x: branchPos.x, y: branchPos.y },
            color: sub.color || branchColor,
            level: 2,
            angle: subAngle,
          });
        });
      }
    });

    return positions;
  }, [data, collapsedNodes]);

  // Zoom controls
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
    if (svgRef.current) {
      svgRef.current.style.transform = `translate3d(0px, 0px, 0) scale(1)`;
    }
  };

  // Pointer Down on canvas background or nodes
  const handleContainerPointerDown = (e: React.PointerEvent) => {
    const target = e.target as Element;
    if (target.closest("[data-collapse-btn]")) {
      return;
    }

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

  const handleContainerPointerMove = (e: React.PointerEvent) => {
    if (!isPanningRef.current) return;

    const dx = e.clientX - startPanPosRef.current.mouseX;
    const dy = e.clientY - startPanPosRef.current.mouseY;
    const newPan = {
      x: startPanPosRef.current.panX + dx,
      y: startPanPosRef.current.panY + dy,
    };
    panRef.current = newPan;

    // Direct 60-120fps DOM manipulation without triggering React re-renders during drag
    if (svgRef.current) {
      svgRef.current.style.transform = `translate3d(${newPan.x}px, ${newPan.y}px, 0) scale(${zoomRef.current})`;
    }
  };

  const handleContainerPointerUp = (e: React.PointerEvent) => {
    if (isPanningRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      isPanningRef.current = false;
      setIsPanningState(false);
      // Sync state once on gesture end
      setPan(panRef.current);
    }
  };

  // Toggle Collapse
  const toggleCollapse = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setCollapsedNodes((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  // Export as PNG (HD 2x)
  const handleExportPNG = async () => {
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
        downloadLink.download = `${title || "mapa-mental-radial"}.png`;
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

  // Export as SVG
  const handleExportSVG = () => {
    if (!svgRef.current) return;
    const svgString = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "mapa-mental-radial"}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative flex flex-col w-full h-full min-h-[460px] sm:min-h-[580px] max-h-[820px] rounded-2xl sm:rounded-3xl border border-line bg-paper overflow-hidden select-none shadow-soft">
      {/* Floating Canvas Toolbar */}
      <div className="absolute top-2.5 left-2.5 sm:top-4 sm:left-4 z-20 flex flex-wrap items-center gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl border border-line/80 bg-surface/95 backdrop-blur-md p-1 sm:p-1.5 shadow-raise">
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
            className="hover:bg-subtle rounded-lg p-1.5 transition-colors text-ink-soft hover:text-ink touch-tap"
            title="Centralizar e Resetar Posições"
          >
            <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
        </div>

        <div className="h-3.5 sm:h-4 w-px bg-line" />

        {/* Export Buttons */}
        <div className="flex items-center gap-1">
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
          <Button
            variant="surface"
            size="sm"
            onClick={handleExportSVG}
            className="h-6 sm:h-7 text-[11px] sm:text-xs px-2 sm:px-2.5 font-medium rounded-lg"
            title="Exportar Vetor SVG"
          >
            <span>SVG</span>
          </Button>
        </div>
      </div>

      {/* Helpful Hint */}
      <div className="absolute bottom-2.5 left-2.5 sm:bottom-4 sm:left-4 z-20 flex items-center gap-1.5 rounded-lg sm:rounded-xl bg-surface/90 backdrop-blur-xs border border-line/60 px-2.5 py-1 text-[10px] sm:text-[11px] text-ink-faint shadow-xs pointer-events-none">
        <Move className="h-3 w-3 text-accent shrink-0" />
        <span className="hidden xs:inline">Arraste para navegar · Scroll/Trackpad para mover</span>
        <span className="xs:hidden">Arraste para mover</span>
      </div>

      {/* Interactive Pan/Zoom Canvas */}
      <div
        ref={containerRef}
        onPointerDown={handleContainerPointerDown}
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handleContainerPointerUp}
        onPointerCancel={handleContainerPointerUp}
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
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transformOrigin: "center center",
            willChange: "transform",
            userSelect: "none",
          }}
          className="overflow-visible w-full h-full pointer-events-none"
        >
          <defs>
            {DEFAULT_COLORS.map((col, idx) => (
              <marker
                key={idx}
                id={`rad-arrow-${idx}`}
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={col} />
              </marker>
            ))}
          </defs>

          {/* Background Grid Texture */}
          <pattern
            id="dotPatternRadial"
            x="0"
            y="0"
            width="36"
            height="36"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="18" cy="18" r="1.2" fill="#cbd5e1" opacity="0.6" />
          </pattern>
          <rect
            x={-HALF_W}
            y={-HALF_H}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            fill="url(#dotPatternRadial)"
            className="pointer-events-none"
          />

          {/* 1. Curved Bézier Connectors */}
          <g className="mindmap-connectors pointer-events-none">
            {nodePositions
              .filter((p) => p.parentPos)
              .map((p) => {
                const { x: x1, y: y1 } = p.parentPos!;
                const { x: x2, y: y2, color, level } = p;

                const dx = x2 - x1;
                const dy = y2 - y1;
                const cx1 = x1 + dx * 0.45;
                const cy1 = y1 + dy * 0.15;
                const cx2 = x1 + dx * 0.55;
                const cy2 = y2 - dy * 0.15;

                const pathData = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
                const strokeWidth = level === 1 ? 3.5 : 2;
                const colorIndex = DEFAULT_COLORS.indexOf(color);
                const markerId = colorIndex >= 0 ? `url(#rad-arrow-${colorIndex})` : undefined;

                return (
                  <g key={`conn-${p.id}`}>
                    <path
                      d={pathData}
                      fill="none"
                      stroke={color}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeOpacity={level === 1 ? 0.85 : 0.65}
                      markerEnd={markerId}
                    />
                  </g>
                );
              })}
          </g>

          {/* 2. Nodes Layer */}
          <g className="mindmap-nodes pointer-events-auto">
            {nodePositions.map((pos) => {
              const isRoot = pos.level === 0;
              const isMain = pos.level === 1;
              const hasChildren = (pos.node.subbranches || []).length > 0;
              const isCollapsed = !!collapsedNodes[pos.id];

              if (isRoot) {
                return (
                  <g
                    key={pos.id}
                    data-node-id={pos.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="cursor-grab active:cursor-grabbing select-none"
                  >
                    {/* Root Bubble */}
                    <rect
                      x="-145"
                      y="-48"
                      width="290"
                      height="96"
                      rx="30"
                      fill="#0f766e"
                      stroke="#14b8a6"
                      strokeWidth="2.5"
                    />
                    <rect
                      x="-140"
                      y="-43"
                      width="280"
                      height="86"
                      rx="25"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      strokeOpacity="0.3"
                    />
                    <text
                      x="0"
                      y="-14"
                      textAnchor="middle"
                      fill="#5eead4"
                      fontSize="13"
                      fontWeight="bold"
                      fontFamily="sans-serif"
                      className="pointer-events-none select-none"
                    >
                      {icon} MAPA MENTAL
                    </text>
                    <text
                      x="0"
                      y="16"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="15"
                      fontWeight="800"
                      fontFamily="serif"
                      className="tracking-tight pointer-events-none select-none"
                    >
                      {pos.node.name.length > 28
                        ? pos.node.name.slice(0, 26) + "…"
                        : pos.node.name}
                    </text>
                  </g>
                );
              }

              if (isMain) {
                const nodeText = pos.node.name;
                const nodeAnnotation = pos.node.annotation;
                const badgeColor = pos.color;

                return (
                  <g
                    key={pos.id}
                    data-node-id={pos.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="cursor-grab active:cursor-grabbing select-none group"
                  >
                    <rect
                      x="-125"
                      y="-40"
                      width="250"
                      height={nodeAnnotation ? "80" : "58"}
                      rx="20"
                      fill="#ffffff"
                      stroke={badgeColor}
                      strokeWidth="2.5"
                    />

                    {/* Number Badge */}
                    {pos.order !== undefined && (
                      <g transform="translate(-125, -40)">
                        <circle
                          cx="0"
                          cy="0"
                          r="16"
                          fill={badgeColor}
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                        <text
                          x="0"
                          y="5"
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="13"
                          fontWeight="900"
                          fontFamily="sans-serif"
                          className="pointer-events-none select-none"
                        >
                          {pos.order}
                        </text>
                      </g>
                    )}

                    {/* Title */}
                    <text
                      x="-96"
                      y={nodeAnnotation ? "-10" : "4"}
                      textAnchor="start"
                      fill="#0f172a"
                      fontSize="13.5"
                      fontWeight="700"
                      fontFamily="serif"
                      className="pointer-events-none select-none"
                    >
                      {nodeText.length > 24 ? nodeText.slice(0, 22) + "…" : nodeText}
                    </text>

                    {/* Annotation */}
                    {nodeAnnotation && (
                      <text
                        x="-96"
                        y="15"
                        textAnchor="start"
                        fill="#64748b"
                        fontSize="11"
                        fontWeight="500"
                        fontFamily="sans-serif"
                        className="pointer-events-none select-none"
                      >
                        {nodeAnnotation.length > 32
                          ? nodeAnnotation.slice(0, 30) + "…"
                          : nodeAnnotation}
                      </text>
                    )}

                    {/* Collapse / Expand */}
                    {hasChildren && (
                      <g
                        data-collapse-btn="true"
                        transform="translate(112, 0)"
                        onClick={(e) => toggleCollapse(e, pos.id)}
                        className="cursor-pointer pointer-events-auto"
                      >
                        <circle
                          cx="0"
                          cy="0"
                          r="10"
                          fill="#f8fafc"
                          stroke="#cbd5e1"
                          strokeWidth="1.5"
                        />
                        <text
                          x="0"
                          y="3.5"
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="bold"
                          fill="#334155"
                          className="pointer-events-none select-none"
                        >
                          {isCollapsed ? "+" : "−"}
                        </text>
                      </g>
                    )}
                  </g>
                );
              }

              // Level 2 Sub-branch
              return (
                <g
                  key={pos.id}
                  data-node-id={pos.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className="cursor-grab active:cursor-grabbing select-none"
                >
                  <rect
                    x="-90"
                    y="-24"
                    width="180"
                    height="48"
                    rx="14"
                    fill="#ffffff"
                    stroke={pos.color}
                    strokeWidth="1.8"
                    strokeDasharray="4 2"
                  />
                  <circle cx="-74" cy="0" r="4" fill={pos.color} />
                  <text
                    x="-62"
                    y="4.5"
                    textAnchor="start"
                    fill="#1e293b"
                    fontSize="12"
                    fontWeight="600"
                    fontFamily="sans-serif"
                    className="pointer-events-none select-none"
                  >
                    {pos.node.name.length > 22
                      ? pos.node.name.slice(0, 20) + "…"
                      : pos.node.name}
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
