import { analyzeHierarchy } from "./hierarchy";
import {
  createComparableProjectState,
  diffProjectMetadata,
  type ComparableProjectState,
  type MetadataDiffItem
} from "./metadataDiff";
import { normalizeCellValue } from "./text";
import type {
  DimensionRecord,
  DimensionRelationshipRecord,
  ExportLoadMode,
  MetadataDiffItemRecord,
  ProjectMetadataState,
  RelationshipOperationType,
  Severity
} from "./types";

export interface RelationshipOperationPlanIssue {
  code: string;
  severity: Severity;
  message: string;
  dimensionType?: string;
  dimensionName?: string;
  objectKey?: string;
  parentKey?: string;
  childKey?: string;
}

export interface RelationshipOperationPlanItem {
  operation: RelationshipOperationType;
  dimensionType: string;
  dimensionName: string;
  dimensionId: string;
  relationshipId: string;
  objectKey: string;
  parentKey: string;
  childKey: string;
  oldParentKey?: string;
  newParentKey?: string;
  propertyName?: string;
  oldValue?: string;
  newValue?: string;
  severity: Severity;
  details: Record<string, unknown>;
}

export interface RelationshipOperationPlanSummary {
  total: number;
  adds: number;
  updates: number;
  deletes: number;
  moves: number;
  copies: number;
  breaks: number;
  rebuilds: number;
  unchanged: number;
  potentialOrphans: string[];
  warnings: number;
  errors: number;
}

export interface RelationshipOperationPlan {
  mode: ExportLoadMode;
  dimensionId: string;
  items: RelationshipOperationPlanItem[];
  summary: RelationshipOperationPlanSummary;
  warnings: RelationshipOperationPlanIssue[];
  errors: RelationshipOperationPlanIssue[];
}

export interface RelationshipPlanOptions {
  dimensionId?: string;
}

type DiffItemLike = MetadataDiffItem | MetadataDiffItemRecord;

const supportedOperations: RelationshipOperationType[] = ["add", "update", "delete", "move", "copy", "break", "rebuild", "unchanged"];
const supportedModes: ExportLoadMode[] = ["full", "additive", "propertyUpdate", "relationshipDelete", "moveCopy", "breakBuild"];

export function parseExportLoadMode(value: unknown): ExportLoadMode {
  return supportedModes.includes(value as ExportLoadMode) ? value as ExportLoadMode : "full";
}

export function isRelationshipOperation(value: unknown): value is RelationshipOperationType {
  return supportedOperations.includes(value as RelationshipOperationType);
}

export function inferRelationshipOperationsFromDiff(diffItems: DiffItemLike[]): RelationshipOperationPlanItem[] {
  return diffItems
    .map((item) => relationshipOperationFromDiffItem(item))
    .filter((item): item is RelationshipOperationPlanItem => Boolean(item));
}

export function planRelationshipLoadMode(
  projectState: ProjectMetadataState | ComparableProjectState,
  baselineState: ProjectMetadataState | ComparableProjectState | null | undefined,
  requestedMode: ExportLoadMode,
  options: RelationshipPlanOptions = {}
): RelationshipOperationPlan {
  const mode = parseExportLoadMode(requestedMode);
  const target = createComparableProjectState(projectState);
  const baseline = baselineState ? createComparableProjectState(baselineState) : null;
  const dimensionId = options.dimensionId ?? "";
  const issues: RelationshipOperationPlanIssue[] = [];

  if (!baseline && mode === "breakBuild") {
    issues.push({
      code: "BREAK_BUILD_HAS_NO_BASELINE",
      severity: "error",
      message: "Break/build relationship planning requires a baseline so existing relationships can be broken before rebuild."
    });
    return createPlan(mode, dimensionId, [], issues);
  }

  let items: RelationshipOperationPlanItem[] = [];
  if (mode === "full") {
    items = target.relationships.map((relationship) => relationshipPlanItemFromComparable(relationship, "unchanged", "info"));
  } else if (mode === "breakBuild" && baseline) {
    items = detectBreakBuildImpact(target, baseline, options);
  } else if (baseline) {
    const diffItems = diffProjectMetadata(baseline, target).items;
    const operations = inferRelationshipOperationsFromDiff(diffItems)
      .map((item) => hydratePlanItemIds(item, target, baseline))
      .filter((item) => matchesDimensionFilter(item, options.dimensionId));
    items = filterOperationsForMode(operations, mode);
  } else if (mode === "additive") {
    items = target.relationships
      .map((relationship) => relationshipPlanItemFromComparable(relationship, "add", "info", { source: "current-without-baseline" }))
      .filter((item) => matchesDimensionFilter(item, options.dimensionId));
  }

  items = items.map((item) => applyBlueprintPolicySeverity(item, target, baseline, issues));
  const deleteRelationships = items
    .filter((item) => item.operation === "delete")
    .map((item) => relationshipFromPlanItem(item));
  if (deleteRelationships.length > 0) {
    const targetRelationships = selectRelationshipsForDimension(target, options.dimensionId);
    const memberKeys = selectMemberKeysForDimension(target, options.dimensionId);
    const orphaned = findMembersThatBecomeOrphanedAfterRelationshipDeletes(memberKeys, targetRelationships, deleteRelationships);
    for (const memberKey of orphaned) {
      issues.push({
        code: "RELATIONSHIP_DELETE_CREATES_ORPHAN",
        severity: "warning",
        message: `Relationship delete may orphan member '${memberKey}'.`,
        childKey: memberKey
      });
    }
  }

  return createPlan(mode, dimensionId, items.sort(comparePlanItems), issues);
}

