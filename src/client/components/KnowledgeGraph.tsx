import {
  Boxes,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  Filter as FilterIcon,
  GitFork,
  Info,
  Layers,
  Maximize2,
  Minimize2,
  Network,
  RefreshCw,
  Search,
  Share2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchKnowledgeGraph } from "../api/client";
import type {
  KnowledgeDimensionNode,
  KnowledgeGraphModel,
  KnowledgeMemberNode,
  KnowledgeNodeKind,
} from "../../shared/knowledgeGraphTypes";
import { ActionButton, Panel, StatusBadge } from "./ui";

type ViewMode = "member" | "dimension";

interface KindFilter {
  key: KnowledgeNodeKind;
  label: string;
  color: string;
}

const KIND_FILTERS: KindFilter[] = [
  { key: "root", label: "Roots", color: "var(--primary)" },
  { key: "parent", label: "Parents", color: "var(--info)" },
  { key: "leaf", label: "Leaves", color: "var(--surface)" },
  { key: "orphan", label: "Orphans", color: "var(--warning)" },
  { key: "cycle", label: "Cycles", color: "var(--danger)" },
];

const NODE_W = 156;
const NODE_H = 34;
const NODE_GAP_X = 30;
const LEVEL_H = 120;

interface PlacedMember {
  node: KnowledgeMemberNode;
  x: number;
  y: number;
}

