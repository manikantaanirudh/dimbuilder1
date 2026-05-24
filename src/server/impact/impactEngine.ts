import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord
} from "../../shared/types";
import type {
  CrossDimensionImpact,
  DataImpact,
  HierarchyImpact,
  ImpactAnalysisRequest,
  ImpactReport,
  ImpactSeverity,
  ImpactScope,
  SecurityImpact
} from "../../shared/impactTypes";
import { buildHierarchyPaths, classifyMembersAsLeafOrParent } from "../../shared/hierarchyAnalytics";

export interface ProjectData {
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}

export function runImpactAnalysis(request: ImpactAnalysisRequest, projectData: ProjectData): ImpactReport {
  const { scope } = request;

  const targetDimension = projectData.dimensions.find(d => d.dimensionType === scope.dimensionType);
  const dimensionMembers = targetDimension
    ? projectData.members.filter(m => m.dimensionId === targetDimension.id)
    : [];
  const dimensionRelationships = targetDimension
    ? projectData.relationships.filter(r => r.dimensionId === targetDimension.id)
    : [];

  const hierarchyImpact = analyzeHierarchyImpact(scope, targetDimension, dimensionMembers, dimensionRelationships);
  const crossDimensionImpact = analyzeCrossDimensionImpact(scope, projectData);
  const dataImpact = analyzeDataImpact(scope, dimensionMembers, dimensionRelationships);
  const securityImpact = analyzeSecurityImpact(scope, targetDimension, dimensionRelationships, projectData.dimensions);

  const severity = calculateSeverity(hierarchyImpact, crossDimensionImpact, dataImpact, securityImpact);
  const recommendations = generateRecommendations(hierarchyImpact, crossDimensionImpact, dataImpact, securityImpact, scope);
  const summary = buildSummary(scope, severity, hierarchyImpact, crossDimensionImpact);

  return {
    severity,
    summary,
    hierarchyImpact,
    crossDimensionImpact,
    dataImpact,
    securityImpact,
    recommendations
  };
}

function analyzeHierarchyImpact(
  scope: ImpactScope,
  dimension: DimensionRecord | undefined,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): HierarchyImpact {
  const emptyResult: HierarchyImpact = {
    consolidationPathsChanged: 0,
    orphanedMembers: [],
    newParentPaths: [],
    depthChange: 0
  };

  if (!dimension || members.length === 0) return emptyResult;

  const targetKeys = new Set(scope.memberKeys);

  if (scope.action === "delete") {
    // Find children of deleted members that would become orphaned
    const childrenOfDeleted: string[] = [];
    for (const rel of relationships) {
      if (targetKeys.has(rel.parentKey) && !targetKeys.has(rel.childKey)) {
        // This child's parent is being deleted — check if it has another parent
        const otherParents = relationships.filter(
          r => r.childKey === rel.childKey && !targetKeys.has(r.parentKey)
        );
        if (otherParents.length === 0) {
          childrenOfDeleted.push(rel.childKey);
        }
      }
    }

    // Find all descendants that would be orphaned (transitively)
    const orphanedMembers = findTransitiveOrphans(childrenOfDeleted, targetKeys, relationships);

    // Calculate consolidation path changes by checking paths of OTHER members
    // that pass through deleted members (i.e., the deleted members are ancestors)
    const paths = buildHierarchyPaths(dimension, members, relationships);
    let consolidationPathsChanged = 0;
    for (const path of paths) {
      // Only count paths of non-deleted members that pass through a deleted member
      if (!targetKeys.has(path.memberKey) && path.levels.some(level => targetKeys.has(level))) {
        consolidationPathsChanged++;
      }
    }

    // Estimate depth change
    const maxDeletedDepth = paths
      .filter(p => targetKeys.has(p.memberKey))
      .reduce((max, p) => Math.max(max, p.levels.length - 1), 0);

    return {
      consolidationPathsChanged,
      orphanedMembers: [...new Set(orphanedMembers)],
      newParentPaths: [],
      depthChange: -maxDeletedDepth
    };
  }

  if (scope.action === "move" && scope.targetParent) {
    // Calculate path changes for moved members
    const paths = buildHierarchyPaths(dimension, members, relationships);
    const newParentPaths: { member: string; oldPath: string; newPath: string }[] = [];
    let consolidationPathsChanged = 0;

    for (const memberKey of scope.memberKeys) {
      const memberPaths = paths.filter(p => p.memberKey === memberKey);
      for (const mp of memberPaths) {
        const oldPath = mp.path;
        // Simulate the new path: replace the direct parent with targetParent
        const targetParentPaths = paths.filter(p => p.memberKey === scope.targetParent);
        const newPathPrefix = targetParentPaths.length > 0
          ? targetParentPaths[0].levels.join(" / ")
          : scope.targetParent;
        const newPath = `${newPathPrefix} / ${memberKey}`;

        if (oldPath !== newPath) {
          newParentPaths.push({ member: memberKey, oldPath, newPath });
          consolidationPathsChanged++;
        }
      }
    }

    // Calculate depth change
    const oldMaxDepth = paths
      .filter(p => targetKeys.has(p.memberKey))
      .reduce((max, p) => Math.max(max, p.levels.length - 1), 0);
    const targetPaths = paths.filter(p => p.memberKey === scope.targetParent);
    const newDepth = targetPaths.length > 0 ? targetPaths[0].levels.length : 1;
    const depthChange = newDepth - oldMaxDepth + 1;

    return {
      consolidationPathsChanged,
      orphanedMembers: [],
      newParentPaths,
      depthChange
    };
  }

  // restructure or whatIf — generic analysis
  const paths = buildHierarchyPaths(dimension, members, relationships);
  const consolidationPathsChanged = paths.filter(p =>
    p.levels.some(level => targetKeys.has(level))
  ).length;

  return {
    consolidationPathsChanged,
    orphanedMembers: [],
    newParentPaths: [],
    depthChange: 0
  };
}

