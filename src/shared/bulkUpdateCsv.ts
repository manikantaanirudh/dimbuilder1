import { parseCsvDocument } from "./csvParse";
import {
  getTargetPropertyValue,
  type BulkUpdatePreviewItem,
  type BulkUpdateTarget
} from "./bulkUpdate";
import { getDimensionSchema } from "./dimensionSchemas";
import { normalizePropertyName, type OneStreamPropertyTargetLevel } from "./oneStreamPropertyDictionary";
import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  ProjectMetadataState
} from "./types";

export interface BulkUpdateCsvMapping {
  targetType: BulkUpdateTarget;
  dimensionId: string;
  /** Member key column header (members). Auto-detected when omitted. */
  keyColumn?: string;
  /** Parent key column (relationships). Defaults to Parent. */
  parentColumn?: string;
  /** Child key column (relationships). Defaults to Child. */
  childColumn?: string;
  /** Property columns to apply. When omitted, all non-key columns are used. */
  propertyColumns?: string[];
  delimiter?: string;
  /** When true, empty cells clear the property. Default: skip blank cells. */
  treatBlankAsClear?: boolean;
}

export interface BulkUpdateCsvPreviewResult {
  mapping: BulkUpdateCsvMapping;
  rowCount: number;
  affectedCount: number;
  skippedCount: number;
  previewItems: BulkUpdatePreviewItem[];
  warnings: string[];
}

const MEMBER_KEY_ALIASES = ["member", "memberkey", "member_key", "name", "key", "account"];
const PARENT_KEY_ALIASES = ["parent", "parentkey", "parent_key", "parentmember"];
const CHILD_KEY_ALIASES = ["child", "childkey", "child_key", "childmember"];

export function previewBulkUpdateFromCsv(
  projectState: ProjectMetadataState,
  mapping: BulkUpdateCsvMapping,
  csvContent: string
): BulkUpdateCsvPreviewResult {
  const dimension = projectState.dimensions.find((candidate) => candidate.id === mapping.dimensionId);
  if (!dimension) {
    return emptyCsvPreview(mapping, [`Dimension ${mapping.dimensionId} was not found.`]);
  }

  const parsed = parseCsvDocument(csvContent, mapping.delimiter ?? ",");
  if (parsed.headers.length === 0) {
    return emptyCsvPreview(mapping, ["CSV file has no header row."]);
  }

  if (mapping.targetType === "member") {
    return previewMemberCsv(projectState, dimension, mapping, parsed);
  }
  return previewRelationshipCsv(projectState, dimension, mapping, parsed);
}

function previewMemberCsv(
  projectState: ProjectMetadataState,
  dimension: DimensionRecord,
  mapping: BulkUpdateCsvMapping,
  parsed: ReturnType<typeof parseCsvDocument>
): BulkUpdateCsvPreviewResult {
  const warnings: string[] = [];
  const keyColumn = resolveColumn(parsed.headers, mapping.keyColumn, MEMBER_KEY_ALIASES, [
    getDimensionSchema(dimension.dimensionType).memberKeyField
  ]);
  if (!keyColumn) {
    return emptyCsvPreview(mapping, [`Could not find a member key column. Headers: ${parsed.headers.join(", ")}`]);
  }

  const propertyColumns = resolvePropertyColumns(parsed.headers, mapping, [keyColumn]);
  if (propertyColumns.length === 0) {
    return emptyCsvPreview(mapping, ["No property columns found beside the key column."]);
  }

  const members = projectState.members.filter((member) => member.dimensionId === dimension.id);
  const memberByKey = new Map(members.map((member) => [member.memberKey.toLowerCase(), member]));
  const previewItems: BulkUpdatePreviewItem[] = [];
  let skippedCount = 0;

  for (let rowIndex = 0; rowIndex < parsed.rows.length; rowIndex += 1) {
    const row = parsed.rows[rowIndex];
    const memberKey = row[keyColumn]?.trim();
    if (!memberKey) {
      skippedCount += 1;
      warnings.push(`Row ${rowIndex + 2}: missing member key.`);
      continue;
    }

    const member = memberByKey.get(memberKey.toLowerCase());
    if (!member) {
      skippedCount += 1;
      warnings.push(`Row ${rowIndex + 2}: member '${memberKey}' was not found.`);
      continue;
    }

    skippedCount += appendPropertyUpdates({
      dimension,
      targetType: "member",
      target: member,
      rowIndex,
      row,
      propertyColumns,
      mapping,
      previewItems,
      warnings
    });
  }

  return buildCsvPreview(mapping, parsed.rows.length, previewItems, warnings, skippedCount);
}

