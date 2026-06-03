import { parseCsvDocument } from "./csvParse";
import { getDimensionSchema } from "./dimensionSchemas";
import { normalizePropertyName } from "./oneStreamPropertyDictionary";
import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  DimensionType
} from "./types";

const MEMBER_ALIASES = ["member", "memberkey", "member_key", "child", "childkey", "child_key", "name", "key"];
const PARENT_ALIASES = ["parent", "parentkey", "parent_key", "parentmember"];
const DIMENSION_TYPE_ALIASES = ["dimensiontype", "dimension_type", "type"];
const DIMENSION_NAME_ALIASES = ["dimensionname", "dimension_name"];
const DESCRIPTION_ALIASES = ["description", "desc"];
const ALIAS_ALIASES = ["alias"];
const SORT_ORDER_ALIASES = ["sortorder", "sort_order", "roworder", "row_order"];

export interface MetadataCsvFormDefaults {
  dimensionType?: string;
  dimensionName?: string;
  projectName?: string;
}

export interface MetadataCsvImportContext {
  csvContent: string;
  delimiter?: string;
  formDefaults: MetadataCsvFormDefaults;
  enabledDimensionTypes: DimensionType[];
  mode: "newProject" | "existingProject";
  projectId?: string;
  existingDimensions?: DimensionRecord[];
  existingMembers?: DimensionMemberRecord[];
  existingRelationships?: DimensionRelationshipRecord[];
}

export interface MetadataCsvPreviewCounts {
  rowCount: number;
  dimensionsToCreate: number;
  membersToCreate: number;
  membersToUpdate: number;
  relationshipsToCreate: number;
  relationshipsSkipped: number;
}

export interface MetadataCsvPreview {
  ok: boolean;
  errors: string[];
  warnings: string[];
  counts: MetadataCsvPreviewCounts;
  suggestedProjectName?: string;
}

export interface MetadataCsvCommitPlan {
  mode: "newProject" | "existingProject";
  projectId?: string;
  projectName: string;
  sourceFileName: string;
  dimensions: MetadataCsvCommitDimension[];
  membersToCreate: MetadataCsvCommitMember[];
  membersToUpdate: MetadataCsvCommitMemberUpdate[];
  relationshipsToCreate: MetadataCsvCommitRelationship[];
}

export interface MetadataCsvCommitDimension {
  key: string;
  dimensionType: DimensionType;
  dimensionName: string;
  description: string;
  existingDimensionId?: string;
}

export interface MetadataCsvCommitMember {
  dimensionKey: string;
  memberKey: string;
  description: string;
  properties: Record<string, unknown>;
  rowOrder: number;
  sourceRowNumber: number;
}

export interface MetadataCsvCommitMemberUpdate {
  memberId: string;
  memberKey: string;
  properties: Record<string, unknown>;
}

export interface MetadataCsvCommitRelationship {
  dimensionKey: string;
  parentKey: string;
  childKey: string;
  rowOrder: number;
  sourceRowNumber: number;
}

interface NormalizedCsvRow {
  sourceRowNumber: number;
  dimensionType: DimensionType;
  dimensionName: string;
  parentKey: string;
  memberKey: string;
  description: string;
  alias: string;
  sortOrder: number | null;
  extraProperties: Record<string, string>;
}

function dimensionKey(dimensionType: DimensionType, dimensionName: string): string {
  return `${dimensionType}\u0000${dimensionName.trim().toLowerCase()}`;
}

function resolveColumn(headers: string[], preferred: string | undefined, aliases: string[], fallbacks: string[] = []): string | undefined {
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

function parsePropertyColumns(headers: string[]): Map<string, string> {
  const columns = new Map<string, string>();
  for (const header of headers) {
    const match = /^property\.(.+)$/i.exec(header.trim());
    if (match?.[1]) {
      columns.set(header, match[1].trim());
    }
  }
  return columns;
}

function normalizeDimensionType(value: string, enabledTypes: DimensionType[]): DimensionType | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = enabledTypes.find((type) => type.toLowerCase() === trimmed.toLowerCase());
  return match ?? null;
}

function buildMemberProperties(
  dimensionType: DimensionType,
  row: NormalizedCsvRow
): Record<string, unknown> {
  const schema = getDimensionSchema(dimensionType);
  const properties: Record<string, unknown> = {
    [schema.memberKeyField]: row.memberKey
  };
  if (row.description) {
    properties.Description = row.description;
  }
  if (row.alias) {
    properties.Alias = row.alias;
  }
  for (const [rawName, rawValue] of Object.entries(row.extraProperties)) {
    if (!rawValue.trim()) continue;
    const propertyName = normalizePropertyName(dimensionType, "member", rawName);
    properties[propertyName] = rawValue.trim();
  }
  return properties;
}

