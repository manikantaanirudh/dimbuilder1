import { getDimensionSchema } from "./dimensionSchemas";
import { normalizePropertyLookupName } from "./oneStreamPropertyDictionary";
import { normalizeCellValue } from "./text";
import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  DimensionType,
  MetadataDiffChangeType,
  MetadataDiffItemRecord,
  MetadataDiffSummary,
  MetadataDiffTargetType,
  ProjectMetadataState,
  Severity,
  UnknownXmlData,
  UnknownXmlElementData
} from "./types";
import { UNKNOWN_XML_DATA_KEY } from "./xmlImport";

export interface ComparableDimensionState {
  key: string;
  dimensionType: DimensionType;
  dimensionName: string;
  dimension: DimensionRecord;
}

export interface ComparableMemberState {
  key: string;
  dimensionKey: string;
  dimensionType: DimensionType;
  dimensionName: string;
  objectKey: string;
  member: DimensionMemberRecord;
  properties: Record<string, string>;
}

export interface ComparableRelationshipState {
  key: string;
  dimensionKey: string;
  dimensionType: DimensionType;
  dimensionName: string;
  objectKey: string;
  parentKey: string;
  childKey: string;
  relationship: DimensionRelationshipRecord;
  properties: Record<string, string>;
}

export interface ComparableProjectState {
  dimensions: ComparableDimensionState[];
  members: ComparableMemberState[];
  relationships: ComparableRelationshipState[];
}

export interface MetadataDiffOptions {
  includeUnchanged?: boolean;
}

export type MetadataDiffItem = Omit<MetadataDiffItemRecord, "id" | "diffRunId">;

export interface MetadataDiffResult {
  items: MetadataDiffItem[];
  summary: MetadataDiffSummary;
}

export function createComparableProjectState(projectState: ProjectMetadataState | ComparableProjectState | unknown): ComparableProjectState {
  if (isComparableProjectState(projectState)) {
    return {
      dimensions: [...projectState.dimensions].sort(compareComparableDimensions),
      members: [...projectState.members].sort(compareComparableMembers),
      relationships: [...projectState.relationships].sort(compareComparableRelationships)
    };
  }

  if (!isProjectMetadataState(projectState)) {
    return { dimensions: [], members: [], relationships: [] };
  }

  const dimensions = [...projectState.dimensions]
    .map((dimension) => ({
      key: dimensionKey(dimension.dimensionType, dimension.dimensionName),
      dimensionType: dimension.dimensionType,
      dimensionName: dimension.dimensionName,
      dimension
    }))
    .sort(compareComparableDimensions);
  const dimensionById = new Map(dimensions.map((dimension) => [dimension.dimension.id, dimension]));

  const members = projectState.members
    .filter((member) => member.isActive !== false)
    .map((member) => {
      const dimension = dimensionById.get(member.dimensionId);
      if (!dimension) return null;
      return {
        key: memberKey(dimension.key, member.memberKey),
        dimensionKey: dimension.key,
        dimensionType: dimension.dimensionType,
        dimensionName: dimension.dimensionName,
        objectKey: member.memberKey,
        member,
        properties: extractMemberProperties(dimension.dimensionType, member)
      };
    })
    .filter((member): member is ComparableMemberState => Boolean(member))
    .sort(compareComparableMembers);

  const relationships = projectState.relationships
    .map((relationship) => {
      const dimension = dimensionById.get(relationship.dimensionId);
      if (!dimension) return null;
      return {
        key: relationshipKey(dimension.key, relationship.parentKey, relationship.childKey),
        dimensionKey: dimension.key,
        dimensionType: dimension.dimensionType,
        dimensionName: dimension.dimensionName,
        objectKey: relationshipObjectKey(relationship.parentKey, relationship.childKey),
        parentKey: relationship.parentKey,
        childKey: relationship.childKey,
        relationship,
        properties: extractRelationshipProperties(relationship)
      };
    })
    .filter((relationship): relationship is ComparableRelationshipState => Boolean(relationship))
    .sort(compareComparableRelationships);

  return { dimensions, members, relationships };
}

export function diffProjectMetadata(
  baselineState: ProjectMetadataState | ComparableProjectState | unknown,
  targetState: ProjectMetadataState | ComparableProjectState | unknown,
  _options: MetadataDiffOptions = {}
): MetadataDiffResult {
  const baseline = createComparableProjectState(baselineState);
  const target = createComparableProjectState(targetState);
  const items = [
    ...diffMembers(baseline, target),
    ...diffRelationships(baseline, target),
    ...diffProperties(baseline, target)
  ].sort(compareDiffItems);

  return {
    items,
    summary: summarizeDiff(items)
  };
}

