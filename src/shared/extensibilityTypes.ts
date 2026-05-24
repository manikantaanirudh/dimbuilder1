export type CubeType = 'base' | 'consol' | 'rates' | 'adj' | 'custom';

export interface ExtensibleDimensionModel {
  projectId: string;
  cubeTypes: CubeTypeDefinition[];
  dimensionExtensions: DimensionExtension[];
  memberVisibility: MemberVisibilityRule[];
}

export interface CubeTypeDefinition {
  name: string;
  cubeType: CubeType;
  description: string;
  basedOn: string | null;
  depth: number;
}

export interface DimensionExtension {
  dimensionType: string;
  baseDimensionName: string;
  extendedDimensionName: string;
  cubeType: string;
  localMembers: string[];
  inheritedMembers: string[];
  overriddenProperties: Array<{
    memberKey: string;
    propertyName: string;
    baseValue: unknown;
    extendedValue: unknown;
  }>;
}

export interface MemberVisibilityRule {
  dimensionType: string;
  memberKey: string;
  cubeType: string;
  isVisible: boolean;
  isLocal: boolean;
  reason: string;
}

export interface ExtensibilityAntiPattern {
  type: 'deep_inheritance' | 'orphaned_extension' | 'excessive_overrides' | 'circular_reference' | 'shadow_member';
  severity: 'error' | 'warning' | 'info';
  dimensionType: string;
  description: string;
  affectedMembers: string[];
  recommendation: string;
}

export interface WhatIfExtensionInput {
  dimensionType: string;
  cubeType: string;
  addMembers?: string[];
  removeMembers?: string[];
  overrideProperties?: Array<{ memberKey: string; propertyName: string; value: unknown }>;
}

export interface WhatIfExtensionResult {
  input: WhatIfExtensionInput;
  impact: {
    affectedCubeTypes: string[];
    memberCountChange: number;
    inheritanceDepthChange: number;
    newAntiPatterns: ExtensibilityAntiPattern[];
  };
  recommendations: string[];
}

export interface ExtensibilityDocumentation {
  projectId: string;
  generatedAt: string;
  cubeTypes: CubeTypeDefinition[];
  dimensions: Array<{
    dimensionType: string;
    baseMembers: string[];
    extensionsByCubeType: Record<string, { localMembers: string[]; overrides: string[] }>;
  }>;
  antiPatterns: ExtensibilityAntiPattern[];
}