function parseRows(input: MetadataCsvImportContext): {
  errors: string[];
  warnings: string[];
  rows: NormalizedCsvRow[];
  relationshipRows: NormalizedCsvRow[];
  parsedRowCount: number;
  suggestedProjectName?: string;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseCsvDocument(input.csvContent, input.delimiter ?? ",");
  if (parsed.headers.length === 0) {
    errors.push("CSV file has no header row.");
    return { errors, warnings, rows: [], relationshipRows: [], parsedRowCount: 0 };
  }
  if (parsed.rows.length === 0) {
    errors.push("CSV file has no data rows.");
    return { errors, warnings, rows: [], relationshipRows: [], parsedRowCount: 0 };
  }

  const memberColumn = resolveColumn(parsed.headers, undefined, MEMBER_ALIASES, ["Member"]);
  if (!memberColumn) {
    errors.push("CSV must include a member column (for example: member).");
    return { errors, warnings, rows: [], relationshipRows: [], parsedRowCount: 0, suggestedProjectName: input.formDefaults.projectName };
  }

  const parentColumn = resolveColumn(parsed.headers, undefined, PARENT_ALIASES, ["Parent"]);
  const dimensionTypeColumn = resolveColumn(parsed.headers, undefined, DIMENSION_TYPE_ALIASES);
  const dimensionNameColumn = resolveColumn(parsed.headers, undefined, DIMENSION_NAME_ALIASES);
  const descriptionColumn = resolveColumn(parsed.headers, undefined, DESCRIPTION_ALIASES, ["Description"]);
  const aliasColumn = resolveColumn(parsed.headers, undefined, ALIAS_ALIASES);
  const sortOrderColumn = resolveColumn(parsed.headers, undefined, SORT_ORDER_ALIASES);
  const propertyColumns = parsePropertyColumns(parsed.headers);

  const normalizedRows: NormalizedCsvRow[] = [];

  for (let index = 0; index < parsed.rows.length; index += 1) {
    const row = parsed.rows[index];
    const sourceRowNumber = index + 2;
    const memberKey = row[memberColumn]?.trim() ?? "";
    if (!memberKey) {
      errors.push(`Row ${sourceRowNumber}: member is required.`);
      continue;
    }

    const parentKey = parentColumn ? row[parentColumn]?.trim() ?? "" : "";
    if (parentKey && parentKey.toLowerCase() === memberKey.toLowerCase()) {
      errors.push(`Row ${sourceRowNumber}: parent cannot equal member (${memberKey}).`);
      continue;
    }

    const dimensionTypeText = (dimensionTypeColumn ? row[dimensionTypeColumn]?.trim() : "") || input.formDefaults.dimensionType?.trim() || "";
    const dimensionNameText = (dimensionNameColumn ? row[dimensionNameColumn]?.trim() : "") || input.formDefaults.dimensionName?.trim() || "";
    if (!dimensionTypeText || !dimensionNameText) {
      errors.push(`Row ${sourceRowNumber}: dimension type and dimension name are required (provide CSV columns or form defaults).`);
      continue;
    }

    const dimensionType = normalizeDimensionType(dimensionTypeText, input.enabledDimensionTypes);
    if (!dimensionType) {
      errors.push(`Row ${sourceRowNumber}: unsupported dimension type '${dimensionTypeText}'.`);
      continue;
    }

    const description = descriptionColumn ? row[descriptionColumn]?.trim() ?? "" : "";
    const alias = aliasColumn ? row[aliasColumn]?.trim() ?? "" : "";
    let sortOrder: number | null = null;
    if (sortOrderColumn) {
      const rawSort = row[sortOrderColumn]?.trim() ?? "";
      if (rawSort) {
        const parsedSort = Number(rawSort);
        if (!Number.isFinite(parsedSort)) {
          warnings.push(`Row ${sourceRowNumber}: sortOrder '${rawSort}' is not numeric; ignored.`);
        } else {
          sortOrder = parsedSort;
        }
      }
    }

    const extraProperties: Record<string, string> = {};
    for (const [header, propertyName] of propertyColumns.entries()) {
      const value = row[header]?.trim() ?? "";
      if (value) {
        extraProperties[propertyName] = value;
      }
    }

    normalizedRows.push({
      sourceRowNumber,
      dimensionType,
      dimensionName: dimensionNameText,
      parentKey,
      memberKey,
      description,
      alias,
      sortOrder,
      extraProperties
    });
  }

  const collapsedMembers = new Map<string, NormalizedCsvRow>();
  for (const row of normalizedRows) {
    const memberDedupeKey = `${dimensionKey(row.dimensionType, row.dimensionName)}\u0000${row.memberKey.toLowerCase()}`;
    if (collapsedMembers.has(memberDedupeKey)) {
      warnings.push(`Row ${row.sourceRowNumber}: duplicate member '${row.memberKey}' collapsed (later row kept).`);
    }
    collapsedMembers.set(memberDedupeKey, row);
  }

  const collapsedRelationships = new Map<string, NormalizedCsvRow>();
  for (const row of normalizedRows) {
    if (!row.parentKey) continue;
    const relationshipDedupeKey = `${dimensionKey(row.dimensionType, row.dimensionName)}\u0000${row.parentKey.toLowerCase()}\u0000${row.memberKey.toLowerCase()}`;
    if (collapsedRelationships.has(relationshipDedupeKey)) {
      warnings.push(`Row ${row.sourceRowNumber}: duplicate relationship ${row.parentKey} -> ${row.memberKey} collapsed.`);
    }
    collapsedRelationships.set(relationshipDedupeKey, row);
  }

  return {
    errors,
    warnings,
    rows: [...collapsedMembers.values()],
    relationshipRows: [...collapsedRelationships.values()],
    parsedRowCount: parsed.rows.length,
    suggestedProjectName: input.formDefaults.projectName
  };
}