export function diffMembers(baseline: ComparableProjectState, target: ComparableProjectState): MetadataDiffItem[] {
  const items: MetadataDiffItem[] = [];
  const baselineMembers = new Map(baseline.members.map((member) => [member.key, member]));
  const targetMembers = new Map(target.members.map((member) => [member.key, member]));

  for (const member of target.members) {
    if (baselineMembers.has(member.key)) continue;
    items.push(createItem({
      dimensionType: member.dimensionType,
      dimensionName: member.dimensionName,
      targetType: "member",
      changeType: "add",
      severity: "info",
      objectKey: member.objectKey,
      newValue: member.objectKey,
      details: { memberKey: member.member.memberKey }
    }));
  }

  for (const member of baseline.members) {
    const current = targetMembers.get(member.key);
    if (!current) {
      items.push(createItem({
        dimensionType: member.dimensionType,
        dimensionName: member.dimensionName,
        targetType: "member",
        changeType: "delete",
        severity: "warning",
        objectKey: member.objectKey,
        oldValue: member.objectKey,
        details: { risk: "delete member" }
      }));
      continue;
    }

    const oldDescription = normalizeCellValue(member.member.description);
    const newDescription = normalizeCellValue(current.member.description);
    if (oldDescription !== newDescription) {
      items.push(createItem({
        dimensionType: member.dimensionType,
        dimensionName: member.dimensionName,
        targetType: "member",
        changeType: "update",
        severity: "info",
        objectKey: member.objectKey,
        propertyName: "Description",
        oldValue: oldDescription,
        newValue: newDescription,
        details: { field: "description" }
      }));
    }
  }

  return items;
}

export function diffRelationships(baseline: ComparableProjectState, target: ComparableProjectState): MetadataDiffItem[] {
  const items: MetadataDiffItem[] = [];
  const baselineRelationships = new Map(baseline.relationships.map((relationship) => [relationship.key, relationship]));
  const targetRelationships = new Map(target.relationships.map((relationship) => [relationship.key, relationship]));
  const added = target.relationships.filter((relationship) => !baselineRelationships.has(relationship.key));
  const removed = baseline.relationships.filter((relationship) => !targetRelationships.has(relationship.key));
  const usedAdded = new Set<string>();
  const usedRemoved = new Set<string>();
  const baselineParentsByChild = groupParentsByDimensionChild(baseline.relationships);
  const targetParentsByChild = groupParentsByDimensionChild(target.relationships);

  for (const relationship of added) {
    const childKey = dimensionChildKey(relationship.dimensionKey, relationship.childKey);
    const baselineParents = baselineParentsByChild.get(childKey) ?? new Set<string>();
    const targetParents = targetParentsByChild.get(childKey) ?? new Set<string>();
    const removedForChild = removed
      .filter((candidate) => candidate.dimensionKey === relationship.dimensionKey && candidate.childKey === relationship.childKey && !usedRemoved.has(candidate.key))
      .sort(compareComparableRelationships);
    const retainedParentCount = [...baselineParents].filter((parent) => targetParents.has(parent)).length;

    if (removedForChild.length > 0 && retainedParentCount === 0) {
      const oldRelationship = removedForChild[0];
      usedAdded.add(relationship.key);
      usedRemoved.add(oldRelationship.key);
      items.push(createItem({
        dimensionType: relationship.dimensionType,
        dimensionName: relationship.dimensionName,
        targetType: "relationship",
        changeType: "move",
        severity: "warning",
        objectKey: relationship.objectKey,
        parentKey: relationship.parentKey,
        childKey: relationship.childKey,
        oldValue: oldRelationship.parentKey,
        newValue: relationship.parentKey,
        details: { oldParentKey: oldRelationship.parentKey, newParentKey: relationship.parentKey, risk: "move branch" }
      }));
      continue;
    }

    if (retainedParentCount > 0) {
      usedAdded.add(relationship.key);
      items.push(createItem({
        dimensionType: relationship.dimensionType,
        dimensionName: relationship.dimensionName,
        targetType: "relationship",
        changeType: "copy",
        severity: "info",
        objectKey: relationship.objectKey,
        parentKey: relationship.parentKey,
        childKey: relationship.childKey,
        newValue: relationship.objectKey,
        details: { retainedParents: [...baselineParents].filter((parent) => targetParents.has(parent)).sort() }
      }));
    }
  }

  for (const relationship of added) {
    if (usedAdded.has(relationship.key)) continue;
    items.push(createItem({
      dimensionType: relationship.dimensionType,
      dimensionName: relationship.dimensionName,
      targetType: "relationship",
      changeType: "add",
      severity: "info",
      objectKey: relationship.objectKey,
      parentKey: relationship.parentKey,
      childKey: relationship.childKey,
      newValue: relationship.objectKey
    }));
  }

  for (const relationship of removed) {
    if (usedRemoved.has(relationship.key)) continue;
    items.push(createItem({
      dimensionType: relationship.dimensionType,
      dimensionName: relationship.dimensionName,
      targetType: "relationship",
      changeType: "delete",
      severity: "warning",
      objectKey: relationship.objectKey,
      parentKey: relationship.parentKey,
      childKey: relationship.childKey,
      oldValue: relationship.objectKey,
      details: { risk: "relationship delete" }
    }));
  }

  return items;
}

