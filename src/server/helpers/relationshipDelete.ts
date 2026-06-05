import type { Repositories } from "../db/repositories";

export function deleteRelationshipsByIds(
  repos: Repositories,
  dimensionId: string,
  relationshipIds: string[]
): { relationshipsDeleted: number } {
  const uniqueIds = [...new Set(relationshipIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { relationshipsDeleted: 0 };
  }

  const relationships = repos.relationships.listByIds(dimensionId, uniqueIds);
  const relationshipsDeleted = repos.relationships.deleteMany(relationships.map((relationship) => relationship.id));
  return { relationshipsDeleted };
}
