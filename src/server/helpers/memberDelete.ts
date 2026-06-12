import type { DimensionMemberRecord } from "../../shared/types";
import type { Repositories } from "../db/repositories";

export async function deleteMembersWithRelationships(
  repos: Repositories,
  dimensionId: string,
  memberIds: string[]
): Promise<{ membersDeleted: number; relationshipsDeleted: number }> {
  const uniqueIds = [...new Set(memberIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { membersDeleted: 0, relationshipsDeleted: 0 };
  }

  const members = (
    await Promise.all(uniqueIds.map((id) => repos.members.getById(id)))
  ).filter((member): member is DimensionMemberRecord => Boolean(member && member.dimensionId === dimensionId));

  const memberKeys = [...new Set(members.map((member) => member.memberKey).filter(Boolean))];
  const relationshipsDeleted = await repos.relationships.deleteForMemberKeys(dimensionId, memberKeys);
  const membersDeleted = await repos.members.softDeleteMany(members.map((member) => member.id));

  return { membersDeleted, relationshipsDeleted };
}