export function diffProperties(baseline: ComparableProjectState, target: ComparableProjectState): MetadataDiffItem[] {
  return [
    ...diffTargetProperties(
      new Map(baseline.members.map((member) => [member.key, member])),
      new Map(target.members.map((member) => [member.key, member])),
      "member"
    ),
    ...diffTargetProperties(
      new Map(baseline.relationships.map((relationship) => [relationship.key, relationship])),
      new Map(target.relationships.map((relationship) => [relationship.key, relationship])),
      "relationship"
    )
  ];
}

export function summarizeDiff(items: MetadataDiffItem[]): MetadataDiffSummary {
  const bySeverity = emptySeverityCounts();
  const byChangeType = emptyChangeTypeCounts();
  const summary: MetadataDiffSummary = {
    totalItems: items.length,
    bySeverity,
    byChangeType,
    members: { adds: 0, updates: 0, deletes: 0 },
    relationships: { adds: 0, deletes: 0, moves: 0, copies: 0 },
    properties: { updates: 0 },
    warnings: 0,
    errors: 0
  };

  for (const item of items) {
    bySeverity[item.severity] += 1;
    byChangeType[item.changeType] += 1;
    if (item.targetType === "member") {
      if (item.changeType === "add") summary.members.adds += 1;
      if (item.changeType === "update") summary.members.updates += 1;
      if (item.changeType === "delete") summary.members.deletes += 1;
    }
    if (item.targetType === "relationship") {
      if (item.changeType === "add") summary.relationships.adds += 1;
      if (item.changeType === "delete") summary.relationships.deletes += 1;
      if (item.changeType === "move") summary.relationships.moves += 1;
      if (item.changeType === "copy") summary.relationships.copies += 1;
    }
    if (item.targetType === "property" && item.changeType === "update") summary.properties.updates += 1;
  }

  summary.warnings = bySeverity.warning;
  summary.errors = bySeverity.error;
  return summary;
}

function diffTargetProperties<T extends ComparableMemberState | ComparableRelationshipState>(
  baseline: Map<string, T>,
  target: Map<string, T>,
  sourceTargetType: "member" | "relationship"
): MetadataDiffItem[] {
  const items: MetadataDiffItem[] = [];
  for (const [key, oldRecord] of baseline.entries()) {
    const newRecord = target.get(key);
    if (!newRecord) continue;
    const propertyNames = new Set([...Object.keys(oldRecord.properties), ...Object.keys(newRecord.properties)]);
    for (const propertyName of [...propertyNames].sort((left, right) => left.localeCompare(right))) {
      const oldValue = normalizeCellValue(oldRecord.properties[propertyName]);
      const newValue = normalizeCellValue(newRecord.properties[propertyName]);
      if (oldValue === newValue) continue;
      const severity = resolvePropertyChangeSeverity(newRecord.dimensionType, sourceTargetType, propertyName);
      items.push(createItem({
        dimensionType: newRecord.dimensionType,
        dimensionName: newRecord.dimensionName,
        targetType: "property",
        changeType: "update",
        severity,
        objectKey: newRecord.objectKey,
        parentKey: sourceTargetType === "relationship" ? (newRecord as ComparableRelationshipState).parentKey : "",
        childKey: sourceTargetType === "relationship" ? (newRecord as ComparableRelationshipState).childKey : "",
        propertyName,
        oldValue,
        newValue,
        details: {
          sourceTargetType,
          risk: severity === "warning" ? "high-risk property change" : undefined
        }
      }));
    }
  }
  return items;
}

function extractMemberProperties(dimensionType: DimensionType, member: DimensionMemberRecord): Record<string, string> {
  const schema = getDimensionSchema(dimensionType);
  const excluded = new Set([UNKNOWN_XML_DATA_KEY, schema.memberKeyField, "Name", "Member", "Member Key", "Description"].map(normalizePropertyLookupName));
  const properties = extractRecordProperties(member.properties, excluded);
  addUnknownXmlProperties(properties, member.properties);
  return properties;
}

