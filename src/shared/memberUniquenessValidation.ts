import { nanoid } from "nanoid";
import type { DimensionMemberRecord, DimensionRecord, ProjectRecord, Severity, ValidationIssue } from "./types";

/**
 * OneStream requires member names to be unique within a dimension type across the application
 * (e.g. only one account named GrossIncome across all Account dimensions).
 */
export function validateMemberUniquenessAcrossDimensionTypes(input: {
  project: ProjectRecord;
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  severity?: Severity;
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
        severity,
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
