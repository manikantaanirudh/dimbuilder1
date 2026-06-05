import builtInDefaultsJson from "../../config/builtInPropertyDefaults.json";
import type { PropertyDefaultTargetLevel, PropertyDefaultValue } from "./propertyDefaults";
import type { DimensionType } from "./types";

export interface BuiltInPropertyDefaultsCatalog {
  source: {
    name: string;
    sourceFileName: string;
    sourceXmlHash: string;
  };
  values: PropertyDefaultValue[];
}

export const builtInPropertyDefaultsCatalog = builtInDefaultsJson as BuiltInPropertyDefaultsCatalog;

export const BUILTIN_PROPERTY_DEFAULTS_SOURCE = builtInPropertyDefaultsCatalog.source;

/** Stable id for built-in rows (not stored in DB until overridden). */
export function builtInPropertyDefaultId(
  dimensionType: DimensionType,
  targetLevel: PropertyDefaultTargetLevel,
  propertyName: string
): string {
  return `builtin:${dimensionType}:${targetLevel}:${propertyName}`;
}

export function parseBuiltInPropertyDefaultId(id: string): {
  dimensionType: DimensionType;
  targetLevel: PropertyDefaultTargetLevel;
  propertyName: string;
} | null {
  if (!id.startsWith("builtin:")) return null;
  const [, dimensionType, targetLevel, ...propertyParts] = id.split(":");
  if (!dimensionType || !targetLevel || propertyParts.length === 0) return null;
  return {
    dimensionType: dimensionType as DimensionType,
    targetLevel: targetLevel as PropertyDefaultTargetLevel,
    propertyName: propertyParts.join(":")
  };
}

export function listBuiltInPropertyDefaults(dimensionType?: DimensionType): PropertyDefaultValue[] {
  const values = builtInPropertyDefaultsCatalog.values;
  if (!dimensionType) return values;
  return values.filter((value) => value.dimensionType === dimensionType);
}
