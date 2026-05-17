export type DimensionType =
  | "Scenario"
  | "Entity"
  | "Account"
  | "Flow"
  | "UD1"
  | "UD2"
  | "UD3"
  | "UD4"
  | "UD5"
  | "UD6"
  | "UD7"
  | "UD8";

export type Severity = "error" | "warning" | "info";
export type FieldKind = "text" | "boolean" | "number" | "dropdown" | "formula";

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  sourceFileName: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DimensionRecord {
  id: string;
  projectId: string;
  sheetName: string;
  dimensionType: DimensionType;
  dimensionName: string;
  description: string;
  accessGroup: string;
  maintenanceGroup: string;
  inheritedDimension: string;
  sortOrder: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DimensionMemberRecord {
  id: string;
  dimensionId: string;
  memberKey: string;
  description: string;
  properties: Record<string, unknown>;
  rowOrder: number;
  sourceRowNumber: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DimensionRelationshipRecord {
  id: string;
  dimensionId: string;
  parentKey: string;
  childKey: string;
  aggregationWeight: number | null;
  percentConsol: number | null;
  percentOwnership: number | null;
  ownershipType: string;
  properties: Record<string, unknown>;
  rowOrder: number;
  sourceRowNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface FieldDefinition {
  name: string;
  kind: FieldKind;
  required?: boolean;
  generated?: boolean;
  aliases?: string[];
}

export interface DimensionSchema {
  dimensionType: DimensionType;
  sheetNames: string[];
  memberKeyField: string;
  memberFields: FieldDefinition[];
  relationshipFields: FieldDefinition[];
  booleanFields: string[];
  numericFields: string[];
  requiredFields: string[];
  duplicateSeverity: Severity;
}

export interface MetadataDimensionReference {
  type: DimensionType;
  name: string;
  description?: string;
  accessGroup?: string;
  maintenanceGroup?: string;
  inheritedDim?: string | null;
  dimMemberSourceType?: string;
  dimMemberSourcePath?: string;
  dimMemberSourceNVPairs?: string;
  memberCount?: number;
  relationshipCount?: number;
}

export interface MetadataReference {
  version?: string;
  dimensions: MetadataDimensionReference[];
}

export interface ParsedProject {
  project: ProjectRecord;
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
  importSummary: ImportSummary;
}

export interface ImportSummary {
  sheetsDetected: number;
  dimensionsImported: number;
  membersImported: number;
  relationshipsImported: number;
  skippedBlankRows: number;
  warnings: string[];
  errors: string[];
}

export interface ValidationIssue {
  id: string;
  projectId: string;
  dimensionId: string;
  entityType: "dimension" | "member" | "relationship";
  entityId: string;
  severity: Severity;
  code: string;
  message: string;
  fieldName: string;
  rowNumber: number | null;
  createdAt: string;
}

export interface DashboardSummary {
  totalDimensions: number;
  totalMembers: number;
  totalRelationships: number;
  validationErrors: number;
  validationWarnings: number;
  recentDimensions: DimensionRecord[];
}
