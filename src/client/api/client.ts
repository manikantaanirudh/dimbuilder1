import type {
  BulkUpdateJobDetail,
  BulkUpdateJobRecord,
  BulkUpdatePreviewResult,
  BulkUpdateRequest
} from "../../shared/bulkUpdate";
import type {
  DashboardSummary,
  ChangeSetDetail,
  ChangeSetRecord,
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  ExportLoadMode,
  MetadataDiffItemRecord,
  MetadataDiffRunRecord,
  ProjectBaselineRecord,
  ProjectRecord,
  ProjectSnapshotRecord,
  ProjectSnapshotSummaryRecord,
  ReleasePackageMode,
  ReleasePackageRecord,
  SnapshotRestoreSummary,
  VaryingPropertyValueFilters,
  VaryingPropertyValueInput,
  VaryingPropertyValueRecord,
  ValidationIssue
} from "../../shared/types";
import type { ClientAppConfig, OneStreamValidationProfileConfig } from "../../shared/appConfigTypes";
import type { DimensionBlueprintConfig } from "../../shared/appConfigTypes";
import type { HierarchyAnalyticsResult } from "../../shared/hierarchyAnalytics";
import type { GroupedOneStreamPropertyDictionary } from "../../shared/oneStreamPropertyDictionary";
import type { RelationshipOperationPlan } from "../../shared/relationshipOperations";
import type { AuthUser, LoginResponse } from "../../shared/authTypes";

// --- Token Store ---

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string, refresh: string): void {
  accessToken = access;
  refreshToken = refresh;
}

export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  return headers;
}

async function attemptRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    if (!response.ok) { clearTokens(); return false; }
    const data = await response.json() as { accessToken: string };
    accessToken = data.accessToken;
    return true;
  } catch { clearTokens(); return false; }
}

// --- Auth API Functions ---

export interface AuthStatusResponse {
  enabled: boolean;
  strategy: string;
  oidcAuthorizeUrl: string | null;
}

export async function fetchAuthStatus(): Promise<AuthStatusResponse> {
  const response = await fetch("/api/auth/status");
  if (!response.ok) return { enabled: false, strategy: "none", oidcAuthorizeUrl: null };
  return response.json() as Promise<AuthStatusResponse>;
}

export async function apiLogin(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json() as LoginResponse;
  setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function apiLogout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", headers: authHeaders() });
  clearTokens();
}

export async function apiGetMe(): Promise<AuthUser | null> {
  if (!accessToken) return null;
  try {
    return await apiGet<AuthUser>("/auth/me");
  } catch { return null; }
}

export async function apiRegister(email: string, password: string, displayName: string): Promise<AuthUser> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<AuthUser>;
}

// --- Core API Functions ---

