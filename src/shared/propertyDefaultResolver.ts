import type { PropertyDefaultResolutionEntry } from "./effectiveProperties";
import type { PropertyDefaultTargetLevel } from "./propertyDefaults";
import type { DimensionType } from "./types";

export interface PropertyDefaultCatalogRecord {
  id: string;
  dimensionType: DimensionType;
  targetLevel: PropertyDefaultTargetLevel;
  propertyName: string;
  xmlName: string;
  defaultValue: string;
  enabled: boolean;
  updatedAt: string;
}

export interface PropertyDefaultDisplayRow {
  id: string;
  dimensionType: DimensionType;
  targetLevel: PropertyDefaultTargetLevel;
  propertyName: string;
  xmlName: string;
  defaultValue: string;
  enabled: boolean;
}

export function toPropertyDefaultDisplayRow(record: PropertyDefaultCatalogRecord): PropertyDefaultDisplayRow {
  return {
    id: record.id,
    dimensionType: record.dimensionType,
    targetLevel: record.targetLevel,
    propertyName: record.propertyName,
    xmlName: record.xmlName,
    defaultValue: record.defaultValue,
    enabled: record.enabled
  };
}

export function toPropertyDefaultResolutionEntries(
  catalog: PropertyDefaultCatalogRecord[],
  dimensionType?: DimensionType
): PropertyDefaultResolutionEntry[] {
  return catalog
    .filter((row) => row.enabled)
    .filter((row) => !dimensionType || row.dimensionType === dimensionType)
    .map((row) => ({
      dimensionType: row.dimensionType,
      targetLevel: row.targetLevel,
      propertyName: row.propertyName,
      xmlName: row.xmlName,
      defaultValue: row.defaultValue,
      enabled: row.enabled
    }));
}

export function groupDisplayRowsByDimensionType(
  rows: PropertyDefaultDisplayRow[]
): Record<string, PropertyDefaultDisplayRow[]> {
  const grouped: Record<string, PropertyDefaultDisplayRow[]> = {};
  for (const row of rows) {
    grouped[row.dimensionType] ??= [];
    grouped[row.dimensionType].push(row);
  }
  return grouped;
}