function extractRelationshipProperties(relationship: DimensionRelationshipRecord): Record<string, string> {
  const excluded = new Set([UNKNOWN_XML_DATA_KEY, "Parent", "Child"].map(normalizePropertyLookupName));
  const properties = extractRecordProperties(relationship.properties, excluded);
  setIfPresent(properties, "Aggregation Weight", relationship.aggregationWeight);
  setIfPresent(properties, "Percent Consol", relationship.percentConsol);
  setIfPresent(properties, "Percent Ownership", relationship.percentOwnership);
  setIfPresent(properties, "Ownership Type", relationship.ownershipType);
  addUnknownXmlProperties(properties, relationship.properties);
  return properties;
}

function extractRecordProperties(source: Record<string, unknown>, excluded: Set<string>): Record<string, string> {
  const properties: Record<string, string> = {};
  for (const [name, value] of Object.entries(source).sort(([left], [right]) => left.localeCompare(right))) {
    if (excluded.has(normalizePropertyLookupName(name))) continue;
    const normalized = normalizeCellValue(value);
    if (!normalized) continue;
    properties[name] = normalized;
  }
  return properties;
}

function addUnknownXmlProperties(properties: Record<string, string>, source: Record<string, unknown>): void {
  const unknownXml = getUnknownXmlData(source);
  if (!unknownXml) return;
  const represented = new Set(Object.keys(properties).map(normalizePropertyLookupName));
  for (const element of unknownXml.unknownElements.filter(isPreservedPropertyElement).sort(compareUnknownElements)) {
    const propertyName = element.attributes.name || (element.name === "property" ? "" : element.name);
    if (!propertyName || represented.has(normalizePropertyLookupName(propertyName))) continue;
    properties[propertyName] = normalizeCellValue(element.attributes.value ?? element.text ?? "");
    represented.add(normalizePropertyLookupName(propertyName));
  }
}

function setIfPresent(properties: Record<string, string>, name: string, value: unknown): void {
  const normalized = normalizeCellValue(value);
  if (normalized) properties[name] = normalized;
}

function getUnknownXmlData(source: Record<string, unknown>): UnknownXmlData | null {
  const value = source[UNKNOWN_XML_DATA_KEY];
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<UnknownXmlData>;
  return {
    unknownAttributes: isRecord(candidate.unknownAttributes) ? normalizeStringRecord(candidate.unknownAttributes) : {},
    unknownElements: Array.isArray(candidate.unknownElements) ? candidate.unknownElements.filter(isUnknownElementData) : [],
    originalXmlPath: typeof candidate.originalXmlPath === "string" ? candidate.originalXmlPath : undefined,
    sourcePath: typeof candidate.sourcePath === "string" ? candidate.sourcePath : undefined,
    sourceOrder: typeof candidate.sourceOrder === "number" ? candidate.sourceOrder : 0
  };
}

function resolvePropertyChangeSeverity(
  dimensionType: DimensionType,
  targetType: "member" | "relationship",
  propertyName: string
): Severity {
  const normalized = normalizePropertyLookupName(propertyName);
  if (dimensionType === "Account" && targetType === "member" && normalized === "accounttype") return "warning";
  if (
    dimensionType === "Entity"
    && targetType === "relationship"
    && ["percentconsol", "percentconsolidation", "percentownership", "ownershiptype"].includes(normalized)
  ) return "warning";
  return "info";
}

function groupParentsByDimensionChild(relationships: ComparableRelationshipState[]): Map<string, Set<string>> {
  const grouped = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    const key = dimensionChildKey(relationship.dimensionKey, relationship.childKey);
    const parents = grouped.get(key) ?? new Set<string>();
    parents.add(relationship.parentKey);
    grouped.set(key, parents);
  }
  return grouped;
}

function createItem(input: Partial<MetadataDiffItem> & {
  dimensionType: DimensionType;
  dimensionName: string;
  targetType: MetadataDiffTargetType;
  changeType: MetadataDiffChangeType;
  severity: Severity;
  objectKey: string;
}): MetadataDiffItem {
  return {
    dimensionType: input.dimensionType,
    dimensionName: input.dimensionName,
    targetType: input.targetType,
    changeType: input.changeType,
    severity: input.severity,
    objectKey: input.objectKey,
    parentKey: input.parentKey ?? "",
    childKey: input.childKey ?? "",
    propertyName: input.propertyName ?? "",
    oldValue: input.oldValue ?? "",
    newValue: input.newValue ?? "",
    details: Object.fromEntries(Object.entries(input.details ?? {}).filter(([, value]) => value !== undefined))
  };
}

