import { getDimensionSchema } from "./dimensionSchemas";
import {
  getPropertyDefinitionByName,
  normalizePropertyName,
  type OneStreamPropertyTargetLevel
} from "./oneStreamPropertyDictionary";
import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  ProjectMetadataState
} from "./types";

export type BulkUpdateTarget = "member" | "relationship";
export type BulkUpdateOperation =
  | "set"
  | "clear"
  | "replaceText"
  | "append"
  | "prepend"
  | "copyFromProperty"
  | "deriveFromParent"
  | "regexReplace";
export type BulkUpdateJobStatus = "previewed" | "applied" | "failed" | "rolledBack";
export type BulkUpdateItemStatus = "applied" | "skipped" | "failed" | "rolledBack";
export type BulkUpdatePropertyFilterOperator = "equals" | "notEquals" | "contains" | "blank" | "notBlank" | "regex";

export interface BulkUpdatePropertyFilter {
  propertyName: string;
  operator: BulkUpdatePropertyFilterOperator;
  value?: string;
}

export interface BulkUpdateFilter {
  dimensionId?: string;
  propertyFilters?: BulkUpdatePropertyFilter[];
  memberKeyContains?: string;
  memberKeyStartsWith?: string;
  memberKeyRegex?: string;
  parentKeyContains?: string;
  parentKeyStartsWith?: string;
  parentKeyRegex?: string;
  childKeyContains?: string;
  childKeyStartsWith?: string;
  childKeyRegex?: string;
  activeOnly?: boolean;
}

export interface BulkUpdateRequest {
  targetType: BulkUpdateTarget;
  operation: BulkUpdateOperation;
  propertyName: string;
  value?: string;
  sourcePropertyName?: string;
  searchText?: string;
  replaceText?: string;
  regexPattern?: string;
  regexFlags?: string;
  filter?: BulkUpdateFilter;
}

export interface BulkUpdatePreviewItem {
  targetType: BulkUpdateTarget;
  targetId: string;
  targetKey: string;
  dimensionId: string;
  propertyName: string;
  oldValue: string;
  newValue: string;
  warnings: string[];
}

export interface BulkUpdatePreviewResult {
  targetType: BulkUpdateTarget;
  operation: BulkUpdateOperation;
  propertyName: string;
  affectedCount: number;
  skippedCount: number;
  previewItems: BulkUpdatePreviewItem[];
  warnings: string[];
}

export interface BulkUpdateJobRecord {
  id: string;
  projectId: string;
  targetType: BulkUpdateTarget;
  operation: BulkUpdateOperation;
  request: BulkUpdateRequest;
  summary: Record<string, unknown>;
  rollback: unknown;
  status: BulkUpdateJobStatus;
  createdBy: string;
  createdAt: string;
}

export interface BulkUpdateItemRecord {
  id: string;
  jobId: string;
  targetId: string;
  targetKey: string;
  propertyName: string;
  oldValue: string;
  newValue: string;
  status: BulkUpdateItemStatus;
  message: string;
}

export interface BulkUpdateJobDetail {
  job: BulkUpdateJobRecord;
  items: BulkUpdateItemRecord[];
}

type BulkTargetRecord = DimensionMemberRecord | DimensionRelationshipRecord;

export function previewBulkUpdate(
  projectState: ProjectMetadataState,
  request: BulkUpdateRequest
): BulkUpdatePreviewResult {
  const targetType = parseBulkUpdateTarget(request.targetType);
  const operation = parseBulkUpdateOperation(request.operation);
  const warnings: string[] = [];
  const filter = request.filter ?? {};
  const dimension = resolveDimension(projectState.dimensions, filter.dimensionId);
  const targetLevel: OneStreamPropertyTargetLevel = targetType === "member" ? "member" : "relationship";
  const propertyName = dimension
    ? normalizePropertyName(dimension.dimensionType, targetLevel, String(request.propertyName ?? "").trim())
    : String(request.propertyName ?? "").trim();

  if (!dimension) {
    return emptyPreview(targetType, operation, propertyName, ["No matching dimension was found for the bulk update filter."]);
  }
  if (!propertyName) {
    return emptyPreview(targetType, operation, propertyName, ["Property name is required."]);
  }

  const targets = getTargets(projectState, targetType, dimension.id);
  const previewItems: BulkUpdatePreviewItem[] = [];
  let skippedCount = 0;

  for (const target of targets) {
    if (!matchesTargetFilter(target, targetType, dimension, filter)) {
      skippedCount += 1;
      continue;
    }

    const oldValue = getTargetPropertyValue(target, targetType, dimension, propertyName);
    const computed = computeNewValue(projectState, target, targetType, dimension, oldValue, request);
    if (computed.warning) {
      warnings.push(`${targetKey(target, targetType)}: ${computed.warning}`);
      skippedCount += 1;
      continue;
    }

    const newValue = computed.value;
    if (newValue === oldValue) {
      skippedCount += 1;
      continue;
    }

    previewItems.push({
      targetType,
      targetId: target.id,
      targetKey: targetKey(target, targetType),
      dimensionId: dimension.id,
      propertyName,
      oldValue,
      newValue,
      warnings: validatePreviewValue(dimension, targetLevel, propertyName, newValue)
    });
  }

  return {
    targetType,
    operation,
    propertyName,
    affectedCount: previewItems.length,
    skippedCount,
    previewItems,
    warnings
  };
}