function findTransitiveOrphans(
  initialOrphans: string[],
  deletedKeys: Set<string>,
  relationships: DimensionRelationshipRecord[]
): string[] {
  const orphans = new Set(initialOrphans);
  const queue = [...initialOrphans];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    // Find children of this orphan whose only parent is either deleted or orphaned
    for (const rel of relationships) {
      if (rel.parentKey === current && !deletedKeys.has(rel.childKey) && !orphans.has(rel.childKey)) {
        const otherParents = relationships.filter(
          r => r.childKey === rel.childKey && r.parentKey !== current && !deletedKeys.has(r.parentKey) && !orphans.has(r.parentKey)
        );
        if (otherParents.length === 0) {
          orphans.add(rel.childKey);
          queue.push(rel.childKey);
        }
      }
    }
  }

  return [...orphans];
}

function analyzeCrossDimensionImpact(scope: ImpactScope, projectData: ProjectData): CrossDimensionImpact {
  const targetKeys = new Set(scope.memberKeys);
  const referencesFound: { dimensionType: string; dimensionName: string; memberKeys: string[] }[] = [];

  // Check other dimensions for references to target member keys
  for (const dim of projectData.dimensions) {
    if (dim.dimensionType === scope.dimensionType) continue;

    const foundKeys: string[] = [];
    const dimMembers = projectData.members.filter(m => m.dimensionId === dim.id);
    const dimRelationships = projectData.relationships.filter(r => r.dimensionId === dim.id);

    // Check member properties for references
    for (const member of dimMembers) {
      for (const value of Object.values(member.properties)) {
        const strValue = String(value ?? "");
        for (const targetKey of targetKeys) {
          if (strValue === targetKey || strValue.includes(targetKey)) {
            if (!foundKeys.includes(targetKey)) foundKeys.push(targetKey);
          }
        }
      }
    }

    // Check relationship properties for references
    for (const rel of dimRelationships) {
      for (const value of Object.values(rel.properties)) {
        const strValue = String(value ?? "");
        for (const targetKey of targetKeys) {
          if (strValue === targetKey || strValue.includes(targetKey)) {
            if (!foundKeys.includes(targetKey)) foundKeys.push(targetKey);
          }
        }
      }
    }

    if (foundKeys.length > 0) {
      referencesFound.push({
        dimensionType: dim.dimensionType,
        dimensionName: dim.dimensionName,
        memberKeys: foundKeys
      });
    }
  }

  const totalReferences = referencesFound.reduce((sum, ref) => sum + ref.memberKeys.length, 0);
  return { referencesFound, totalReferences };
}

function analyzeDataImpact(
  scope: ImpactScope,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): DataImpact {
  const targetKeys = new Set(scope.memberKeys);
  const classifications = classifyMembersAsLeafOrParent(members, relationships);

  // Heuristic: leaf members are more likely to have data
  const targetClassifications = classifications.filter(c => targetKeys.has(c.memberKey));
  const leafCount = targetClassifications.filter(c => c.isLeaf).length;
  const hasData = leafCount > 0;

  // Estimate cell count based on leaf status (heuristic)
  const estimatedCellCount = leafCount * 12; // rough estimate: 12 cube intersections per leaf

  const affectedCubeTypes = hasData ? ["input", "calculated"] : [];
  const warning = hasData
    ? "Data existence unknown — connect to OneStream environment for live check"
    : "No leaf members targeted — data impact unlikely";

  return { hasData, estimatedCellCount, affectedCubeTypes, warning };
}