function emptySeverityCounts(): Record<Severity, number> {
  return { error: 0, warning: 0, info: 0, off: 0 };
}

function emptyChangeTypeCounts(): Record<MetadataDiffChangeType, number> {
  return { add: 0, update: 0, delete: 0, move: 0, copy: 0, unchanged: 0, warning: 0 };
}

function dimensionKey(dimensionType: DimensionType, dimensionName: string): string {
  return `${dimensionType}\u0000${normalizeLookup(dimensionName)}`;
}

function memberKey(dimensionLookupKey: string, key: string): string {
  return `${dimensionLookupKey}\u0000member\u0000${normalizeLookup(key)}`;
}

function relationshipKey(dimensionLookupKey: string, parentKey: string, childKey: string): string {
  return `${dimensionLookupKey}\u0000relationship\u0000${normalizeLookup(parentKey)}\u0000${normalizeLookup(childKey)}`;
}

function dimensionChildKey(dimensionLookupKey: string, childKey: string): string {
  return `${dimensionLookupKey}\u0000child\u0000${normalizeLookup(childKey)}`;
}

function relationshipObjectKey(parentKey: string, childKey: string): string {
  return `${parentKey} -> ${childKey}`;
}

function normalizeLookup(value: string): string {
  return normalizeCellValue(value).toLowerCase();
}

function compareComparableDimensions(left: ComparableDimensionState, right: ComparableDimensionState): number {
  return left.dimension.sortOrder - right.dimension.sortOrder
    || left.dimensionType.localeCompare(right.dimensionType)
    || left.dimensionName.localeCompare(right.dimensionName)
    || left.key.localeCompare(right.key);
}

function compareComparableMembers(left: ComparableMemberState, right: ComparableMemberState): number {
  return left.dimensionName.localeCompare(right.dimensionName)
    || left.objectKey.localeCompare(right.objectKey)
    || left.key.localeCompare(right.key);
}

function compareComparableRelationships(left: ComparableRelationshipState, right: ComparableRelationshipState): number {
  return left.dimensionName.localeCompare(right.dimensionName)
    || left.parentKey.localeCompare(right.parentKey)
    || left.childKey.localeCompare(right.childKey)
    || left.key.localeCompare(right.key);
}

function compareDiffItems(left: MetadataDiffItem, right: MetadataDiffItem): number {
  return left.dimensionName.localeCompare(right.dimensionName)
    || targetTypeRank(left.targetType) - targetTypeRank(right.targetType)
    || changeTypeRank(left.changeType) - changeTypeRank(right.changeType)
    || left.objectKey.localeCompare(right.objectKey)
    || left.propertyName.localeCompare(right.propertyName)
    || left.parentKey.localeCompare(right.parentKey)
    || left.childKey.localeCompare(right.childKey);
}

function targetTypeRank(targetType: MetadataDiffTargetType): number {
  return { dimension: 0, member: 1, relationship: 2, property: 3 }[targetType];
}

function changeTypeRank(changeType: MetadataDiffChangeType): number {
  return { add: 0, copy: 1, delete: 2, move: 3, update: 4, warning: 5, unchanged: 6 }[changeType];
}

function isProjectMetadataState(value: unknown): value is ProjectMetadataState {
  if (!isRecord(value)) return false;
  return Array.isArray(value.dimensions) && Array.isArray(value.members) && Array.isArray(value.relationships);
}

function isComparableProjectState(value: unknown): value is ComparableProjectState {
  if (!isProjectMetadataState(value)) return false;
  const firstDimension = value.dimensions[0] as Partial<ComparableDimensionState> | undefined;
  return !firstDimension || typeof firstDimension.key === "string";
}

function isPreservedPropertyElement(element: UnknownXmlElementData): boolean {
  return element.name === "property" || Boolean(element.originalXmlPath?.endsWith("/properties/property"));
}

function compareUnknownElements(left: UnknownXmlElementData, right: UnknownXmlElementData): number {
  return left.sourceOrder - right.sourceOrder || left.name.localeCompare(right.name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeStringRecord(record: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([name, value]) => [name, normalizeCellValue(value)]));
}

function isUnknownElementData(value: unknown): value is UnknownXmlElementData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<UnknownXmlElementData>;
  return typeof candidate.name === "string"
    && isRecord(candidate.attributes)
    && typeof candidate.sourceOrder === "number";
}
