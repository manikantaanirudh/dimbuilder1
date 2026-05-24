import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord } from "../../shared/types";
import type {
  ExtensibleDimensionModel,
  CubeTypeDefinition,
  DimensionExtension,
  MemberVisibilityRule,
  ExtensibilityAntiPattern,
  WhatIfExtensionInput,
  WhatIfExtensionResult,
  ExtensibilityDocumentation
} from "../../shared/extensibilityTypes";

export interface ProjectData {
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}

export function buildExtensibilityModel(projectData: ProjectData): ExtensibleDimensionModel {
  const { dimensions, members } = projectData;
  const projectId = dimensions[0]?.projectId ?? '';

  // Identify cube types from dimension inheritance patterns
  const cubeTypes = identifyCubeTypes(dimensions);

  // Build dimension extensions
  const dimensionExtensions = buildDimensionExtensions(dimensions, members);

  // Calculate member visibility
  const memberVisibility = calculateMemberVisibility(dimensions, members, cubeTypes);

  return { projectId, cubeTypes, dimensionExtensions, memberVisibility };
}

export function detectAntiPatterns(projectData: ProjectData): ExtensibilityAntiPattern[] {
  const { dimensions, members } = projectData;
  const antiPatterns: ExtensibilityAntiPattern[] = [];

  // Deep inheritance (>3 levels)
  const inheritanceDepths = new Map<string, number>();
  for (const dim of dimensions) {
    const depth = calculateInheritanceDepth(dim, dimensions);
    inheritanceDepths.set(dim.dimensionType, depth);
    if (depth > 3) {
      antiPatterns.push({
        type: 'deep_inheritance',
        severity: 'warning',
        dimensionType: dim.dimensionType,
        description: `Dimension "${dim.dimensionName}" has inheritance depth of ${depth} (>3 is excessive)`,
        affectedMembers: [],
        recommendation: 'Consider flattening the inheritance chain to reduce complexity'
      });
    }
  }

  // Orphaned extensions (dimension inherits from non-existent)
  for (const dim of dimensions) {
    if (dim.inheritedDimension) {
      const parent = dimensions.find(d =>
        d.dimensionName === dim.inheritedDimension || d.dimensionType === dim.inheritedDimension
      );
      if (!parent) {
        antiPatterns.push({
          type: 'orphaned_extension',
          severity: 'error',
          dimensionType: dim.dimensionType,
          description: `Dimension "${dim.dimensionName}" inherits from "${dim.inheritedDimension}" which does not exist in the project`,
          affectedMembers: members.filter(m => m.dimensionId === dim.id).map(m => m.memberKey),
          recommendation: 'Add the base dimension or remove the inheritance reference'
        });
      }
    }
  }

  // Excessive overrides (>50% of members override base properties)
  for (const dim of dimensions) {
    if (!dim.inheritedDimension) continue;
    const parentDim = dimensions.find(d =>
      d.dimensionName === dim.inheritedDimension || d.dimensionType === dim.inheritedDimension
    );
    if (!parentDim) continue;

    const parentMembers = new Map(
      members.filter(m => m.dimensionId === parentDim.id).map(m => [m.memberKey, m])
    );
    const childMembers = members.filter(m => m.dimensionId === dim.id);

    let overrideCount = 0;
    for (const child of childMembers) {
      const parent = parentMembers.get(child.memberKey);
      if (parent && JSON.stringify(child.properties) !== JSON.stringify(parent.properties)) {
        overrideCount++;
      }
    }

    if (childMembers.length > 5 && overrideCount / childMembers.length > 0.5) {
      antiPatterns.push({
        type: 'excessive_overrides',
        severity: 'warning',
        dimensionType: dim.dimensionType,
        description: `${overrideCount}/${childMembers.length} members override base properties — may indicate the extension is too divergent`,
        affectedMembers: childMembers.filter(c => parentMembers.has(c.memberKey)).map(c => c.memberKey),
        recommendation: 'Consider making this a separate base dimension rather than an extension'
      });
    }
  }

  return antiPatterns;
}

