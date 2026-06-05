import { detectCsvDelimiter, parseCsvDocument } from "./csvParse";
import { getDimensionSchema } from "./dimensionSchemas";
import {
  type MetadataCsvColumnMapping,
  type MetadataCsvHierarchyMode,
  resolveMappedHeader
} from "./metadataCsvMapping";
import { isKnownProperty, normalizePropertyName } from "./oneStreamPropertyDictionary";
import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  DimensionType
} from "./types";

const MEMBER_ALIASES = [
  "member",
  "memberkey",
  "member_key",
  "child",
  "childkey",
  "child_key",
  "name",
  "key",
  "nk_glaccountcode",
  "glaccountcode",
  "accountcode",
  "account",
  "accountid"
];
const PARENT_ALIASES = ["parent", "parentkey", "parent_key", "parentmember"];
const DIMENSION_TYPE_ALIASES = ["dimensiontype", "dimension_type", "type"];
const DIMENSION_NAME_ALIASES = ["dimensionname", "dimension_name"];
const DESCRIPTION_ALIASES = ["description", "desc", "glaccountname", "accountname", "memberdescription", "membername"];
const ALIAS_ALIASES = ["alias"];
const SORT_ORDER_ALIASES = ["sortorder", "sort_order", "roworder", "row_order"];

export interface MetadataCsvFormDefaults {
  dimensionType?: string;
  dimensionName?: string;
  projectName?: string;
  /** Applied to Account leaf members when Account Type is not mapped/imported. */
  defaultAccountType?: string;
}

export interface MetadataCsvImportContext {
  csvContent: string;
  delimiter?: string;
  columnMapping?: MetadataCsvColumnMapping;
  formDefaults: MetadataCsvFormDefaults;
  enabledDimensionTypes: DimensionType[];
  mode: "newProject" | "existingProject";
  projectId?: string;
  existingDimensions?: DimensionRecord[];
  existingMembers?: DimensionMemberRecord[];
  existingRelationships?: DimensionRelationshipRecord[];
}

export type { MetadataCsvColumnMapping } from "./metadataCsvMapping";
export { inspectMetadataCsvFile, suggestMetadataCsvColumnMapping } from "./metadataCsvMapping";

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

const SKIP_PROPERTY_HEADERS = new Set(["", "row", "roworder", "row_order", "#", "lineno", "line", "line_no"]);

function isSkippableHeader(header: string): boolean {
  const normalized = header.trim().toLowerCase();
  return SKIP_PROPERTY_HEADERS.has(normalized);
}

function findHierarchyLevelColumns(headers: string[]): string[] {
  const bySuffix = new Map<string, Array<{ level: number; header: string }>>();
  for (const header of headers) {
    const match = /^L(\d+)_(.+)$/i.exec(header.trim());
    if (!match?.[1] || !match[2]) continue;
    const level = Number(match[1]);
    if (!Number.isFinite(level)) continue;
    const suffix = match[2];
    const group = bySuffix.get(suffix) ?? [];
    group.push({ level, header });
    bySuffix.set(suffix, group);
  }
  if (bySuffix.size === 0) return [];

  for (const header of headers) {
    const match = /^L(\d+)_(.+)$/i.exec(header.trim());
    if (!match?.[2]) continue;
    const group = bySuffix.get(match[2]);
    if (!group?.some((entry) => entry.level === 1)) continue;
    return [...group].sort((left, right) => left.level - right.level).map((entry) => entry.header);
  }

  const [firstGroup] = [...bySuffix.values()].sort((left, right) => left[0]!.level - right[0]!.level);
  return [...firstGroup].sort((left, right) => left.level - right.level).map((entry) => entry.header);
}

function isHierarchyHeader(header: string): boolean {
  return /^L\d+_/i.test(header.trim());
}

function collectLeafExtraProperties(
  row: Record<string, string>,
  headers: string[],
  reservedHeaders: Set<string>,
  dimensionType: DimensionType,
  skippedColumns: Set<string>
): Record<string, string> {
  const extraProperties: Record<string, string> = {};
  for (const header of headers) {
    if (reservedHeaders.has(header) || isSkippableHeader(header) || isHierarchyHeader(header)) continue;
    const value = row[header]?.trim() ?? "";
    if (!value) continue;
    const propertyName = normalizePropertyName(dimensionType, "member", header);
    if (!isKnownProperty(dimensionType, "member", propertyName)) {
      skippedColumns.add(header);
      continue;
    }
    extraProperties[propertyName] = value;
  }
  return extraProperties;
}

