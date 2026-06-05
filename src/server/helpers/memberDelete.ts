import type { Repositories } from "../db/repositories";

export function deleteMembersWithRelationships(
  repos: Repositories,
  dimensionId: string,
  memberIds: string[]
): { membersDeleted: number; relationshipsDeleted: number } {
  const uniqueIds = [...new Set(memberIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { membersDeleted: 0, relationshipsDeleted: 0 };
  }

  const members = uniqueIds
    .map((id) => repos.members.getById(id))
    .filter((member): member is NonNullable<typeof member> => Boolean(member && member.dimensionId === dimensionId));

  const memberKeys = [...new Set(members.map((member) => member.memberKey).filter(Boolean))];
  const relationshipsDeleted = repos.relationships.deleteForMemberKeys(dimensionId, memberKeys);
  const membersDeleted = repos.members.softDeleteMany(members.map((member) => member.id));

  return { membersDeleted, relationshipsDeleted };
}
