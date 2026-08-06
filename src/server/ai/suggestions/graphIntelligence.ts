import type {
  DimensionMemberRecord,
  DimensionRelationshipRecord,
} from "../../../shared/types";

export interface GraphMetrics {
  totalMembers: number;
  totalRelationships: number;
  rootCount: number;
  orphanCount: number;
  cycleCount: number;
  maxDepth: number;
  leafCount: number;
}

export interface GraphCycle {
  id: string;
  path: string[];
  description: string;
}

export interface GraphOrphan {
  memberKey: string;
  dimensionId: string;
  suggestedParent: string | null;
}

export interface MultiParentNode {
  memberKey: string;
  parents: string[];
  totalWeight: number;
}

export interface QuickFixAction {
  id: string;
  type: "linkOrphan" | "breakCycle" | "trimWhitespace" | "assignDescription";
  title: string;
  description: string;
  targetMemberKey?: string;
  payload: Record<string, unknown>;
}

export interface TopologyTreeNode {
  id: string;
  key: string;
  label: string;
  dimensionId?: string;
  kind: "root" | "parent" | "child" | "leaf" | "orphan" | "cycle";
  children: TopologyTreeNode[];
}

export interface GraphAnalysisResult {
  metrics: GraphMetrics;
  cycles: GraphCycle[];
  orphans: GraphOrphan[];
  multiParents: MultiParentNode[];
  quickFixes: QuickFixAction[];
  topologyTree: TopologyTreeNode[];
}

const PSEUDO_ROOTS = new Set(["root", "Root", "ROOT", ""]);