function analyzeSecurityImpact(
  scope: ImpactScope,
  targetDimension: DimensionRecord | undefined,
  relationships: DimensionRelationshipRecord[],
  allDimensions: DimensionRecord[]
): SecurityImpact {
  const accessGroupChanges: { member: string; currentGroup: string; newGroup: string }[] = [];

  if (scope.action !== "move" || !scope.targetParent || !targetDimension) {
    return { accessGroupChanges, usersAffected: 0 };
  }

  // Find the current access group from the dimension's access group setting
  const currentGroup = targetDimension.accessGroup || "Everyone";

  // Check if the target parent belongs to a dimension with a different access group
  // In OneStream, access groups are typically at the dimension level
  // but can vary by member/branch — we check if moving changes the effective group
  const targetParentDim = allDimensions.find(d =>
    d.dimensionType === scope.dimensionType && d.accessGroup && d.accessGroup !== currentGroup
  );

  if (targetParentDim && targetParentDim.accessGroup !== currentGroup) {
    for (const memberKey of scope.memberKeys) {
      accessGroupChanges.push({
        member: memberKey,
        currentGroup,
        newGroup: targetParentDim.accessGroup
      });
    }
  }

  // Also check relationship properties for access group info
  for (const memberKey of scope.memberKeys) {
    const currentRels = relationships.filter(r => r.childKey === memberKey);
    for (const rel of currentRels) {
      const relAccessGroup = String(rel.properties.AccessGroup ?? rel.properties.accessGroup ?? "");
      if (relAccessGroup && relAccessGroup !== currentGroup) {
        if (!accessGroupChanges.find(c => c.member === memberKey)) {
          accessGroupChanges.push({
            member: memberKey,
            currentGroup: relAccessGroup,
            newGroup: currentGroup
          });
        }
      }
    }
  }

  return { accessGroupChanges, usersAffected: accessGroupChanges.length > 0 ? accessGroupChanges.length : 0 };
}

function calculateSeverity(
  hierarchy: HierarchyImpact,
  crossDimension: CrossDimensionImpact,
  data: DataImpact,
  security: SecurityImpact
): ImpactSeverity {
  // HIGH: orphans created, or cross-dimension references exist
  if (hierarchy.orphanedMembers.length > 0) return "high";
  if (crossDimension.totalReferences > 0) return "high";

  // MEDIUM: consolidation paths change, data likely exists (heuristic only), or security changes
  if (hierarchy.consolidationPathsChanged > 0 && hierarchy.newParentPaths.length > 0) return "medium";
  if (data.hasData && hierarchy.consolidationPathsChanged > 0) return "medium";
  if (security.accessGroupChanges.length > 0) return "medium";

  // LOW: minor restructure with some paths affected, or data heuristic only
  if (hierarchy.consolidationPathsChanged > 0) return "low";
  if (data.hasData) return "low";
  if (hierarchy.newParentPaths.length > 0) return "low";

  return "none";
}

function generateRecommendations(
  hierarchy: HierarchyImpact,
  crossDimension: CrossDimensionImpact,
  data: DataImpact,
  security: SecurityImpact,
  scope: ImpactScope
): string[] {
  const recommendations: string[] = [];

  if (hierarchy.orphanedMembers.length > 0) {
    recommendations.push("Create a snapshot before proceeding");
    recommendations.push(
      `Reassign ${hierarchy.orphanedMembers.length} orphaned member(s) to a new parent before deleting`
    );
  }

  if (crossDimension.totalReferences > 0) {
    const dims = crossDimension.referencesFound.map(r => r.dimensionType).join(", ");
    recommendations.push(`Review cross-dimension references in [${dims}] before ${scope.action === "delete" ? "deleting" : "modifying"}`);
  }

  if (data.hasData) {
    recommendations.push("Consider updating downstream reports that reference these members");
    recommendations.push("Connect to OneStream environment for precise data impact assessment");
  }

  if (security.accessGroupChanges.length > 0) {
    recommendations.push("Review access group changes — affected users may lose or gain access to data");
  }

  if (hierarchy.consolidationPathsChanged > 0 && hierarchy.orphanedMembers.length === 0) {
    recommendations.push("Verify consolidation totals after applying changes");
  }

  if (recommendations.length === 0) {
    recommendations.push("No impact detected — safe to proceed");
  }

  return recommendations;
}

function buildSummary(
  scope: ImpactScope,
  severity: ImpactSeverity,
  hierarchy: HierarchyImpact,
  crossDimension: CrossDimensionImpact
): string {
  const action = scope.action === "whatIf" ? "what-if analysis" : `${scope.action} operation`;
  const memberCount = scope.memberKeys.length;
  const parts: string[] = [
    `${severity.toUpperCase()} impact for ${action} on ${memberCount} member(s) in ${scope.dimensionType}`
  ];

  if (hierarchy.orphanedMembers.length > 0) {
    parts.push(`${hierarchy.orphanedMembers.length} orphan(s) created`);
  }
  if (hierarchy.consolidationPathsChanged > 0) {
    parts.push(`${hierarchy.consolidationPathsChanged} consolidation path(s) affected`);
  }
  if (crossDimension.totalReferences > 0) {
    parts.push(`${crossDimension.totalReferences} cross-dimension reference(s) found`);
  }

  return parts.join(". ");
}