export interface GridResponse<T> {
  rows: T[];
  total: number;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`, { headers: authHeaders() });
  if (response.status === 401 && accessToken) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      const retryResponse = await fetch(`/api${path}`, { headers: authHeaders() });
      if (!retryResponse.ok) throw new Error(await retryResponse.text());
      return retryResponse.json() as Promise<T>;
    }
  }
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiText(path: string): Promise<string> {
  const response = await fetch(`/api${path}`, { headers: authHeaders() });
  if (response.status === 401 && accessToken) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      const retryResponse = await fetch(`/api${path}`, { headers: authHeaders() });
      if (!retryResponse.ok) throw new Error(await retryResponse.text());
      return retryResponse.text();
    }
  }
  if (!response.ok) throw new Error(await response.text());
  return response.text();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const contentHeaders = body instanceof FormData
    ? authHeaders()
    : { ...authHeaders(), "Content-Type": "application/json" };
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: contentHeaders,
    body: body instanceof FormData ? body : JSON.stringify(body ?? {})
  });
  if (response.status === 401 && accessToken) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      const retryHeaders = body instanceof FormData
        ? authHeaders()
        : { ...authHeaders(), "Content-Type": "application/json" };
      const retryResponse = await fetch(`/api${path}`, {
        method: "POST",
        headers: retryHeaders,
        body: body instanceof FormData ? body : JSON.stringify(body ?? {})
      });
      if (!retryResponse.ok) throw new Error(await retryResponse.text());
      return retryResponse.json() as Promise<T>;
    }
  }
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPatch(path: string, body: unknown): Promise<void> {
  const response = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (response.status === 401 && accessToken) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      const retryResponse = await fetch(`/api${path}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!retryResponse.ok) throw new Error(await retryResponse.text());
      return;
    }
  }
  if (!response.ok) throw new Error(await response.text());
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (response.status === 401 && accessToken) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      const retryResponse = await fetch(`/api${path}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!retryResponse.ok) throw new Error(await retryResponse.text());
      return retryResponse.json() as Promise<T>;
    }
  }
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPatchJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (response.status === 401 && accessToken) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      const retryResponse = await fetch(`/api${path}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!retryResponse.ok) throw new Error(await retryResponse.text());
      return retryResponse.json() as Promise<T>;
    }
  }
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(`/api${path}`, { method: "DELETE", headers: authHeaders() });
  if (response.status === 401 && accessToken) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      const retryResponse = await fetch(`/api${path}`, { method: "DELETE", headers: authHeaders() });
      if (!retryResponse.ok) throw new Error(await retryResponse.text());
      return;
    }
  }
  if (!response.ok) throw new Error(await response.text());
}

export function fetchProjects() {
  return apiGet<ProjectRecord[]>("/projects");
}

export function createProject(body: { name: string; description: string }) {
  return apiPost<ProjectRecord>("/projects", body);
}

export function deleteProject(projectId: string) {
  return apiDelete(`/projects/${projectId}`);
}

export function renameProject(projectId: string, body: { name?: string; description?: string }) {
  return apiPatchJson<ProjectRecord>(`/projects/${projectId}`, body);
}

export function fetchAppConfig() {
  return apiGet<ClientAppConfig>("/config");
}

export function fetchOneStreamPropertyDictionary(version?: string) {
  return apiGet<GroupedOneStreamPropertyDictionary>(version ? `/schema/onestream/${version}` : "/schema/onestream");
}

export function fetchBlueprints() {
  return apiGet<{
    enabled: boolean;
    allowConfigWrite: boolean;
    dimensionTypes: string[];
    blueprints: Partial<Record<string, DimensionBlueprintConfig>>;
  }>("/blueprints");
}

export function validateBlueprintDraft(dimensionType: string, draft: unknown) {
  return apiPost<{ valid: boolean; blueprint: DimensionBlueprintConfig | null; errors: string[] }>("/blueprints/validate", { dimensionType, draft });
}

export function generateBlueprintYaml(dimensionType: string, draft: unknown) {
  return apiPost<{ dimensionType: string; blueprint: DimensionBlueprintConfig; yaml: string }>("/blueprints/yaml", { dimensionType, draft });
}

export function generateBlueprintFromDimension(projectId: string, dimensionId: string) {
  return apiPost<{ dimensionType: string; blueprint: DimensionBlueprintConfig; yaml: string }>(`/projects/${projectId}/dimensions/${dimensionId}/blueprint`);
}

export function fetchSummary(projectId: string) {
  return apiGet<DashboardSummary>(`/projects/${projectId}/summary`);
}

export function fetchDimensions(projectId: string) {
  return apiGet<DimensionRecord[]>(`/projects/${projectId}/dimensions`);
}

export function fetchIssues(projectId: string) {
  return apiGet<ValidationIssue[]>(`/projects/${projectId}/issues`);
}

export function fetchMembers(projectId: string, dimensionId: string, offset = 0, limit = 300, ids?: string[]) {
  if (ids && ids.length > 0) {
    return apiGet<GridResponse<DimensionMemberRecord>>(`/projects/${projectId}/dimensions/${dimensionId}/members?ids=${ids.join(",")}`);
  }
  return apiGet<GridResponse<DimensionMemberRecord>>(`/projects/${projectId}/dimensions/${dimensionId}/members?offset=${offset}&limit=${limit}`);
}