export function getTargetPropertyValue(
  target: BulkTargetRecord,
  targetType: BulkUpdateTarget,
  dimension: DimensionRecord,
  propertyName: string
): string {
  if (targetType === "member") {
    const member = target as DimensionMemberRecord;
    const schema = getDimensionSchema(dimension.dimensionType);
    if (propertyName === schema.memberKeyField || propertyName === "Name" || propertyName === "Member Key") {
      return stringifyValue(member.memberKey);
    }
    if (propertyName === "Description") return stringifyValue(member.description || member.properties.Description);
    return stringifyValue(member.properties[propertyName]);
  }

  const relationship = target as DimensionRelationshipRecord;
  if (propertyName === "Parent") return stringifyValue(relationship.parentKey);
  if (propertyName === "Child") return stringifyValue(relationship.childKey);
  if (propertyName === "Aggregation Weight") return stringifyValue(relationship.properties[propertyName] ?? relationship.aggregationWeight);
  if (propertyName === "Percent Consol") return stringifyValue(relationship.properties[propertyName] ?? relationship.percentConsol);
  if (propertyName === "Percent Ownership") return stringifyValue(relationship.properties[propertyName] ?? relationship.percentOwnership);
  if (propertyName === "Ownership Type") return stringifyValue(relationship.properties[propertyName] ?? relationship.ownershipType);
  return stringifyValue(relationship.properties[propertyName]);
}

function computeNewValue(
  projectState: ProjectMetadataState,
  target: BulkTargetRecord,
  targetType: BulkUpdateTarget,
  dimension: DimensionRecord,
  oldValue: string,
  request: BulkUpdateRequest
): { value: string; warning?: string } {
  switch (parseBulkUpdateOperation(request.operation)) {
    case "set":
      return { value: stringifyValue(request.value) };
    case "clear":
      return { value: "" };
    case "replaceText": {
      const searchText = stringifyValue(request.searchText);
      if (!searchText) return { value: oldValue, warning: "Search text is required for replaceText." };
      return { value: oldValue.split(searchText).join(stringifyValue(request.replaceText)) };
    }
    case "append":
      return { value: `${oldValue}${stringifyValue(request.value)}` };
    case "prepend":
      return { value: `${stringifyValue(request.value)}${oldValue}` };
    case "copyFromProperty": {
      const sourcePropertyName = stringifyValue(request.sourcePropertyName).trim();
      if (!sourcePropertyName) return { value: oldValue, warning: "Source property is required for copyFromProperty." };
      const targetLevel: OneStreamPropertyTargetLevel = targetType === "member" ? "member" : "relationship";
      const normalizedSource = normalizePropertyName(dimension.dimensionType, targetLevel, sourcePropertyName);
      return { value: getTargetPropertyValue(target, targetType, dimension, normalizedSource) };
    }
    case "deriveFromParent": {
      if (targetType === "relationship") return { value: stringifyValue((target as DimensionRelationshipRecord).parentKey) };
      const parent = projectState.relationships
        .filter((relationship) => relationship.dimensionId === dimension.id)
        .find((relationship) => relationship.childKey === (target as DimensionMemberRecord).memberKey);
      if (!parent) return { value: oldValue, warning: "No parent relationship was found for deriveFromParent." };
      return { value: parent.parentKey };
    }
    case "regexReplace": {
      const pattern = stringifyValue(request.regexPattern);
      if (!pattern) return { value: oldValue, warning: "Regex pattern is required for regexReplace." };
      try {
        const flags = sanitizeRegexFlags(stringifyValue(request.regexFlags));
        return { value: oldValue.replace(new RegExp(pattern, flags), stringifyValue(request.replaceText)) };
      } catch {
        return { value: oldValue, warning: "Regex pattern is invalid." };
      }
    }
  }
}

function validatePreviewValue(
  dimension: DimensionRecord,
  targetLevel: OneStreamPropertyTargetLevel,
  propertyName: string,
  value: string
): string[] {
  if (!value) return [];
  const definition = getPropertyDefinitionByName(dimension.dimensionType, targetLevel, propertyName);
  if (!definition) return [`${propertyName} is not in the OneStream property dictionary.`];

  if ((definition.valueType === "number" || definition.valueType === "decimal") && !Number.isFinite(Number(value))) {
    return [`${definition.displayName} expects a numeric value.`];
  }
  if (definition.valueType === "boolean" && !isBooleanText(value)) {
    return [`${definition.displayName} expects True or False.`];
  }
  if (definition.valueType === "enum" && definition.enumValues?.length) {
    const normalized = value.trim().toLowerCase();
    if (!definition.enumValues.some((candidate) => candidate.toLowerCase() === normalized)) {
      return [`${definition.displayName} expects one of: ${definition.enumValues.join(", ")}.`];
    }
  }
  return [];
}

