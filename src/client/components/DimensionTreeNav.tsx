import { ChevronDown, ChevronRight, Database, Folder, Layers } from "lucide-react";
import { useMemo, useState } from "react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { DIMENSION_TYPE_DISPLAY_ORDER } from "../../shared/dimensionTypeOrder";
import type { DimensionRecord, DimensionType, ValidationIssue } from "../../shared/types";
import { buildBlockingIssueSummary, type IssueSummary } from "../ui/viewModel";

export interface DimensionTreeNode {
  id: string;
  name: string;
  dimension: DimensionRecord;
  children: DimensionTreeNode[];
  issueSummary: IssueSummary;
}

export interface DimensionCategoryGroup {
  type: DimensionType;
  label: string;
  nodes: DimensionTreeNode[];
  totalErrors: number;
}

/**
 * Builds a hierarchical tree of dimensions grouped by canonical OneStream Dimension Type,
 * using inheritedDimension relationships to nest child dimensions under their parent dimension.
 */
export function buildDimensionTreeGroups(
  dimensions: DimensionRecord[],
  issues: ValidationIssue[],
  _blockedSeverities: Array<"error" | "warning" | "info" | "off">
): DimensionCategoryGroup[] {
  // Map dimensions by normalized name for quick parent lookup
  const byNormalizedName = new Map<string, DimensionRecord>();
  for (const dim of dimensions) {
    byNormalizedName.set(dim.dimensionName.trim().toLowerCase(), dim);
  }

  // Group dimensions by dimensionType
  const byType = new Map<DimensionType, DimensionRecord[]>();
  for (const dim of dimensions) {
    const list = byType.get(dim.dimensionType) ?? [];
    list.push(dim);
    byType.set(dim.dimensionType, list);
  }

  const result: DimensionCategoryGroup[] = [];

  for (const type of DIMENSION_TYPE_DISPLAY_ORDER) {
    const typeDimensions = byType.get(type) ?? [];
    if (typeDimensions.length === 0) continue;

    // Find parent-child links within this type
    const parentMap = new Map<string, DimensionRecord[]>();
    const rootDims: DimensionRecord[] = [];

    for (const dim of typeDimensions) {
      const inherited = dim.inheritedDimension.trim().toLowerCase();
      if (inherited && byNormalizedName.has(inherited) && byNormalizedName.get(inherited)?.id !== dim.id) {
        const parentDim = byNormalizedName.get(inherited)!;
        const children = parentMap.get(parentDim.id) ?? [];
        children.push(dim);
        parentMap.set(parentDim.id, children);
      } else {
        rootDims.push(dim);
      }
    }

    // Recursively build tree nodes
    function buildNode(dim: DimensionRecord): DimensionTreeNode {
      const children = (parentMap.get(dim.id) ?? []).map(buildNode);
      return {
        id: dim.id,
        name: dim.dimensionName,
        dimension: dim,
        children,
        issueSummary: buildBlockingIssueSummary(issues, dim.id)
      };
    }

    const nodes = rootDims.map(buildNode);

    // Compute category blocking-error totals
    let totalErrors = 0;
    for (const dim of typeDimensions) {
      const summary = buildBlockingIssueSummary(issues, dim.id);
      totalErrors += summary.errors;
    }

    result.push({
      type,
      label: type,
      nodes,
      totalErrors
    });
  }

  return result;
}

/**
 * Filters dimension tree nodes by search query.
 * Keeps node if its name or any descendant matches search query.
 */
export function filterTreeNodes(
  nodes: DimensionTreeNode[],
  query: string
): { filtered: DimensionTreeNode[]; matchingIds: Set<string> } {
  const needle = query.trim().toLowerCase();
  const matchingIds = new Set<string>();

  function filter(node: DimensionTreeNode): DimensionTreeNode | null {
    const nameMatches =
      node.name.toLowerCase().includes(needle) ||
      node.dimension.sheetName.toLowerCase().includes(needle) ||
      node.dimension.dimensionType.toLowerCase().includes(needle);

    const filteredChildren: DimensionTreeNode[] = [];
    for (const child of node.children) {
      const matchedChild = filter(child);
      if (matchedChild) filteredChildren.push(matchedChild);
    }

    if (nameMatches || filteredChildren.length > 0) {
      matchingIds.add(node.id);
      return {
        ...node,
        children: filteredChildren
      };
    }

    return null;
  }

  if (!needle) {
    const collectAllIds = (n: DimensionTreeNode) => {
      matchingIds.add(n.id);
      n.children.forEach(collectAllIds);
    };
    nodes.forEach(collectAllIds);
    return { filtered: nodes, matchingIds };
  }

  const filtered = nodes.map(filter).filter((n): n is DimensionTreeNode => n !== null);
  return { filtered, matchingIds };
}

