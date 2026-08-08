import type { DimensionMemberRecord } from "../../shared/types";
import type { Repositories } from "../db/repositories";

export async function deleteMembersWithRelationships(
  repos: Repositories,
  dimensionId: string,
  memberIds: string[]
): Promise<{ membersDeleted: number; relationshipsDeleted: number; memberKeys: string[] }> {
  const uniqueIds = [...new Set(memberIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { membersDeleted: 0, relationshipsDeleted: 0, memberKeys: [] };
  }

  const allMembers = await repos.members.listAllByDimension(dimensionId);
  const idSet = new Set(uniqueIds);
  const targetMembers = allMembers.filter((m) => idSet.has(m.id) || idSet.has(m.memberKey));

  // If any uniqueIds were not matched in active dimension list, fall back to getById lookup
  const foundIds = new Set(targetMembers.map((m) => m.id));
  const missingIds = uniqueIds.filter((id) => !foundIds.has(id) && !targetMembers.some((m) => m.memberKey === id));
  if (missingIds.length > 0) {
    const fetched = (await Promise.all(missingIds.map((id) => repos.members.getById(id))))
      .filter((m): m is DimensionMemberRecord => Boolean(m && m.dimensionId === dimensionId));
    targetMembers.push(...fetched);
  }

  const memberKeys = [...new Set(targetMembers.map((m) => m.memberKey).filter(Boolean))];
  const targetMemberIds = [...new Set(targetMembers.map((m) => m.id))];

  const relationshipsDeleted = await repos.relationships.deleteForMemberKeys(dimensionId, memberKeys);
  const membersDeleted = await repos.members.softDeleteMany(targetMemberIds.length > 0 ? targetMemberIds : uniqueIds);

  return { membersDeleted, relationshipsDeleted, memberKeys };
}
