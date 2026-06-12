import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord } from "../../shared/types";
import type { VcsDiff, VcsDiffEntry, VcsMergeResult, VcsMergeConflict, ProjectSnapshot } from "../../shared/vcsTypes";
import type { Repositories } from "../db/repositories";

export async function serializeProject(repos: Repositories, projectId: string): Promise<ProjectSnapshot> {
  const project = await repos.projects.get(projectId);
  if (!project) throw new Error("Project not found");

  const dimensions = await repos.dimensions.listByProject(projectId);
  const allMembers = await repos.members.listByProject(projectId);
  const allRelationships = await repos.relationships.listByProject(projectId);

  return {
    project: { name: project.name, description: project.description },
    dimensions: dimensions.map(dim => ({
      dimensionType: dim.dimensionType,
      dimensionName: dim.dimensionName,
      members: allMembers
        .filter(m => m.dimensionId === dim.id)
        .map(m => ({ memberKey: m.memberKey, description: m.description, properties: m.properties })),
      relationships: allRelationships
        .filter(r => r.dimensionId === dim.id)
        .map(r => ({ parentKey: r.parentKey, childKey: r.childKey, aggregationWeight: r.aggregationWeight }))
    }))
  };
}

export function computeDiff(fromSnapshot: ProjectSnapshot, toSnapshot: ProjectSnapshot): VcsDiff {
  const entries: VcsDiffEntry[] = [];

  // Compare project-level changes
  if (fromSnapshot.project.name !== toSnapshot.project.name) {
    entries.push({ path: 'project.name', changeType: 'modified', oldValue: fromSnapshot.project.name, newValue: toSnapshot.project.name });
  }

  // Build dimension maps
  const fromDims = new Map(fromSnapshot.dimensions.map(d => [d.dimensionType, d]));
  const toDims = new Map(toSnapshot.dimensions.map(d => [d.dimensionType, d]));

  // Detect added/removed dimensions
  for (const [type, dim] of toDims) {
    if (!fromDims.has(type)) {
      entries.push({ path: `dimensions.${type}`, changeType: 'added', newValue: dim.dimensionName });
    }
  }
  for (const [type] of fromDims) {
    if (!toDims.has(type)) {
      entries.push({ path: `dimensions.${type}`, changeType: 'deleted', oldValue: fromDims.get(type)!.dimensionName });
    }
  }

  // Compare members within shared dimensions
  for (const [type, toDim] of toDims) {
    const fromDim = fromDims.get(type);
    if (!fromDim) continue;

    const fromMembers = new Map(fromDim.members.map(m => [m.memberKey, m]));
    const toMembers = new Map(toDim.members.map(m => [m.memberKey, m]));

    for (const [key, member] of toMembers) {
      if (!fromMembers.has(key)) {
        entries.push({ path: `dimensions.${type}.members.${key}`, changeType: 'added', newValue: key });
      } else {
        const oldMember = fromMembers.get(key)!;
        if (JSON.stringify(oldMember.properties) !== JSON.stringify(member.properties)) {
          entries.push({ path: `dimensions.${type}.members.${key}.properties`, changeType: 'modified', oldValue: oldMember.properties, newValue: member.properties });
        }
      }
    }
    for (const [key] of fromMembers) {
      if (!toMembers.has(key)) {
        entries.push({ path: `dimensions.${type}.members.${key}`, changeType: 'deleted', oldValue: key });
      }
    }
  }

  const added = entries.filter(e => e.changeType === 'added').length;
  const modified = entries.filter(e => e.changeType === 'modified').length;
  const deleted = entries.filter(e => e.changeType === 'deleted').length;

  return { fromCommitId: '', toCommitId: '', entries, summary: { added, modified, deleted } };
}

export function mergeBranches(
  sourceSnapshot: ProjectSnapshot,
  targetSnapshot: ProjectSnapshot,
  baseSnapshot: ProjectSnapshot | null
): VcsMergeResult {
  const conflicts: VcsMergeConflict[] = [];

  if (!baseSnapshot) {
    // No common ancestor — simple overlay (source wins)
    return { success: true, commitId: null, conflicts: [] };
  }

  // Detect conflicts: changes in both source and target relative to base
  const baseDims = new Map(baseSnapshot.dimensions.map(d => [d.dimensionType, d]));
  const sourceDims = new Map(sourceSnapshot.dimensions.map(d => [d.dimensionType, d]));
  const targetDims = new Map(targetSnapshot.dimensions.map(d => [d.dimensionType, d]));

  for (const [type, baseDim] of baseDims) {
    const sourceDim = sourceDims.get(type);
    const targetDim = targetDims.get(type);
    if (!sourceDim || !targetDim) continue;

    const baseMembers = new Map(baseDim.members.map(m => [m.memberKey, m]));
    const sourceMembers = new Map(sourceDim.members.map(m => [m.memberKey, m]));
    const targetMembers = new Map(targetDim.members.map(m => [m.memberKey, m]));

    for (const [key, baseMember] of baseMembers) {
      const sourceMember = sourceMembers.get(key);
      const targetMember = targetMembers.get(key);
      if (!sourceMember || !targetMember) continue;

      const sourceChanged = JSON.stringify(sourceMember.properties) !== JSON.stringify(baseMember.properties);
      const targetChanged = JSON.stringify(targetMember.properties) !== JSON.stringify(baseMember.properties);

      if (sourceChanged && targetChanged) {
        if (JSON.stringify(sourceMember.properties) !== JSON.stringify(targetMember.properties)) {
          conflicts.push({
            path: `dimensions.${type}.members.${key}`,
            sourceValue: sourceMember.properties,
            targetValue: targetMember.properties,
            baseValue: baseMember.properties
          });
        }
      }
    }
  }

  return { success: conflicts.length === 0, commitId: null, conflicts };
}
