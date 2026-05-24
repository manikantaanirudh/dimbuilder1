export type CrossDimensionMappingType = 'reference' | 'mirror' | 'lookup' | 'default_value';
export type CrossDimensionRuleType = 'member_exists' | 'property_maps' | 'hierarchy_mirrors';

export interface CrossDimensionRule {
  id: string;
  projectId: string;
  name: string;
  sourceDimensionType: string;
  targetDimensionType: string;
  ruleType: CrossDimensionRuleType;
  ruleConfig: Record<string, unknown>;
  severity: 'error' | 'warning' | 'info';
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

export interface CrossDimensionMapping {
  id: string;
  projectId: string;
  sourceDimensionType: string;
  sourceMemberKey: string;
  targetDimensionType: string;
  targetMemberKey: string;
  mappingType: CrossDimensionMappingType;
  createdAt: string;
}

export interface DimensionNode {
  dimensionType: string;
  dimensionName: string;
  memberCount: number;
  hasInheritance: boolean;
}

export interface DimensionEdge {
  source: string;
  target: string;
  edgeType: 'inheritance' | 'property_ref' | 'rule';
  referenceCount: number;
  label?: string;
}

export interface DimensionRelationshipMap {
  nodes: DimensionNode[];
  edges: DimensionEdge[];
}

export interface WhereUsedReference {
  dimensionType: string;
  dimensionId: string;
  memberKey: string;
  propertyName: string;
  context: string;
}

export interface WhereUsedResult {
  memberKey: string;
  dimensionType: string;
  references: WhereUsedReference[];
  totalReferences: number;
}

export interface InheritanceChain {
  dimensionType: string;
  dimensionName: string;
  inheritsFrom: string;
  depth: number;
}

export interface CrossDimViolation {
  sourceMemberKey: string;
  targetDimensionType: string;
  message: string;
}

export interface CrossDimRuleResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  violations: CrossDimViolation[];
}

export interface CrossDimValidationResult {
  rules: CrossDimRuleResult[];
  totalViolations: number;
  totalRules: number;
}
