import {
  AlertTriangle,
  GitCommit,
  Info,
  Layers,
  Maximize2,
  Minimize2,
  Network,
  RefreshCw,
  Search,
  ShieldAlert,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  GraphAnalysisResult,
  TopologyTreeNode,
} from "../../server/ai/suggestions/graphIntelligence";
import { ActionButton, Panel, StatusBadge } from "./ui";

interface PlacedNode {
  node: TopologyTreeNode;
  x: number;
  y: number;
  level: number;
  parentKey?: string;
  parentX?: number;
  parentY?: number;
}

export function GraphVisualizer({
  graphData,
  dimensionName = "All Dimensions (Project-Wide)",
  onApplyFix,
}: {
  graphData: GraphAnalysisResult;
  dimensionName?: string;
  onApplyFix?: (type: string, payload: Record<string, unknown>) => void;
}) {
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [hoveredNodeKey, setHoveredNodeKey] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  const { metrics, cycles, orphans, multiParents, quickFixes, topologyTree } =
    graphData;

  const handleResetZoom = () => setZoomLevel(1);
  const handleZoomIn = () => setZoomLevel((z) => Math.min(3.0, z + 0.25));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(0.4, z - 0.25));

  // --- NON-OVERLAPPING LEVELIZED SUBTREE LAYOUT ALGORITHM ---
  const { placedNodes, canvasWidth, svgHeight, maxLevel } = useMemo(() => {
    const minNodeWidth = 140;
    const nodeGap = 36;
    const levelYHeight = 110;

    const nodeMap = new Map<string, TopologyTreeNode>();
    function indexNodes(nodes: TopologyTreeNode[]) {
      for (const n of nodes) {
        nodeMap.set(n.key, n);
        if (n.children) indexNodes(n.children);
      }
    }
    indexNodes(topologyTree);

    function countSubtreeLeaves(node: TopologyTreeNode): number {
      if (!node.children || node.children.length === 0) return 1;
      return node.children.reduce(
        (sum, child) => sum + countSubtreeLeaves(child),
        0,
      );
    }

    const totalLeaves = topologyTree.reduce(
      (sum, root) => sum + countSubtreeLeaves(root),
      0,
    );

    const calculatedWidth = Math.max(
      1100,
      Math.max(totalLeaves, 6) * (minNodeWidth + nodeGap) + 120,
    );

    const placed: PlacedNode[] = [];
    let currentX = 40;

    function layoutSubtree(
      node: TopologyTreeNode,
      level: number,
      parentPos?: { key: string; x: number; y: number },
    ): { minX: number; maxX: number; centerX: number } {
      const y = 55 + level * levelYHeight;

      if (!node.children || node.children.length === 0) {
        const x = currentX + minNodeWidth / 2;
        currentX += minNodeWidth + nodeGap;

        placed.push({
          node,
          x,
          y,
          level,
          parentKey: parentPos?.key,
          parentX: parentPos?.x,
          parentY: parentPos?.y,
        });

        return { minX: x, maxX: x, centerX: x };
      }

      const childSpans = node.children.map((child) =>
        layoutSubtree(child, level + 1, { key: node.key, x: 0, y }),
      );

      const minX = childSpans[0].minX;
      const maxX = childSpans[childSpans.length - 1].maxX;
      const centerX = Math.round((minX + maxX) / 2);

      placed.push({
        node,
        x: centerX,
        y,
        level,
        parentKey: parentPos?.key,
        parentX: parentPos?.x,
        parentY: parentPos?.y,
      });

      placed.forEach((p) => {
        if (p.parentKey === node.key) {
          p.parentX = centerX;
          p.parentY = y;
        }
      });

      return { minX, maxX, centerX };
    }

    for (const root of topologyTree) {
      layoutSubtree(root, 0);
    }

    const highestLevel = Math.max(0, ...placed.map((pn) => pn.level));
    const calculatedHeight = Math.max(380, (highestLevel + 1) * levelYHeight + 80);

    return {
      placedNodes: placed,
      canvasWidth: Math.max(calculatedWidth, currentX + 60),
      svgHeight: calculatedHeight,
      maxLevel: highestLevel,
    };
  }, [topologyTree]);

  // Selected or Hovered node details for highlight tracing
  const activeFocusKey = hoveredNodeKey ?? selectedNodeKey;
  const activeNodeObj = useMemo(
    () => placedNodes.find((pn) => pn.node.key === activeFocusKey)?.node ?? null,
    [activeFocusKey, placedNodes],
  );

  // Set of connected nodes & links to highlight when a node is focused
  const connectedKeys = useMemo(() => {
    if (!activeFocusKey) return new Set<string>();
    const keys = new Set<string>([activeFocusKey]);
    const focusPlaced = placedNodes.find((pn) => pn.node.key === activeFocusKey);

    if (focusPlaced) {
      if (focusPlaced.parentKey) keys.add(focusPlaced.parentKey);
      placedNodes.forEach((pn) => {
        if (pn.parentKey === activeFocusKey) keys.add(pn.node.key);
      });
    }

    return keys;
  }, [activeFocusKey, placedNodes]);

  // Filtered nodes by search filter
  const matchingSearchKeys = useMemo(() => {
    if (!searchFilter.trim()) return null;
    const needle = searchFilter.trim().toLowerCase();
    const set = new Set<string>();
    placedNodes.forEach((pn) => {
      if (
        pn.node.key.toLowerCase().includes(needle) ||
        pn.node.label.toLowerCase().includes(needle)
      ) {
        set.add(pn.node.key);
      }
    });
    return set;
  }, [placedNodes, searchFilter]);

  const canvasContent = (
    <div
      className="canvas-card-wrapper"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-subtle)",
        borderRadius: "var(--radius-sm)",
        padding: "0.85rem",
        border: "1px solid var(--border)",
      }}
    >
      {/* STICKY FIXED TOOLBAR HEADER: Stays 100% visible when scrolling horizontally */}
      <div
        className="topology-toolbar-sticky"
        style={{
          position: "sticky",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          display: "flex",
          justify: "space-between",
          alignItems: "center",
          paddingBottom: "0.6rem",
          background: "var(--surface-subtle)",
          borderBottom: "1px solid var(--border)",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Network size={18} style={{ color: "var(--primary)" }} />
          <strong style={{ fontSize: "0.95rem" }}>
            Dynamic Topology Map ({dimensionName})
          </strong>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {/* Search Filter input */}
          <div
            className="search-box"
            style={{ minWidth: "180px", height: "32px", padding: "0 8px" }}
          >
            <Search size={13} />
            <input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Highlight node..."
              style={{ fontSize: "12px", border: "none", background: "transparent" }}
            />
          </div>

          <ActionButton onClick={handleZoomIn} title="Zoom In">
            <ZoomIn size={14} />
          </ActionButton>
          <ActionButton onClick={handleZoomOut} title="Zoom Out">
            <ZoomOut size={14} />
          </ActionButton>
          <ActionButton onClick={handleResetZoom} title="Reset Scale">
            <RefreshCw size={14} /> {Math.round(zoomLevel * 100)}%
          </ActionButton>
          <ActionButton
            variant="primary"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit Fullscreen" : "Expand Fullscreen Modal"}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {isFullscreen ? "Exit" : "Expand Fullscreen"}
          </ActionButton>
        </div>
      </div>

      {/* ONLY THIS INNER CONTAINER IS SCROLLABLE (Horizontal & Vertical) */}
      <div
        className="svg-scroll-viewport"
        style={{
          overflow: "auto",
          minHeight: isFullscreen ? "70vh" : "380px",
          maxHeight: isFullscreen ? "80vh" : "520px",
          marginTop: "0.75rem",
          position: "relative",
        }}
      >
        <div
          style={{
            minWidth: `${canvasWidth}px`,
            width: `${canvasWidth}px`,
            height: `${svgHeight}px`,
            margin: "0 auto",
            display: "flex",
            justify: "center",
          }}
        >
          {placedNodes.length === 0 ? (
            <div
              style={{ textAlign: "center", color: "var(--muted)", padding: "3rem" }}
            >
              No members or relationships found in this selection.
            </div>
          ) : (
            <svg
              width={canvasWidth}
              height={svgHeight}
              viewBox={`0 0 ${canvasWidth} ${svgHeight}`}
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: "top center",
                transition: "transform 200ms ease",
              }}
            >
              <defs>
                <marker
                  id="arrowhead-active"
                  viewBox="0 0 10 10"
                  refX="7"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
                </marker>
                <marker
                  id="arrowhead-muted"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-strong)" />
                </marker>
              </defs>

              {/* Connection Lines */}
              {placedNodes.map((pn, i) => {
                if (pn.parentX == null || pn.parentY == null || !pn.parentKey)
                  return null;

                const isLineActive =
                  activeFocusKey &&
                  (pn.node.key === activeFocusKey ||
                    pn.parentKey === activeFocusKey);

                const isDimmed = activeFocusKey && !isLineActive;

                return (
                  <path
                    key={`line-${i}`}
                    d={`M ${pn.parentX} ${pn.parentY + 16} C ${pn.parentX} ${(pn.parentY + pn.y) / 2}, ${pn.x} ${(pn.parentY + pn.y) / 2}, ${pn.x} ${pn.y - 16}`}
                    fill="none"
                    stroke={
                      isLineActive ? "var(--primary)" : "var(--border-strong)"
                    }
                    strokeWidth={isLineActive ? 3.5 : 1.8}
                    opacity={isDimmed ? 0.2 : 1.0}
                    markerEnd={
                      isLineActive
                        ? "url(#arrowhead-active)"
                        : "url(#arrowhead-muted)"
                    }
                    style={{ transition: "stroke 200ms, opacity 200ms" }}
                  />
                );
              })}

              {/* Tree Nodes */}
              {placedNodes.map((pn, i) => {
                const node = pn.node;
                const isSelected = selectedNodeKey === node.key;
                const isHovered = hoveredNodeKey === node.key;
                const isFocus = isSelected || isHovered;
                const isConnected = connectedKeys.has(node.key);
                const isSearchMatch = matchingSearchKeys?.has(node.key);

                const isDimmed =
                  (activeFocusKey && !isConnected) ||
                  (matchingSearchKeys && !isSearchMatch);

                const isOrphan = node.kind === "orphan";
                const isRoot = node.kind === "root";
                const isCycle = node.kind === "cycle";

                const rectWidth = 140;
                const rectHeight = 32;

                return (
                  <g
                    key={`node-${i}`}
                    transform={`translate(${pn.x}, ${pn.y})`}
                    onClick={() =>
                      setSelectedNodeKey(
                        selectedNodeKey === node.key ? null : node.key,
                      )
                    }
                    onMouseEnter={() => setHoveredNodeKey(node.key)}
                    onMouseLeave={() => setHoveredNodeKey(null)}
                    style={{ cursor: "pointer" }}
                    opacity={isDimmed ? 0.25 : 1.0}
                  >
                    <rect
                      x={-rectWidth / 2}
                      y={-rectHeight / 2}
                      width={rectWidth}
                      height={rectHeight}
                      rx={isRoot ? 16 : 6}
                      fill={
                        isRoot
                          ? "var(--primary)"
                          : isOrphan
                            ? "var(--warning-soft)"
                            : isCycle
                              ? "var(--danger-soft)"
                              : isSearchMatch
                                ? "var(--highlight)"
                                : "var(--surface)"
                      }
                      stroke={
                        isFocus
                          ? "var(--accent)"
                          : isRoot
                            ? "var(--primary-strong)"
                            : isOrphan
                              ? "var(--warning)"
                              : isCycle
                                ? "var(--danger)"
                                : "var(--info)"
                      }
                      strokeWidth={isFocus || isSearchMatch ? 3 : 2}
                      strokeDasharray={isOrphan ? "4 2" : undefined}
                      style={{ transition: "all 150ms ease" }}
                    />
                    <text
                      x="0"
                      y="4"
                      textAnchor="middle"
                      fill={isRoot ? "#ffffff" : "var(--text)"}
                      fontSize="11"
                      fontWeight={isRoot || isFocus ? "bold" : "600"}
                    >
                      {isOrphan
                        ? `⚠ ${node.key}`
                        : node.key.length > 16
                          ? `${node.key.slice(0, 14)}…`
                          : node.key}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>

      {/* FIXED INSPECTOR DRAWER SLOT: Eliminates screen shaking/layout reflow */}
      <div style={{ minHeight: "56px", marginTop: "0.5rem" }}>
        {activeNodeObj && (
          <div
            style={{
              padding: "0.6rem 1rem",
              background: "var(--surface)",
              border:
                "1px solid var(--primary-soft-border, oklch(0.8254 0.0942 307.19))",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Info size={16} style={{ color: "var(--primary)" }} />
                <strong>Node Inspector: {activeNodeObj.key}</strong>
                <StatusBadge
                  tone={activeNodeObj.kind === "orphan" ? "warning" : "info"}
                >
                  {activeNodeObj.kind.toUpperCase()}
                </StatusBadge>
              </div>
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "var(--muted)",
                  marginTop: "2px",
                }}
              >
                Label: {activeNodeObj.label} · Direct Children:{" "}
                {activeNodeObj.children.length}
              </div>
            </div>
            <ActionButton
              variant="ghost"
              onClick={() => {
                setSelectedNodeKey(null);
                setHoveredNodeKey(null);
              }}
            >
              Clear Selection
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="graph-visualizer">
      {/* Scope Title Header */}
      <div
        style={{
          marginBottom: "0.75rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
          Showing Topology Map for:{" "}
          <strong style={{ color: "var(--text)" }}>{dimensionName}</strong>
        </div>
        <StatusBadge tone="info">
          {metrics.totalMembers} Members · {metrics.totalRelationships} Links
        </StatusBadge>
      </div>

      {/* Graph Metric KPI Cards */}
      <div
        className="graph-metrics-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <Panel className="graph-metric-card" style={{ padding: "0.85rem", textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>
            Max Tree Depth
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--primary)" }}>
            {metrics.maxDepth} levels
          </div>
        </Panel>
        <Panel className="graph-metric-card" style={{ padding: "0.85rem", textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>
            Orphan Members
          </div>
          <div
            style={{
              fontSize: "1.6rem",
              fontWeight: 800,
              color: metrics.orphanCount > 0 ? "var(--warning)" : "var(--success)",
            }}
          >
            {metrics.orphanCount}
          </div>
        </Panel>
        <Panel className="graph-metric-card" style={{ padding: "0.85rem", textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>
            Cycle Loops
          </div>
          <div
            style={{
              fontSize: "1.6rem",
              fontWeight: 800,
              color: metrics.cycleCount > 0 ? "var(--danger)" : "var(--success)",
            }}
          >
            {metrics.cycleCount}
          </div>
        </Panel>
        <Panel className="graph-metric-card" style={{ padding: "0.85rem", textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>
            Multi-Parents
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--info)" }}>
            {multiParents.length}
          </div>
        </Panel>
      </div>

      {/* Embedded Main Topology View */}
      {canvasContent}

      {/* FULLSCREEN TOPOLOGY EXPAND MODAL */}
      {isFullscreen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "var(--bg)",
              borderRadius: "var(--radius)",
              padding: "1.25rem",
              maxHeight: "94vh",
              overflow: "auto",
              boxShadow: "var(--shadow-xl)",
            }}
          >
            <div
              style={{
                display: "flex",
                justify: "space-between",
                alignItems: "center",
                marginBottom: "0.75rem",
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>
                  <Network style={{ marginRight: "0.5rem" }} />
                  Expanded Fullscreen Topology View: {dimensionName}
                </h3>
                <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                  Zero-overlap levelized map · Trace connections by hovering any node
                </span>
              </div>
              <ActionButton
                variant="primary"
                onClick={() => setIsFullscreen(false)}
              >
                <Minimize2 size={16} /> Exit Fullscreen
              </ActionButton>
            </div>

            {canvasContent}
          </div>
        </div>
      )}

      {/* Graph Anomaly Details & Quick Fixes */}
      <div style={{ marginTop: "1rem", display: "grid", gap: "1rem" }}>
        {cycles.length > 0 && (
          <Panel style={{ borderLeft: "4px solid var(--danger)", padding: "1rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.5rem",
                color: "var(--danger)",
              }}
            >
              <ShieldAlert size={18} />
              <h4 style={{ margin: 0 }}>Circular Dependency Cycles ({cycles.length})</h4>
            </div>
            {cycles.map((cycle, i) => (
              <div key={i} style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                <code>{cycle.description}</code>
              </div>
            ))}
          </Panel>
        )}

        {orphans.length > 0 && (
          <Panel style={{ borderLeft: "4px solid var(--warning)", padding: "1rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.5rem",
                color: "var(--warning)",
              }}
            >
              <AlertTriangle size={18} />
              <h4 style={{ margin: 0 }}>Orphan Members ({orphans.length})</h4>
            </div>
            {orphans.map((orphan, i) => {
              const fix = quickFixes.find(
                (f) => f.targetMemberKey === orphan.memberKey,
              );
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justify: "space-between",
                    alignItems: "center",
                    padding: "0.5rem 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <code>{orphan.memberKey}</code>
                    <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                      Unlinked member (No parent relationship defined)
                    </div>
                  </div>
                  {fix && onApplyFix && (
                    <ActionButton
                      variant="primary"
                      onClick={() => onApplyFix(fix.type, fix.payload)}
                    >
                      <GitCommit size={14} /> Link to Root
                    </ActionButton>
                  )}
                </div>
              );
            })}
          </Panel>
        )}

        {multiParents.length > 0 && (
          <Panel style={{ borderLeft: "4px solid var(--info)", padding: "1rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.5rem",
                color: "var(--info)",
              }}
            >
              <Layers size={18} />
              <h4 style={{ margin: 0 }}>
                Multi-Parent Diamond Nodes ({multiParents.length})
              </h4>
            </div>
            {multiParents.map((mp, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justify: "space-between",
                  alignItems: "center",
                  padding: "0.4rem 0",
                  borderBottom: "1px dashed var(--border)",
                }}
              >
                <div>
                  <code>{mp.memberKey}</code>
                  <span
                    style={{
                      marginLeft: "0.5rem",
                      fontSize: "0.8rem",
                      color: "var(--muted)",
                    }}
                  >
                    Parents: {mp.parents.join(", ")}
                  </span>
                </div>
                <StatusBadge tone="info">Weight Total: {mp.totalWeight}</StatusBadge>
              </div>
            ))}
          </Panel>
        )}
      </div>
    </div>
  );
}