function expandHierarchyRows(
  row: Record<string, string>,
  sourceRowNumber: number,
  hierarchyHeaders: string[],
  memberKey: string,
  description: string,
  alias: string,
  sortOrder: number | null,
  dimensionType: DimensionType,
  dimensionName: string,
  leafExtraProperties: Record<string, string>
): NormalizedCsvRow[] {
  const path = hierarchyHeaders
    .map((header) => row[header]?.trim() ?? "")
    .filter((value) => value.length > 0);

  const expanded: NormalizedCsvRow[] = [];
  let parentKey = "";
  for (const levelMember of path) {
    expanded.push({
      sourceRowNumber,
      dimensionType,
      dimensionName,
      parentKey,
      memberKey: levelMember,
      description: levelMember,
      alias: "",
      sortOrder: null,
      extraProperties: {}
    });
    parentKey = levelMember;
  }

  expanded.push({
    sourceRowNumber,
    dimensionType,
    dimensionName,
    parentKey,
    memberKey,
    description,
    alias,
    sortOrder,
    extraProperties: leafExtraProperties
  });

  return expanded;
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

function resolveHierarchyMode(
  mapping: MetadataCsvColumnMapping | undefined,
  parentColumn: string | undefined
): MetadataCsvHierarchyMode | undefined {
  if (mapping?.hierarchyMode) return mapping.hierarchyMode;
  if ((mapping?.hierarchyColumns?.length ?? 0) > 0) return "levelColumns";
  if (mapping?.parent || parentColumn) return "parentColumn";
  if (mapping) return "none";
  return undefined;
}

function resolveHierarchyHeaders(
  headers: string[],
  mapping: MetadataCsvColumnMapping | undefined,
  parentColumn: string | undefined
): string[] {
  const hierarchyMode = resolveHierarchyMode(mapping, parentColumn);
  if (hierarchyMode === "none") return [];
  if (hierarchyMode === "levelColumns") {
    return (mapping?.hierarchyColumns ?? [])
      .map((column) => resolveMappedHeader(headers, column))
      .filter((column): column is string => Boolean(column));
  }
  if (hierarchyMode === "parentColumn" || parentColumn) return [];
  return parentColumn ? [] : findHierarchyLevelColumns(headers);
}

function buildRowProperties(
  row: Record<string, string>,
  headers: string[],
  propertyColumns: Map<string, string>,
  mapping: MetadataCsvColumnMapping | undefined,
  useExplicitPropertyMapping: boolean,
  dimensionType: DimensionType,
  skippedColumns: Set<string>,
  reserved: {
    memberColumn: string;
    parentColumn?: string;
    dimensionTypeColumn?: string;
    dimensionNameColumn?: string;
    descriptionColumn?: string;
    aliasColumn?: string;
    sortOrderColumn?: string;
    hierarchyHeaders: string[];
    mappedPropertyHeaders: Set<string>;
  }
): Record<string, string> {
  const extraProperties: Record<string, string> = {};

  for (const [header, propertyName] of propertyColumns.entries()) {
    const value = row[header]?.trim() ?? "";
    if (value) extraProperties[propertyName] = value;
  }

  for (const [propertyName, sourceHeader] of Object.entries(mapping?.properties ?? {})) {
    const header = resolveMappedHeader(headers, sourceHeader);
    if (!header) continue;
    const value = row[header]?.trim() ?? "";
    if (value) extraProperties[propertyName] = value;
  }

  if (!useExplicitPropertyMapping) {
    const reservedHeaders = new Set<string>([
      reserved.memberColumn,
      ...(reserved.parentColumn ? [reserved.parentColumn] : []),
      ...(reserved.dimensionTypeColumn ? [reserved.dimensionTypeColumn] : []),
      ...(reserved.dimensionNameColumn ? [reserved.dimensionNameColumn] : []),
      ...(reserved.descriptionColumn ? [reserved.descriptionColumn] : []),
      ...(reserved.aliasColumn ? [reserved.aliasColumn] : []),
      ...(reserved.sortOrderColumn ? [reserved.sortOrderColumn] : []),
      ...reserved.hierarchyHeaders,
      ...propertyColumns.keys(),
      ...reserved.mappedPropertyHeaders
    ]);
    Object.assign(extraProperties, collectLeafExtraProperties(row, headers, reservedHeaders, dimensionType, skippedColumns));
  }

  return extraProperties;
}

function normalizeDimensionType(value: string, enabledTypes: DimensionType[]): DimensionType | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = enabledTypes.find((type) => type.toLowerCase() === trimmed.toLowerCase());
  return match ?? null;
}

