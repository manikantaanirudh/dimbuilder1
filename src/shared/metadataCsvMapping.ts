import { detectCsvDelimiter, parseCsvDocument } from "./csvParse";
import { getDimensionSchema } from "./dimensionSchemas";
import type { DimensionType } from "./types";

export type MetadataCsvHierarchyMode = "none" | "parentColumn" | "levelColumns";

export interface MetadataCsvColumnMapping {
  member?: string;
  parent?: string;
  description?: string;
  alias?: string;
  sortOrder?: string;
  dimensionType?: string;
  dimensionName?: string;
  hierarchyMode?: MetadataCsvHierarchyMode;
  /** Ordered source headers when hierarchyMode is levelColumns. */
  hierarchyColumns?: string[];
  /** OneStream member property name -> source file header. */
  properties?: Record<string, string>;
}

export interface MetadataCsvSystemField {
  id: keyof MetadataCsvColumnMapping | "hierarchyColumns";
  label: string;
  required?: boolean;
}

export interface MetadataCsvInspectResult {
  headers: string[];
  delimiter: string;
  rowCount: number;
  sampleRow: Record<string, string>;
  suggestedMapping: MetadataCsvColumnMapping;
  systemFields: MetadataCsvSystemField[];
  dimensionProperties: string[];
}

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

const SYSTEM_FIELDS: MetadataCsvSystemField[] = [
  { id: "member", label: "Member key", required: true },
  { id: "parent", label: "Parent key" },
  { id: "description", label: "Description" },
  { id: "alias", label: "Alias" },
  { id: "sortOrder", label: "Sort order" },
  { id: "dimensionType", label: "Dimension type" },
  { id: "dimensionName", label: "Dimension name" }
];

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

function suggestPropertyMappings(
  headers: string[],
  dimensionType: DimensionType,
  reserved: Set<string>
): Record<string, string> {
  const schema = getDimensionSchema(dimensionType);
  const properties: Record<string, string> = {};
  const memberFieldNames = new Set(schema.memberFields.map((field) => field.name.toLowerCase()));

  for (const header of headers) {
    if (reserved.has(header)) continue;
    const normalizedHeader = header.trim().toLowerCase();
    if (!normalizedHeader || /^l\d+_/i.test(header.trim())) continue;

    const exact = schema.memberFields.find((field) => field.name.toLowerCase() === normalizedHeader);
    if (exact) {
      properties[exact.name] = header;
      continue;
    }

    const aliasMatch = schema.memberFields.find((field) =>
      field.aliases?.some((alias) => alias.toLowerCase() === normalizedHeader)
    );
    if (aliasMatch) {
      properties[aliasMatch.name] = header;
      continue;
    }

    if (memberFieldNames.has(normalizedHeader.replace(/\s+/g, ""))) {
      const loose = schema.memberFields.find((field) =>
        field.name.toLowerCase().replace(/\s+/g, "") === normalizedHeader.replace(/\s+/g, "")
      );
      if (loose) properties[loose.name] = header;
    }
  }

  return properties;
}

export function listMappableMemberProperties(dimensionType: DimensionType): string[] {
  const schema = getDimensionSchema(dimensionType);
  return schema.memberFields
    .map((field) => field.name)
    .filter((name) => name !== schema.memberKeyField && name !== "Description");
}

