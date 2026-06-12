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
export async function deleteDimension(repos: Repositories, dimensionId: string): Promise<DeleteDimensionResult | null> {
  const dimension = await repos.dimensions.get(dimensionId);
  if (!dimension) return null;

  const membersRemoved = await repos.members.countByDimension(dimensionId);
  const relationshipsRemoved = await repos.relationships.countByDimension(dimensionId);

  if (!(await repos.dimensions.delete(dimensionId))) return null;

  return {
    dimensionId: dimension.id,
    dimensionType: dimension.dimensionType,
    dimensionName: dimension.dimensionName,
    membersRemoved,
    relationshipsRemoved
  };
}
