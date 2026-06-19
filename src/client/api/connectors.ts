import type {
  ConnectorCreateRequest,
  ConnectorDefinition,
  MappingRule,
  MappingRuleCreateRequest,
  MemberSourceRecord,
  SyncJob,
  SyncPreviewResult,
  SyncRun
} from "@shared/connectorTypes";
import { apiDelete, apiGet, apiPatchJson, apiPost } from "./core";

export function fetchConnectors() {
  return apiGet<ConnectorDefinition[]>("/connectors");
}

export function createConnector(body: ConnectorCreateRequest) {
  return apiPost<ConnectorDefinition>("/connectors", body);
}

export function updateConnector(id: string, body: Partial<ConnectorCreateRequest & { isActive: boolean }>) {
  return apiPatchJson<ConnectorDefinition>(`/connectors/${id}`, body);
}

export function deleteConnector(id: string) {
  return apiDelete(`/connectors/${id}`);
}

export function testConnectorConnection(id: string) {
  return apiPost<{ success: boolean; message: string }>(`/connectors/${id}/test`, {});
}

export function previewConnectorExtraction(id: string, mappingRuleId: string) {
  return apiPost<SyncPreviewResult>(`/connectors/${id}/preview`, { mappingRuleId });
}

export function fetchMappingRules(connectorId: string) {
  return apiGet<MappingRule[]>(`/connectors/${connectorId}/mappings`);
}

export function createMappingRule(connectorId: string, body: Omit<MappingRuleCreateRequest, "connectorId">) {
  return apiPost<MappingRule>(`/connectors/${connectorId}/mappings`, body);
}

export function updateMappingRule(id: string, body: Partial<MappingRuleCreateRequest & { isActive: boolean }>) {
  return apiPatchJson<MappingRule>(`/mappings/${id}`, body);
}

export function deleteMappingRule(id: string) {
  return apiDelete(`/mappings/${id}`);
}

export function fetchSyncJobs(params: { connectorId?: string; projectId?: string } = {}) {
  const query = new URLSearchParams();
  if (params.connectorId) query.set("connectorId", params.connectorId);
  if (params.projectId) query.set("projectId", params.projectId);
  const qs = query.toString();
  return apiGet<SyncJob[]>(`/sync-jobs${qs ? `?${qs}` : ""}`);
}

export function createSyncJob(body: {
  connectorId: string;
  mappingRuleId: string;
  projectId: string;
  scheduleCron?: string;
  autoApprove?: boolean;
}) {
  return apiPost<SyncJob>("/sync-jobs", body);
}

export function triggerSyncRun(jobId: string) {
  return apiPost<SyncRun>(`/sync-jobs/${jobId}/run`, {});
}

export function fetchSyncRuns(jobId: string) {
  return apiGet<SyncRun[]>(`/sync-jobs/${jobId}/runs`);
}

export function fetchSyncRun(id: string) {
  return apiGet<SyncRun>(`/sync-runs/${id}`);
}

export function fetchSourceRegistry(projectId: string, dimensionType?: string) {
  const query = dimensionType ? `?dimensionType=${encodeURIComponent(dimensionType)}` : "";
  return apiGet<MemberSourceRecord[]>(`/projects/${projectId}/source-registry${query}`);
}
