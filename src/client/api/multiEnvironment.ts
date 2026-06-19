import type {
  EnvironmentOverride,
  EnvironmentSyncStatus,
  PromotionPipeline,
  PromotionRecord,
  PromotionStage
} from "@shared/multiEnvTypes";
import { apiDelete, apiGet, apiPatchJson, apiPost } from "./core";

export interface SyncStatusSummary {
  environmentId: string;
  environmentName: string;
  statuses: EnvironmentSyncStatus[];
  totalDimTypes: number;
  inSync: number;
  localAhead: number;
  remoteAhead: number;
  diverged: number;
  unknown: number;
}

export function fetchPipelines() {
  return apiGet<PromotionPipeline[]>("/environments/pipelines");
}

export function createPipeline(body: { name: string; stages: PromotionStage[] }) {
  return apiPost<PromotionPipeline>("/environments/pipelines", body);
}

export function updatePipeline(id: string, body: { name?: string; stages?: PromotionStage[]; isActive?: boolean }) {
  return apiPatchJson<PromotionPipeline>(`/environments/pipelines/${id}`, body);
}

export function deletePipeline(id: string) {
  return apiDelete(`/environments/pipelines/${id}`);
}

export function promotePipeline(pipelineId: string, body: { projectId: string; fromStageIndex: number; toStageIndex: number }) {
  return apiPost<PromotionRecord>(`/environments/pipelines/${pipelineId}/promote`, body);
}

export function fetchSyncStatusSummary(projectId: string) {
  return apiGet<SyncStatusSummary[]>(`/environments/projects/${projectId}/sync-status`);
}

export function refreshProjectSyncStatus(projectId: string, environmentId?: string) {
  return apiPost<EnvironmentSyncStatus[]>("/environments/sync-status/refresh", { projectId, environmentId });
}

export function fetchEnvOverrides(params?: { environmentId?: string; projectId?: string }) {
  const query = new URLSearchParams();
  if (params?.environmentId) query.set("environmentId", params.environmentId);
  if (params?.projectId) query.set("projectId", params.projectId);
  const qs = query.toString();
  return apiGet<EnvironmentOverride[]>(`/environments/env-overrides${qs ? `?${qs}` : ""}`);
}

export function createEnvOverride(body: {
  environmentId: string;
  projectId: string;
  dimensionType: string;
  memberKey: string;
  propertyName: string;
  overrideValue: string;
  reason?: string;
}) {
  return apiPost<EnvironmentOverride>("/environments/env-overrides", body);
}

export function updateEnvOverride(id: string, body: { overrideValue?: string; reason?: string }) {
  return apiPatchJson<EnvironmentOverride>(`/environments/env-overrides/${id}`, body);
}

export function deleteEnvOverride(id: string) {
  return apiDelete(`/environments/env-overrides/${id}`);
}