export function fetchRelationships(projectId: string, dimensionId: string, offset = 0, limit = 300, ids?: string[]) {
  if (ids && ids.length > 0) {
    return apiGet<GridResponse<DimensionRelationshipRecord>>(`/projects/${projectId}/dimensions/${dimensionId}/relationships?ids=${ids.join(",")}`);
  }
  return apiGet<GridResponse<DimensionRelationshipRecord>>(`/projects/${projectId}/dimensions/${dimensionId}/relationships?offset=${offset}&limit=${limit}`);
}

export function fetchHierarchyAnalytics(projectId: string, dimensionId: string) {
  return apiGet<HierarchyAnalyticsResult>(`/projects/${projectId}/dimensions/${dimensionId}/hierarchy/analytics`);
}

export function hierarchyLevelizedCsvUrl(projectId: string, dimensionId: string) {
  return `/api/projects/${projectId}/dimensions/${dimensionId}/hierarchy/levelized.csv`;
}

export function hierarchyPathsCsvUrl(projectId: string, dimensionId: string) {
  return `/api/projects/${projectId}/dimensions/${dimensionId}/hierarchy/paths.csv`;
}

export function hierarchyParentChildCsvUrl(projectId: string, dimensionId: string) {
  return `/api/projects/${projectId}/dimensions/${dimensionId}/hierarchy/parent-child.csv`;
}

export function hierarchySharedMembersCsvUrl(projectId: string, dimensionId: string) {
  return `/api/projects/${projectId}/dimensions/${dimensionId}/hierarchy/shared-members.csv`;
}

export function hierarchyOrphansCsvUrl(projectId: string, dimensionId: string) {
  return `/api/projects/${projectId}/dimensions/${dimensionId}/hierarchy/orphans.csv`;
}

export function fetchVaryingPropertyValues(projectId: string, filters: VaryingPropertyValueFilters = {}) {
  const params = new URLSearchParams();
  if (filters.dimensionId) params.set("dimensionId", filters.dimensionId);
  if (filters.targetType) params.set("targetType", filters.targetType);
  if (filters.targetId) params.set("targetId", filters.targetId);
  if (filters.propertyName) params.set("propertyName", filters.propertyName);
  const suffix = params.toString() ? `?${params}` : "";
  return apiGet<VaryingPropertyValueRecord[]>(`/projects/${projectId}/varying-properties${suffix}`);
}

export function fetchProjectBaselines(projectId: string) {
  return apiGet<ProjectBaselineRecord[]>(`/projects/${projectId}/baselines`);
}

export function createProjectBaseline(projectId: string, body: { name: string; sourceType?: "xml" | "snapshot" | "json" | "manual"; sourceFileName?: string; baseline?: unknown; xml?: string; xmlContent?: string }) {
  return apiPost<ProjectBaselineRecord>(`/projects/${projectId}/baselines`, body);
}

export function fetchProjectBaseline(projectId: string, baselineId: string) {
  return apiGet<ProjectBaselineRecord>(`/projects/${projectId}/baselines/${baselineId}`);
}

export function fetchProjectSnapshots(projectId: string) {
  return apiGet<ProjectSnapshotSummaryRecord[]>(`/projects/${projectId}/snapshots`);
}

export function createProjectSnapshot(projectId: string, body: { name?: string; description?: string } = {}) {
  return apiPost<{ id: string; name: string }>(`/projects/${projectId}/snapshots`, body);
}

export function fetchProjectSnapshot(projectId: string, snapshotId: string) {
  return apiGet<ProjectSnapshotRecord>(`/projects/${projectId}/snapshots/${snapshotId}`);
}

export function restoreProjectSnapshot(projectId: string, snapshotId: string, body: { restoreValidationIssues?: boolean } = {}) {
  return apiPost<SnapshotRestoreSummary>(`/projects/${projectId}/snapshots/${snapshotId}/restore`, body);
}

