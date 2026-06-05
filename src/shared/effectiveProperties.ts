import type { DimensionType } from "./types";
import type { PropertyDefaultTargetLevel } from "./propertyDefaults";

export interface PropertyDefaultResolutionEntry {
  dimensionType: DimensionType;
  targetLevel: PropertyDefaultTargetLevel;
  propertyName: string;
  xmlName: string;
  defaultValue: string;
  enabled: boolean;
}

export interface ResolveEffectivePropertiesOptions {
  /** When true, empty string on the row means inherit the active default. */
  treatEmptyStringAsInherit?: boolean;
}

function hasExplicitOverride(
  recordProperties: Record<string, unknown>,
  propertyName: string,
  treatEmptyStringAsInherit: boolean
): boolean {
  if (!(propertyName in recordProperties)) return false;
  const value = recordProperties[propertyName];
  if (value === undefined || value === null) return false;
  if (treatEmptyStringAsInherit && normalizeOverrideValue(value) === "") return false;
  return true;
}

function normalizeOverrideValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Merges row-level property overrides with project-scoped dynamic defaults.
 * Explicit row values win; missing or cleared cells inherit enabled defaults.
 */
export function resolveEffectiveProperties(
  recordProperties: Record<string, unknown>,
  defaults: PropertyDefaultResolutionEntry[],
  options: ResolveEffectivePropertiesOptions = {}
): Record<string, unknown> {
  const treatEmptyStringAsInherit = options.treatEmptyStringAsInherit ?? true;
  const merged = { ...recordProperties };

  for (const entry of defaults) {
    if (!entry.enabled) continue;
    if (hasExplicitOverride(merged, entry.propertyName, treatEmptyStringAsInherit)) continue;
    merged[entry.propertyName] = entry.defaultValue;
  }

  return merged;
}

export function filterDefaultsForTarget(
  defaults: PropertyDefaultResolutionEntry[],
  dimensionType: DimensionType,
  targetLevel: PropertyDefaultTargetLevel
): PropertyDefaultResolutionEntry[] {
  return defaults.filter((entry) => entry.enabled && entry.dimensionType === dimensionType && entry.targetLevel === targetLevel);
}
