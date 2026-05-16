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
      <input className="wide-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${dimension.sheetName} hierarchy`} />
      <div className="tree">
        {tree.length === 0 ? <div className="empty-state">No local relationships found.</div> : tree.map((node) => <TreeNode key={node.key} node={node} search={search.toLowerCase()} />)}
      </div>
    </div>
  );
}

function TreeNode({ node, search }: { node: HierarchyNode; search: string }) {
  const [open, setOpen] = useState(true);
  const match = search && node.key.toLowerCase().includes(search);
  return (
    <div className="tree-node">
      <button className={match ? "match" : ""} onClick={() => setOpen((current) => !current)}>
        {node.children.length ? (open ? "-" : "+") : ""}
        <span>{node.key}</span>
        {node.issueCodes.map((issue) => <em key={issue}>{issue}</em>)}
      </button>
      {open && node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((child) => <TreeNode key={`${node.key}-${child.key}`} node={child} search={search} />)}
        </div>
      )}
    </div>
  );
}