export function branchProjectSnapshot(projectId: string, snapshotId: string, body: { name: string; description?: string }) {
  return apiPost<{ project: ProjectRecord; summary: SnapshotRestoreSummary }>(`/projects/${projectId}/snapshots/${snapshotId}/branch`, body);
}

export function runProjectDiff(projectId: string, body: { baselineId: string; options?: Record<string, unknown> }) {
  return apiPost<MetadataDiffRunRecord>(`/projects/${projectId}/diff`, body);
}

export function fetchMetadataDiffRun(projectId: string, diffRunId: string) {
  return apiGet<MetadataDiffRunRecord>(`/projects/${projectId}/diff/${diffRunId}`);
}

export function fetchMetadataDiffItems(projectId: string, diffRunId: string) {
  return apiGet<MetadataDiffItemRecord[]>(`/projects/${projectId}/diff/${diffRunId}/items`);
}

export function planRelationshipExport(projectId: string, body: { baselineId?: string; mode: ExportLoadMode; dimensionId?: string }) {
  return apiPost<RelationshipOperationPlan>(`/projects/${projectId}/relationship-plan`, body);
}

export function previewBulkUpdate(projectId: string, body: BulkUpdateRequest) {
  return apiPost<BulkUpdatePreviewResult>(`/projects/${projectId}/bulk-updates/preview`, body);
}

export function applyBulkUpdate(projectId: string, body: BulkUpdateRequest) {
  return apiPost<BulkUpdateJobDetail>(`/projects/${projectId}/bulk-updates/apply`, body);
}

export function fetchBulkUpdateJobs(projectId: string) {
  return apiGet<BulkUpdateJobRecord[]>(`/projects/${projectId}/bulk-updates`);
}

export function fetchBulkUpdateJob(projectId: string, jobId: string) {
  return apiGet<BulkUpdateJobDetail>(`/projects/${projectId}/bulk-updates/${jobId}`);
}

export function fetchChangeSets(projectId: string) {
  return apiGet<ChangeSetRecord[]>(`/projects/${projectId}/change-sets`);
}

export function createChangeSet(projectId: string, body: { diffRunId?: string; selectedItemIds?: string[]; name: string; description?: string; targetEnvironment?: string }) {
  return apiPost<ChangeSetDetail>(`/projects/${projectId}/change-sets`, body);
}

export function fetchChangeSet(projectId: string, changeSetId: string) {
  return apiGet<ChangeSetDetail>(`/projects/${projectId}/change-sets/${changeSetId}`);
}

export function patchChangeSet(projectId: string, changeSetId: string, body: Partial<ChangeSetRecord>) {
  return apiPatchJson<ChangeSetDetail>(`/projects/${projectId}/change-sets/${changeSetId}`, body);
}

export function validateChangeSet(projectId: string, changeSetId: string) {
  return apiPost<ChangeSetDetail & { validationSummary: Record<string, unknown> }>(`/projects/${projectId}/change-sets/${changeSetId}/validate`);
}

export function approveChangeSet(projectId: string, changeSetId: string, body: { comment?: string; bypassValidation?: boolean } = {}) {
  return apiPost<ChangeSetDetail & { validationSummary: Record<string, unknown> }>(`/projects/${projectId}/change-sets/${changeSetId}/approve`, body);
}

export function rejectChangeSet(projectId: string, changeSetId: string, body: { comment?: string } = {}) {
  return apiPost<ChangeSetDetail>(`/projects/${projectId}/change-sets/${changeSetId}/reject`, body);
}

export function packageChangeSet(projectId: string, changeSetId: string, body: { mode?: ReleasePackageMode; packageName?: string } = {}) {
  return apiPost<ChangeSetDetail & { package: ReleasePackageRecord; manifest: Record<string, unknown>; validationSummary: Record<string, unknown> }>(`/projects/${projectId}/change-sets/${changeSetId}/package`, body);
}

export function fetchChangeSetPackage(projectId: string, changeSetId: string) {
  return apiGet<{ changeSet: ChangeSetRecord; package: ReleasePackageRecord; manifest: Record<string, unknown> }>(`/projects/${projectId}/change-sets/${changeSetId}/package`);
}

