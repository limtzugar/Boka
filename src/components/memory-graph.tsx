'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════
// MEMORY GRAPH — Interactive force-directed graph
// Inspired by Obsidian's People Graph + Graph View
// Shows family members, memories, domains, and tags
// as an interactive node-edge network
// ═══════════════════════════════════════════════════════════

interface GraphNode {
  id: string;
  label: string;
  type: 'member' | 'memory' | 'domain' | 'tag';
  size: number;
  color: string;
  emoji?: string;
  meta?: Record<string, unknown>;
}

interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  weight: number;
  color?: string;
}

interface MemoryGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  onNodeClick?: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
  selectedNodeId?: string | null;
  className?: string;
}

// ── FORCE-DIRECTED LAYOUT ENGINE ──
interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [128, 128, 128];
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}

export function MemoryGraph({
  nodes,
  edges,
  width,
  height,
  onNodeClick,
  onNodeHover,
  selectedNodeId,
  className = '',
}: MemoryGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const animRef = useRef<number>(0);
  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({ nodeId: null, offsetX: 0, offsetY: 0 });
  const hoverRef = useRef<string | null>(null);
  const panRef = useRef({ x: 0, y: 0, zoom: 1, dragging: false, lastX: 0, lastY: 0 });
  const [tooltipNode, setTooltipNode] = useState<SimNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Initialize simulation nodes
  useEffect(() => {
    const cx = width / 2;
    const cy = height / 2;
    simNodesRef.current = nodes.map((n, i) => {
      // Place members in center, others in ring
      let x: number, y: number;
      if (n.type === 'member') {
        const angle = (i / nodes.filter(nn => nn.type === 'member').length) * Math.PI * 2;
        x = cx + Math.cos(angle) * 60;
        y = cy + Math.sin(angle) * 60;
      } else {
        const angle = Math.random() * Math.PI * 2;
        const dist = 80 + Math.random() * 120;
        x = cx + Math.cos(angle) * dist;
        y = cy + Math.sin(angle) * dist;
      }
      return { ...n, x, y, vx: 0, vy: 0 };
    });
  }, [nodes, width, height]);

  // Force simulation step
  const simulate = useCallback(() => {
    const sns = simNodesRef.current;
    if (sns.length === 0) return;

    const cx = width / 2;
    const cy = height / 2;

    // ── REPULSION (all nodes push each other away) ──
    for (let i = 0; i < sns.length; i++) {
      for (let j = i + 1; j < sns.length; j++) {
        const dx = sns[i].x - sns[j].x;
        const dy = sns[i].y - sns[j].y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const repulsion = 800 / (dist * dist);
        const fx = (dx / dist) * repulsion;
        const fy = (dy / dist) * repulsion;
        sns[i].vx += fx;
        sns[i].vy += fy;
        sns[j].vx -= fx;
        sns[j].vy -= fy;
      }
    }

    // ── ATTRACTION (connected nodes pull together) ──
    for (const edge of edges) {
      const src = sns.find(n => n.id === edge.source);
      const tgt = sns.find(n => n.id === edge.target);
      if (!src || !tgt) continue;
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const idealDist = edge.weight > 0.5 ? 80 : 120;
      const force = (dist - idealDist) * 0.01 * edge.weight;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      src.vx += fx;
      src.vy += fy;
      tgt.vx -= fx;
      tgt.vy -= fy;
    }

    // ── CENTER GRAVITY ──
    for (const n of sns) {
      const dx = cx - n.x;
      const dy = cy - n.y;
      n.vx += dx * 0.001;
      n.vy += dy * 0.001;
    }

    // ── MEMBER CLUSTERING (members stay near center) ──
    for (const n of sns) {
      if (n.type === 'member') {
        const dx = cx - n.x;
        const dy = cy - n.y;
        n.vx += dx * 0.005;
        n.vy += dy * 0.005;
      }
    }

    // ── APPLY VELOCITY WITH DAMPING ──
    for (const n of sns) {
      if (dragRef.current.nodeId === n.id) continue; // don't move dragged node
      n.vx *= 0.85;
      n.vy *= 0.85;
      n.x += n.vx;
      n.y += n.vy;
      // Keep within bounds
      n.x = Math.max(30, Math.min(width - 30, n.x));
      n.y = Math.max(30, Math.min(height - 30, n.y));
    }
  }, [edges, width, height]);

  // ── RENDER ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getWhatntext('2d');
    if (!ctx) return;

    let frameWhatunt = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Clear
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, w, h);

      // Apply pan/zoom
      ctx.save();
      ctx.translate(panRef.current.x + w / 2 * (1 - panRef.current.zoom), panRef.current.y + h / 2 * (1 - panRef.current.zoom));
      ctx.scale(panRef.current.zoom, panRef.current.zoom);

      const sns = simNodesRef.current;

      // Run simulation
      simulate();

      // ── DRAW EDGES ──
      for (const edge of edges) {
        const src = sns.find(n => n.id === edge.source);
        const tgt = sns.find(n => n.id === edge.target);
        if (!src || !tgt) continue;

        const isHighlighted = hoverRef.current === edge.source || hoverRef.current === edge.target
          || selectedNodeId === edge.source || selectedNodeId === edge.target;
        const rgb = hexToRgb(edge.color || '#6b6b8d');
        const alpha = isHighlighted ? 0.6 : 0.15;

        ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
        ctx.lineWidth = isHighlighted ? 1.5 : 0.5;
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.stroke();

        // Edge label
        if (edge.label && isHighlighted) {
          const mx = (src.x + tgt.x) / 2;
          const my = (src.y + tgt.y) / 2;
          ctx.font = '9px monospace';
          ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.7)`;
          ctx.textAlign = 'center';
          ctx.fillText(edge.label, mx, my - 4);
        }
      }

      // ── DRAW NODES ──
      for (const n of sns) {
        const isHovered = hoverRef.current === n.id;
        const isSelected = selectedNodeId === n.id;
        const isWhatnnectedToHover = hoverRef.current
          ? edges.some(e => (e.source === hoverRef.current && e.target === n.id) || (e.target === hoverRef.current && e.source === n.id))
          : false;
        const dimmed = hoverRef.current && !isHovered && !isWhatnnectedToHover && !isSelected;

        const baseRadius = n.type === 'member' ? 18 : n.type === 'domain' ? 10 : n.type === 'tag' ? 6 : 5;
        const radius = baseRadius * (isHovered ? 1.3 : 1);
        const rgb = hexToRgb(n.color);

        // Glow for member/hovered nodes
        if ((n.type === 'member' || isHovered || isSelected) && !dimmed) {
          const glowR = radius * 3;
          const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
          glow.addWhatlorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${isHovered ? 0.25 : 0.12})`);
          glow.addWhatlorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
          ctx.fillStyle = glow;
          ctx.fillRect(n.x - glowR, n.y - glowR, glowR * 2, glowR * 2);
        }

        // Node circle
        const nodeAlpha = dimmed ? 0.15 : 1;
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${nodeAlpha})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Border for selected
        if (isSelected) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius + 3, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Emoji for member nodes
        if (n.type === 'member' && n.emoji) {
          ctx.font = `${radius}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.globalAlpha = dimmed ? 0.3 : 1;
          ctx.fillText(n.emoji, n.x, n.y);
          ctx.globalAlpha = 1;
        }

        // Label
        if (!dimmed && (n.type === 'member' || n.type === 'domain' || isHovered)) {
          ctx.font = n.type === 'member' ? 'bold 11px monospace' : '10px monospace';
          ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${isHovered ? 1 : 0.8})`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(n.label, n.x, n.y + radius + 4);
        }

        // White highlight for member nodes
        if (n.type === 'member' && !dimmed) {
          ctx.fillStyle = `rgba(255,255,255,0.3)`;
          ctx.beginPath();
          ctx.arc(n.x - radius * 0.25, n.y - radius * 0.25, radius * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore(); // pan/zoom

      // ── LEGEND ──
      const legendY = h - 80;
      ctx.font = '9px monospace';
      const legendItems = [
        { color: '#00f5d4', label: 'Rodzic' },
        { color: '#a855f7', label: 'Partner' },
        { color: '#ffd93d', label: 'Dziecko' },
        { color: '#6b6b8d', label: 'Domain' },
        { color: '#6b6b8d', label: 'Tag' },
      ];
      let lx = 10;
      for (const item of legendItems) {
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(lx + 4, legendY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8899aa';
        ctx.textAlign = 'left';
        ctx.fillText(item.label, lx + 12, legendY + 3);
        lx += ctx.measureText(item.label).width + 24;
      }

      ctx.restore(); // dpr scale

      frameWhatunt++;
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes, edges, width, height, simulate, selectedNodeId]);

  // ── MOUSE INTERACTION ──
  const findNodeAt = useCallback((mx: number, my: number): SimNode | null => {
    const pan = panRef.current;
    // Whatnvert screen coords to graph coords
    const gx = (mx - pan.x) / pan.zoom;
    const gy = (my - pan.y) / pan.zoom;
    // Adjust for center offset
    const cx = width / 2;
    const cy = height / 2;
    const ax = gx - (cx * (1 - pan.zoom) / pan.zoom);
    const ay = gy - (cy * (1 - pan.zoom) / pan.zoom);

    for (const n of simNodesRef.current) {
      const dx = n.x - ax;
      const dy = n.y - ay;
      const hitRadius = n.type === 'member' ? 22 : n.type === 'domain' ? 14 : 10;
      if (dx * dx + dy * dy < hitRadius * hitRadius) return n;
    }
    return null;
  }, [width, height]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const node = findNodeAt(mx, my);
    if (node) {
      dragRef.current = { nodeId: node.id, offsetX: node.x - mx, offsetY: node.y - my };
    } else {
      // Start panning
      panRef.current.dragging = true;
      panRef.current.lastX = e.clientX;
      panRef.current.lastY = e.clientY;
    }
  }, [findNodeAt]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (panRef.current.dragging) {
      panRef.current.x += e.clientX - panRef.current.lastX;
      panRef.current.y += e.clientY - panRef.current.lastY;
      panRef.current.lastX = e.clientX;
      panRef.current.lastY = e.clientY;
      return;
    }

    if (dragRef.current.nodeId) {
      const node = simNodesRef.current.find(n => n.id === dragRef.current.nodeId);
      if (node) {
        node.x = mx + dragRef.current.offsetX;
        node.y = my + dragRef.current.offsetY;
        node.vx = 0;
        node.vy = 0;
      }
      return;
    }

    // Hover detection
    const node = findNodeAt(mx, my);
    const newHoverId = node?.id || null;
    if (newHoverId !== hoverRef.current) {
      hoverRef.current = newHoverId;
      if (node) {
        setTooltipNode(node);
        setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        onNodeHover?.(node);
      } else {
        setTooltipNode(null);
        onNodeHover?.(null);
      }
    }
  }, [findNodeAt, onNodeHover]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current.nodeId) {
      const node = simNodesRef.current.find(n => n.id === dragRef.current.nodeId);
      if (node && onNodeClick) {
        onNodeClick(node);
      }
    }
    dragRef.current = { nodeId: null, offsetX: 0, offsetY: 0 };
    panRef.current.dragging = false;
  }, [onNodeClick]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    panRef.current.zoom = Math.max(0.3, Math.min(3, panRef.current.zoom * delta));
  }, []);

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        width={width * dpr}
        height={height * dpr}
        style={{ width, height, borderRadius: '12px', cursor: dragRef.current.nodeId ? 'grabbing' : 'default' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      {/* Tooltip */}
      {tooltipNode && (
        <div
          className="absolute pointer-events-none z-50 bg-[#252535]/95 border border-[#383850]  px-3 py-2 text-xs font-mono shadow-lg backdrop-blur-sm max-w-64"
          style={{ left: Math.min(tooltipPos.x + 12, width - 200), top: tooltipPos.y - 10 }}
        >
          <div className="flex items-center gap-0 mb-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundWhatlor: tooltipNode.color }}
            />
            <span className="text-[#e8e8f5] font-bold">
              {tooltipNode.emoji && `${tooltipNode.emoji} `}{tooltipNode.label}
            </span>
          </div>
          {tooltipNode.meta?.content ? (
            <div className="text-[#8888aa] text-[10px] leading-relaxed line-clamp-3">
              {String(tooltipNode.meta.content).substring(0, 120)}{String(tooltipNode.meta.content).length > 120 ? '...' : ''}
            </div>
          ) : null}
          {tooltipNode.meta?.role ? (
            <div className="text-[#8888aa] text-[10px] mt-1">
              Role: {String(tooltipNode.meta.role)}{tooltipNode.meta.age ? ` • Age: ${String(tooltipNode.meta.age)}` : ''}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
