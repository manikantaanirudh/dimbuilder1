import { ChevronDown, ChevronRight, Search } from "lucide-react";
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
import {
  createRelationship,
  fetchRelationships,
  patchRelationship,
} from "../api/client";
import { HierarchyAnalyticsPanel } from "./HierarchyAnalyticsPanel";
import { StatusBadge } from "./ui";

export function HierarchyTree({
  projectId,
  dimension,
  onRelationshipChanged,
  refreshSignal = 0,
}: {
  projectId: string;
  dimension: DimensionRecord;
  onRelationshipChanged?: () => void;
  refreshSignal?: number;
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

  const tree = useMemo(
    () => buildHierarchyTree(relationships),
    [relationships],
  );

  async function handleReparent(childKey: string, newParentKey: string) {
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
      await refreshRelationships();
      setStatus(`Moved ${childKey} under ${newParentKey}`);
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
          refreshSignal={refreshSignal}
        />
        <div
          className="tree hierarchy-tree"
          role="tree"
          aria-label={`${dimension.dimensionName} relationship hierarchy`}
        >
          {tree.length === 0 ? (
            <div className="hierarchy-empty empty-state-block">
              <strong>No local relationships found</strong>
              <span>
                {dimension.sheetName} has no relationship rows to show in the
                tree.
              </span>
            </div>
          ) : (
            tree.map((node) => (
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
}: {
  node: HierarchyNode;
  search: string;
  level: number;
  draggedKey: string | null;
  dropTargetKey: string | null;
  onReparent: (childKey: string, newParentKey: string) => Promise<void>;
  setDraggedKey: (key: string | null) => void;
  setDropTargetKey: (key: string | null) => void;
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
