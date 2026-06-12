import type { Repositories } from "../db/repositories";

export async function deleteRelationshipsByIds(
  repos: Repositories,
  dimensionId: string,
  relationshipIds: string[]
): Promise<{ relationshipsDeleted: number }> {
  const uniqueIds = [...new Set(relationshipIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { relationshipsDeleted: 0 };
  }

  const relationships = await repos.relationships.listByIds(dimensionId, uniqueIds);
  const relationshipsDeleted = await repos.relationships.deleteMany(relationships.map((relationship) => relationship.id));
  return { relationshipsDeleted };
}
