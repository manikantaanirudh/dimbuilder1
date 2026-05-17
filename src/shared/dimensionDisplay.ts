import type { ClientAppConfig } from "./appConfigTypes";
import type { DimensionRecord } from "./types";

export type DimensionDisplayConfig = ClientAppConfig["dimensions"]["display"];

function getDefaultDimensionLabel(dimension: DimensionRecord): string {
  return dimension.dimensionName.trim()
    ? `${dimension.dimensionType} - ${dimension.dimensionName}`
    : dimension.dimensionType;
}

export function getDimensionDisplayLabel(
  dimension: DimensionRecord,
  displayConfig?: DimensionDisplayConfig
): string {
  const defaultLabel = getDefaultDimensionLabel(dimension);
  const formattedLabel = displayConfig?.labelFormat
    ?.replaceAll("{type}", dimension.dimensionType)
    .replaceAll("{name}", dimension.dimensionName)
    .replaceAll("{sheetName}", dimension.sheetName)
    .replaceAll("{inheritedDimension}", dimension.inheritedDimension);
  const label = formattedLabel?.trim() ? formattedLabel : defaultLabel;

  return displayConfig?.showMetadataOnlyBadge && dimension.metadata.metadataOnly === true
    ? `${label} (metadata only)`
    : label;
}

export function getDimensionDisplaySubtitle(
  dimension: DimensionRecord,
  displayConfig?: DimensionDisplayConfig
): string {
  const sourceSheetNames = Array.isArray(dimension.metadata.sourceSheetNames)
    ? dimension.metadata.sourceSheetNames.map(String).filter(Boolean)
    : [];

  const sheetSubtitle = sourceSheetNames.length > 1
    ? `Sheets: ${sourceSheetNames.join(", ")}`
    : sourceSheetNames[0] ?? dimension.sheetName;

  return displayConfig?.showInheritedDimensionSubtitle && dimension.inheritedDimension.trim()
    ? `${sheetSubtitle}; Inherits: ${dimension.inheritedDimension}`
    : sheetSubtitle;
}
