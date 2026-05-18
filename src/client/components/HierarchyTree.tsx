import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildHierarchyTree, type HierarchyNode } from "../../shared/hierarchy";
import type { DimensionRecord, DimensionRelationshipRecord } from "../../shared/types";
import { fetchRelationships } from "../api/client";

export function HierarchyTree({ projectId, dimension }: { projectId: string; dimension: DimensionRecord }) {
  const [relationships, setRelationships] = useState<DimensionRelationshipRecord[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void fetchRelationships(projectId, dimension.id, 0, 1000).then((result) => setRelationships(result.rows));
  }, [projectId, dimension.id]);

  const tree = useMemo(() => buildHierarchyTree(relationships), [relationships]);

  return (
    <div className="panel hierarchy-panel">
      <div className="panel-heading compact">
        <div>
          <span className="section-kicker">Hierarchy</span>
          <h2>Relationships</h2>
        </div>
      </div>
      <div className="search-box hierarchy-search">
        <Search size={15} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${dimension.sheetName} hierarchy`} />
      </div>
      <div className="tree">
        {tree.length === 0 ? <div className="empty-state">No local relationships found.</div> : tree.map((node) => <TreeNode key={node.key} node={node} search={search.toLowerCase()} />)}
      </div>
    </div>
  );
}

function TreeNode({ node, search }: { node: HierarchyNode; search: string }) {
  const [open, setOpen] = useState(true);
  const match = search && node.key.toLowerCase().includes(search);
  const hasChildren = node.children.length > 0;
  const toggleLabel = hasChildren ? `${open ? "Collapse" : "Expand"} ${node.key}` : `Hierarchy member ${node.key}`;
  return (
    <div className="tree-node">
      <button
        type="button"
        className={match ? "match" : ""}
        onClick={() => {
          if (hasChildren) setOpen((current) => !current);
        }}
        aria-expanded={hasChildren ? open : undefined}
        aria-label={toggleLabel}
        title={toggleLabel}
      >
        {hasChildren ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="tree-spacer" />}
        <span>{node.key}</span>
        {node.issueCodes.map((issue) => <em key={issue}>{issue}</em>)}
      </button>
      {open && hasChildren && (
        <div className="tree-children">
          {node.children.map((child) => <TreeNode key={`${node.key}-${child.key}`} node={child} search={search} />)}
        </div>
      )}
    </div>
  );
}

