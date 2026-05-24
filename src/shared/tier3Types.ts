// Feature 13: Excel Add-In types
export interface ExcelSessionInfo {
  projectId: string;
  dimensionId: string;
  userId: string;
  connectedAt: string;
  lastSyncAt: string | null;
}

export interface ExcelPublishPayload {
  projectId: string;
  dimensionId: string;
  members: Array<{ memberKey: string; description: string; properties: Record<string, unknown> }>;
  relationships: Array<{ parentKey: string; childKey: string; aggregationWeight?: number }>;
}

export interface ExcelPublishResult {
  membersCreated: number;
  membersUpdated: number;
  relationshipsCreated: number;
  relationshipsUpdated: number;
  validationIssues: Array<{ memberKey: string; severity: string; message: string }>;
}

export interface ExcelDownloadResult {
  dimensionType: string;
  dimensionName: string;
  members: Array<{ memberKey: string; description: string; properties: Record<string, unknown> }>;
  relationships: Array<{ parentKey: string; childKey: string; aggregationWeight: number | null }>;
  validationRules: Array<{ field: string; rule: string; message: string }>;
}

// Feature 14: Conflict Resolution types
export interface EditLock {
  id: string;
  projectId: string;
  dimensionId: string;
  userId: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface ConflictDetectionResult {
  hasConflicts: boolean;
  conflicts: MemberConflict[];
  autoMerged: string[];
}

export interface MemberConflict {
  memberKey: string;
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  baseValue: unknown;
}

export interface ConflictResolution {
  memberKey: string;
  field: string;
  resolvedValue: unknown;
  resolution: 'keep_local' | 'keep_remote' | 'manual';
}

// Feature 15: Scheduled Jobs types
export type JobTriggerType = 'cron' | 'event' | 'webhook';
export type JobStatus = 'active' | 'paused' | 'completed' | 'failed';
export type JobExecutionStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface ScheduledJob {
  id: string;
  projectId: string;
  name: string;
  triggerType: JobTriggerType;
  triggerConfig: Record<string, unknown>;
  actionType: string;
  actionConfig: Record<string, unknown>;
  status: JobStatus;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobExecution {
  id: string;
  jobId: string;
  status: JobExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
}

export interface WebhookConfig {
  id: string;
  projectId: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

// Feature 16: Data Quality Scoring types
export interface QualityRule {
  id: string;
  projectId: string;
  name: string;
  category: 'completeness' | 'naming' | 'structure' | 'consistency' | 'custom';
  weight: number;
  config: Record<string, unknown>;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

export interface MemberQualityScore {
  memberKey: string;
  dimensionType: string;
  overallScore: number;
  breakdown: Array<{ rule: string; score: number; maxScore: number; details?: string }>;
}

export interface DimensionQualityScore {
  dimensionType: string;
  dimensionName: string;
  overallScore: number;
  memberCount: number;
  avgMemberScore: number;
  lowestScoreMembers: Array<{ memberKey: string; score: number }>;
  ruleScores: Array<{ ruleName: string; score: number }>;
}

export interface QualityGate {
  id: string;
  projectId: string;
  name: string;
  threshold: number;
  scope: 'project' | 'dimension' | 'member';
  action: 'block_deploy' | 'warn' | 'notify';
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

export interface QualityGateEvaluation {
  gate: QualityGate;
  passed: boolean;
  currentScore: number;
  threshold: number;
  blockedItems: string[];
}

// Feature 17: Migration Assistant types
export type MigrationSourceType = 'hyperion_hfm' | 'hyperion_planning' | 'sap_bpc' | 'csv_generic';

export interface MigrationProject {
  id: string;
  projectId: string;
  name: string;
  sourceType: MigrationSourceType;
  status: 'draft' | 'mapping' | 'validating' | 'migrating' | 'completed' | 'failed';
  sourceConfig: Record<string, unknown>;
  progress: MigrationProgress;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MigrationProgress {
  totalDimensions: number;
  completedDimensions: number;
  totalMembers: number;
  mappedMembers: number;
  unmappedMembers: number;
  gapCount: number;
}

export interface MigrationMapping {
  id: string;
  migrationId: string;
  sourceDimensionType: string;
  sourceMemberKey: string;
  targetDimensionType: string;
  targetMemberKey: string;
  status: 'mapped' | 'unmapped' | 'skipped';
  notes: string;
}

export interface MigrationGap {
  dimensionType: string;
  memberKey: string;
  gapType: 'unmapped_member' | 'missing_property' | 'structure_mismatch';
  description: string;
  recommendation: string;
}

// Feature 18: API & Extensibility types
export interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  permissions: string[];
  rateLimitPerMinute: number;
  userId: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface WebhookSubscription {
  id: string;
  projectId: string;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  failureCount: number;
  createdBy: string;
  createdAt: string;
}

export interface PluginDefinition {
  id: string;
  name: string;
  pluginType: 'validator' | 'transformer' | 'notifier' | 'importer';
  entryPoint: string;
  config: Record<string, unknown>;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

// Feature 19: Offline Mode types
export interface SyncQueueEntry {
  id: string;
  projectId: string;
  operationType: 'create' | 'update' | 'delete';
  entityType: 'member' | 'relationship' | 'dimension';
  entityId: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'synced' | 'conflict' | 'failed';
  createdAt: string;
  syncedAt: string | null;
}

export interface SyncStatus {
  isOnline: boolean;
  pendingChanges: number;
  lastSyncAt: string | null;
  conflicts: number;
}

// Feature 20: Documentation Auto-Generation types
export type DocFormat = 'json' | 'html' | 'markdown';

export interface DocTemplate {
  id: string;
  name: string;
  format: DocFormat;
  sections: string[];
  branding: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

export interface GeneratedDocument {
  id: string;
  projectId: string;
  templateId: string | null;
  title: string;
  format: DocFormat;
  content: string;
  snapshotId: string | null;
  generatedBy: string;
  generatedAt: string;
}

export interface DocSection {
  title: string;
  type: 'hierarchy_diagram' | 'property_summary' | 'validation_results' | 'change_log' | 'member_list' | 'statistics';
  content: string;
}