export function analyzeGraphTopology({
  members,
  relationships,
}: {
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}): GraphAnalysisResult {
  const memberMap = new Map<string, DimensionMemberRecord>();
  const activeMemberKeys = new Set<string>();

  for (const m of members) {
    if (m.isActive !== false && m.memberKey) {
      const trimmed = m.memberKey.trim();
      memberMap.set(trimmed.toLowerCase(), m);
      activeMemberKeys.add(trimmed);
    }
  }

  const parentsByChild = new Map<string, Set<string>>();
  const childrenByParent = new Map<string, string[]>();
  const parentWeightsByChild = new Map<string, number>();

  for (const rel of relationships) {
    const parent = (rel.parentKey ?? "").trim();
    const child = (rel.childKey ?? "").trim();
    if (!parent || !child) continue;

    if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
    childrenByParent.get(parent)!.push(child);

    if (!parentsByChild.has(child)) parentsByChild.set(child, new Set());
    parentsByChild.get(child)!.add(parent);

    const weight = rel.aggregationWeight ?? 1.0;
    parentWeightsByChild.set(
      child,
      (parentWeightsByChild.get(child) ?? 0) + weight,
    );
  }

  // 1. Identify Real Hierarchy Roots
  // A key is a root if it is a parent in childrenByParent AND either has no parents or its parent is pseudo 'root'
  const rootKeys = new Set<string>();

  for (const parentKey of childrenByParent.keys()) {
    if (PSEUDO_ROOTS.has(parentKey)) continue;

    const parents = parentsByChild.get(parentKey);
    if (!parents || parents.size === 0) {
      rootKeys.add(parentKey);
    } else {
      let onlyPseudoParents = true;
      for (const p of parents) {
        if (!PSEUDO_ROOTS.has(p)) {
          onlyPseudoParents = false;
          break;
        }
      }
      if (onlyPseudoParents) {
        rootKeys.add(parentKey);
      }
    }
  }

  // 2. Identify Orphans (Active members that are not reachable from any root and have no parents/children)
  const reachable = new Set<string>();

  function collectReachable(node: string) {
    if (reachable.has(node)) return;
    reachable.add(node);
    const children = childrenByParent.get(node) ?? [];
    for (const child of children) {
      collectReachable(child);
    }
  }

  for (const root of rootKeys) {
    collectReachable(root);
  }

  const orphans: GraphOrphan[] = [];
  const defaultSuggestedRoot = Array.from(rootKeys)[0] ?? null;

  for (const member of members) {
    if (member.isActive === false || !member.memberKey) continue;
    const key = member.memberKey.trim();

    if (!reachable.has(key) && !rootKeys.has(key)) {
      orphans.push({
        memberKey: key,
        dimensionId: member.dimensionId,
        suggestedParent: defaultSuggestedRoot,
      });
    }
  }

  // 3. Detect Cycles using DFS Traversal
  const cycles: GraphCycle[] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const currentPath: string[] = [];

  function dfsCycle(node: string) {
    visited.add(node);
    recStack.add(node);
    currentPath.push(node);

    const children = childrenByParent.get(node) ?? [];
    for (const child of children) {
      if (!visited.has(child)) {
        dfsCycle(child);
      } else if (recStack.has(child)) {
        const cycleStartIndex = currentPath.indexOf(child);
        const cyclePath = [...currentPath.slice(cycleStartIndex), child];
        cycles.push({
          id: `cycle-${cyclePath.join("-")}`,
          path: cyclePath,
          description: `Circular dependency detected: ${cyclePath.join(" → ")}`,
        });
      }
    }

    currentPath.pop();
    recStack.delete(node);
  }

  for (const member of members) {
    const key = member.memberKey.trim();
    if (!visited.has(key)) {
      dfsCycle(key);
    }
  }

  // 4. Multi-parent diamond nodes
  const multiParents: MultiParentNode[] = [];
  for (const [child, parents] of parentsByChild.entries()) {
    if (parents.size > 1 && !PSEUDO_ROOTS.has(child)) {
      multiParents.push({
        memberKey: child,
        parents: Array.from(parents),
        totalWeight: parentWeightsByChild.get(child) ?? 0,
      });
    }
  }

  // 5. Calculate Max Tree Depth & Leaf Count
  let maxDepth = 0;
  let leafCount = 0;
  const depthVisited = new Set<string>();

  function getDepth(node: string, depth: number): number {
    if (depthVisited.has(node)) return depth;
    depthVisited.add(node);

    const children = childrenByParent.get(node) ?? [];
    if (children.length === 0) {
      leafCount++;
      return depth;
    }
    let maxChildDepth = depth;
    for (const child of children) {
      maxChildDepth = Math.max(maxChildDepth, getDepth(child, depth + 1));
    }
    return maxChildDepth;
  }

  for (const root of rootKeys) {
    depthVisited.clear();
    maxDepth = Math.max(maxDepth, getDepth(root, 1));
  }

  // 6. Build Dynamic Topology Tree for SVG Visualization
  const topologyTree: TopologyTreeNode[] = [];
  const builtKeys = new Set<string>();

  function buildTreeBranch(key: string, level: number): TopologyTreeNode {
    builtKeys.add(key);
    const children = childrenByParent.get(key) ?? [];
    const member = memberMap.get(key.toLowerCase());
    const isLeaf = children.length === 0;

    const childNodes: TopologyTreeNode[] = [];
    const sliceChildren = children.slice(0, 10);
    for (const childKey of sliceChildren) {
      if (!builtKeys.has(childKey)) {
        childNodes.push(buildTreeBranch(childKey, level + 1));
      }
    }

    return {
      id: `node-${key}`,
      key,
      label: member?.description ? `${key} (${member.description})` : key,
      dimensionId: member?.dimensionId,
      kind: level === 0 ? "root" : isLeaf ? "leaf" : "parent",
      children: childNodes,
    };
  }

  for (const rootKey of rootKeys) {
    topologyTree.push(buildTreeBranch(rootKey, 0));
  }

  // Add Orphan nodes to topology tree root level
  for (const orphan of orphans.slice(0, 10)) {
    topologyTree.push({
      id: `orphan-${orphan.memberKey}`,
      key: orphan.memberKey,
      label: orphan.memberKey,
      dimensionId: orphan.dimensionId,
      kind: "orphan",
      children: [],
    });
  }

  // 7. Generate 1-Click Quick-Fix Actions
  const quickFixes: QuickFixAction[] = [];

  for (const orphan of orphans) {
    quickFixes.push({
      id: `fix-orphan-${orphan.memberKey}`,
      type: "linkOrphan",
      title: `Link Orphan '${orphan.memberKey}' to Root`,
      description: `Attach member '${orphan.memberKey}' under root hierarchy`,
      targetMemberKey: orphan.memberKey,
      payload: {
        memberKey: orphan.memberKey,
        parentKey: orphan.suggestedParent ?? "Root",
        dimensionId: orphan.dimensionId,
      },
    });
  }

  for (const member of members) {
    if (member.memberKey !== member.memberKey.trim()) {
      quickFixes.push({
        id: `fix-space-${member.id}`,
        type: "trimWhitespace",
        title: `Trim Whitespace in '${member.memberKey}'`,
        description: `Remove leading/trailing spaces from member key`,
        targetMemberKey: member.memberKey,
        payload: {
          memberId: member.id,
          trimmedKey: member.memberKey.trim(),
        },
      });
    }
  }

  for (const member of members) {
    if (!member.description || member.description.trim() === "") {
      quickFixes.push({
        id: `fix-desc-${member.id}`,
        type: "assignDescription",
        title: `Auto-Assign Description for '${member.memberKey}'`,
        description: `Set description to canonical key format: ${member.memberKey}`,
        targetMemberKey: member.memberKey,
        payload: {
          memberId: member.id,
          description: member.memberKey,
        },
      });
    }
  }

  return {
    metrics: {
      totalMembers: members.length,
      totalRelationships: relationships.length,
      rootCount: rootKeys.size,
      orphanCount: orphans.length,
      cycleCount: cycles.length,
      maxDepth: maxDepth || (members.length > 0 ? 1 : 0),
      leafCount: leafCount || members.length,
    },
    cycles,
    orphans,
    multiParents,
    quickFixes,
    topologyTree,
  };
}