function previewRelationshipCsv(
  projectState: ProjectMetadataState,
  dimension: DimensionRecord,
  mapping: BulkUpdateCsvMapping,
  parsed: ReturnType<typeof parseCsvDocument>
): BulkUpdateCsvPreviewResult {
  const warnings: string[] = [];
  const parentColumn = resolveColumn(parsed.headers, mapping.parentColumn, PARENT_KEY_ALIASES, ["Parent"]);
  const childColumn = resolveColumn(parsed.headers, mapping.childColumn, CHILD_KEY_ALIASES, ["Child"]);
  if (!parentColumn || !childColumn) {
    return emptyCsvPreview(mapping, ["Relationship CSV requires Parent and Child columns."]);
  }

  const propertyColumns = resolvePropertyColumns(parsed.headers, mapping, [parentColumn, childColumn]);
  if (propertyColumns.length === 0) {
    return emptyCsvPreview(mapping, ["No property columns found beside parent/child columns."]);
  }

  const relationships = projectState.relationships.filter((relationship) => relationship.dimensionId === dimension.id);
  const relationshipByKey = new Map(
    relationships.map((relationship) => [
      `${relationship.parentKey.toLowerCase()}\u0000${relationship.childKey.toLowerCase()}`,
      relationship
    ])
  );
  const previewItems: BulkUpdatePreviewItem[] = [];
  let skippedCount = 0;

  for (let rowIndex = 0; rowIndex < parsed.rows.length; rowIndex += 1) {
    const row = parsed.rows[rowIndex];
    const parentKey = row[parentColumn]?.trim();
    const childKey = row[childColumn]?.trim();
    if (!parentKey || !childKey) {
      skippedCount += 1;
      warnings.push(`Row ${rowIndex + 2}: parent and child are required.`);
      continue;
    }

    const relationship = relationshipByKey.get(`${parentKey.toLowerCase()}\u0000${childKey.toLowerCase()}`);
    if (!relationship) {
      skippedCount += 1;
      warnings.push(`Row ${rowIndex + 2}: relationship '${parentKey} -> ${childKey}' was not found.`);
      continue;
    }

    skippedCount += appendPropertyUpdates({
      dimension,
      targetType: "relationship",
      target: relationship,
      rowIndex,
      row,
      propertyColumns,
      mapping,
      previewItems,
      warnings
    });
  }

  return buildCsvPreview(mapping, parsed.rows.length, previewItems, warnings, skippedCount);
}

function appendPropertyUpdates(input: {
  dimension: DimensionRecord;
  targetType: BulkUpdateTarget;
  target: DimensionMemberRecord | DimensionRelationshipRecord;
  rowIndex: number;
  row: Record<string, string>;
  propertyColumns: string[];
  mapping: BulkUpdateCsvMapping;
  previewItems: BulkUpdatePreviewItem[];
  warnings: string[];
}): number {
  let skipped = 0;
  const targetLevel: OneStreamPropertyTargetLevel = input.targetType === "member" ? "member" : "relationship";

  for (const column of input.propertyColumns) {
    const rawValue = input.row[column];
    const hasValue = rawValue !== undefined && rawValue.trim() !== "";
    if (!hasValue && !input.mapping.treatBlankAsClear) {
      skipped += 1;
      continue;
    }

    const propertyName = normalizePropertyName(input.dimension.dimensionType, targetLevel, column);
    const oldValue = getTargetPropertyValue(input.target, input.targetType, input.dimension, propertyName);
    const newValue = hasValue ? rawValue.trim() : "";
    if (newValue === oldValue) {
      skipped += 1;
      continue;
    }

    input.previewItems.push({
      targetType: input.targetType,
      targetId: input.target.id,
      targetKey: targetDisplayKey(input.target, input.targetType),
      dimensionId: input.dimension.id,
      propertyName,
      oldValue,
      newValue,
      warnings: []
    });
  }

  return skipped;
}

function resolvePropertyColumns(headers: string[], mapping: BulkUpdateCsvMapping, reserved: string[]): string[] {
  if (mapping.propertyColumns?.length) {
    return mapping.propertyColumns.filter((column) => headers.includes(column));
  }
  const reservedLower = new Set(reserved.map((column) => column.toLowerCase()));
  return headers.filter((header) => !reservedLower.has(header.toLowerCase()));
}

function resolveColumn(headers: string[], preferred: string | undefined, aliases: string[], fallbacks: string[]): string | undefined {
  if (preferred && headers.includes(preferred)) return preferred;
  const lowerHeaders = new Map(headers.map((header) => [header.toLowerCase(), header]));
  for (const alias of aliases) {
    const match = lowerHeaders.get(alias.toLowerCase());
    if (match) return match;
  }
  for (const fallback of fallbacks) {
    const match = lowerHeaders.get(fallback.toLowerCase());
    if (match) return match;
  }
  return undefined;
}

function targetDisplayKey(
  target: DimensionMemberRecord | DimensionRelationshipRecord,
  targetType: BulkUpdateTarget
): string {
  if (targetType === "member") return (target as DimensionMemberRecord).memberKey;
  const relationship = target as DimensionRelationshipRecord;
  return `${relationship.parentKey} -> ${relationship.childKey}`;
}

function buildCsvPreview(
  mapping: BulkUpdateCsvMapping,
  rowCount: number,
  previewItems: BulkUpdatePreviewItem[],
  warnings: string[],
  skippedCount: number
): BulkUpdateCsvPreviewResult {
  return {
    mapping,
    rowCount,
    affectedCount: previewItems.length,
    skippedCount,
    previewItems,
    warnings
  };
}

function emptyCsvPreview(mapping: BulkUpdateCsvMapping, warnings: string[]): BulkUpdateCsvPreviewResult {
  return {
    mapping,
    rowCount: 0,
    affectedCount: 0,
    skippedCount: 0,
    previewItems: [],
    warnings
  };
}