export function detectMovesAndCopies(
  baselineRelationships: DimensionRelationshipRecord[],
  targetRelationships: DimensionRelationshipRecord[],
  dimension: DimensionRecord
): RelationshipOperationPlanItem[] {
  const projectState = {
    dimensions: [dimension],
    members: [],
    relationships: targetRelationships
  };
  const baselineState = {
    dimensions: [dimension],
    members: [],
    relationships: baselineRelationships
  };
  return planRelationshipLoadMode(projectState, baselineState, "moveCopy", { dimensionId: dimension.id })
    .items
    .filter((item) => item.operation === "move" || item.operation === "copy");
}

export function detectBreakBuildImpact(
  target: ComparableProjectState,
  baseline: ComparableProjectState,
  options: RelationshipPlanOptions = {}
): RelationshipOperationPlanItem[] {
  const breaks = baseline.relationships
    .filter((relationship) => matchesDimensionId(relationship.relationship.dimensionId, options.dimensionId))
    .map((relationship) => relationshipPlanItemFromComparable(
      relationship,
      "break",
      "warning",
      { reason: "break existing relationship before rebuild" }
    ));
  const rebuilds = target.relationships
    .filter((relationship) => matchesDimensionId(relationship.relationship.dimensionId, options.dimensionId))
    .map((relationship) => relationshipPlanItemFromComparable(
      relationship,
      "rebuild",
      "info",
      { reason: "rebuild target relationship after break" }
    ));
  return [...breaks, ...rebuilds].sort(comparePlanItems);
}

export function summarizeRelationshipPlan(
  items: RelationshipOperationPlanItem[],
  issues: RelationshipOperationPlanIssue[] = [],
  potentialOrphans: string[] = []
): RelationshipOperationPlanSummary {
  const summary: RelationshipOperationPlanSummary = {
    total: items.length,
    adds: 0,
    updates: 0,
    deletes: 0,
    moves: 0,
    copies: 0,
    breaks: 0,
    rebuilds: 0,
    unchanged: 0,
    potentialOrphans: [...potentialOrphans].sort(),
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    errors: issues.filter((issue) => issue.severity === "error").length
  };

  for (const item of items) {
    if (item.operation === "add") summary.adds += 1;
    if (item.operation === "update") summary.updates += 1;
    if (item.operation === "delete") summary.deletes += 1;
    if (item.operation === "move") summary.moves += 1;
    if (item.operation === "copy") summary.copies += 1;
    if (item.operation === "break") summary.breaks += 1;
    if (item.operation === "rebuild") summary.rebuilds += 1;
    if (item.operation === "unchanged") summary.unchanged += 1;
    if (item.severity === "warning") summary.warnings += 1;
    if (item.severity === "error") summary.errors += 1;
  }

  return summary;
}