export function whatIfExtension(
  input: WhatIfExtensionInput,
  projectData: ProjectData
): WhatIfExtensionResult {
  const { dimensions, members } = projectData;
  const targetDim = dimensions.find(d => d.dimensionType === input.dimensionType);
  const currentMembers = targetDim ? members.filter(m => m.dimensionId === targetDim.id) : [];

  const addCount = input.addMembers?.length ?? 0;
  const removeCount = input.removeMembers?.length ?? 0;
  const memberCountChange = addCount - removeCount;

  // Simulate and check for new anti-patterns
  const newAntiPatterns: ExtensibilityAntiPattern[] = [];

  if (addCount > 20) {
    newAntiPatterns.push({
      type: 'excessive_overrides',
      severity: 'info',
      dimensionType: input.dimensionType,
      description: `Adding ${addCount} members at once may indicate a structural issue`,
      affectedMembers: input.addMembers ?? [],
      recommendation: 'Consider grouping into sub-hierarchies'
    });
  }

  // Check affected cube types
  const affectedCubeTypes = [input.cubeType];
  for (const dim of dimensions) {
    if (dim.inheritedDimension && (dim.dimensionName === targetDim?.dimensionName || dim.dimensionType === input.dimensionType)) {
      affectedCubeTypes.push(dim.dimensionType);
    }
  }

  return {
    input,
    impact: {
      affectedCubeTypes: [...new Set(affectedCubeTypes)],
      memberCountChange,
      inheritanceDepthChange: 0,
      newAntiPatterns
    },
    recommendations: memberCountChange > 10
      ? ['Consider creating intermediate hierarchy groups for the new members']
      : []
  };
}

export function generateDocumentation(projectData: ProjectData): ExtensibilityDocumentation {
  const { dimensions, members } = projectData;
  const projectId = dimensions[0]?.projectId ?? '';
  const cubeTypes = identifyCubeTypes(dimensions);
  const antiPatterns = detectAntiPatterns(projectData);

  const dimensionDocs = dimensions
    .filter(d => !d.inheritedDimension)
    .map(baseDim => {
      const baseMembers = members.filter(m => m.dimensionId === baseDim.id).map(m => m.memberKey);
      const extensions = dimensions.filter(d =>
        d.inheritedDimension === baseDim.dimensionName || d.inheritedDimension === baseDim.dimensionType
      );

      const extensionsByCubeType: Record<string, { localMembers: string[]; overrides: string[] }> = {};
      for (const ext of extensions) {
        const extMembers = members.filter(m => m.dimensionId === ext.id);
        const baseMemberKeys = new Set(baseMembers);
        const localMembers = extMembers.filter(m => !baseMemberKeys.has(m.memberKey)).map(m => m.memberKey);
        const overrides = extMembers.filter(m => baseMemberKeys.has(m.memberKey)).map(m => m.memberKey);
        extensionsByCubeType[ext.dimensionType] = { localMembers, overrides };
      }

      return {
        dimensionType: baseDim.dimensionType,
        baseMembers,
        extensionsByCubeType
      };
    });

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    cubeTypes,
    dimensions: dimensionDocs,
    antiPatterns
  };
}

function identifyCubeTypes(dimensions: DimensionRecord[]): CubeTypeDefinition[] {
  const cubeTypes: CubeTypeDefinition[] = [];
  const seen = new Set<string>();

  for (const dim of dimensions) {
    if (seen.has(dim.dimensionType)) continue;
    seen.add(dim.dimensionType);

    const depth = calculateInheritanceDepth(dim, dimensions);
    const basedOn = dim.inheritedDimension || null;

    cubeTypes.push({
      name: dim.dimensionName,
      cubeType: depth === 0 ? 'base' : 'custom',
      description: dim.description || `${dim.dimensionType} dimension`,
      basedOn,
      depth
    });
  }

  return cubeTypes;
}

