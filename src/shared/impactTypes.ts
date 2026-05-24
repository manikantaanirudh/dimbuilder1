export type ImpactAnalysisType = "delete" | "move" | "restructure" | "whatIf";
export type ImpactSeverity = "high" | "medium" | "low" | "none";

export interface ImpactScope {
  dimensionType: string;
  memberKeys: string[];
  action: ImpactAnalysisType;
  targetParent?: string;
}

export interface HierarchyImpact {
  consolidationPathsChanged: number;
  orphanedMembers: string[];
  newParentPaths: { member: string; oldPath: string; newPath: string }[];
  depthChange: number;
}

export interface CrossDimensionImpact {
  referencesFound: { dimensionType: string; dimensionName: string; memberKeys: string[] }[];
  totalReferences: number;
}

export interface DataImpact {
  hasData: boolean;
  estimatedCellCount: number;
  affectedCubeTypes: string[];
  warning: string;
}

export interface SecurityImpact {
  accessGroupChanges: { member: string; currentGroup: string; newGroup: string }[];
  usersAffected: number;
}

export interface ImpactReport {
  severity: ImpactSeverity;
  summary: string;
  hierarchyImpact: HierarchyImpact;
  crossDimensionImpact: CrossDimensionImpact;
  dataImpact: DataImpact;
  securityImpact: SecurityImpact;
  recommendations: string[];
}

export interface ImpactAnalysisRecord {
  id: string;
  projectId: string;
  changeSetId: string | null;
  analysisType: ImpactAnalysisType;
  scope: ImpactScope;
  environmentId: string | null;
  results: ImpactReport;
  severity: ImpactSeverity;
  summary: string;
  createdBy: string;
  createdAt: string;
}

export interface ImpactAnalysisRequest {
  type: ImpactAnalysisType;
  scope: ImpactScope;
  environmentId?: string;
  changeSetId?: string;
}
