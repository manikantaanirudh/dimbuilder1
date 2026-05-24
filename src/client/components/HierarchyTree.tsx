import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildHierarchyTree, type HierarchyNode } from "../../shared/hierarchy";
import type { DimensionRecord, DimensionRelationshipRecord } from "../../shared/types";
import { fetchRelationships } from "../api/client";
import { HierarchyAnalyticsPanel } from "./HierarchyAnalyticsPanel";
import { StatusBadge } from "./ui";

export function HierarchyTree({ projectId, dimension }: { projectId: string; dimension: DimensionRecord }) {
  const [relationships, setRelationships] = useState<DimensionRelationshipRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loadLimit, setLoadLimit] = useState(200);
  const [totalAvailable, setTotalAvailable] = useState(0);

  useEffect(() => {
    void fetchRelationships(projectId, dimension.id, 0, loadLimit).then((result) => {
      setRelationships(result.rows);
      setTotalAvailable(result.total);
    });
  }, [projectId, dimension.id, loadLimit]);

  const tree = useMemo(() => buildHierarchyTree(relationships), [relationships]);

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
          <StatusBadge tone={tree.length ? "neutral" : "info"}>{tree.length ? `${tree.length} roots` : "Empty tree"}</StatusBadge>
        </div>
        <HierarchyAnalyticsPanel projectId={projectId} dimension={dimension} />
        <div className="tree hierarchy-tree" role="tree" aria-label={`${dimension.dimensionName} relationship hierarchy`}>
          {tree.length === 0 ? (
            <div className="hierarchy-empty empty-state-block">
              <strong>No local relationships found</strong>
              <span>{dimension.sheetName} has no relationship rows to show in the tree.</span>
            </div>
          ) : (
            tree.map((node) => <TreeNode key={node.key} node={node} search={search.toLowerCase()} level={1} />)
          )}
          {totalAvailable > loadLimit && (
            <button
              className="action-button secondary"
              style={{ marginTop: "0.75rem", width: "100%" }}
              onClick={() => setLoadLimit(prev => prev + 200)}
            >
              Load more relationships ({totalAvailable - loadLimit} remaining)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TreeNode({ node, search, level }: { node: HierarchyNode; search: string; level: number }) {
  const [open, setOpen] = useState(true);
  const match = search && node.key.toLowerCase().includes(search);
  const hasChildren = node.children.length > 0;
  const toggleLabel = hasChildren ? `${open ? "Collapse" : "Expand"} ${node.key}` : `Hierarchy member ${node.key}`;
  return (
    <div className="tree-node">
      <button
        type="button"
        className={`tree-row ${match ? "match" : ""}`.trim()}
        onClick={() => {
          if (hasChildren) setOpen((current) => !current);
        }}
        role="treeitem"
        aria-level={level}
        aria-expanded={hasChildren ? open : undefined}
        aria-label={toggleLabel}
        title={toggleLabel}
      >
        {hasChildren ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="tree-spacer" />}
        <span className="tree-member-label">{node.key}</span>
        {node.issueCodes.map((issue) => <em key={issue}>{issue}</em>)}
      </button>
      {open && hasChildren && (
        <div className="tree-children" role="group">
          {node.children.map((child) => <TreeNode key={`${node.key}-${child.key}`} node={child} search={search} level={level + 1} />)}
        </div>
      )}
    </div>
  );
}

