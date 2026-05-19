import type { DimensionBlueprintConfig } from "./appConfigTypes";

export const relationshipDefaultFieldNames = {
  aggregationWeight: "Aggregation Weight",
  percentConsol: "Percent Consol",
  percentOwnership: "Percent Ownership",
  ownershipType: "Ownership Type"
} as const;

export type RelationshipDefaultKey = keyof typeof relationshipDefaultFieldNames;

export const supportedRelationshipDefaultKeys = Object.keys(relationshipDefaultFieldNames) as RelationshipDefaultKey[];

export function relationshipDefaultsToProperties(
  defaults: DimensionBlueprintConfig["relationshipDefaults"],
  supportedFieldNames: Set<string>
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const key of supportedRelationshipDefaultKeys) {
    const value = defaults[key];
    const fieldName = relationshipDefaultFieldNames[key];
    if (value !== undefined && supportedFieldNames.has(fieldName)) {
      properties[fieldName] = value;
    }
  }
  return properties;
}

export function relationshipPropertiesToDefaults(
  properties: Record<string, unknown>,
  supportedFieldNames: Set<string>
): DimensionBlueprintConfig["relationshipDefaults"] {
  const defaults: DimensionBlueprintConfig["relationshipDefaults"] = {};
  if (supportedFieldNames.has(relationshipDefaultFieldNames.aggregationWeight)) {
    defaults.aggregationWeight = toNumberDefault(properties[relationshipDefaultFieldNames.aggregationWeight]);
  }
  if (supportedFieldNames.has(relationshipDefaultFieldNames.percentConsol)) {
    defaults.percentConsol = toNumberDefault(properties[relationshipDefaultFieldNames.percentConsol]);
  }
  if (supportedFieldNames.has(relationshipDefaultFieldNames.percentOwnership)) {
    defaults.percentOwnership = toNumberDefault(properties[relationshipDefaultFieldNames.percentOwnership]);
  }
  if (
    supportedFieldNames.has(relationshipDefaultFieldNames.ownershipType) &&
    properties[relationshipDefaultFieldNames.ownershipType] !== undefined
  ) {
    defaults.ownershipType = String(properties[relationshipDefaultFieldNames.ownershipType]);
  }
  return defaults;
}

function toNumberDefault(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}
