import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord
} from "./types";
import { normalizeCellValue } from "./text";

export interface HierarchyPathRow {
  dimensionType: string;
  dimensionName: string;
  path: string;
  levels: string[];
  memberKey: string;
  description: string;
  isLeaf: boolean;
  parentCount: number;
  aggregationWeight: number | null;
  warnings: string[];
}

export interface LevelizedHierarchyTable {
  headers: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
}

export interface ParentChildHierarchyTable {
  headers: string[];
  rows: Array<Record<string, string | number | null>>;
}

export interface MemberClassification {
  memberKey: string;
  isLeaf: boolean;
  isParent: boolean;
  parentCount: number;
  childCount: number;
}

export interface SharedMemberReportRow {
  memberKey: string;
  parentCount: number;
  parents: string[];
}

export interface OrphanMemberReportRow {
  dimensionType: string;
  dimensionName: string;
  memberKey: string;
  description: string;
}

export interface HierarchyDepthStats {
  maxDepth: number;
  minDepth: number;
  averageDepth: number;
  pathCount: number;
  hasCycle: boolean;
}

export interface HierarchyHealthSummary {
  dimensionType: string;
  dimensionName: string;
  memberCount: number;
  relationshipCount: number;
  maxDepth: number;
  pathCount: number;
  orphanCount: number;
  sharedMemberCount: number;
  leafCount: number;
  parentCount: number;
  hasCycle: boolean;
  warnings: string[];
}

export interface HierarchyAnalyticsResult {
  summary: HierarchyHealthSummary;
  depthStats: HierarchyDepthStats;
  classifications: MemberClassification[];
  sharedMembers: SharedMemberReportRow[];
  orphanMembers: OrphanMemberReportRow[];
  paths: HierarchyPathRow[];
}

const LEVELIZED_BASE_HEADERS = ["dimensionType", "dimensionName", "path"] as const;
const LEVELIZED_TRAILING_HEADERS = ["memberKey", "description", "isLeaf", "parentCount", "aggregationWeight", "warnings"] as const;
const PARENT_CHILD_HEADERS = [
  "dimensionType",
  "dimensionName",
  "parentKey",
  "childKey",
  "sortOrder",
  "aggregationWeight",
  "percentConsol",
  "percentOwnership",
  "ownershipType",
  "operation"
] as const;

export function buildHierarchyPaths(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): HierarchyPathRow[] {
  const activeMembers = members.filter((member) => member.isActive !== false && member.memberKey);
  const graph = buildGraph(relationships, activeMembers);

  if (graph.relationships.length === 0) {
    return activeMembers
      .sort((left, right) => compareKeys(left.memberKey, right.memberKey))
      .map((member) => toPathRow(dimension, [member.memberKey], member.memberKey, graph, undefined, []));
  }

  const roots = findTraversalRoots(graph);
  const rows: HierarchyPathRow[] = [];
  const traversedRoots = roots.length ? roots : graph.sortedParentKeys.slice(0, 1);

  for (const root of traversedRoots) {
    traverseHierarchy(dimension, root, graph, [root], rows, undefined);
  }

  return rows;
}

export function buildLevelizedRows(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): LevelizedHierarchyTable {
  const paths = buildHierarchyPaths(dimension, members, relationships);
  const maxLevelIndex = Math.max(0, ...paths.map((row) => row.levels.length - 1));
  const levelHeaders = Array.from({ length: maxLevelIndex + 1 }, (_item, index) => `level${index}`);
  const headers = [...LEVELIZED_BASE_HEADERS, ...levelHeaders, ...LEVELIZED_TRAILING_HEADERS];
  const rows = paths.map((path) => {
    const row: Record<string, string | number | boolean | null> = {
      dimensionType: path.dimensionType,
      dimensionName: path.dimensionName,
      path: path.path,
      memberKey: path.memberKey,
      description: path.description,
      isLeaf: path.isLeaf,
      parentCount: path.parentCount,
      aggregationWeight: path.aggregationWeight,
      warnings: path.warnings.join("; ")
    };
    levelHeaders.forEach((header, index) => {
      row[header] = path.levels[index] ?? "";
    });
    return row;
  });

  return { headers, rows };
}

