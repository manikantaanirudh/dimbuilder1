import { nanoid } from "nanoid";
import type { AppConfig } from "./appConfigTypes";
import type { DimensionRecord, DimensionType, ProjectRecord, Severity, ValidationIssue } from "./types";

export interface ValidateProjectStructureInput {
  project: ProjectRecord;
  dimensions: DimensionRecord[];
  config: AppConfig;
  /** Optional per-rule-code severity overrides (from project admin panel). */
  ruleOverrides?: Map<string, Severity>;
}

/**
 * Project-level (preflight) validation. Complements per-dimension validation by checking
 * properties of the project as a whole — currently, whether all expected OneStream dimension
 * types are present. Expected types come from validation.oneStreamProfile.expectedDimensionTypes
 * when set, otherwise from dimensions.enabledTypes.
 */
export function validateProjectStructure(input: ValidateProjectStructureInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const createdAt = new Date().toISOString();
  const profile = input.config.validation.oneStreamProfile;
  if (!profile?.enabled) return issues;

  const expected: DimensionType[] =
    profile.expectedDimensionTypes && profile.expectedDimensionTypes.length > 0
      ? profile.expectedDimensionTypes
      : input.config.dimensions.enabledTypes;
  if (!expected || expected.length === 0) return issues;

  const present = new Set(input.dimensions.map((dimension) => dimension.dimensionType));
  const missingSeverity: Severity = profile.missingDimensionSeverity ?? "warning";

  for (const type of expected) {
    if (present.has(type)) continue;
    const overrideSeverity = input.ruleOverrides?.get("DIMENSION_MISSING_FROM_PROJECT");
    const severity = overrideSeverity ?? missingSeverity;
    if (severity === "off") continue;
    issues.push({
      id: nanoid(),
      projectId: input.project.id,
      dimensionId: "",
      entityType: "project",
      entityId: input.project.id,
      severity,
      code: "DIMENSION_MISSING_FROM_PROJECT",
      message: `Project is missing an expected '${type}' dimension. OneStream applications typically require this dimension type.`,
      fieldName: "Dimensions",
      rowNumber: null,
      createdAt
    });
  }

  return issues;
}