export function DimensionTreeNav({
  dimensions,
  issues,
  activeDimensionId,
  searchQuery,
  blockedSeverities,
  onSelectDimension
}: {
  dimensions: DimensionRecord[];
  issues: ValidationIssue[];
  activeDimensionId: string | null;
  searchQuery: string;
  blockedSeverities: Array<"error" | "warning" | "info" | "off">;
  onSelectDimension: (dimensionId: string) => void;
}) {
  const treeGroups = useMemo(
    () => buildDimensionTreeGroups(dimensions, issues, blockedSeverities),
    [dimensions, issues, blockedSeverities]
  );

  // Expanded state for category groups and parent nodes
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());

  const toggleNode = (key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isSearching = Boolean(searchQuery.trim());

  return (
    <div className="dimension-tree-nav" role="tree" aria-label="OneStream Dimension Hierarchy">
      {treeGroups.map((group) => {
        const { filtered } = filterTreeNodes(group.nodes, searchQuery);
        if (isSearching && filtered.length === 0) return null;

        const categoryKey = `cat-${group.type}`;
        const isCategoryExpanded = isSearching || !collapsedKeys.has(categoryKey);

        return (
          <div key={categoryKey} className="tree-category-group" role="treeitem" aria-expanded={isCategoryExpanded}>
            <div
              className="tree-category-header"
              onClick={() => toggleNode(categoryKey)}
              title={`${group.label} (${group.nodes.length} dimensions)`}
            >
              <button
                type="button"
                className="tree-toggle-btn"
                aria-label={isCategoryExpanded ? `Collapse ${group.label}` : `Expand ${group.label}`}
              >
                {isCategoryExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <span className="tree-category-icon">
                <Folder size={15} />
              </span>
              <strong className="tree-category-title">{group.label}</strong>
              {group.totalErrors > 0 && (
                <span className="status-badge danger tree-badge">
                  {group.totalErrors}
                </span>
              )}
            </div>

            {isCategoryExpanded && (
              <div className="tree-category-children" role="group">
                {filtered.map((node) => (
                  <TreeNodeItem
                    key={node.id}
                    node={node}
                    level={1}
                    activeDimensionId={activeDimensionId}
                    collapsedKeys={collapsedKeys}
                    isSearching={isSearching}
                    onToggleNode={toggleNode}
                    onSelectDimension={onSelectDimension}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TreeNodeItem({
  node,
  level,
  activeDimensionId,
  collapsedKeys,
  isSearching,
  onToggleNode,
  onSelectDimension
}: {
  node: DimensionTreeNode;
  level: number;
  activeDimensionId: string | null;
  collapsedKeys: Set<string>;
  isSearching: boolean;
  onToggleNode: (key: string) => void;
  onSelectDimension: (dimensionId: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const nodeKey = `node-${node.id}`;
  const isExpanded = isSearching || !collapsedKeys.has(nodeKey);
  const isSelected = activeDimensionId === node.id;

  return (
    <div className="tree-node-wrapper">
      <div
        className={`tree-node-item ${isSelected ? "selected" : ""} level-${level}`}
        onClick={() => onSelectDimension(node.id)}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isExpanded : undefined}
      >
        <div className="tree-node-content">
          {hasChildren ? (
            <button
              type="button"
              className="tree-toggle-btn"
              onClick={(e) => {
                e.stopPropagation();
                onToggleNode(nodeKey);
              }}
              aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            >
              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <span className="tree-toggle-spacer" />
          )}

          <span className="tree-node-icon">
            {hasChildren ? <Database size={14} /> : <Layers size={14} />}
          </span>

          <span className="tree-node-label" title={node.dimension.sheetName}>
            {node.name}
          </span>

          {node.issueSummary.errors > 0 && (
            <span className="nav-issue error" title={`${node.issueSummary.errors} blocking errors`}>
              {node.issueSummary.errors}
            </span>
          )}
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className="tree-node-children" role="group">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              level={level + 1}
              activeDimensionId={activeDimensionId}
              collapsedKeys={collapsedKeys}
              isSearching={isSearching}
              onToggleNode={onToggleNode}
              onSelectDimension={onSelectDimension}
            />
          ))}
        </div>
      )}
    </div>
  );
}