function matchesTargetFilter(
  target: BulkTargetRecord,
  targetType: BulkUpdateTarget,
  dimension: DimensionRecord,
  filter: BulkUpdateFilter
): boolean {
  if (targetType === "member") {
    const member = target as DimensionMemberRecord;
    if ((filter.activeOnly ?? true) && !member.isActive) return false;
    if (!matchesStringFilter(member.memberKey, filter.memberKeyContains, filter.memberKeyStartsWith, filter.memberKeyRegex)) return false;
  } else {
    const relationship = target as DimensionRelationshipRecord;
    if (!matchesStringFilter(relationship.parentKey, filter.parentKeyContains, filter.parentKeyStartsWith, filter.parentKeyRegex)) return false;
    if (!matchesStringFilter(relationship.childKey, filter.childKeyContains, filter.childKeyStartsWith, filter.childKeyRegex)) return false;
  }

  for (const propertyFilter of filter.propertyFilters ?? []) {
    const targetLevel: OneStreamPropertyTargetLevel = targetType === "member" ? "member" : "relationship";
    const propertyName = normalizePropertyName(dimension.dimensionType, targetLevel, propertyFilter.propertyName);
    const value = getTargetPropertyValue(target, targetType, dimension, propertyName);
    if (!matchesPropertyFilter(value, propertyFilter)) return false;
  }

  return true;
}

function matchesStringFilter(value: string, contains?: string, startsWith?: string, regex?: string): boolean {
  const normalizedValue = value.toLowerCase();
  if (contains && !normalizedValue.includes(contains.toLowerCase())) return false;
  if (startsWith && !normalizedValue.startsWith(startsWith.toLowerCase())) return false;
  if (regex) {
    try {
      if (!new RegExp(regex).test(value)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function matchesPropertyFilter(value: string, filter: BulkUpdatePropertyFilter): boolean {
  const expected = stringifyValue(filter.value);
  switch (filter.operator) {
    case "equals":
      return value === expected;
    case "notEquals":
      return value !== expected;
    case "contains":
      return value.toLowerCase().includes(expected.toLowerCase());
    case "blank":
      return value.trim() === "";
    case "notBlank":
      return value.trim() !== "";
    case "regex":
      try {
        return new RegExp(expected).test(value);
      } catch {
        return false;
      }
  }
}

function resolveDimension(dimensions: DimensionRecord[], dimensionId?: string): DimensionRecord | undefined {
  if (dimensionId) return dimensions.find((dimension) => dimension.id === dimensionId);
  return dimensions[0];
}

function getTargets(projectState: ProjectMetadataState, targetType: BulkUpdateTarget, dimensionId: string): BulkTargetRecord[] {
  if (targetType === "member") return projectState.members.filter((member) => member.dimensionId === dimensionId);
  return projectState.relationships.filter((relationship) => relationship.dimensionId === dimensionId);
}

function targetKey(target: BulkTargetRecord, targetType: BulkUpdateTarget): string {
  if (targetType === "member") return (target as DimensionMemberRecord).memberKey || target.id;
  const relationship = target as DimensionRelationshipRecord;
  return `${relationship.parentKey || "(blank)"} -> ${relationship.childKey || "(blank)"}`;
}

function parseBulkUpdateTarget(value: unknown): BulkUpdateTarget {
  return value === "relationship" ? "relationship" : "member";
}

function parseBulkUpdateOperation(value: unknown): BulkUpdateOperation {
  const supported: BulkUpdateOperation[] = ["set", "clear", "replaceText", "append", "prepend", "copyFromProperty", "deriveFromParent", "regexReplace"];
  return supported.includes(value as BulkUpdateOperation) ? value as BulkUpdateOperation : "set";
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function sanitizeRegexFlags(flags: string): string {
  return Array.from(new Set(flags.split("").filter((flag) => "dgimsuvy".includes(flag)))).join("");
}

function isBooleanText(value: string): boolean {
  return ["true", "false", "yes", "no", "1", "0"].includes(value.trim().toLowerCase());
}

function emptyPreview(
  targetType: BulkUpdateTarget,
  operation: BulkUpdateOperation,
  propertyName: string,
  warnings: string[]
): BulkUpdatePreviewResult {
  return {
    targetType,
    operation,
    propertyName,
    affectedCount: 0,
    skippedCount: 0,
    previewItems: [],
    warnings
  };
}
