/**
 * Dimension Knowledge Graph model.
 *
 * A unified, precomputed graph over a project's dimensions, members and
 * parent/child relationships. It powers the Insights → Knowledge Graph tab:
 * dimension graph, member graph, cross-dimension links, where-used and impact
 * (ancestor/descendant) tracing.
 */

export type KnowledgeNodeKind =
  | "root"
  | "parent"
  | "leaf"
  | "orphan"
  | "cycle";

/** A member node in the member graph. */
export interface KnowledgeMemberNode {
  /** Stable id: `m::${dimensionId}::${memberKey}`. */
  id: string;
  memberKey: string;
  label: string;
  description: string;
  dimensionId: string;
  dimensionName: string;
  dimensionType: string;
  kind: KnowledgeNodeKind;
  /** Longest-path depth from a root (0 = root). Used for layered layout. */
  depth: number;
  /** Node ids of direct parents (within the same dimension). */
  parentIds: string[];
  /** Node ids of direct children (within the same dimension). */
  childIds: string[];
  /** Number of other dimensions that also contain this member key. */
  crossDimensionCount: number;
}

/** A dimension node in the dimension graph. */
export interface KnowledgeDimensionNode {
  /** Stable id: `d::${dimensionId}`. */
  id: string;
  dimensionId: string;
  dimensionName: string;
  dimensionType: string;
  memberCount: number;
  relationshipCount: number;
}

export interface KnowledgeEdge {
  id: string;
  /** Source node id (parent, or dimension A). */
  source: string;
  /** Target node id (child, or dimension B). */
  target: string;
  type: "parent-child" | "cross-dimension";
  /** Aggregation weight for parent-child; shared-member count for cross-dimension. */
  weight: number;
}

/** A member key that appears in more than one dimension. */
export interface CrossDimensionMember {
  memberKey: string;
  dimensions: { dimensionId: string; dimensionName: string; dimensionType: string }[];
}

export interface KnowledgeGraphMetrics {
  memberNodeCount: number;
  dimensionNodeCount: number;
  parentChildEdgeCount: number;
  crossDimensionEdgeCount: number;
  crossDimensionMemberCount: number;
  orphanCount: number;
  rootCount: number;
  cycleCount: number;
  maxDepth: number;
  /** True when member-level nodes were capped for performance. */
  truncated: boolean;
}

export interface KnowledgeGraphModel {
  scope: string;
  memberNodes: KnowledgeMemberNode[];
  memberEdges: KnowledgeEdge[];
  dimensionNodes: KnowledgeDimensionNode[];
  dimensionEdges: KnowledgeEdge[];
  crossDimensionMembers: CrossDimensionMember[];
  metrics: KnowledgeGraphMetrics;
}
