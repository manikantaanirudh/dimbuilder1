export type ConnectorType = "sap" | "oracle" | "sql" | "csv" | "rest";
export type SyncStatus = "running" | "success" | "failed" | "partial";
export type ConflictResolution = "source_wins" | "target_wins" | "skip" | "manual";

export interface ConnectorDefinition {
  id: string;
  name: string;
  connectorType: ConnectorType;
  connectionConfig: Record<string, unknown>;
  extractionConfig: Record<string, unknown>;
  isActive: boolean;
  lastTestedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorCreateRequest {
  name: string;
  connectorType: ConnectorType;
  connectionConfig: Record<string, unknown>;
  extractionConfig: Record<string, unknown>;
}

export interface MappingRule {
  id: string;
  connectorId: string;
  name: string;
  sourceEntity: string;
  targetDimensionType: string;
  fieldMappings: FieldMapping[];
  hierarchyRules: HierarchyRule | null;
  filterRules: FilterRule[];
  conflictResolution: ConflictResolution;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FieldMapping {
  source: string;
  target: string;
  transform?: string;
}

export interface HierarchyRule {
  parentField: string;
  parentTransform?: string;
  rootParent: string;
}

export interface FilterRule {
  field: string;
  operator: "in" | "not_in" | "equals" | "not_equals" | "starts_with" | "contains";
  values: string[];
}

export interface MappingRuleCreateRequest {
  connectorId: string;
  name: string;
  sourceEntity: string;
  targetDimensionType: string;
  fieldMappings: FieldMapping[];
  hierarchyRules?: HierarchyRule;
  filterRules?: FilterRule[];
  conflictResolution?: ConflictResolution;
}

export interface SyncJob {
  id: string;
  connectorId: string;
  mappingRuleId: string;
  projectId: string;
  scheduleCron: string | null;
  autoApprove: boolean;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncRun {
  id: string;
  jobId: string;
  status: SyncStatus;
  sourceRecordsRead: number;
  membersCreated: number;
  membersUpdated: number;
  membersDeleted: number;
  relationshipsCreated: number;
  relationshipsUpdated: number;
  conflictsDetected: number;
  conflictsResolved: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface MemberSourceRecord {
  id: string;
  projectId: string;
  dimensionType: string;
  memberKey: string;
  sourceSystem: string;
  sourceId: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncPreviewResult {
  membersToCreate: number;
  membersToUpdate: number;
  membersToDelete: number;
  relationshipsToCreate: number;
  conflicts: { memberKey: string; reason: string }[];
  sampleRecords: Record<string, unknown>[];
}
