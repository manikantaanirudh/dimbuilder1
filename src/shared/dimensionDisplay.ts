import type { DimensionRecord } from "./types";

export function getDimensionDisplayLabel(dimension: DimensionRecord): string {
  return dimension.dimensionName
    ? `${dimension.dimensionType} - ${dimension.dimensionName}`
    : dimension.dimensionType;
}

export function getDimensionDisplaySubtitle(dimension: DimensionRecord): string {
  const sourceSheetNames = Array.isArray(dimension.metadata.sourceSheetNames)
    ? dimension.metadata.sourceSheetNames.map(String).filter(Boolean)
    : [];

  if (sourceSheetNames.length > 1) return `Sheets: ${sourceSheetNames.join(", ")}`;
  return sourceSheetNames[0] ?? dimension.sheetName;
}
