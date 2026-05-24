import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord } from "../../shared/types";
import type {
  CrossDimensionRule,
  DimensionRelationshipMap,
  DimensionNode,
  DimensionEdge,
  WhereUsedResult,
  WhereUsedReference,
  InheritanceChain,
  CrossDimValidationResult,
  CrossDimRuleResult,
  CrossDimViolation
} from "../../shared/crossDimensionTypes";

export interface ProjectData {
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}

export function buildDimensionMap(projectData: ProjectData): DimensionRelationshipMap {
  const { dimensions, members } = projectData;

  const nodes: DimensionNode[] = dimensions.map(dim => ({
    dimensionType: dim.dimensionType,
    dimensionName: dim.dimensionName,
    memberCount: members.filter(m => m.dimensionId === dim.id).length,
    hasInheritance: !!dim.inheritedDimension
  }));

  const edges: DimensionEdge[] = [];
  const edgeMap = new Map<string, DimensionEdge>();

  // Detect inheritance edges
  for (const dim of dimensions) {
    if (dim.inheritedDimension) {
      const targetDim = dimensions.find(d =>
        d.dimensionName === dim.inheritedDimension || d.dimensionType === dim.inheritedDimension
      );
      if (targetDim) {
        const key = `${dim.dimensionType}→${targetDim.dimensionType}:inheritance`;
        if (!edgeMap.has(key)) {
          const edge: DimensionEdge = {
            source: dim.dimensionType,
            target: targetDim.dimensionType,
            edgeType: 'inheritance',
            referenceCount: 1,
            label: 'inherits'
          };
          edgeMap.set(key, edge);
        }
      }
    }
  }

  // Detect property reference edges by scanning member properties for known dimension member keys
  const memberKeysByDimType = new Map<string, Set<string>>();
  for (const dim of dimensions) {
    const dimMembers = members.filter(m => m.dimensionId === dim.id);
    memberKeysByDimType.set(dim.dimensionType, new Set(dimMembers.map(m => m.memberKey)));
  }

  for (const dim of dimensions) {
    const dimMembers = members.filter(m => m.dimensionId === dim.id);

    for (const member of dimMembers) {
      for (const [propName, propValue] of Object.entries(member.properties)) {
        if (typeof propValue !== 'string' || !propValue || propValue === member.memberKey) continue;

        // Check if property value matches a member in another dimension
        for (const [otherDimType, otherMembers] of memberKeysByDimType) {
          if (otherDimType === dim.dimensionType) continue;
          if (otherMembers.has(propValue)) {
            const key = `${dim.dimensionType}→${otherDimType}:property_ref`;
            if (!edgeMap.has(key)) {
              edgeMap.set(key, {
                source: dim.dimensionType,
                target: otherDimType,
                edgeType: 'property_ref',
                referenceCount: 0,
                label: propName
              });
            }
            edgeMap.get(key)!.referenceCount++;
            break;
          }
        }
      }
    }
  }

  edges.push(...edgeMap.values());
  return { nodes, edges };
}

export function whereUsed(memberKey: string, dimensionType: string, projectData: ProjectData): WhereUsedResult {
  const { dimensions, members } = projectData;
  const references: WhereUsedReference[] = [];

  for (const dim of dimensions) {
    if (dim.dimensionType === dimensionType) continue;
    const dimMembers = members.filter(m => m.dimensionId === dim.id);

    for (const member of dimMembers) {
      for (const [propName, propValue] of Object.entries(member.properties)) {
        if (String(propValue) === memberKey) {
          references.push({
            dimensionType: dim.dimensionType,
            dimensionId: dim.id,
            memberKey: member.memberKey,
            propertyName: propName,
            context: `${dim.dimensionType}.${member.memberKey}.${propName} = "${memberKey}"`
          });
        }
      }
    }
  }

  return {
    memberKey,
    dimensionType,
    references,
    totalReferences: references.length
  };
}

export function buildInheritanceChains(dimensions: DimensionRecord[]): InheritanceChain[] {
  const chains: InheritanceChain[] = [];

  for (const dim of dimensions) {
    if (!dim.inheritedDimension) continue;

    let depth = 1;
    let current = dim.inheritedDimension;
    const visited = new Set<string>([dim.dimensionType]);

    // Walk up the inheritance chain
    while (current) {
      const parentDim = dimensions.find(d =>
        d.dimensionName === current || d.dimensionType === current
      );
      if (!parentDim || visited.has(parentDim.dimensionType)) break;
      visited.add(parentDim.dimensionType);
      if (parentDim.inheritedDimension) {
        depth++;
        current = parentDim.inheritedDimension;
      } else {
        break;
      }
    }

    chains.push({
      dimensionType: dim.dimensionType,
      dimensionName: dim.dimensionName,
      inheritsFrom: dim.inheritedDimension,
      depth
    });
  }

  return chains.sort((a, b) => b.depth - a.depth);
}

