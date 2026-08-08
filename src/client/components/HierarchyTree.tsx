import { ChevronDown, ChevronRight, Search, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildHierarchyTree,
  canReparentHierarchy,
  type HierarchyNode,
} from "../../shared/hierarchy";
import type {
  DimensionRecord,
  DimensionRelationshipRecord,
} from "../../shared/types";
import type { HierarchyAnalyticsResult } from "../../shared/hierarchyAnalytics";
import {
  createRelationship,
  fetchRelationships,
  patchRelationship,
  fetchHierarchyAnalytics,
} from "../api/client";
import { HierarchyAnalyticsPanel } from "./HierarchyAnalyticsPanel";
import { StatusBadge } from "./ui";

export function HierarchyTree({
  projectId,
  dimension,
  onRelationshipChanged,
  refreshSignal = 0,
  onNodeClick,
}: {
  projectId: string;
  dimension: DimensionRecord;
  onRelationshipChanged?: () => void;
  refreshSignal?: number;
  onNodeClick?: (memberKey: string) => void;
}) {
  const [relationships, setRelationships] = useState<
    DimensionRelationshipRecord[]
  >([]);
  const [search, setSearch] = useState("");
  const [loadLimit, setLoadLimit] = useState(200);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [status, setStatus] = useState("");
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<HierarchyAnalyticsResult | null>(null);
  const [analyticsStatus, setAnalyticsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [filterOrphans, setFilterOrphans] = useState(false);
  const [lastMove, setLastMove] = useState<{ childKey: string; oldParentKey: string } | null>(null);

  async function refreshRelationships() {
    const result = await fetchRelationships(
      projectId,
      dimension.id,
      0,
      loadLimit,
    );
    setRelationships(result.rows);
    setTotalAvailable(result.total);
  }

  useEffect(() => {
    void refreshRelationships();
  }, [projectId, dimension.id, loadLimit, refreshSignal]);

  useEffect(() => {
    let cancelled = false;
    setAnalyticsStatus("loading");
    void fetchHierarchyAnalytics(projectId, dimension.id)
      .then((result) => {
        if (cancelled) return;
        setAnalytics(result);
        setAnalyticsStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setAnalyticsStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, dimension.id, refreshSignal]);

  const tree = useMemo(
    () => buildHierarchyTree(relationships),
    [relationships],
  );

  const orphanNodes = useMemo(() => {
    return (analytics?.orphanMembers ?? []).map((m) => ({
      key: m.memberKey,
      children: [],
      issueCodes: [],
    }));
  }, [analytics?.orphanMembers]);

  const displayedTree = filterOrphans ? orphanNodes : tree;

  async function handleReparent(childKey: string, newParentKey: string, isUndo = false) {
    const validation = canReparentHierarchy(
      relationships,
      childKey,
      newParentKey,
    );
    if (!validation.ok) {
      setStatus(validation.reason ?? "This move is not allowed.");
      return;
    }

    const existingRelationship = relationships.find(
      (relationship) => relationship.childKey === childKey,
    );
    if (!existingRelationship && childKey === newParentKey) {
      setStatus("A member cannot be moved under itself.");
      return;
    }

    const oldParentKey = existingRelationship ? existingRelationship.parentKey : "Root";

    setStatus(`Moving ${childKey} under ${newParentKey}...`);
    try {
      if (existingRelationship) {
        await patchRelationship(projectId, existingRelationship.id, {
          parentKey: newParentKey,
          childKey: existingRelationship.childKey,
          properties: {
            ...existingRelationship.properties,
            Parent: newParentKey,
            Child: existingRelationship.childKey,
          },
        });
      } else {
        await createRelationship(projectId, dimension.id, {
          parentKey: newParentKey,
          childKey,
          properties: { Parent: newParentKey, Child: childKey },
        });
      }

      if (!isUndo) {
        setLastMove({ childKey, oldParentKey });
      } else {
        setLastMove(null);
      }

      await refreshRelationships();
      // Refetch analytics on relationship changes
      void fetchHierarchyAnalytics(projectId, dimension.id)
        .then((result) => {
          setAnalytics(result);
          setAnalyticsStatus("ready");
        });
      setStatus(isUndo ? `Undid move of ${childKey}` : `Moved ${childKey} under ${newParentKey}`);
      onRelationshipChanged?.();
    } catch (caught) {
      setStatus(
        caught instanceof Error ? caught.message : "Reparenting failed",
      );
    } finally {
      setDraggedKey(null);
      setDropTargetKey(null);
    }
  }

  return (
    <div className="panel hierarchy-panel">
      <div className="hierarchy-document">
        <div className="hierarchy-toolbar">
          <div className="grid-toolbar-title">
            <strong>Relationships</strong>
            <span>{relationships.length} local links</span>
          </div>
          {lastMove && (
            <button
              className="action-button warning"
              onClick={() => handleReparent(lastMove.childKey, lastMove.oldParentKey, true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                fontSize: "0.85rem",
                borderRadius: "var(--radius-sm)",
                background: "color-mix(in srgb, var(--warning, #f59e0b) 12%, transparent)",
                border: "1px solid var(--warning, #f59e0b)",
                color: "oklch(0.686 0.166 69.31)",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              title={`Undo move of ${lastMove.childKey} under ${lastMove.oldParentKey}`}
            >
              <Undo2 size={14} /> Undo Move
            </button>
          )}
          <div className="search-box hierarchy-search">
            <Search size={15} />
            <input
              aria-label={`Search ${dimension.sheetName} hierarchy`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${dimension.sheetName} hierarchy`}
            />
          </div>
          <StatusBadge
            tone={status ? "warning" : tree.length ? "neutral" : "info"}
          >
            {status || (tree.length ? `${tree.length} roots` : "Empty tree")}
          </StatusBadge>
        </div>
        <HierarchyAnalyticsPanel
          projectId={projectId}
          dimension={dimension}
          analytics={analytics}
          status={analyticsStatus}
          isOrphansFiltered={filterOrphans}
          onOrphansToggle={() => setFilterOrphans(!filterOrphans)}
        />
        <div
          className="tree hierarchy-tree"
          role="tree"
          aria-label={`${dimension.dimensionName} relationship hierarchy`}
        >
          {displayedTree.length === 0 ? (
            <div className="hierarchy-empty empty-state-block">
              <strong>{filterOrphans ? "No orphan members found" : "No local relationships found"}</strong>
              <span>
                {filterOrphans
                  ? `${dimension.sheetName} has no orphan members to display.`
                  : `${dimension.sheetName} has no relationship rows to show in the tree.`}
              </span>
            </div>
          ) : (
            displayedTree.map((node) => (
              <TreeNode
                key={node.key}
                node={node}
                search={search.toLowerCase()}
                level={1}
                draggedKey={draggedKey}
                dropTargetKey={dropTargetKey}
                onReparent={handleReparent}
                setDraggedKey={setDraggedKey}
                setDropTargetKey={setDropTargetKey}
                onNodeClick={onNodeClick}
              />
            ))
          )}
          {totalAvailable > loadLimit && (
            <button
              className="action-button secondary"
              style={{ marginTop: "0.75rem", width: "100%" }}
              onClick={() => setLoadLimit((prev) => prev + 200)}
            >
              Load more relationships ({totalAvailable - loadLimit} remaining)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TreeNode({
  node,
  search,
  level,
  draggedKey,
  dropTargetKey,
  onReparent,
  setDraggedKey,
  setDropTargetKey,
  onNodeClick,
}: {
  node: HierarchyNode;
  search: string;
  level: number;
  draggedKey: string | null;
  dropTargetKey: string | null;
  onReparent: (childKey: string, newParentKey: string) => Promise<void>;
  setDraggedKey: (key: string | null) => void;
  setDropTargetKey: (key: string | null) => void;
  onNodeClick?: (memberKey: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const match = search && node.key.toLowerCase().includes(search);
  const hasChildren = node.children.length > 0;
  const isDropTarget = dropTargetKey === node.key;

  // When searching, hide branches that don't contain any matches
  const childrenContainMatch = useMemo(() => {
    if (!search) return true;
    function hasMatch(n: HierarchyNode): boolean {
      if (n.key.toLowerCase().includes(search)) return true;
      return n.children.some(hasMatch);
    }
    return hasMatch(node);
  }, [node, search]);

  if (search && !childrenContainMatch) return null;

  const toggleLabel = hasChildren
    ? `${open ? "Collapse" : "Expand"} ${node.key}`
    : `Hierarchy member ${node.key}`;
  return (
    <div className="tree-node">
      <button
        type="button"
        className={`tree-row ${match ? "match" : ""} ${isDropTarget ? "drop-target" : ""}`.trim()}
        draggable={Boolean(draggedKey || node.key)}
        onClick={() => {
          if (hasChildren) setOpen((current) => !current);
          onNodeClick?.(node.key);
        }}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", node.key);
          setDraggedKey(node.key);
        }}
        onDragEnd={() => {
          setDraggedKey(null);
          setDropTargetKey(null);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (node.key !== draggedKey) {
            setDropTargetKey(node.key);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          const sourceKey = event.dataTransfer.getData("text/plain");
          if (sourceKey && sourceKey !== node.key) {
            void onReparent(sourceKey, node.key);
          }
        }}
        role="treeitem"
        aria-level={level}
        aria-expanded={hasChildren ? open : undefined}
        aria-label={toggleLabel}
        title={toggleLabel}
      >
        {hasChildren ? (
          open ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )
        ) : (
          <span className="tree-spacer" />
        )}
        <span className="tree-member-label">{node.key}</span>
        {node.issueCodes.map((issue) => (
          <em key={issue}>{issue}</em>
        ))}
      </button>
      {open && hasChildren && (
        <div className="tree-children" role="group">
          {node.children.map((child) => (
            <TreeNode
              key={`${node.key}-${child.key}`}
              node={child}
              search={search}
              level={level + 1}
              draggedKey={draggedKey}
              dropTargetKey={dropTargetKey}
              onReparent={onReparent}
              setDraggedKey={setDraggedKey}
              setDropTargetKey={setDropTargetKey}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