export function classifyMembersAsLeafOrParent(
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): MemberClassification[] {
  const graph = buildGraph(relationships);
  return members
    .filter((member) => member.isActive !== false && member.memberKey)
    .sort((left, right) => compareKeys(left.memberKey, right.memberKey))
    .map((member) => {
      const childCount = graph.childrenByParent.get(member.memberKey)?.length ?? 0;
      const parentCount = graph.parentsByChild.get(member.memberKey)?.size ?? 0;
      return {
        memberKey: member.memberKey,
        isLeaf: childCount === 0,
        isParent: childCount > 0,
        parentCount,
        childCount
      };
    });
}

export function findSharedMembers(
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): SharedMemberReportRow[] {
  const activeMemberKeys = new Set(members.filter((member) => member.isActive !== false).map((member) => member.memberKey));
  const graph = buildGraph(relationships);
  return [...graph.parentsByChild.entries()]
    .filter(([memberKey, parents]) => activeMemberKeys.has(memberKey) && parents.size > 1)
    .map(([memberKey, parents]) => ({ memberKey, parentCount: parents.size, parents: [...parents].sort(compareKeys) }))
    .sort((left, right) => compareKeys(left.memberKey, right.memberKey));
}

export function findOrphanMembers(
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[],
  dimension?: DimensionRecord
): OrphanMemberReportRow[] {
  const activeMembers = members.filter((member) => member.isActive !== false && member.memberKey);
  if (relationships.length === 0) return [];

  const graph = buildGraph(relationships);
  const reachable = new Set<string>();
  const roots = findTraversalRoots(graph);
  const traversalRoots = roots.length ? roots : graph.sortedParentKeys.slice(0, 1);

  for (const root of traversalRoots) {
    collectReachable(root, graph, reachable, new Set());
  }

  return activeMembers
    .filter((member) => !reachable.has(member.memberKey))
    .sort((left, right) => compareKeys(left.memberKey, right.memberKey))
    .map((member) => ({
      dimensionType: dimension?.dimensionType ?? "",
      dimensionName: dimension?.dimensionName ?? "",
      memberKey: member.memberKey,
      description: getMemberDescription(member)
    }));
}

export function calculateHierarchyDepthStats(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): HierarchyDepthStats {
  const paths = buildHierarchyPaths(dimension, members, relationships);
  const depths = paths.map((path) => Math.max(0, path.levels.length - 1));
  const hasCycle = paths.some((path) => path.warnings.includes("CYCLE_DETECTED"));
  if (depths.length === 0) {
    return { maxDepth: 0, minDepth: 0, averageDepth: 0, pathCount: 0, hasCycle };
  }
  return {
    maxDepth: Math.max(...depths),
    minDepth: Math.min(...depths),
    averageDepth: Number((depths.reduce((total, depth) => total + depth, 0) / depths.length).toFixed(2)),
    pathCount: depths.length,
    hasCycle
  };
}

export function buildParentChildRows(
  dimension: DimensionRecord,
  _members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): ParentChildHierarchyTable {
  const rows = [...relationships]
    .filter((relationship) => relationship.parentKey || relationship.childKey)
    .sort(compareRelationships)
    .map((relationship) => ({
      dimensionType: dimension.dimensionType,
      dimensionName: dimension.dimensionName,
      parentKey: relationship.parentKey,
      childKey: relationship.childKey,
      sortOrder: relationship.rowOrder,
      aggregationWeight: relationship.aggregationWeight,
      percentConsol: relationship.percentConsol,
      percentOwnership: relationship.percentOwnership,
      ownershipType: relationship.ownershipType,
      operation: relationship.operation ?? ""
    }));
  return { headers: [...PARENT_CHILD_HEADERS], rows };
}