function calculateInheritanceDepth(dim: DimensionRecord, allDimensions: DimensionRecord[]): number {
  if (!dim.inheritedDimension) return 0;
  let depth = 0;
  let current: string | undefined = dim.inheritedDimension;
  const visited = new Set<string>([dim.dimensionType]);

  while (current) {
    depth++;
    const parent = allDimensions.find(d =>
      d.dimensionName === current || d.dimensionType === current
    );
    if (!parent || visited.has(parent.dimensionType)) break;
    visited.add(parent.dimensionType);
    current = parent.inheritedDimension || undefined;
  }

  return depth;
}

function buildDimensionExtensions(dimensions: DimensionRecord[], members: DimensionMemberRecord[]): DimensionExtension[] {
  const extensions: DimensionExtension[] = [];

  for (const dim of dimensions) {
    if (!dim.inheritedDimension) continue;

    const parentDim = dimensions.find(d =>
      d.dimensionName === dim.inheritedDimension || d.dimensionType === dim.inheritedDimension
    );
    if (!parentDim) continue;

    const parentMemberKeys = new Set(
      members.filter(m => m.dimensionId === parentDim.id).map(m => m.memberKey)
    );
    const childMembers = members.filter(m => m.dimensionId === dim.id);

    const localMembers = childMembers.filter(m => !parentMemberKeys.has(m.memberKey)).map(m => m.memberKey);
    const inheritedMembers = childMembers.filter(m => parentMemberKeys.has(m.memberKey)).map(m => m.memberKey);

    const overriddenProperties: DimensionExtension['overriddenProperties'] = [];
    const parentMemberMap = new Map(
      members.filter(m => m.dimensionId === parentDim.id).map(m => [m.memberKey, m])
    );

    for (const child of childMembers) {
      const parent = parentMemberMap.get(child.memberKey);
      if (!parent) continue;
      for (const [prop, childVal] of Object.entries(child.properties)) {
        const parentVal = parent.properties[prop];
        if (JSON.stringify(childVal) !== JSON.stringify(parentVal)) {
          overriddenProperties.push({ memberKey: child.memberKey, propertyName: prop, baseValue: parentVal, extendedValue: childVal });
        }
      }
    }

    extensions.push({
      dimensionType: dim.dimensionType,
      baseDimensionName: parentDim.dimensionName,
      extendedDimensionName: dim.dimensionName,
      cubeType: dim.dimensionType,
      localMembers,
      inheritedMembers,
      overriddenProperties
    });
  }

  return extensions;
}

function calculateMemberVisibility(
  dimensions: DimensionRecord[],
  members: DimensionMemberRecord[],
  cubeTypes: CubeTypeDefinition[]
): MemberVisibilityRule[] {
  const rules: MemberVisibilityRule[] = [];

  for (const dim of dimensions) {
    const dimMembers = members.filter(m => m.dimensionId === dim.id);
    const isExtension = !!dim.inheritedDimension;

    let parentMemberKeys = new Set<string>();
    if (isExtension) {
      const parentDim = dimensions.find(d =>
        d.dimensionName === dim.inheritedDimension || d.dimensionType === dim.inheritedDimension
      );
      if (parentDim) {
        parentMemberKeys = new Set(members.filter(m => m.dimensionId === parentDim.id).map(m => m.memberKey));
      }
    }

    for (const member of dimMembers) {
      const isLocal = !parentMemberKeys.has(member.memberKey);
      rules.push({
        dimensionType: dim.dimensionType,
        memberKey: member.memberKey,
        cubeType: dim.dimensionType,
        isVisible: true,
        isLocal,
        reason: isLocal ? 'Local member defined in this cube type' : 'Inherited from base dimension'
      });
    }
  }

  return rules;
}