export function findMembersThatBecomeOrphanedAfterRelationshipDeletes(
  memberKeys: string[],
  relationships: DimensionRelationshipRecord[],
  relationshipsToDelete: Array<Pick<DimensionRelationshipRecord, "parentKey" | "childKey">>
): string[] {
  const deleteKeys = new Set(relationshipsToDelete.map((relationship) => relationshipKey(relationship.parentKey, relationship.childKey)));
  const before = analyzeHierarchy(relationships, memberKeys);
  const afterRelationships = relationships.filter((relationship) => !deleteKeys.has(relationshipKey(relationship.parentKey, relationship.childKey)));
  const after = analyzeHierarchy(afterRelationships, memberKeys);
  const alreadyOrphaned = new Set(before.orphanMemberKeys);
  return after.orphanMemberKeys
    .filter((memberKey) => !alreadyOrphaned.has(memberKey))
    .sort();
}

function relationshipOperationFromDiffItem(item: DiffItemLike): RelationshipOperationPlanItem | null {
  if (item.targetType === "relationship" && isRelationshipOperation(item.changeType)) {
    const operation = item.changeType as RelationshipOperationType;
    return {
      operation,
      dimensionType: item.dimensionType,
      dimensionName: item.dimensionName,
      dimensionId: "",
      relationshipId: "",
      objectKey: item.objectKey,
      parentKey: item.parentKey,
      childKey: item.childKey,
      oldParentKey: normalizeCellValue(item.details.oldParentKey ?? item.oldValue) || undefined,
      newParentKey: normalizeCellValue(item.details.newParentKey ?? item.newValue) || undefined,
      oldValue: item.oldValue,
      newValue: item.newValue,
      severity: item.severity,
      details: item.details
    };
  }

  if (item.targetType === "property" && item.changeType === "update" && item.details.sourceTargetType === "relationship") {
    return {
      operation: "update",
      dimensionType: item.dimensionType,
      dimensionName: item.dimensionName,
      dimensionId: "",
      relationshipId: "",
      objectKey: item.objectKey,
      parentKey: item.parentKey,
      childKey: item.childKey,
      propertyName: item.propertyName,
      oldValue: item.oldValue,
      newValue: item.newValue,
      severity: item.severity,
      details: item.details
    };
  }

  return null;
}

function filterOperationsForMode(items: RelationshipOperationPlanItem[], mode: ExportLoadMode): RelationshipOperationPlanItem[] {
  if (mode === "additive") return items.filter((item) => item.operation === "add" || item.operation === "copy" || item.operation === "update");
  if (mode === "propertyUpdate") return items.filter((item) => item.operation === "update");
  if (mode === "relationshipDelete") return items.filter((item) => item.operation === "delete");
  if (mode === "moveCopy") return items.filter((item) => item.operation === "add" || item.operation === "move" || item.operation === "copy");
  return items;
}

function hydratePlanItemIds(
  item: RelationshipOperationPlanItem,
  target: ComparableProjectState,
  baseline: ComparableProjectState
): RelationshipOperationPlanItem {
  const match = findComparableRelationship(target, item)
    ?? findComparableRelationship(baseline, item)
    ?? findComparableRelationshipByChild(target, item)
    ?? findComparableRelationshipByChild(baseline, item);
  const dimension = target.dimensions.find((candidate) => match && candidate.dimension.id === match.relationship.dimensionId)
    ?? baseline.dimensions.find((candidate) => match && candidate.dimension.id === match.relationship.dimensionId)
    ?? target.dimensions.find((candidate) =>
    candidate.dimensionType === item.dimensionType && candidate.dimensionName === item.dimensionName
  ) ?? baseline.dimensions.find((candidate) =>
    candidate.dimensionType === item.dimensionType && candidate.dimensionName === item.dimensionName
  );
  return {
    ...item,
    dimensionId: dimension?.dimension.id ?? item.dimensionId,
    relationshipId: match?.relationship.id ?? item.relationshipId
  };
}

function applyBlueprintPolicySeverity(
  item: RelationshipOperationPlanItem,
  target: ComparableProjectState,
  baseline: ComparableProjectState | null,
  issues: RelationshipOperationPlanIssue[]
): RelationshipOperationPlanItem {
  if (item.operation !== "copy") return item;
  const dimension = target.dimensions.find((candidate) => candidate.dimension.id === item.dimensionId)
    ?? baseline?.dimensions.find((candidate) => candidate.dimension.id === item.dimensionId);
  if (dimension?.dimension.metadata.allowMultipleParents !== false) return item;
  issues.push({
    code: "COPY_CONFLICTS_WITH_SINGLE_PARENT_POLICY",
    severity: "warning",
    message: `Copy operation for '${item.childKey}' conflicts with this dimension blueprint single-parent policy.`,
    dimensionType: item.dimensionType,
    dimensionName: item.dimensionName,
    objectKey: item.objectKey,
    parentKey: item.parentKey,
    childKey: item.childKey
  });
  return item;
}

