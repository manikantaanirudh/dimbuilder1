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

export type Severity = "error" | "warning" | "info" | "off";
export type FieldKind = "text" | "boolean" | "number" | "dropdown" | "formula";
export type VaryingPropertyTargetType = "dimension" | "member" | "relationship";
export type BaselineSourceType = "xml" | "snapshot" | "json" | "manual";
export type MetadataDiffTargetType = "dimension" | "member" | "relationship" | "property";
export type MetadataDiffChangeType = "add" | "update" | "delete" | "move" | "copy" | "unchanged" | "warning";
export type MetadataDiffStatus = "completed" | "failed";
export type ChangeSetStatus = "draft" | "validated" | "approved" | "exported" | "rejected";
export type ChangeSetApprovalAction = "approve" | "reject" | "comment";
export type RelationshipOperationType = "add" | "update" | "delete" | "move" | "copy" | "break" | "rebuild" | "unchanged";
export type ExportLoadMode = "full" | "additive" | "propertyUpdate" | "relationshipDelete" | "moveCopy" | "breakBuild";
export type ReleasePackageMode = ExportLoadMode;

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
  operation?: RelationshipOperationType | "";
  operationSource?: string;
  operationNotes?: string;
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

export interface UnknownXmlElementData {
  name: string;
  attributes: Record<string, string>;
  text?: string;
  sourceOrder: number;
  originalXmlPath?: string;
  sourcePath?: string;
}

export interface UnknownXmlData {
  unknownAttributes: Record<string, string>;
  unknownElements: UnknownXmlElementData[];
  originalXmlPath?: string;
  sourcePath?: string;
  sourceOrder: number;
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
  unknownAttributesPreserved?: number;
  unknownElementsPreserved?: number;
  unknownPropertiesPreserved?: number;
}

export interface ValidationIssue {
  id: string;
  projectId: string;
  dimensionId: string;
  entityType: "dimension" | "member" | "relationship" | "project";
  entityId: string;
  severity: Severity;
  code: string;
  message: string;
  fieldName: string;
  rowNumber: number | null;
  createdAt: string;
}

export interface VaryingPropertyContext {
  cubeType?: string;
  scenarioType?: string;
  timeMember?: string;
}

export interface VaryingPropertyValueRecord {
  id: string;
  projectId: string;
  dimensionId: string;
  targetType: VaryingPropertyTargetType;
  targetId: string;
  propertyName: string;
  value: string;
  cubeType: string;
  scenarioType: string;
  timeMember: string;
  isDefault: boolean;
  revertToDefaultScenarioType: boolean;
  source: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface VaryingPropertyValueInput {
  projectId: string;
  dimensionId: string;
  targetType: VaryingPropertyTargetType;
  targetId: string;
  propertyName: string;
  value: string;
  cubeType?: string;
  scenarioType?: string;
  timeMember?: string;
  isDefault?: boolean;
  revertToDefaultScenarioType?: boolean;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface VaryingPropertyValueFilters {
  dimensionId?: string;
  targetType?: VaryingPropertyTargetType;
  targetId?: string;
  propertyName?: string;
}

export interface DashboardSummary {
  totalDimensions: number;
  totalMembers: number;
  totalRelationships: number;
  validationErrors: number;
  validationWarnings: number;
  recentDimensions: DimensionRecord[];
}

export interface ProjectMetadataState {
  project?: ProjectRecord;
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}

export interface ProjectSnapshotState extends ProjectMetadataState {
  varyingPropertyValues?: VaryingPropertyValueRecord[];
  validationIssues?: ValidationIssue[];
}

export interface ProjectSnapshotRecord {
  id: string;
  projectId: string;
  name: string;
  description: string;
  snapshot: ProjectSnapshotState;
  createdBy: string;
  createdAt: string;
}

export interface ProjectSnapshotSummaryRecord {
  id: string;
  projectId: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
}

export interface SnapshotRestoreSummary {
  mode: "replaceCurrent" | "newProject";
  projectId: string;
  snapshotId: string;
  safetySnapshotId?: string;
  dimensionsRestored: number;
  membersRestored: number;
  relationshipsRestored: number;
  varyingPropertiesRestored: number;
}

export interface MetadataDiffSummary {
  totalItems: number;
  bySeverity: Record<Severity, number>;
  byChangeType: Record<MetadataDiffChangeType, number>;
  members: {
    adds: number;
    updates: number;
    deletes: number;
  };
  relationships: {
    adds: number;
    deletes: number;
    moves: number;
    copies: number;
  };
  properties: {
    updates: number;
  };
  warnings: number;
  errors: number;
}

export interface ProjectBaselineRecord {
  id: string;
  projectId: string;
  name: string;
  sourceType: BaselineSourceType;
  sourceFileName: string;
  baseline: unknown;
  createdBy: string;
  createdAt: string;
}

export interface MetadataDiffRunRecord {
  id: string;
  projectId: string;
  baselineId: string;
  status: MetadataDiffStatus;
  summary: MetadataDiffSummary;
  createdBy: string;
  createdAt: string;
}

export interface MetadataDiffItemRecord {
  id: string;
  diffRunId: string;
  dimensionType: DimensionType;
  dimensionName: string;
  targetType: MetadataDiffTargetType;
  changeType: MetadataDiffChangeType;
  severity: Severity;
  objectKey: string;
  parentKey: string;
  childKey: string;
  propertyName: string;
  oldValue: string;
  newValue: string;
  details: Record<string, unknown>;
}

export interface ChangeSetRecord {
  id: string;
  projectId: string;
  baselineId: string;
  diffRunId: string;
  name: string;
  description: string;
  status: ChangeSetStatus;
  targetEnvironment: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeSetItemRecord {
  id: string;
  changeSetId: string;
  diffItemId: string;
  itemType: MetadataDiffTargetType;
  changeType: MetadataDiffChangeType;
  severity: Severity;
  dimensionType: DimensionType;
  objectKey: string;
  propertyName: string;
  oldValue: string;
  newValue: string;
  details: Record<string, unknown>;
}

export interface ChangeSetApprovalRecord {
  id: string;
  changeSetId: string;
  action: ChangeSetApprovalAction;
  comment: string;
  createdBy: string;
  createdAt: string;
}

export interface ReleasePackageRecord {
  id: string;
  changeSetId: string;
  packageName: string;
  packagePath: string;
  manifest: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

export interface ChangeSetSummary {
  totalItems: number;
  bySeverity: Record<Severity, number>;
  byChangeType: Record<MetadataDiffChangeType, number>;
  warnings: number;
  errors: number;
}

export interface ChangeSetDetail {
  changeSet: ChangeSetRecord;
  items: ChangeSetItemRecord[];
  approvals: ChangeSetApprovalRecord[];
  latestPackage: ReleasePackageRecord | null;
}