export function previewMetadataCsvImport(input: MetadataCsvImportContext): MetadataCsvPreview {
  const parsed = parseRows(input);
  if (parsed.errors.length > 0) {
    return {
      ok: false,
      errors: parsed.errors,
      warnings: parsed.warnings,
      counts: emptyCounts(parsed.parsedRowCount),
      suggestedProjectName: parsed.suggestedProjectName
    };
  }

  const plan = buildCommitPlan(input, parsed.rows, parsed.relationshipRows, parsed.warnings, parsed.parsedRowCount);
  return {
    ok: true,
    errors: [],
    warnings: plan.warnings,
    counts: plan.counts,
    suggestedProjectName: parsed.suggestedProjectName
  };
}

export function buildMetadataCsvCommitPlan(input: MetadataCsvImportContext, sourceFileName: string): {
  preview: MetadataCsvPreview;
  plan: MetadataCsvCommitPlan | null;
} {
  const parsed = parseRows(input);
  const preview: MetadataCsvPreview = parsed.errors.length > 0
    ? {
        ok: false,
        errors: parsed.errors,
        warnings: parsed.warnings,
        counts: emptyCounts(0),
        suggestedProjectName: parsed.suggestedProjectName
      }
    : previewMetadataCsvImport(input);

  if (!preview.ok) {
    return { preview, plan: null };
  }

  const built = buildCommitPlan(input, parsed.rows, parsed.relationshipRows, parsed.warnings, parsed.parsedRowCount);
  const plan: MetadataCsvCommitPlan = {
    mode: input.mode,
    projectId: input.projectId,
    projectName: input.formDefaults.projectName?.trim() || sourceFileName.replace(/\.csv$/i, "") || "Imported CSV Project",
    sourceFileName,
    dimensions: built.dimensions,
    membersToCreate: built.membersToCreate,
    membersToUpdate: built.membersToUpdate,
    relationshipsToCreate: built.relationshipsToCreate
  };

  return {
    preview: {
      ok: true,
      errors: [],
      warnings: built.warnings,
      counts: built.counts,
      suggestedProjectName: parsed.suggestedProjectName
    },
    plan
  };
}

function emptyCounts(rowCount: number): MetadataCsvPreviewCounts {
  return {
    rowCount,
    dimensionsToCreate: 0,
    membersToCreate: 0,
    membersToUpdate: 0,
    relationshipsToCreate: 0,
    relationshipsSkipped: 0
  };
}