export async function uploadWorkbook(file: File, projectName: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("projectName", projectName);
  return apiPost<{ project: ProjectRecord; importSummary: Record<string, unknown> }>("/import/workbook", formData);
}

export async function uploadXml(file: File, projectName: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("projectName", projectName);
  return apiPost<{ project: ProjectRecord; importSummary: Record<string, unknown> }>("/import/xml", formData);
}

export function validateProject(
  projectId: string,
  duplicateSeverity = "warning",
  options: { profile?: "default" | "onestream"; options?: Partial<OneStreamValidationProfileConfig> } = {}
) {
  return apiPost<{ issues: ValidationIssue[] }>(`/validation/${projectId}/run`, { duplicateSeverity, ...options });
}

export function patchDimension(projectId: string, dimensionId: string, body: Partial<DimensionRecord>) {
  return apiPatch(`/projects/${projectId}/dimensions/${dimensionId}`, body);
}

export function createMember(projectId: string, dimensionId: string, body: { memberKey: string; properties: Record<string, unknown> }) {
  return apiPost<DimensionMemberRecord>(`/projects/${projectId}/dimensions/${dimensionId}/members`, body);
}

export function patchMember(projectId: string, memberId: string, body: { memberKey: string; properties: Record<string, unknown> }) {
  return apiPatch(`/projects/${projectId}/members/${memberId}`, body);
}

export function deleteMember(projectId: string, memberId: string) {
  return apiDelete(`/projects/${projectId}/members/${memberId}`);
}

export function createRelationship(projectId: string, dimensionId: string, body: { parentKey: string; childKey: string; properties: Record<string, unknown> }) {
  return apiPost<DimensionRelationshipRecord>(`/projects/${projectId}/dimensions/${dimensionId}/relationships`, body);
}

export function patchRelationship(projectId: string, relationshipId: string, body: { parentKey: string; childKey: string; properties: Record<string, unknown> }) {
  return apiPatch(`/projects/${projectId}/relationships/${relationshipId}`, body);
}

export function deleteRelationship(projectId: string, relationshipId: string) {
  return apiDelete(`/projects/${projectId}/relationships/${relationshipId}`);
}

export function createVaryingPropertyValue(projectId: string, body: Omit<VaryingPropertyValueInput, "projectId">) {
  return apiPost<VaryingPropertyValueRecord>(`/projects/${projectId}/varying-properties`, body);
}

export function patchVaryingPropertyValue(projectId: string, valueId: string, body: Partial<VaryingPropertyValueInput>) {
  return apiPatchJson<VaryingPropertyValueRecord>(`/projects/${projectId}/varying-properties/${valueId}`, body);
}

export function deleteVaryingPropertyValue(projectId: string, valueId: string) {
  return apiDelete(`/projects/${projectId}/varying-properties/${valueId}`);
}

export function fetchValidationConfig(projectId: string) {
  return apiGet<{ overrides: Array<{ id: string; ruleCode: string; severity: string; updatedAt: string }> }>(`/projects/${projectId}/validation-config`);
}

export function saveValidationConfig(projectId: string, overrides: Array<{ ruleCode: string; severity: string }>) {
  return apiPost<{ overrides: Array<{ id: string; ruleCode: string; severity: string; updatedAt: string }> }>(`/projects/${projectId}/validation-config`, { overrides });
}

// --- Workflow API ---

import type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowInstanceDetail,
  SubmitWorkflowRequest,
  WorkflowActionRequest,
  WorkflowNotification
} from "../../shared/workflowTypes";

export function fetchWorkflowDefinitions() {
  return apiGet<WorkflowDefinition[]>("/workflows/definitions");
}

export function createWorkflowDefinition(body: { name: string; description?: string; steps: unknown[]; dimensionTypes?: string; autoAdvanceRules?: Record<string, unknown> }) {
  return apiPost<WorkflowDefinition>("/workflows/definitions", body);
}

