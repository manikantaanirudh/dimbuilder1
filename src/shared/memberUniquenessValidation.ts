import { nanoid } from "nanoid";
import type { DimensionMemberRecord, DimensionRecord, ProjectRecord, Severity, ValidationIssue } from "./types";
import { resolveValidationSeverity } from "./validationRuleCatalog";

/**
 * OneStream requires member names to be unique within a dimension type across the application
 * (e.g. only one account named GrossIncome across all Account dimensions).
 */
export function validateMemberUniquenessAcrossDimensionTypes(input: {
  project: ProjectRecord;
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  severity?: Severity;
  ruleOverrides?: Map<string, Severity>;
}): ValidationIssue[] {
  const severity = input.severity ?? "error";
  if (severity === "off") return [];

  const dimensionById = new Map(input.dimensions.map((dimension) => [dimension.id, dimension]));
  const groups = new Map<string, Array<{ member: DimensionMemberRecord; dimension: DimensionRecord }>>();

  for (const member of input.members) {
    if (member.isActive === false) continue;
    const dimension = dimensionById.get(member.dimensionId);
    const normalizedKey = member.memberKey.trim().toLowerCase();
    if (!dimension || !normalizedKey) continue;

    const groupKey = `${dimension.dimensionType}\u0000${normalizedKey}`;
    const entry = { member, dimension };
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), entry]);
  }

  const issues: ValidationIssue[] = [];
  const createdAt = new Date().toISOString();

  for (const [, entries] of groups) {
    const dimensionIds = new Set(entries.map((entry) => entry.dimension.id));
    if (dimensionIds.size <= 1) continue;

    const dimensionType = entries[0]!.dimension.dimensionType;
    const memberKey = entries[0]!.member.memberKey;
    const otherDimensions = [...new Set(
      entries
        .map((entry) => entry.dimension.dimensionName)
        .filter((name) => name !== entries[0]!.dimension.dimensionName)
    )];

    for (const { member, dimension } of entries) {
      const peers = otherDimensions.length > 0
        ? otherDimensions.join(", ")
        : entries
            .filter((entry) => entry.dimension.id !== dimension.id)
            .map((entry) => entry.dimension.dimensionName)
            .join(", ");

      issues.push({
        id: nanoid(),
        projectId: input.project.id,
        dimensionId: dimension.id,
        entityType: "member",
        entityId: member.id,
        severity: resolveValidationSeverity("DUPLICATE_MEMBER_ACROSS_DIMENSION_TYPE", severity, input.ruleOverrides),
        code: "DUPLICATE_MEMBER_ACROSS_DIMENSION_TYPE",
        message: `Member '${memberKey}' must be unique across all ${dimensionType} dimensions. Also defined in: ${peers}.`,
        fieldName: "Member Name",
        rowNumber: member.sourceRowNumber,
        createdAt
      });
    }
  }

  return issues;
}

/**
 * OneStream aliases share the same uniqueness namespace as member names within a
 * dimension type. The per-dimension validator catches local collisions; this
 * project-level pass catches collisions between dimensions of the same type.
 */
export function validateAliasUniquenessAcrossDimensionTypes(input: {
  project: ProjectRecord;
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  ruleOverrides?: Map<string, Severity>;
}): ValidationIssue[] {
  const dimensionById = new Map(input.dimensions.map((dimension) => [dimension.id, dimension]));
  const entries = input.members
    .filter((member) => member.isActive !== false)
    .map((member) => ({ member, dimension: dimensionById.get(member.dimensionId), alias: readAlias(member.properties) }))
    .filter((entry): entry is { member: DimensionMemberRecord; dimension: DimensionRecord; alias: string } => Boolean(entry.dimension && entry.alias));
  const groups = new Map<string, typeof entries>();

  for (const entry of entries) {
    const key = `${entry.dimension.dimensionType}\u0000${entry.alias.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const issues: ValidationIssue[] = [];
  const createdAt = new Date().toISOString();
  for (const [, aliasEntries] of groups) {
    const dimensionIds = new Set(aliasEntries.map((entry) => entry.dimension.id));
    if (dimensionIds.size <= 1) continue;
    const dimensionType = aliasEntries[0]!.dimension.dimensionType;
    const alias = aliasEntries[0]!.alias;
    const memberNames = new Set(input.members
      .filter((member) => dimensionById.get(member.dimensionId)?.dimensionType === dimensionType)
      .map((member) => member.memberKey.trim().toLowerCase())
      .filter(Boolean));
    for (const entry of aliasEntries) {
      const code = memberNames.has(alias.toLowerCase()) ? "ALIAS_DUPLICATES_MEMBER_NAME" : "DUPLICATE_ALIAS";
      issues.push({
        id: nanoid(),
        projectId: input.project.id,
        dimensionId: entry.dimension.id,
        entityType: "member",
        entityId: entry.member.id,
        severity: resolveValidationSeverity(code, "error", input.ruleOverrides),
        code,
        message: code === "ALIAS_DUPLICATES_MEMBER_NAME"
          ? `Alias '${alias}' collides with a member name across the ${dimensionType} dimension type.`
          : `Alias '${alias}' appears in more than one ${dimensionType} dimension.`,
        fieldName: "Alias",
        rowNumber: entry.member.sourceRowNumber,
        createdAt
      });
    }
  }
  return issues;
}

function readAlias(properties: Record<string, unknown>): string {
  const value = Object.entries(properties).find(([key]) => key.trim().toLowerCase() === "alias")?.[1];
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}