export function summarizeHierarchyHealth(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): HierarchyHealthSummary {
  const classifications = classifyMembersAsLeafOrParent(members, relationships);
  const sharedMembers = findSharedMembers(members, relationships);
  const orphans = findOrphanMembers(members, relationships, dimension);
  const depthStats = calculateHierarchyDepthStats(dimension, members, relationships);
  const warnings: string[] = [];
  if (depthStats.hasCycle) warnings.push("CYCLE_DETECTED");

  return {
    dimensionType: dimension.dimensionType,
    dimensionName: dimension.dimensionName,
    memberCount: classifications.length,
    relationshipCount: relationships.length,
    maxDepth: depthStats.maxDepth,
    pathCount: depthStats.pathCount,
    orphanCount: orphans.length,
    sharedMemberCount: sharedMembers.length,
    leafCount: classifications.filter((row) => row.isLeaf).length,
    parentCount: classifications.filter((row) => row.isParent).length,
    hasCycle: depthStats.hasCycle,
    warnings
  };
}

export function buildHierarchyAnalytics(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): HierarchyAnalyticsResult {
  return {
    summary: summarizeHierarchyHealth(dimension, members, relationships),
    depthStats: calculateHierarchyDepthStats(dimension, members, relationships),
    classifications: classifyMembersAsLeafOrParent(members, relationships),
    sharedMembers: findSharedMembers(members, relationships),
    orphanMembers: findOrphanMembers(members, relationships, dimension),
    paths: buildHierarchyPaths(dimension, members, relationships)
  };
}

export function exportHierarchyLevelizedCsv(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): string {
  const table = buildLevelizedRows(dimension, members, relationships);
  return toCsv(table.headers, table.rows);
}

export function exportHierarchyPathsCsv(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): string {
  const rows = buildHierarchyPaths(dimension, members, relationships).map((path) => ({
    dimensionType: path.dimensionType,
    dimensionName: path.dimensionName,
    path: path.path,
    depth: Math.max(0, path.levels.length - 1),
    memberKey: path.memberKey,
    isLeaf: path.isLeaf,
    parentCount: path.parentCount,
    warnings: path.warnings.join("; ")
  }));
  return toCsv(["dimensionType", "dimensionName", "path", "depth", "memberKey", "isLeaf", "parentCount", "warnings"], rows);
}

export function exportHierarchyParentChildCsv(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): string {
  const table = buildParentChildRows(dimension, members, relationships);
  return toCsv(table.headers, table.rows);
}

export function exportSharedMembersCsv(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): string {
  const rows = findSharedMembers(members, relationships).map((row) => ({
    dimensionType: dimension.dimensionType,
    dimensionName: dimension.dimensionName,
    memberKey: row.memberKey,
    parentCount: row.parentCount,
    parents: row.parents.join(" | ")
  }));
  return toCsv(["dimensionType", "dimensionName", "memberKey", "parentCount", "parents"], rows);
}

export function exportOrphanMembersCsv(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): string {
  const rows = findOrphanMembers(members, relationships, dimension);
  return toCsv(["dimensionType", "dimensionName", "memberKey", "description"], rows);
}

interface HierarchyGraph {
  relationships: DimensionRelationshipRecord[];
  childrenByParent: Map<string, DimensionRelationshipRecord[]>;
  parentsByChild: Map<string, Set<string>>;
  memberByKey: Map<string, DimensionMemberRecord>;
  sortedParentKeys: string[];
}

