export type SyncStatus = "in_sync" | "local_ahead" | "remote_ahead" | "diverged" | "unknown";

export interface PromotionStage {
  environmentId: string;
  order: number;
  name: string;
  requiresApproval: boolean;
}

export interface PromotionPipeline {
  id: string;
  name: string;
  stages: PromotionStage[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentSyncStatus {
  id: string;
  environmentId: string;
  projectId: string;
  dimensionType: string;
  lastDeployedAt: string | null;
  localVersionHash: string;
  syncStatus: SyncStatus;
  checkedAt: string;
}

export interface EnvironmentOverride {
  id: string;
  environmentId: string;
  projectId: string;
  dimensionType: string;
  memberKey: string;
  propertyName: string;
  overrideValue: string;
  reason: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionRecord {
  id: string;
  pipelineId: string;
  projectId: string;
  fromEnvironmentId: string;
  toEnvironmentId: string;
  deploymentId: string | null;
  status: "pending" | "in_progress" | "success" | "failed";
  promotedBy: string;
  promotedAt: string;
}