export function validateCrossDimension(
  rules: CrossDimensionRule[],
  projectData: ProjectData
): CrossDimValidationResult {
  const { dimensions, members, relationships } = projectData;
  const results: CrossDimRuleResult[] = [];

  const activeRules = rules.filter(r => r.isActive);

  for (const rule of activeRules) {
    const sourceDim = dimensions.find(d => d.dimensionType === rule.sourceDimensionType);
    const targetDim = dimensions.find(d => d.dimensionType === rule.targetDimensionType);

    if (!sourceDim || !targetDim) {
      results.push({ ruleId: rule.id, ruleName: rule.name, passed: true, violations: [] });
      continue;
    }

    const sourceMembers = members.filter(m => m.dimensionId === sourceDim.id);
    const targetMembers = members.filter(m => m.dimensionId === targetDim.id);
    const targetMemberKeys = new Set(targetMembers.map(m => m.memberKey));

    let violations: CrossDimViolation[] = [];

    switch (rule.ruleType) {
      case 'member_exists':
        violations = validateMemberExists(sourceMembers, targetMemberKeys, rule);
        break;
      case 'property_maps':
        violations = validatePropertyMaps(sourceMembers, targetMemberKeys, rule);
        break;
      case 'hierarchy_mirrors':
        violations = validateHierarchyMirrors(
          sourceMembers, targetMembers,
          relationships.filter(r => r.dimensionId === sourceDim.id),
          relationships.filter(r => r.dimensionId === targetDim.id),
          rule
        );
        break;
    }

    results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      passed: violations.length === 0,
      violations
    });
  }

  const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);
  return { rules: results, totalViolations, totalRules: activeRules.length };
}

function validateMemberExists(
  sourceMembers: DimensionMemberRecord[],
  targetMemberKeys: Set<string>,
  rule: CrossDimensionRule
): CrossDimViolation[] {
  const violations: CrossDimViolation[] = [];
  const config = rule.ruleConfig as { excludePatterns?: string[] };
  const excludePatterns = (config.excludePatterns || []).map(p => new RegExp(p, 'i'));

  for (const member of sourceMembers) {
    if (excludePatterns.some(p => p.test(member.memberKey))) continue;
    if (!targetMemberKeys.has(member.memberKey)) {
      violations.push({
        sourceMemberKey: member.memberKey,
        targetDimensionType: rule.targetDimensionType,
        message: `Member "${member.memberKey}" in ${rule.sourceDimensionType} does not exist in ${rule.targetDimensionType}`
      });
    }
  }

  return violations;
}

function validatePropertyMaps(
  sourceMembers: DimensionMemberRecord[],
  targetMemberKeys: Set<string>,
  rule: CrossDimensionRule
): CrossDimViolation[] {
  const violations: CrossDimViolation[] = [];
  const config = rule.ruleConfig as { propertyName?: string };
  const propertyName = config.propertyName || '';

  if (!propertyName) return violations;

  for (const member of sourceMembers) {
    const propValue = String(member.properties[propertyName] ?? '');
    if (propValue && !targetMemberKeys.has(propValue)) {
      violations.push({
        sourceMemberKey: member.memberKey,
        targetDimensionType: rule.targetDimensionType,
        message: `Property "${propertyName}" of "${member.memberKey}" references "${propValue}" which does not exist in ${rule.targetDimensionType}`
      });
    }
  }

  return violations;
}

function validateHierarchyMirrors(
  sourceMembers: DimensionMemberRecord[],
  targetMembers: DimensionMemberRecord[],
  sourceRels: DimensionRelationshipRecord[],
  targetRels: DimensionRelationshipRecord[],
  rule: CrossDimensionRule
): CrossDimViolation[] {
  const violations: CrossDimViolation[] = [];

  // Build parent-child sets for both dimensions
  const sourceParentChild = new Set(sourceRels.map(r => `${r.parentKey}→${r.childKey}`));
  const targetParentChild = new Set(targetRels.map(r => `${r.parentKey}→${r.childKey}`));
  const targetMemberKeys = new Set(targetMembers.map(m => m.memberKey));

  // Check that every source relationship has a corresponding target relationship
  // (only for members that exist in both dimensions)
  for (const rel of sourceRels) {
    if (!targetMemberKeys.has(rel.parentKey) || !targetMemberKeys.has(rel.childKey)) continue;
    const key = `${rel.parentKey}→${rel.childKey}`;
    if (!targetParentChild.has(key)) {
      violations.push({
        sourceMemberKey: rel.childKey,
        targetDimensionType: rule.targetDimensionType,
        message: `Relationship ${rel.parentKey}→${rel.childKey} exists in ${rule.sourceDimensionType} but not in ${rule.targetDimensionType}`
      });
    }
  }

  return violations;
}