function buildGraph(relationships: DimensionRelationshipRecord[], members: DimensionMemberRecord[] = []): HierarchyGraph {
  const childrenByParent = new Map<string, DimensionRelationshipRecord[]>();
  const parentsByChild = new Map<string, Set<string>>();

  for (const relationship of relationships) {
    if (!relationship.parentKey || !relationship.childKey) continue;
    if (!childrenByParent.has(relationship.parentKey)) childrenByParent.set(relationship.parentKey, []);
    childrenByParent.get(relationship.parentKey)?.push(relationship);
    if (!parentsByChild.has(relationship.childKey)) parentsByChild.set(relationship.childKey, new Set());
    parentsByChild.get(relationship.childKey)?.add(relationship.parentKey);
  }

  for (const rows of childrenByParent.values()) rows.sort(compareRelationships);

  return {
    relationships: relationships.filter((relationship) => relationship.parentKey || relationship.childKey),
    childrenByParent,
    parentsByChild,
    memberByKey: new Map(members.map((member) => [member.memberKey, member])),
    sortedParentKeys: [...childrenByParent.keys()].sort(compareKeys)
  };
}

function findTraversalRoots(graph: HierarchyGraph): string[] {
  return graph.sortedParentKeys.filter((parentKey) => !graph.parentsByChild.has(parentKey));
}

function traverseHierarchy(
  dimension: DimensionRecord,
  currentKey: string,
  graph: HierarchyGraph,
  trail: string[],
  rows: HierarchyPathRow[],
  incomingRelationship: DimensionRelationshipRecord | undefined
): void {
  const children = graph.childrenByParent.get(currentKey) ?? [];
  if (children.length === 0) {
    rows.push(toPathRow(dimension, trail, currentKey, graph, incomingRelationship, []));
    return;
  }

  for (const relationship of children) {
    const nextTrail = [...trail, relationship.childKey];
    if (trail.includes(relationship.childKey)) {
      rows.push(toPathRow(dimension, nextTrail, relationship.childKey, graph, relationship, ["CYCLE_DETECTED"]));
      continue;
    }
    traverseHierarchy(dimension, relationship.childKey, graph, nextTrail, rows, relationship);
  }
}

function toPathRow(
  dimension: DimensionRecord,
  levels: string[],
  memberKey: string,
  graph: HierarchyGraph,
  incomingRelationship: DimensionRelationshipRecord | undefined,
  warnings: string[]
): HierarchyPathRow {
  return {
    dimensionType: dimension.dimensionType,
    dimensionName: dimension.dimensionName,
    path: levels.join(" / "),
    levels,
    memberKey,
    description: getMemberDescription(graph.memberByKey.get(memberKey)),
    isLeaf: (graph.childrenByParent.get(memberKey) ?? []).length === 0,
    parentCount: graph.parentsByChild.get(memberKey)?.size ?? 0,
    aggregationWeight: incomingRelationship?.aggregationWeight ?? null,
    warnings
  };
}

function collectReachable(key: string, graph: HierarchyGraph, reachable: Set<string>, ancestry: Set<string>): void {
  if (ancestry.has(key)) return;
  reachable.add(key);
  const nextAncestry = new Set(ancestry);
  nextAncestry.add(key);
  for (const relationship of graph.childrenByParent.get(key) ?? []) {
    collectReachable(relationship.childKey, graph, reachable, nextAncestry);
  }
}

function getMemberDescription(member: DimensionMemberRecord | undefined): string {
  if (!member) return "";
  return normalizeCellValue(member.description || member.properties.Description);
}

function compareRelationships(left: DimensionRelationshipRecord, right: DimensionRelationshipRecord): number {
  return (
    left.rowOrder - right.rowOrder ||
    compareKeys(left.parentKey, right.parentKey) ||
    compareKeys(left.childKey, right.childKey) ||
    compareKeys(left.id, right.id)
  );
}

function compareKeys(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function toCsv<T extends object>(headers: string[], rows: T[]): string {
  if (headers.length === 0) return "";
  return [
    headers.map(quoteCsv).join(","),
    ...rows.map((row) => {
      const record = row as Record<string, unknown>;
      return headers.map((header) => quoteCsv(normalizeCellValue(record[header]))).join(",");
    })
  ].join("\n");
}

function quoteCsv(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