function createPlan(
  mode: ExportLoadMode,
  dimensionId: string,
  items: RelationshipOperationPlanItem[],
  issues: RelationshipOperationPlanIssue[]
): RelationshipOperationPlan {
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const errors = issues.filter((issue) => issue.severity === "error");
  return {
    mode,
    dimensionId,
    items,
    summary: summarizeRelationshipPlan(items, issues, issues.filter((issue) => issue.code === "RELATIONSHIP_DELETE_CREATES_ORPHAN").map((issue) => issue.childKey ?? "").filter(Boolean)),
    warnings,
    errors
  };
}

function relationshipPlanItemFromComparable(
  comparable: ComparableProjectState["relationships"][number],
  operation: RelationshipOperationType,
  severity: Severity,
  details: Record<string, unknown> = {}
): RelationshipOperationPlanItem {
  return {
    operation,
    dimensionType: comparable.dimensionType,
    dimensionName: comparable.dimensionName,
    dimensionId: comparable.relationship.dimensionId,
    relationshipId: comparable.relationship.id,
    objectKey: comparable.objectKey,
    parentKey: comparable.parentKey,
    childKey: comparable.childKey,
    oldParentKey: operation === "break" || operation === "delete" ? comparable.parentKey : undefined,
    newParentKey: operation === "rebuild" || operation === "add" ? comparable.parentKey : undefined,
    severity,
    details
  };
}

function relationshipFromPlanItem(item: RelationshipOperationPlanItem): DimensionRelationshipRecord {
  return {
    id: item.relationshipId || item.objectKey,
    dimensionId: item.dimensionId,
    parentKey: item.parentKey,
    childKey: item.childKey,
    aggregationWeight: null,
    percentConsol: null,
    percentOwnership: null,
    ownershipType: "",
    properties: { Parent: item.parentKey, Child: item.childKey },
    rowOrder: 0,
    sourceRowNumber: 0,
    createdAt: "",
    updatedAt: ""
  };
}

function selectRelationshipsForDimension(state: ComparableProjectState, dimensionId?: string): DimensionRelationshipRecord[] {
  return state.relationships
    .filter((relationship) => matchesDimensionId(relationship.relationship.dimensionId, dimensionId))
    .map((relationship) => relationship.relationship);
}

function selectMemberKeysForDimension(state: ComparableProjectState, dimensionId?: string): string[] {
  return state.members
    .filter((member) => matchesDimensionId(member.member.dimensionId, dimensionId))
    .map((member) => member.member.memberKey);
}

function matchesDimensionFilter(item: RelationshipOperationPlanItem, dimensionId?: string): boolean {
  return matchesDimensionId(item.dimensionId, dimensionId);
}

function matchesDimensionId(candidate: string, dimensionId?: string): boolean {
  return !dimensionId || candidate === dimensionId;
}

function findComparableRelationship(state: ComparableProjectState, item: RelationshipOperationPlanItem) {
  return state.relationships.find((relationship) =>
    relationship.dimensionType === item.dimensionType
    && relationship.dimensionName === item.dimensionName
    && relationship.parentKey === item.parentKey
    && relationship.childKey === item.childKey
  );
}

function findComparableRelationshipByChild(state: ComparableProjectState, item: RelationshipOperationPlanItem) {
  return state.relationships.find((relationship) =>
    relationship.dimensionType === item.dimensionType
    && relationship.dimensionName === item.dimensionName
    && relationship.childKey === item.childKey
  );
}

function relationshipKey(parentKey: string, childKey: string): string {
  return `${parentKey}\u0000${childKey}`;
}

function comparePlanItems(left: RelationshipOperationPlanItem, right: RelationshipOperationPlanItem): number {
  return left.dimensionName.localeCompare(right.dimensionName)
    || operationRank(left.operation) - operationRank(right.operation)
    || left.parentKey.localeCompare(right.parentKey)
    || left.childKey.localeCompare(right.childKey)
    || (left.propertyName ?? "").localeCompare(right.propertyName ?? "")
    || left.objectKey.localeCompare(right.objectKey);
}

function operationRank(operation: RelationshipOperationType): number {
  return { add: 0, update: 1, delete: 2, move: 3, copy: 4, break: 5, rebuild: 6, unchanged: 7 }[operation];
}