export function suggestMetadataCsvColumnMapping(
  headers: string[],
  dimensionType: DimensionType
): MetadataCsvColumnMapping {
  const schema = getDimensionSchema(dimensionType);
  const member = resolveColumn(headers, undefined, MEMBER_ALIASES, [schema.memberKeyField, "Member"]);
  const parent = resolveColumn(headers, undefined, PARENT_ALIASES, ["Parent"]);
  const description = resolveColumn(headers, undefined, DESCRIPTION_ALIASES, ["Description"]);
  const alias = resolveColumn(headers, undefined, ALIAS_ALIASES);
  const sortOrder = resolveColumn(headers, undefined, SORT_ORDER_ALIASES);
  const dimensionTypeColumn = resolveColumn(headers, undefined, DIMENSION_TYPE_ALIASES);
  const dimensionNameColumn = resolveColumn(headers, undefined, DIMENSION_NAME_ALIASES);
  const hierarchyColumns = parent ? [] : findHierarchyLevelColumns(headers);

  const reserved = new Set<string>(
    [member, parent, description, alias, sortOrder, dimensionTypeColumn, dimensionNameColumn, ...hierarchyColumns].filter(
      (value): value is string => Boolean(value)
    )
  );

  let hierarchyMode: MetadataCsvHierarchyMode = "none";
  if (parent) {
    hierarchyMode = "parentColumn";
  } else if (hierarchyColumns.length > 0) {
    hierarchyMode = "levelColumns";
  }

  return {
    member,
    parent,
    description,
    alias,
    sortOrder,
    dimensionType: dimensionTypeColumn,
    dimensionName: dimensionNameColumn,
    hierarchyMode,
    hierarchyColumns: hierarchyColumns.length > 0 ? hierarchyColumns : undefined,
    properties: suggestPropertyMappings(headers, dimensionType, reserved)
  };
}

export function inspectMetadataCsvFile(csvContent: string, dimensionType: DimensionType): MetadataCsvInspectResult {
  const delimiter = detectCsvDelimiter(csvContent);
  const parsed = parseCsvDocument(csvContent, delimiter);
  const suggestedMapping = suggestMetadataCsvColumnMapping(parsed.headers, dimensionType);

  return {
    headers: parsed.headers.filter((header) => header.trim().length > 0 || header === ""),
    delimiter,
    rowCount: parsed.rows.length,
    sampleRow: parsed.rows[0] ?? {},
    suggestedMapping,
    systemFields: SYSTEM_FIELDS,
    dimensionProperties: listMappableMemberProperties(dimensionType)
  };
}

export function parseMetadataCsvColumnMapping(raw: unknown): MetadataCsvColumnMapping | undefined {
  if (!raw) return undefined;
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }
  if (typeof value !== "object" || value === null) return undefined;

  const record = value as Record<string, unknown>;
  const mapping: MetadataCsvColumnMapping = {};

  const copyString = (key: keyof MetadataCsvColumnMapping) => {
    const field = record[key];
    if (typeof field === "string" && field.trim()) {
      mapping[key] = field.trim() as never;
    }
  };

  copyString("member");
  copyString("parent");
  copyString("description");
  copyString("alias");
  copyString("sortOrder");
  copyString("dimensionType");
  copyString("dimensionName");

  const hierarchyMode = record.hierarchyMode;
  if (hierarchyMode === "none" || hierarchyMode === "parentColumn" || hierarchyMode === "levelColumns") {
    mapping.hierarchyMode = hierarchyMode;
  }

  if (Array.isArray(record.hierarchyColumns)) {
    mapping.hierarchyColumns = record.hierarchyColumns.filter((column): column is string => typeof column === "string" && column.length > 0);
    if (mapping.hierarchyColumns.length > 0 && !mapping.hierarchyMode) {
      mapping.hierarchyMode = "levelColumns";
    }
  }

  if (record.properties && typeof record.properties === "object" && !Array.isArray(record.properties)) {
    const properties: Record<string, string> = {};
    for (const [name, header] of Object.entries(record.properties as Record<string, unknown>)) {
      if (typeof header === "string" && header.trim()) {
        properties[name] = header.trim();
      }
    }
    mapping.properties = properties;
  }

  return mapping;
}

export function resolveMappedHeader(headers: string[], mapped?: string): string | undefined {
  if (!mapped) return undefined;
  const trimmed = mapped.trim();
  const exact = headers.find((header) => header === trimmed);
  if (exact) return exact;
  const lower = trimmed.toLowerCase();
  return headers.find((header) => header.trim().toLowerCase() === lower);
}