function buildMemberProperties(
  dimensionType: DimensionType,
  row: NormalizedCsvRow,
  formDefaults: MetadataCsvFormDefaults
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
  if (
    dimensionType === "Account"
    && formDefaults.defaultAccountType?.trim()
    && !normalizeCellValue(properties["Account Type"])
  ) {
    properties["Account Type"] = formDefaults.defaultAccountType.trim();
  }
  return properties;
}

function normalizeCellValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
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
  const delimiter = input.delimiter ?? detectCsvDelimiter(input.csvContent);
  const parsed = parseCsvDocument(input.csvContent, delimiter);
  if (parsed.headers.length === 0) {
    errors.push("CSV file has no header row.");
    return { errors, warnings, rows: [], relationshipRows: [], parsedRowCount: 0 };
  }
  if (parsed.rows.length === 0) {
    errors.push("CSV file has no data rows.");
    return { errors, warnings, rows: [], relationshipRows: [], parsedRowCount: 0 };
  }

  const mapping = input.columnMapping;
  const schemaForDefaults = getDimensionSchema(
    normalizeDimensionType(input.formDefaults.dimensionType ?? "", input.enabledDimensionTypes) ?? input.enabledDimensionTypes[0] ?? "Account"
  );

  const memberColumn = mapping?.member
    ? resolveMappedHeader(parsed.headers, mapping.member)
    : resolveColumn(parsed.headers, undefined, MEMBER_ALIASES, [schemaForDefaults.memberKeyField, "Member"]);
  if (!memberColumn) {
    errors.push(mapping?.member
      ? `Mapped member column '${mapping.member}' was not found in the file.`
      : "CSV must include a member column (map Member key or add a member column).");
    return { errors, warnings, rows: [], relationshipRows: [], parsedRowCount: 0, suggestedProjectName: input.formDefaults.projectName };
  }

  const parentColumn = mapping?.hierarchyMode === "parentColumn"
    ? resolveMappedHeader(parsed.headers, mapping.parent)
    : mapping?.hierarchyMode === "levelColumns"
      ? undefined
      : mapping?.parent
        ? resolveMappedHeader(parsed.headers, mapping.parent)
        : resolveColumn(parsed.headers, undefined, PARENT_ALIASES, ["Parent"]);

  const dimensionTypeColumn = mapping?.dimensionType
    ? resolveMappedHeader(parsed.headers, mapping.dimensionType)
    : resolveColumn(parsed.headers, undefined, DIMENSION_TYPE_ALIASES);
  const dimensionNameColumn = mapping?.dimensionName
    ? resolveMappedHeader(parsed.headers, mapping.dimensionName)
    : resolveColumn(parsed.headers, undefined, DIMENSION_NAME_ALIASES);
  const descriptionColumn = mapping?.description
    ? resolveMappedHeader(parsed.headers, mapping.description)
    : resolveColumn(parsed.headers, undefined, DESCRIPTION_ALIASES, ["Description"]);
  const aliasColumn = mapping?.alias
    ? resolveMappedHeader(parsed.headers, mapping.alias)
    : resolveColumn(parsed.headers, undefined, ALIAS_ALIASES);
  const sortOrderColumn = mapping?.sortOrder
    ? resolveMappedHeader(parsed.headers, mapping.sortOrder)
    : resolveColumn(parsed.headers, undefined, SORT_ORDER_ALIASES);

  const propertyColumns = parsePropertyColumns(parsed.headers);
  const mappedPropertyHeaders = new Set(Object.values(mapping?.properties ?? {}));
  const hierarchyHeaders = resolveHierarchyHeaders(parsed.headers, mapping, parentColumn);
  const useHierarchyExpansion = hierarchyHeaders.length > 0;
  const hierarchyMode = resolveHierarchyMode(mapping, parentColumn);
  if (hierarchyMode === "levelColumns" && (mapping?.hierarchyColumns?.length ?? 0) > 0) {
    const mappedCount = hierarchyHeaders.length;
    const requestedCount = mapping!.hierarchyColumns!.length;
    if (mappedCount < requestedCount) {
      warnings.push(
        `Only ${mappedCount} of ${requestedCount} hierarchy level column(s) matched headers in the file. Check stacked level mappings.`
      );
    }
    const uniqueHeaders = new Set(hierarchyHeaders);
    if (uniqueHeaders.size < hierarchyHeaders.length) {
      warnings.push(
        "The same file column is mapped to more than one hierarchy level. Map Level 1 (top) through the deepest level to distinct columns (for Opex exports, often L03 → L02 → L01)."
      );
    }
  }
  const useExplicitPropertyMapping = Boolean(mapping && Object.keys(mapping.properties ?? {}).length > 0);
  const skippedColumns = new Set<string>();

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
      warnings.push(`Row ${sourceRowNumber}: skipped because parent equals member (${memberKey}).`);
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

    const extraProperties = buildRowProperties(
      row,
      parsed.headers,
      propertyColumns,
      mapping,
      useExplicitPropertyMapping,
      dimensionType,
      skippedColumns,
      {
        memberColumn,
        parentColumn,
        dimensionTypeColumn,
        dimensionNameColumn,
        descriptionColumn,
        aliasColumn,
        sortOrderColumn,
        hierarchyHeaders,
        mappedPropertyHeaders
      }
    );

    if (useHierarchyExpansion) {
      const leafExtraProperties = extraProperties;
      normalizedRows.push(
        ...expandHierarchyRows(
          row,
          sourceRowNumber,
          hierarchyHeaders,
          memberKey,
          description || memberKey,
          alias,
          sortOrder,
          dimensionType,
          dimensionNameText,
          leafExtraProperties
        )
      );
      continue;
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
    const previous = collapsedMembers.get(memberDedupeKey);
    if (previous) {
      const differs =
        previous.parentKey !== row.parentKey
        || previous.description !== row.description
        || previous.alias !== row.alias
        || JSON.stringify(previous.extraProperties) !== JSON.stringify(row.extraProperties);
      if (differs) {
        warnings.push(`Row ${row.sourceRowNumber}: duplicate member '${row.memberKey}' collapsed (later row kept).`);
      }
    }
    collapsedMembers.set(memberDedupeKey, row);
  }

  const collapsedRelationships = new Map<string, NormalizedCsvRow>();
  for (const row of normalizedRows) {
    if (!row.parentKey) continue;
    const relationshipDedupeKey = `${dimensionKey(row.dimensionType, row.dimensionName)}\u0000${row.parentKey.toLowerCase()}\u0000${row.memberKey.toLowerCase()}`;
    if (!collapsedRelationships.has(relationshipDedupeKey)) {
      collapsedRelationships.set(relationshipDedupeKey, row);
    }
  }

  if (skippedColumns.size > 0) {
    const sample = [...skippedColumns].slice(0, 6).join(", ");
    const suffix = skippedColumns.size > 6 ? ", ..." : "";
    warnings.push(
      `${skippedColumns.size} file column(s) were not imported because they are not OneStream member properties (${sample}${suffix}). Use Column mapping → Member properties to map them (for example to Text1).`
    );
  }

  const importsAccounts = [...collapsedMembers.values()].some((row) => row.dimensionType === "Account")
    || input.formDefaults.dimensionType === "Account";
  if (importsAccounts && !input.formDefaults.defaultAccountType?.trim() && !mapping?.properties?.["Account Type"]) {
    warnings.push(
      "No Account Type mapped. Set a default Account Type below or map a source column to Account Type to avoid ACCOUNT_TYPE_MISSING warnings."
    );
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
    projectName: input.formDefaults.projectName?.trim() || sourceFileName.replace(/\.(csv|txt|tsv)$/i, "") || "Imported CSV Project",
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

    const properties = buildMemberProperties(row.dimensionType, row, input.formDefaults);
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
