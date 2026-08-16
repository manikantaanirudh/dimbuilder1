import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
} from "../../../shared/types";
import type {
  CrossDimensionMember,
  KnowledgeDimensionNode,
  KnowledgeEdge,
  KnowledgeGraphModel,
  KnowledgeMemberNode,
  KnowledgeNodeKind,
} from "../../../shared/knowledgeGraphTypes";

/** Cap on member-level nodes to keep the client SVG responsive. */
const MEMBER_NODE_CAP = 600;

function memberNodeId(dimensionId: string, memberKey: string): string {
  return `m::${dimensionId}::${memberKey}`;
}

function dimensionNodeId(dimensionId: string): string {
  return `d::${dimensionId}`;
}

/**
 * Builds a unified Dimension Knowledge Graph for a project (optionally scoped
 * to a single dimension). Produces both a member-level graph (parent/child)
 * and a dimension-level graph (cross-dimension shared-member links), plus a
 * cross-dimension member index for where-used analysis.
 */
export function buildKnowledgeGraph({
  dimensions,
  members,
  relationships,
  scopeDimensionId,
}: {
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
  scopeDimensionId?: string;
}): KnowledgeGraphModel {
  const dimById = new Map<string, DimensionRecord>();
  for (const dim of dimensions) dimById.set(dim.id, dim);

  const scoped = Boolean(scopeDimensionId && scopeDimensionId !== "ALL");

  // Resolve scope to a concrete dimension id (accept id or name).
  let scopeId: string | undefined;
  if (scoped) {
    const target = dimensions.find(
      (d) =>
        d.id === scopeDimensionId ||
        d.dimensionName.toLowerCase() === (scopeDimensionId ?? "").toLowerCase(),
    );
    scopeId = target?.id ?? scopeDimensionId;
  }

  const inScope = (dimensionId: string) => !scoped || dimensionId === scopeId;

  const activeMembers = members.filter(
    (m) => m.isActive !== false && m.memberKey && inScope(m.dimensionId),
  );
  const scopedRelationships = relationships.filter((r) =>
    inScope(r.dimensionId),
  );

  // --- Cross-dimension member index (case-insensitive key match) ---------
  const keyToDimensions = new Map<
    string,
    Map<string, { dimensionId: string; dimensionName: string; dimensionType: string }>
  >();
  const displayKeyByNorm = new Map<string, string>();
  for (const m of activeMembers) {
    const normKey = m.memberKey.trim().toLowerCase();
    if (!normKey) continue;
    const dim = dimById.get(m.dimensionId);
    if (!dim) continue;
    if (!displayKeyByNorm.has(normKey)) displayKeyByNorm.set(normKey, m.memberKey.trim());
    if (!keyToDimensions.has(normKey)) keyToDimensions.set(normKey, new Map());
    keyToDimensions.get(normKey)!.set(m.dimensionId, {
      dimensionId: dim.id,
      dimensionName: dim.dimensionName,
      dimensionType: dim.dimensionType,
    });
  }

  const crossDimensionMembers: CrossDimensionMember[] = [];
  for (const [normKey, dimsForKey] of keyToDimensions) {
    if (dimsForKey.size > 1) {
      crossDimensionMembers.push({
        memberKey: displayKeyByNorm.get(normKey) ?? normKey,
        dimensions: Array.from(dimsForKey.values()),
      });
    }
  }

  // --- Parent/child relationship indexes (per dimension) -----------------
  const childrenByParent = new Map<string, string[]>(); // key = `${dimId}::${parentKey}`
  const parentsByChild = new Map<string, Set<string>>();
  const relKey = (dimId: string, key: string) => `${dimId}::${key.trim()}`;

  // Every key that participates in a relationship (parent or child), so that
  // relationship-only keys such as the literal "root" also become nodes —
  // mirroring the dimension hierarchy tree.
  const relNodeInfo = new Map<string, { dimId: string; key: string }>();
  const childRelKeys = new Set<string>();

  for (const rel of scopedRelationships) {
    const parent = (rel.parentKey ?? "").trim();
    const child = (rel.childKey ?? "").trim();
    if (!parent || !child) continue;
    const pKey = relKey(rel.dimensionId, parent);
    const cKey = relKey(rel.dimensionId, child);
    if (!childrenByParent.has(pKey)) childrenByParent.set(pKey, []);
    childrenByParent.get(pKey)!.push(child);
    if (!parentsByChild.has(cKey)) parentsByChild.set(cKey, new Set());
    parentsByChild.get(cKey)!.add(parent);
    relNodeInfo.set(pKey, { dimId: rel.dimensionId, key: parent });
    relNodeInfo.set(cKey, { dimId: rel.dimensionId, key: child });
    childRelKeys.add(cKey);
  }

  // Roots = parent keys that never appear as a child (matches buildHierarchyTree).
  // This includes the literal top node ("root"), which is shown in the graph.
  const rootRelKeys = new Set<string>();
  for (const pKey of childrenByParent.keys()) {
    if (!childRelKeys.has(pKey)) rootRelKeys.add(pKey);
  }

  // Reachability from roots (drives orphan detection, same as the tree).
  const reachable = new Set<string>();
  const collectReachable = (rk: string) => {
    if (reachable.has(rk)) return;
    reachable.add(rk);
    const info = relNodeInfo.get(rk);
    if (!info) return;
    for (const child of childrenByParent.get(rk) ?? []) {
      collectReachable(relKey(info.dimId, child));
    }
  };
  for (const rk of rootRelKeys) collectReachable(rk);

  // Cycle detection via DFS over relationship keys.
  const cycleRelKeys = new Set<string>();
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const dfsCycle = (rk: string) => {
    visited.add(rk);
    recStack.add(rk);
    const info = relNodeInfo.get(rk);
    if (info) {
      for (const child of childrenByParent.get(rk) ?? []) {
        const crk = relKey(info.dimId, child);
        if (!visited.has(crk)) {
          dfsCycle(crk);
        } else if (recStack.has(crk)) {
          cycleRelKeys.add(crk);
          cycleRelKeys.add(rk);
        }
      }
    }
    recStack.delete(rk);
  };
  for (const rk of relNodeInfo.keys()) {
    if (!visited.has(rk)) dfsCycle(rk);
  }

  // Longest-path depth from roots, cycle-safe.
  const depthByRelKey = new Map<string, number>();
  const computeDepth = (rk: string, stack: Set<string>): number => {
    if (depthByRelKey.has(rk)) return depthByRelKey.get(rk)!;
    if (stack.has(rk)) return 0; // cycle guard
    stack.add(rk);
    const info = relNodeInfo.get(rk);
    const parents = parentsByChild.get(rk);
    let depth = 0;
    if (info && parents && parents.size > 0) {
      let maxParent = -1;
      for (const p of parents) {
        maxParent = Math.max(maxParent, computeDepth(relKey(info.dimId, p), stack));
      }
      depth = maxParent + 1;
    }
    stack.delete(rk);
    depthByRelKey.set(rk, depth);
    return depth;
  };

  // --- Build member nodes -------------------------------------------------
  let truncated = false;
  const cappedMembers =
    activeMembers.length > MEMBER_NODE_CAP
      ? (truncated = true, activeMembers.slice(0, MEMBER_NODE_CAP))
      : activeMembers;

  const memberNodeById = new Map<string, KnowledgeMemberNode>();
  const memberNodes: KnowledgeMemberNode[] = [];
  let orphanCount = 0;
  let maxDepth = 0;

  const kindFor = (
    rk: string,
    hasChildren: boolean,
  ): KnowledgeNodeKind => {
    if (cycleRelKeys.has(rk)) return "cycle";
    if (rootRelKeys.has(rk)) return "root";
    if (!reachable.has(rk)) return "orphan";
    if (hasChildren) return "parent";
    return "leaf";
  };

  for (const m of cappedMembers) {
    const key = m.memberKey.trim();
    const dim = dimById.get(m.dimensionId);
    if (!dim) continue;
    const rk = relKey(m.dimensionId, key);
    const hasChildren = (childrenByParent.get(rk) ?? []).length > 0;
    const kind = kindFor(rk, hasChildren);
    if (kind === "orphan") orphanCount += 1;

    const depth = computeDepth(rk, new Set());
    if (depth > maxDepth) maxDepth = depth;

    const crossCount = (keyToDimensions.get(key.toLowerCase())?.size ?? 1) - 1;

    const node: KnowledgeMemberNode = {
      id: memberNodeId(m.dimensionId, key),
      memberKey: key,
      label: m.description ? `${key} — ${m.description}` : key,
      description: m.description ?? "",
      dimensionId: m.dimensionId,
      dimensionName: dim.dimensionName,
      dimensionType: dim.dimensionType,
      kind,
      depth,
      parentIds: [],
      childIds: [],
      crossDimensionCount: Math.max(0, crossCount),
    };
    memberNodes.push(node);
    memberNodeById.set(node.id, node);
  }

  // Add synthetic nodes for relationship-only keys (e.g. the "root" node)
  // that have no member record, so the graph matches the hierarchy exactly.
  for (const [rk, info] of relNodeInfo) {
    const nodeId = memberNodeId(info.dimId, info.key);
    if (memberNodeById.has(nodeId)) continue;
    const dim = dimById.get(info.dimId);
    if (!dim) continue;
    const hasChildren = (childrenByParent.get(rk) ?? []).length > 0;
    const kind = kindFor(rk, hasChildren);
    const depth = computeDepth(rk, new Set());
    if (depth > maxDepth) maxDepth = depth;
    const node: KnowledgeMemberNode = {
      id: nodeId,
      memberKey: info.key,
      label: info.key,
      description: "",
      dimensionId: info.dimId,
      dimensionName: dim.dimensionName,
      dimensionType: dim.dimensionType,
      kind,
      depth,
      parentIds: [],
      childIds: [],
      crossDimensionCount: 0,
    };
    memberNodes.push(node);
    memberNodeById.set(node.id, node);
  }

  // --- Build member edges + wire parent/child ids ------------------------
  const memberEdges: KnowledgeEdge[] = [];
  const seenEdge = new Set<string>();
  for (const rel of scopedRelationships) {
    const parent = (rel.parentKey ?? "").trim();
    const child = (rel.childKey ?? "").trim();
    if (!parent || !child) continue;
    const sourceId = memberNodeId(rel.dimensionId, parent);
    const targetId = memberNodeId(rel.dimensionId, child);
    const source = memberNodeById.get(sourceId);
    const target = memberNodeById.get(targetId);
    if (!source || !target) continue; // endpoint capped/out of scope
    const edgeId = `${sourceId}->${targetId}`;
    if (seenEdge.has(edgeId)) continue;
    seenEdge.add(edgeId);
    source.childIds.push(targetId);
    target.parentIds.push(sourceId);
    memberEdges.push({
      id: edgeId,
      source: sourceId,
      target: targetId,
      type: "parent-child",
      weight: rel.aggregationWeight ?? 1,
    });
  }

  // --- Build dimension graph ---------------------------------------------
  const memberCountByDim = new Map<string, number>();
  for (const m of activeMembers) {
    memberCountByDim.set(m.dimensionId, (memberCountByDim.get(m.dimensionId) ?? 0) + 1);
  }
  const relCountByDim = new Map<string, number>();
  for (const r of scopedRelationships) {
    relCountByDim.set(r.dimensionId, (relCountByDim.get(r.dimensionId) ?? 0) + 1);
  }

  const dimensionNodes: KnowledgeDimensionNode[] = dimensions
    .filter((d) => inScope(d.id) && memberCountByDim.has(d.id))
    .map((d) => ({
      id: dimensionNodeId(d.id),
      dimensionId: d.id,
      dimensionName: d.dimensionName,
      dimensionType: d.dimensionType,
      memberCount: memberCountByDim.get(d.id) ?? 0,
      relationshipCount: relCountByDim.get(d.id) ?? 0,
    }));

  // Cross-dimension edges: two dimensions linked by count of shared member keys.
  const pairSharedCount = new Map<string, number>();
  for (const [, dimsForKey] of keyToDimensions) {
    if (dimsForKey.size < 2) continue;
    const ids = Array.from(dimsForKey.keys()).sort();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const pair = `${ids[i]}|${ids[j]}`;
        pairSharedCount.set(pair, (pairSharedCount.get(pair) ?? 0) + 1);
      }
    }
  }
  const dimensionEdges: KnowledgeEdge[] = [];
  for (const [pair, count] of pairSharedCount) {
    const [a, b] = pair.split("|");
    dimensionEdges.push({
      id: `xdim::${pair}`,
      source: dimensionNodeId(a),
      target: dimensionNodeId(b),
      type: "cross-dimension",
      weight: count,
    });
  }

  crossDimensionMembers.sort((x, y) => y.dimensions.length - x.dimensions.length);

  return {
    scope: scoped ? (scopeId ?? scopeDimensionId ?? "ALL") : "ALL",
    memberNodes,
    memberEdges,
    dimensionNodes,
    dimensionEdges,
    crossDimensionMembers,
    metrics: {
      memberNodeCount: memberNodes.length,
      dimensionNodeCount: dimensionNodes.length,
      parentChildEdgeCount: memberEdges.length,
      crossDimensionEdgeCount: dimensionEdges.length,
      crossDimensionMemberCount: crossDimensionMembers.length,
      orphanCount,
      rootCount: rootRelKeys.size,
      cycleCount: cycleRelKeys.size,
      maxDepth,
      truncated,
    },
  };
}