function buildCommitPlan(
  input: MetadataCsvImportContext,
  memberRows: NormalizedCsvRow[],
  relationshipRows: NormalizedCsvRow[],
  warnings: string[],
  parsedRowCount: number
): {
  warnings: string[];
  counts: MetadataCsvPreviewCounts;
  dimensions: MetadataCsvCommitDimension[];
  membersToCreate: MetadataCsvCommitMember[];
  membersToUpdate: MetadataCsvCommitMemberUpdate[];
  relationshipsToCreate: MetadataCsvCommitRelationship[];
} {
  const existingDimensions = input.existingDimensions ?? [];
  const existingMembers = input.existingMembers ?? [];
  const existingRelationships = input.existingRelationships ?? [];

  const dimensionByKey = new Map(
    existingDimensions.map((dimension) => [dimensionKey(dimension.dimensionType, dimension.dimensionName), dimension])
  );
  const membersByDimensionAndKey = new Map<string, DimensionMemberRecord>();
  for (const member of existingMembers) {
    membersByDimensionAndKey.set(`${member.dimensionId}\u0000${member.memberKey.toLowerCase()}`, member);
  }
  const relationshipsByDimensionAndKey = new Map<string, DimensionRelationshipRecord>();
  for (const relationship of existingRelationships) {
    relationshipsByDimensionAndKey.set(
      `${relationship.dimensionId}\u0000${relationship.parentKey.toLowerCase()}\u0000${relationship.childKey.toLowerCase()}`,
      relationship
    );
  }

  const dimensionPlans = new Map<string, MetadataCsvCommitDimension>();
  const membersToCreate: MetadataCsvCommitMember[] = [];
  const membersToUpdate: MetadataCsvCommitMemberUpdate[] = [];
  const relationshipsToCreate: MetadataCsvCommitRelationship[] = [];
  let relationshipsSkipped = 0;

  let rowOrderCounter = new Map<string, number>();

  for (const row of memberRows) {
    const key = dimensionKey(row.dimensionType, row.dimensionName);
    if (!dimensionPlans.has(key)) {
      const existing = dimensionByKey.get(key);
      dimensionPlans.set(key, {
        key,
        dimensionType: row.dimensionType,
        dimensionName: row.dimensionName,
        description: existing?.description ?? `${row.dimensionName} metadata`,
        existingDimensionId: existing?.id
      });
    }

    const properties = buildMemberProperties(row.dimensionType, row);
    const nextRowOrder = (rowOrderCounter.get(key) ?? 0) + 1;
    rowOrderCounter.set(key, row.sortOrder ?? nextRowOrder);
    const rowOrder = row.sortOrder ?? nextRowOrder;

    if (input.mode === "existingProject") {
      const existingDimension = dimensionByKey.get(key);
      const existingMember = existingDimension
        ? membersByDimensionAndKey.get(`${existingDimension.id}\u0000${row.memberKey.toLowerCase()}`)
        : undefined;
      if (existingMember) {
        const merged = mergeMemberUpdate(existingMember, row, properties);
        if (merged) {
          membersToUpdate.push(merged);
        }
        continue;
      }
    }

    membersToCreate.push({
      dimensionKey: key,
      memberKey: row.memberKey,
      description: row.description,
      properties,
      rowOrder,
      sourceRowNumber: row.sourceRowNumber
    });
  }

  for (const row of relationshipRows) {
    const key = dimensionKey(row.dimensionType, row.dimensionName);
    if (input.mode === "existingProject") {
      const existingDimension = dimensionByKey.get(key);
      if (existingDimension) {
        const relationshipKey = `${existingDimension.id}\u0000${row.parentKey.toLowerCase()}\u0000${row.memberKey.toLowerCase()}`;
        if (relationshipsByDimensionAndKey.has(relationshipKey)) {
          relationshipsSkipped += 1;
          continue;
        }
      }
    }

    const nextRowOrder = (rowOrderCounter.get(`${key}:rel`) ?? 0) + 1;
    rowOrderCounter.set(`${key}:rel`, nextRowOrder);
    relationshipsToCreate.push({
      dimensionKey: key,
      parentKey: row.parentKey,
      childKey: row.memberKey,
      rowOrder: row.sortOrder ?? nextRowOrder,
      sourceRowNumber: row.sourceRowNumber
    });
  }

  const dimensions = [...dimensionPlans.values()];
  const dimensionsToCreate = dimensions.filter((dimension) => !dimension.existingDimensionId).length;

  return {
    warnings,
    counts: {
      rowCount: parsedRowCount,
      dimensionsToCreate,
      membersToCreate: membersToCreate.length,
      membersToUpdate: membersToUpdate.length,
      relationshipsToCreate: relationshipsToCreate.length,
      relationshipsSkipped
    },
    dimensions,
    membersToCreate,
    membersToUpdate,
    relationshipsToCreate
  };
}

function mergeMemberUpdate(
  existing: DimensionMemberRecord,
  row: NormalizedCsvRow,
  parsedProperties: Record<string, unknown>
): MetadataCsvCommitMemberUpdate | null {
  const properties = { ...existing.properties };
  let changed = false;

  if (row.description && row.description !== existing.description) {
    properties.Description = row.description;
    changed = true;
  }
  if (row.alias) {
    properties.Alias = row.alias;
    changed = true;
  }
  for (const [name, value] of Object.entries(parsedProperties)) {
    if (name === getDimensionSchema(row.dimensionType).memberKeyField) continue;
    if (value === undefined || value === "") continue;
    if (properties[name] !== value) {
      properties[name] = value;
      changed = true;
    }
  }

  return changed
    ? { memberId: existing.id, memberKey: existing.memberKey, properties }
    : null;
}