export function updateWorkflowDefinition(id: string, body: Partial<{ name: string; description: string; steps: unknown[]; dimensionTypes: string; isActive: boolean }>) {
  return apiPatchJson<WorkflowDefinition>(`/workflows/definitions/${id}`, body);
}

export function submitWorkflow(body: SubmitWorkflowRequest) {
  return apiPost<WorkflowInstance>("/workflows/submit", body);
}

export function fetchWorkflowInstances(projectId: string, status?: string) {
  const params = new URLSearchParams({ projectId });
  if (status) params.set("status", status);
  return apiGet<WorkflowInstance[]>(`/workflows/instances?${params.toString()}`);
}

export function fetchWorkflowInstanceDetail(id: string) {
  return apiGet<WorkflowInstanceDetail>(`/workflows/instances/${id}`);
}

export function approveWorkflowStep(instanceId: string, body: WorkflowActionRequest = {}) {
  return apiPost<WorkflowInstanceDetail>(`/workflows/instances/${instanceId}/approve`, body);
}

export function rejectWorkflowInstance(instanceId: string, body: WorkflowActionRequest = {}) {
  return apiPost<WorkflowInstanceDetail>(`/workflows/instances/${instanceId}/reject`, body);
}

export function cancelWorkflowInstance(instanceId: string) {
  return apiPost<WorkflowInstanceDetail>(`/workflows/instances/${instanceId}/cancel`, {});
}

export function fetchMyPendingWorkflows() {
  return apiGet<WorkflowInstance[]>("/workflows/my-pending");
}

export function fetchWorkflowNotifications() {
  return apiGet<WorkflowNotification[]>("/workflows/notifications");
}

export function markNotificationRead(id: string) {
  return apiPatchJson<{ ok: boolean }>(`/workflows/notifications/${id}/read`, {});
}

// --- Environment & Deployment API Functions ---

import type {
  ConnectionTestResult,
  DeploymentRecord,
  DeployRequest,
  EnvironmentSafe,
  CreateEnvironmentInput,
  UpdateEnvironmentInput,
  PullResult
} from "../../shared/environmentTypes";

export function fetchEnvironments() {
  return apiGet<EnvironmentSafe[]>("/environments");
}

export function createEnvironment(body: CreateEnvironmentInput) {
  return apiPost<EnvironmentSafe>("/environments", body);
}

export function updateEnvironment(id: string, body: UpdateEnvironmentInput) {
  return apiPatchJson<EnvironmentSafe>(`/environments/${id}`, body);
}

export function deleteEnvironment(id: string) {
  return apiDelete(`/environments/${id}`);
}

export function testEnvironmentConnection(id: string) {
  return apiPost<ConnectionTestResult>(`/environments/${id}/test-connection`, {});
}

export function pullFromEnvironment(id: string) {
  return apiPost<PullResult>(`/environments/${id}/pull`, {});
}

export function deployToEnvironment(id: string, body: DeployRequest) {
  return apiPost<DeploymentRecord>(`/environments/${id}/deploy`, body);
}

export function fetchDeployments(params: { projectId?: string; environmentId?: string } = {}) {
  const query = new URLSearchParams();
  if (params.projectId) query.set("projectId", params.projectId);
  if (params.environmentId) query.set("environmentId", params.environmentId);
  const qs = query.toString();
  return apiGet<Omit<DeploymentRecord, "xmlPayload" | "dimensionResults">[]>(`/environments/deployments${qs ? `?${qs}` : ""}`);
}

export function fetchDeployment(id: string) {
  return apiGet<DeploymentRecord>(`/environments/deployments/${id}`);
}

// --- Connector API Functions ---

import type {
  ConnectorDefinition,
  ConnectorCreateRequest,
  MappingRule,
  MappingRuleCreateRequest,
  SyncJob,
  SyncRun,
  MemberSourceRecord,
  SyncPreviewResult
} from "../../shared/connectorTypes";

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

export function createSyncJob(body: { connectorId: string; mappingRuleId: string; projectId: string; scheduleCron?: string; autoApprove?: boolean }) {
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
