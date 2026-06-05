import type { DimensionType } from "./types";

/** Canonical left-nav and dimension list order for OneStream workbench dimensions. */
export const DIMENSION_TYPE_DISPLAY_ORDER: DimensionType[] = [
  "Entity",
  "Scenario",
  "Account",
  "Flow",
  "UD1",
  "UD2",
  "UD3",
  "UD4",
  "UD5",
  "UD6",
  "UD7",
  "UD8"
];

export function getDimensionTypeSortRank(dimensionType: DimensionType | string): number {
  const index = DIMENSION_TYPE_DISPLAY_ORDER.indexOf(dimensionType as DimensionType);
  return index === -1 ? DIMENSION_TYPE_DISPLAY_ORDER.length + 1 : index;
}

export function compareDimensionsByType<
  T extends { dimensionType: DimensionType | string; dimensionName?: string; sortOrder?: number }
>(left: T, right: T): number {
  const typeOrder = getDimensionTypeSortRank(left.dimensionType) - getDimensionTypeSortRank(right.dimensionType);
  if (typeOrder !== 0) return typeOrder;

  const leftSort = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const rightSort = right.sortOrder ?? Number.MAX_SAFE_INTEGER;
  if (leftSort !== rightSort) return leftSort - rightSort;

  return String(left.dimensionName ?? "").localeCompare(String(right.dimensionName ?? ""), undefined, {
    sensitivity: "base"
  });
}

export function sortDimensionsByType<
  T extends { dimensionType: DimensionType | string; dimensionName?: string; sortOrder?: number }
>(dimensions: T[]): T[] {
  return [...dimensions].sort(compareDimensionsByType);
}

/** Assigns sort_order values that keep dimensions grouped by canonical dimension type. */
export function nextSortOrderForDimensionType(
  dimensionType: DimensionType,
  existing: Array<{ dimensionType: DimensionType | string; sortOrder?: number }>
): number {
  const base = getDimensionTypeSortRank(dimensionType) * 100;
  const sameTypeMax = existing
    .filter((dimension) => dimension.dimensionType === dimensionType)
    .reduce((max, dimension) => Math.max(max, dimension.sortOrder ?? base), base);
  return sameTypeMax + 1;
}
