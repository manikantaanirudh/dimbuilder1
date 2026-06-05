import type { Repositories } from "../db/repositories";

export interface DeleteDimensionResult {
  dimensionId: string;
  dimensionType: string;
  dimensionName: string;
  membersRemoved: number;
  relationshipsRemoved: number;
}

/**
 * Removes a dimension and all dependent metadata (members, relationships, validation issues,
 * varying properties cascade via FK). Cleans ancillary rows without FK constraints.
 */
export function deleteDimension(repos: Repositories, dimensionId: string): DeleteDimensionResult | null {
  const dimension = repos.dimensions.get(dimensionId);
  if (!dimension) return null;

  const membersRemoved = repos.members.countByDimension(dimensionId);
  const relationshipsRemoved = repos.relationships.countByDimension(dimensionId);

  if (!repos.dimensions.delete(dimensionId)) return null;

  return {
    dimensionId: dimension.id,
    dimensionType: dimension.dimensionType,
    dimensionName: dimension.dimensionName,
    membersRemoved,
    relationshipsRemoved
  };
}