export function KnowledgeGraph({
  projectId,
  scopeDimensionId,
  scopeLabel,
  onNavigateDimension,
}: {
  projectId: string;
  scopeDimensionId?: string;
  scopeLabel: string;
  onNavigateDimension?: (dimensionId: string, memberKey?: string) => void;
}) {
  const [model, setModel] = useState<KnowledgeGraphModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [viewMode, setViewMode] = useState<ViewMode>("member");
  const [search, setSearch] = useState("");
  const [enabledKinds, setEnabledKinds] = useState<Set<KnowledgeNodeKind>>(
    () => new Set(KIND_FILTERS.map((f) => f.key)),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const scrollRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const didPanRef = useRef(false);

  // Mouse-wheel zoom over the graph canvas. Attached as a native (non-passive) listener so
  // preventDefault reliably suppresses the browser's default scroll while zooming. Re-runs once
  // the canvas actually mounts (it doesn't exist yet during the initial loading/error/empty
  // states) and whenever fullscreen toggles (a different canvas instance is mounted then).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => {
        const next = z - e.deltaY * 0.0015;
        return Math.min(3, Math.max(0.4, Number(next.toFixed(3))));
      });
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [model, loading, viewMode, fullscreen]);

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setSelectedId(null);
    fetchKnowledgeGraph(projectId, scopeDimensionId)
      .then((res) => {
        if (!cancelled) setModel(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load graph");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, scopeDimensionId]);

  const memberById = useMemo(() => {
    const map = new Map<string, KnowledgeMemberNode>();
    for (const n of model?.memberNodes ?? []) map.set(n.id, n);
    return map;
  }, [model]);

  // Compact by default: auto-collapse very large fan-outs so the initial
  // view is readable. Users can expand any branch with its +/- toggle.
  useEffect(() => {
    if (!model) return;
    const init = new Set<string>();
    for (const n of model.memberNodes) {
      if (n.childIds.length > 12) init.add(n.id);
    }
    setCollapsed(init);
  }, [model]);

  // Nodes visible after applying collapse: walk down from roots, but do not
  // descend past a collapsed node.
  const visibleSet = useMemo(() => {
    const vis = new Set<string>();
    if (!model) return vis;
    const queue: string[] = [];
    for (const n of model.memberNodes) {
      if (n.parentIds.length === 0) {
        vis.add(n.id);
        queue.push(n.id);
      }
    }
    while (queue.length) {
      const id = queue.shift()!;
      if (collapsed.has(id)) continue;
      const node = memberById.get(id);
      if (!node) continue;
      for (const cid of node.childIds) {
        if (!vis.has(cid)) {
          vis.add(cid);
          queue.push(cid);
        }
      }
    }
    return vis;
  }, [model, collapsed, memberById]);

  const toggleKind = (key: KnowledgeNodeKind) => {
    setEnabledKinds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // --- Member graph layered layout ---------------------------------------
  const memberLayout = useMemo(() => {
    if (!model) return { placed: [] as PlacedMember[], width: 0, height: 0 };
    const visible = model.memberNodes.filter(
      (n) => visibleSet.has(n.id) && enabledKinds.has(n.kind),
    );
    const byDepth = new Map<number, KnowledgeMemberNode[]>();
    for (const n of visible) {
      if (!byDepth.has(n.depth)) byDepth.set(n.depth, []);
      byDepth.get(n.depth)!.push(n);
    }
    const depths = Array.from(byDepth.keys()).sort((a, b) => a - b);
    // Remap sparse depths to contiguous levels so collapsing leaves no gaps.
    const levelOf = new Map<number, number>();
    depths.forEach((d, i) => levelOf.set(d, i));
    let maxCount = 0;
    for (const d of depths) {
      const list = byDepth.get(d)!;
      list.sort(
        (a, b) =>
          a.dimensionName.localeCompare(b.dimensionName) ||
          a.memberKey.localeCompare(b.memberKey),
      );
      maxCount = Math.max(maxCount, list.length);
    }
    const width = Math.max(900, maxCount * (NODE_W + NODE_GAP_X) + 80);
    const placed: PlacedMember[] = [];
    for (const d of depths) {
      const list = byDepth.get(d)!;
      const rowWidth = list.length * (NODE_W + NODE_GAP_X);
      const startX = Math.max(40, (width - rowWidth) / 2) + NODE_W / 2;
      list.forEach((node, i) => {
        placed.push({
          node,
          x: startX + i * (NODE_W + NODE_GAP_X),
          y: 50 + (levelOf.get(node.depth) ?? 0) * LEVEL_H,
        });
      });
    }
    const height = Math.max(360, (depths.length || 1) * LEVEL_H + 60);
    return { placed, width, height };
  }, [model, enabledKinds, visibleSet]);

  const memberPos = useMemo(() => {
    const map = new Map<string, PlacedMember>();
    for (const p of memberLayout.placed) map.set(p.node.id, p);
    return map;
  }, [memberLayout]);

  // Smoothly bring a newly selected member into the center of the viewport.
  useEffect(() => {
    if (viewMode !== "member" || !selectedId) return;
    const p = memberPos.get(selectedId);
    const el = scrollRef.current;
    if (!p || !el) return;
    const w = memberLayout.width;
    const visualX = w / 2 + (p.x - w / 2) * zoom;
    const visualY = p.y * zoom;
    el.scrollTo({
      left: Math.max(0, visualX - el.clientWidth / 2),
      top: Math.max(0, visualY - el.clientHeight / 2),
      behavior: "smooth",
    });
  }, [selectedId, memberPos, zoom, viewMode, memberLayout.width]);

  // --- Impact tracing: ancestors (upstream) + descendants (downstream) ----
  const activeId = hoveredId ?? selectedId;
  const impact = useMemo(() => {
    const ancestors = new Set<string>();
    const descendants = new Set<string>();
    if (!activeId || !memberById.has(activeId)) return { ancestors, descendants };
    const up = [activeId];
    while (up.length) {
      const cur = memberById.get(up.pop()!);
      if (!cur) continue;
      for (const pid of cur.parentIds) {
        if (!ancestors.has(pid)) {
          ancestors.add(pid);
          up.push(pid);
        }
      }
    }
    const down = [activeId];
    while (down.length) {
      const cur = memberById.get(down.pop()!);
      if (!cur) continue;
      for (const cid of cur.childIds) {
        if (!descendants.has(cid)) {
          descendants.add(cid);
          down.push(cid);
        }
      }
    }
    return { ancestors, descendants };
  }, [activeId, memberById]);

  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    const set = new Set<string>();
    const src =
      viewMode === "member" ? model?.memberNodes ?? [] : model?.dimensionNodes ?? [];
    for (const n of src) {
      const hay =
        viewMode === "member"
          ? `${(n as KnowledgeMemberNode).memberKey} ${(n as KnowledgeMemberNode).description} ${(n as KnowledgeMemberNode).dimensionName}`
          : `${(n as KnowledgeDimensionNode).dimensionName} ${(n as KnowledgeDimensionNode).dimensionType}`;
      if (hay.toLowerCase().includes(q)) set.add(n.id);
    }
    return set;
  }, [search, viewMode, model]);

  // --- Dimension graph circular layout -----------------------------------
  const dimLayout = useMemo(() => {
    if (!model) return { placed: [] as { node: KnowledgeDimensionNode; x: number; y: number }[], size: 560, cx: 280, cy: 280, r: 200 };
    const nodes = model.dimensionNodes;
    const size = Math.max(520, Math.min(760, 240 + nodes.length * 26));
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 90;
    const placed = nodes.map((node, i) => {
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
      return { node, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
    return { placed, size, cx, cy, r };
  }, [model]);

  const dimPos = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const p of dimLayout.placed) map.set(p.node.id, { x: p.x, y: p.y });
    return map;
  }, [dimLayout]);

  const selectedMember =
    selectedId && memberById.has(selectedId) ? memberById.get(selectedId)! : null;
  const selectedDim =
    selectedId && !selectedMember
      ? model?.dimensionNodes.find((d) => d.id === selectedId) ?? null
      : null;

  const connectedDimIds = useMemo(() => {
    const set = new Set<string>();
    if (!selectedDim || !model) return set;
    for (const e of model.dimensionEdges) {
      if (e.source === selectedDim.id) set.add(e.target);
      if (e.target === selectedDim.id) set.add(e.source);
    }
    return set;
  }, [selectedDim, model]);

  if (loading) {
    return (
      <Panel style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
        Building knowledge graph…
      </Panel>
    );
  }
  if (error) return <div className="banner error">{error}</div>;
  if (!model) return null;

  const { metrics } = model;

  const nodeKindColor = (node: KnowledgeMemberNode): { fill: string; stroke: string } => {
    switch (node.kind) {
      case "root":
        return { fill: "var(--primary)", stroke: "var(--primary-strong)" };
      case "orphan":
        return { fill: "var(--warning-soft)", stroke: "var(--warning)" };
      case "cycle":
        return { fill: "var(--danger-soft)", stroke: "var(--danger)" };
      case "parent":
        return { fill: "var(--surface)", stroke: "var(--info)" };
      default:
        return { fill: "var(--surface)", stroke: "var(--border-strong)" };
    }
  };

  // --- Member graph SVG ---------------------------------------------------
  const memberSvg = (
    <svg
      width={memberLayout.width}
      height={memberLayout.height}
      viewBox={`0 0 ${memberLayout.width} ${memberLayout.height}`}
      style={{ transform: `scale(${zoom})`, transformOrigin: "top center", transition: "transform 200ms ease" }}
    >
      <defs>
        <marker id="kg-arrow-up" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
        </marker>
        <marker id="kg-arrow-down" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
        </marker>
        <marker id="kg-arrow-muted" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-strong)" />
        </marker>
        <filter id="kg-node-shadow" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(15,23,42,0.28)" />
        </filter>
      </defs>

      {/* Edges */}
      {model.memberEdges.map((e) => {
        const s = memberPos.get(e.source);
        const t = memberPos.get(e.target);
        if (!s || !t) return null;
        const upstream = activeId && (impact.ancestors.has(e.source) || e.source === activeId) && (impact.ancestors.has(e.target) || e.target === activeId);
        const downstream = activeId && (impact.descendants.has(e.target) || e.target === activeId) && (impact.descendants.has(e.source) || e.source === activeId);
        const highlighted = upstream || downstream;
        const dimmed = activeId && !highlighted;
        return (
          <path
            key={e.id}
            d={`M ${s.x} ${s.y + NODE_H / 2} C ${s.x} ${(s.y + t.y) / 2}, ${t.x} ${(s.y + t.y) / 2}, ${t.x} ${t.y - NODE_H / 2}`}
            fill="none"
            stroke={upstream ? "var(--accent)" : downstream ? "var(--primary)" : "var(--border-strong)"}
            strokeWidth={highlighted ? 3 : 1.6}
            opacity={dimmed ? 0.15 : 1}
            markerEnd={upstream ? "url(#kg-arrow-up)" : downstream ? "url(#kg-arrow-down)" : "url(#kg-arrow-muted)"}
            style={{ transition: "opacity 150ms" }}
          />
        );
      })}

      {/* Nodes */}
      {memberLayout.placed.map((p) => {
        const node = p.node;
        const isActive = node.id === activeId;
        const isAncestor = impact.ancestors.has(node.id);
        const isDescendant = impact.descendants.has(node.id);
        const inImpact = isActive || isAncestor || isDescendant;
        const isMatch = searchMatches?.has(node.id) ?? false;
        const dimmed = (activeId && !inImpact) || (searchMatches && !isMatch);
        const colors = nodeKindColor(node);
        const stroke = isActive
          ? "var(--accent)"
          : isAncestor
            ? "var(--accent)"
            : isDescendant
              ? "var(--primary)"
              : isMatch
                ? "var(--accent)"
                : colors.stroke;
        return (
          <g
            key={node.id}
            transform={`translate(${p.x}, ${p.y})`}
            style={{ cursor: "pointer" }}
            opacity={dimmed ? 0.22 : 1}
            onClick={() => {
              if (didPanRef.current) return;
              setSelectedId(selectedId === node.id ? null : node.id);
            }}
            onMouseEnter={() => setHoveredId(node.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <rect
              x={-NODE_W / 2}
              y={-NODE_H / 2}
              width={NODE_W}
              height={NODE_H}
              rx={node.kind === "root" ? 16 : 6}
              fill={isMatch ? "var(--highlight)" : colors.fill}
              stroke={stroke}
              strokeWidth={isActive || isMatch || isAncestor || isDescendant ? 3 : 1.8}
              strokeDasharray={node.kind === "orphan" ? "4 2" : undefined}
              filter={isActive || isMatch ? "url(#kg-node-shadow)" : undefined}
              style={{ transition: "all 150ms ease" }}
            />
            {node.crossDimensionCount > 0 && (
              <circle cx={NODE_W / 2 - 8} cy={-NODE_H / 2 + 8} r={6} fill="var(--accent)" />
            )}
            <text
              x={0}
              y={-1}
              textAnchor="middle"
              fill={node.kind === "root" ? "#fff" : "var(--text)"}
              fontSize={11}
              fontWeight={node.kind === "root" || isActive ? 700 : 600}
            >
              {node.memberKey.length > 18 ? `${node.memberKey.slice(0, 16)}…` : node.memberKey}
            </text>
            <text x={0} y={11} textAnchor="middle" fill="var(--muted)" fontSize={8}>
              {node.dimensionName.length > 24 ? `${node.dimensionName.slice(0, 22)}…` : node.dimensionName}
            </text>
            {node.childIds.length > 0 && (
              <g
                transform={`translate(0, ${NODE_H / 2})`}
                style={{ cursor: "pointer" }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (didPanRef.current) return;
                  toggleCollapse(node.id);
                }}
              >
                <circle r={9} fill="var(--surface)" stroke="var(--border-strong)" strokeWidth={1.5} />
                <text x={0} y={3.5} textAnchor="middle" fontSize={13} fontWeight={800} fill="var(--text)">
                  {collapsed.has(node.id) ? "+" : "\u2013"}
                </text>
                {collapsed.has(node.id) && (
                  <text x={13} y={4} fontSize={9} fontWeight={700} fill="var(--muted)">
                    {node.childIds.length}
                  </text>
                )}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );

  // --- Dimension graph SVG ------------------------------------------------
  const maxDimWeight = Math.max(1, ...model.dimensionEdges.map((e) => e.weight));
  const dimensionSvg = (
    <svg
      width={dimLayout.size}
      height={dimLayout.size}
      viewBox={`0 0 ${dimLayout.size} ${dimLayout.size}`}
      style={{ transform: `scale(${zoom})`, transformOrigin: "top center", transition: "transform 200ms ease" }}
    >
      {model.dimensionEdges.map((e) => {
        const s = dimPos.get(e.source);
        const t = dimPos.get(e.target);
        if (!s || !t) return null;
        const touchesSel =
          selectedDim && (e.source === selectedDim.id || e.target === selectedDim.id);
        const dimmed = selectedDim && !touchesSel;
        return (
          <line
            key={e.id}
            x1={s.x}
            y1={s.y}
            x2={t.x}
            y2={t.y}
            stroke={touchesSel ? "var(--accent)" : "var(--info)"}
            strokeWidth={1 + (e.weight / maxDimWeight) * 5}
            opacity={dimmed ? 0.12 : touchesSel ? 0.9 : 0.4}
            style={{ transition: "opacity 150ms" }}
          />
        );
      })}
      {dimLayout.placed.map(({ node, x, y }) => {
        const isSel = node.id === selectedId;
        const isConn = connectedDimIds.has(node.id);
        const isMatch = searchMatches?.has(node.id) ?? false;
        const dimmed = (selectedDim && !isSel && !isConn) || (searchMatches && !isMatch);
        const radius = 26 + Math.min(24, Math.sqrt(node.memberCount) * 3);
        return (
          <g
            key={node.id}
            transform={`translate(${x}, ${y})`}
            style={{ cursor: "pointer" }}
            opacity={dimmed ? 0.25 : 1}
            onClick={() => setSelectedId(selectedId === node.id ? null : node.id)}
            onMouseEnter={() => setHoveredId(node.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <circle
              r={radius}
              fill={isMatch ? "var(--highlight)" : "var(--surface)"}
              stroke={isSel || isMatch ? "var(--accent)" : isConn ? "var(--primary)" : "var(--info)"}
              strokeWidth={isSel ? 4 : 2}
            />
            <text y={-2} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text)">
              {node.dimensionType}
            </text>
            <text y={11} textAnchor="middle" fontSize={8} fill="var(--muted)">
              {node.memberCount} mbrs
            </text>
          </g>
        );
      })}
    </svg>
  );

  const canvasWidth = viewMode === "member" ? memberLayout.width : dimLayout.size;

  const canvas = (
    <div
      style={{
        background: "var(--surface-subtle)",
        borderRadius: "var(--radius-sm)",
        padding: "0.85rem",
        border: "1px solid var(--border)",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          paddingBottom: "0.6rem",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          {viewMode === "member" ? <GitFork size={16} /> : <Share2 size={16} />}
          <strong style={{ fontSize: "0.9rem" }}>
            {viewMode === "member" ? "Member Graph" : "Dimension Graph"} · {scopeLabel}
          </strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <div className="search-box" style={{ minWidth: 170, height: 32, padding: "0 8px" }}>
            <Search size={13} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search nodes…"
              style={{ fontSize: 12, border: "none", background: "transparent" }}
            />
          </div>
          <ActionButton onClick={() => setZoom((z) => Math.min(3, z + 0.25))} title="Zoom in">
            <ZoomIn size={14} />
          </ActionButton>
          <ActionButton onClick={() => setZoom((z) => Math.max(0.4, z - 0.25))} title="Zoom out">
            <ZoomOut size={14} />
          </ActionButton>
          <ActionButton onClick={() => setZoom(1)} title="Reset zoom">
            <RefreshCw size={14} /> {Math.round(zoom * 100)}%
          </ActionButton>
          {!fullscreen && (
            <ActionButton variant="primary" onClick={() => setFullscreen(true)}>
              <Maximize2 size={14} /> Expand
            </ActionButton>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          overflow: "auto",
          minHeight: fullscreen ? "70vh" : 400,
          maxHeight: fullscreen ? "80vh" : 560,
          marginTop: "0.75rem",
          cursor: "grab",
          userSelect: "none",
        }}
        onPointerDown={(e) => {
          const el = scrollRef.current;
          if (!el || e.button !== 0) return;
          didPanRef.current = false;
          panRef.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
          el.style.cursor = "grabbing";
        }}
        onPointerMove={(e) => {
          const el = scrollRef.current;
          const start = panRef.current;
          if (!el || !start) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didPanRef.current = true;
          el.scrollLeft = start.left - dx;
          el.scrollTop = start.top - dy;
        }}
        onPointerUp={() => {
          panRef.current = null;
          if (scrollRef.current) scrollRef.current.style.cursor = "grab";
        }}
        onPointerLeave={() => {
          panRef.current = null;
          if (scrollRef.current) scrollRef.current.style.cursor = "grab";
        }}
      >
        <div style={{ minWidth: canvasWidth, width: canvasWidth, margin: "0 auto" }}>
          {viewMode === "member" ? (
            memberLayout.placed.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--muted)", padding: "3rem" }}>
                No members match the active filters in this scope.
              </div>
            ) : (
              memberSvg
            )
          ) : dimLayout.placed.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--muted)", padding: "3rem" }}>
              No dimensions found in this scope.
            </div>
          ) : (
            dimensionSvg
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="knowledge-graph">
      {/* Header row: view toggle + metrics */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "0.75rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <ActionButton
            variant={viewMode === "member" ? "primary" : "ghost"}
            onClick={() => {
              setViewMode("member");
              setSelectedId(null);
            }}
          >
            <GitFork size={14} /> Member Graph
          </ActionButton>
          <ActionButton
            variant={viewMode === "dimension" ? "primary" : "ghost"}
            onClick={() => {
              setViewMode("dimension");
              setSelectedId(null);
            }}
          >
            <Share2 size={14} /> Dimension Graph
          </ActionButton>
        </div>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <StatusBadge tone="info">
            <Boxes size={12} /> {metrics.memberNodeCount} members
          </StatusBadge>
          <StatusBadge tone="info">
            <Network size={12} /> {metrics.parentChildEdgeCount} links
          </StatusBadge>
          <StatusBadge tone={metrics.crossDimensionMemberCount > 0 ? "warning" : "success"}>
            <Layers size={12} /> {metrics.crossDimensionMemberCount} cross-dim
          </StatusBadge>
          {metrics.truncated && <StatusBadge tone="warning">Capped at 600 nodes</StatusBadge>}
        </div>
      </div>

      {/* Kind filters (member view only) */}
      {viewMode === "member" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            flexWrap: "wrap",
            marginBottom: "0.75rem",
            fontSize: "0.8rem",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "var(--muted)" }}>
            <FilterIcon size={13} /> Filters:
          </span>
          {KIND_FILTERS.map((f) => (
            <label key={f.key} style={{ display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}>
              <input type="checkbox" checked={enabledKinds.has(f.key)} onChange={() => toggleKind(f.key)} />
              <span style={{ width: 10, height: 10, borderRadius: 2, background: f.color, border: "1px solid var(--border-strong)" }} />
              {f.label}
            </label>
          ))}
          <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 0.2rem" }} />
          <ActionButton
            variant="ghost"
            onClick={() =>
              setCollapsed(
                new Set(
                  (model?.memberNodes ?? [])
                    .filter((n) => n.childIds.length > 0 && n.kind !== "root")
                    .map((n) => n.id),
                ),
              )
            }
            title="Collapse every branch"
          >
            <ChevronsDownUp size={13} /> Collapse all
          </ActionButton>
          <ActionButton variant="ghost" onClick={() => setCollapsed(new Set())} title="Expand every branch">
            <ChevronsUpDown size={13} /> Expand all
          </ActionButton>
          <span style={{ color: "var(--muted)", marginLeft: "auto", fontSize: "0.72rem" }}>
            Drag to pan · click a node to focus · +/- to expand
          </span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: selectedMember || selectedDim ? "minmax(0, 1fr) 320px" : "minmax(0, 1fr)", gap: "1rem" }}>
        {!fullscreen && canvas}

        {/* Inspector: metadata + where-used + impact */}
        {(selectedMember || selectedDim) && (
          <Panel style={{ padding: "1rem", alignSelf: "start" }}>
            {selectedMember && (
              <MemberInspector
                node={selectedMember}
                memberById={memberById}
                model={model}
                impact={impact}
                onClose={() => setSelectedId(null)}
                onNavigate={onNavigateDimension}
                onSelect={setSelectedId}
              />
            )}
            {selectedDim && (
              <DimensionInspector
                node={selectedDim}
                model={model}
                onClose={() => setSelectedId(null)}
                onNavigate={onNavigateDimension}
              />
            )}
          </Panel>
        )}
      </div>

      {fullscreen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(4px)",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ background: "var(--bg)", borderRadius: "var(--radius)", padding: "1.25rem", maxHeight: "94vh", overflow: "auto", boxShadow: "var(--shadow-xl)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 style={{ margin: 0 }}>
                <Network style={{ marginRight: "0.5rem" }} />
                Knowledge Graph — {scopeLabel}
              </h3>
              <ActionButton variant="primary" onClick={() => setFullscreen(false)}>
                <Minimize2 size={16} /> Exit Fullscreen
              </ActionButton>
            </div>
            {canvas}
          </div>
        </div>
      )}
    </div>
  );
}

function MemberInspector({
  node,
  memberById,
  model,
  impact,
  onClose,
  onNavigate,
  onSelect,
}: {
  node: KnowledgeMemberNode;
  memberById: Map<string, KnowledgeMemberNode>;
  model: KnowledgeGraphModel;
  impact: { ancestors: Set<string>; descendants: Set<string> };
  onClose: () => void;
  onNavigate?: (dimensionId: string, memberKey?: string) => void;
  onSelect: (id: string) => void;
}) {
  const parents = node.parentIds.map((id) => memberById.get(id)).filter(Boolean) as KnowledgeMemberNode[];
  const children = node.childIds.map((id) => memberById.get(id)).filter(Boolean) as KnowledgeMemberNode[];
  const crossDim = model.crossDimensionMembers.find(
    (c) => c.memberKey.toLowerCase() === node.memberKey.toLowerCase(),
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <Info size={16} style={{ color: "var(--primary)" }} />
          <strong>Node Inspector</strong>
        </div>
        <ActionButton variant="ghost" onClick={onClose}>Close</ActionButton>
      </div>

      <div style={{ marginBottom: "0.6rem" }}>
        <code style={{ fontSize: "0.95rem", fontWeight: 700 }}>{node.memberKey}</code>
        <div style={{ marginTop: 4 }}>
          <StatusBadge tone={node.kind === "orphan" ? "warning" : node.kind === "cycle" ? "danger" : "info"}>
            {node.kind.toUpperCase()}
          </StatusBadge>
        </div>
      </div>

      <dl style={{ fontSize: "0.8rem", margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 8px" }}>
        <dt style={{ color: "var(--muted)" }}>Dimension</dt>
        <dd style={{ margin: 0 }}>{node.dimensionType} — {node.dimensionName}</dd>
        <dt style={{ color: "var(--muted)" }}>Description</dt>
        <dd style={{ margin: 0 }}>{node.description || "—"}</dd>
        <dt style={{ color: "var(--muted)" }}>Depth</dt>
        <dd style={{ margin: 0 }}>Level {node.depth}</dd>
      </dl>

      {onNavigate && (
        <ActionButton variant="primary" style={{ marginTop: "0.6rem", width: "100%" }} onClick={() => onNavigate(node.dimensionId, node.memberKey)}>
          <ExternalLink size={14} /> Open metadata in editor
        </ActionButton>
      )}

      {/* Impact summary */}
      <div style={{ marginTop: "0.8rem", padding: "0.5rem", background: "var(--surface-subtle)", borderRadius: "var(--radius-sm)", fontSize: "0.8rem" }}>
        <strong>Impact trace</strong>
        <div style={{ marginTop: 4, display: "flex", gap: "0.5rem" }}>
          <span style={{ color: "var(--accent)" }}>↑ {impact.ancestors.size} upstream</span>
          <span style={{ color: "var(--primary)" }}>↓ {impact.descendants.size} downstream</span>
        </div>
      </div>

      <WhereUsedList title={`Parents (${parents.length})`} items={parents} onSelect={onSelect} />
      <WhereUsedList title={`Children (${children.length})`} items={children} onSelect={onSelect} />

      {crossDim && crossDim.dimensions.length > 1 && (
        <div style={{ marginTop: "0.7rem" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: 4 }}>
            Cross-dimension usage ({crossDim.dimensions.length})
          </div>
          {crossDim.dimensions.map((d) => (
            <button
              key={d.dimensionId}
              onClick={() => onNavigate?.(d.dimensionId, node.memberKey)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "3px 6px", fontSize: "0.78rem", background: "none", border: "none", borderBottom: "1px dashed var(--border)", cursor: onNavigate ? "pointer" : "default", color: "var(--text)" }}
            >
              {d.dimensionType} — {d.dimensionName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WhereUsedList({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: KnowledgeMemberNode[];
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ marginTop: "0.7rem" }}>
      <div style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: 4 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>None</div>
      ) : (
        <div style={{ maxHeight: 140, overflow: "auto" }}>
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => onSelect(n.id)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "3px 6px", fontSize: "0.78rem", background: "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", color: "var(--text)" }}
            >
              <code>{n.memberKey}</code>
              <span style={{ color: "var(--muted)", marginLeft: 6 }}>{n.dimensionName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DimensionInspector({
  node,
  model,
  onClose,
  onNavigate,
}: {
  node: KnowledgeDimensionNode;
  model: KnowledgeGraphModel;
  onClose: () => void;
  onNavigate?: (dimensionId: string) => void;
}) {
  const links = model.dimensionEdges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => {
      const otherId = e.source === node.id ? e.target : e.source;
      const other = model.dimensionNodes.find((d) => d.id === otherId);
      return other ? { other, weight: e.weight } : null;
    })
    .filter(Boolean) as { other: KnowledgeDimensionNode; weight: number }[];
  links.sort((a, b) => b.weight - a.weight);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <Info size={16} style={{ color: "var(--primary)" }} />
          <strong>Dimension Inspector</strong>
        </div>
        <ActionButton variant="ghost" onClick={onClose}>Close</ActionButton>
      </div>

      <code style={{ fontSize: "0.95rem", fontWeight: 700 }}>{node.dimensionName}</code>
      <div style={{ marginTop: 4 }}>
        <StatusBadge tone="info">{node.dimensionType}</StatusBadge>
      </div>

      <dl style={{ fontSize: "0.8rem", marginTop: "0.6rem", display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 8px" }}>
        <dt style={{ color: "var(--muted)" }}>Members</dt>
        <dd style={{ margin: 0 }}>{node.memberCount}</dd>
        <dt style={{ color: "var(--muted)" }}>Relationships</dt>
        <dd style={{ margin: 0 }}>{node.relationshipCount}</dd>
      </dl>

      {onNavigate && (
        <ActionButton variant="primary" style={{ marginTop: "0.6rem", width: "100%" }} onClick={() => onNavigate(node.dimensionId)}>
          <ExternalLink size={14} /> Open dimension in editor
        </ActionButton>
      )}

      <div style={{ marginTop: "0.7rem" }}>
        <div style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: 4 }}>
          Cross-dimension links ({links.length})
        </div>
        {links.length === 0 ? (
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>No shared members with other dimensions.</div>
        ) : (
          links.map(({ other, weight }) => (
            <div key={other.id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "0.78rem", borderBottom: "1px dashed var(--border)" }}>
              <span>{other.dimensionType} — {other.dimensionName}</span>
              <StatusBadge tone="info">{weight} shared</StatusBadge>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
