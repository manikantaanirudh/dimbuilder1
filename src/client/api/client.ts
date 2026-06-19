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
import type { MetadataCsvColumnMapping, MetadataCsvInspectResult } from "../../shared/metadataCsvMapping";
import type { HierarchyAnalyticsResult } from "../../shared/hierarchyAnalytics";
import type { GroupedOneStreamPropertyDictionary } from "../../shared/oneStreamPropertyDictionary";
import type { RelationshipOperationPlan } from "../../shared/relationshipOperations";
import type { AuthUser, LoginResponse } from "../../shared/authTypes";
import {
  apiDelete,
  apiDeleteJson,
  apiGet,
  apiPatch,
  apiPatchJson,
  apiPost,
  apiPut,
  apiText,
  authHeaders,
  clearTokens,
  getAccessToken,
  setTokens
} from "./core";
export {
  apiDelete,
  apiDeleteJson,
  apiGet,
  apiPatch,
  apiPatchJson,
  apiPost,
  apiPut,
  apiText,
  clearTokens,
  getAccessToken,
  setTokens
} from "./core";
export * from "./connectors";
export * from "./environments";
export * from "./reports";
export * from "./workflows";

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
  if (!getAccessToken()) return null;
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

export function createDimensionFromBlueprint(
  projectId: string,
  body: { dimensionType: string; dimensionName?: string }
) {
  return apiPost<DimensionRecord>(`/projects/${projectId}/dimensions`, body);
}

export function deleteDimension(projectId: string, dimensionId: string) {
  return apiDeleteJson<{
    dimensionId: string;
    dimensionType: string;
    dimensionName: string;
    membersRemoved: number;
    relationshipsRemoved: number;
  }>(`/projects/${projectId}/dimensions/${dimensionId}`);
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

export interface MetadataCsvPreviewResponse {
  preview: {
    ok: boolean;
    errors: string[];
    warnings: string[];
    counts: {
      rowCount: number;
      dimensionsToCreate: number;
      membersToCreate: number;
      membersToUpdate: number;
      relationshipsToCreate: number;
      relationshipsSkipped: number;
    };
    suggestedProjectName?: string;
  };
}

function appendCsvImportFields(formData: FormData, fields: {
  projectId?: string;
  projectName?: string;
  dimensionType?: string;
  dimensionName?: string;
  defaultAccountType?: string;
  columnMapping?: MetadataCsvColumnMapping;
}) {
  if (fields.projectId) formData.append("projectId", fields.projectId);
  if (fields.projectName) formData.append("projectName", fields.projectName);
  if (fields.dimensionType) formData.append("dimensionType", fields.dimensionType);
  if (fields.dimensionName) formData.append("dimensionName", fields.dimensionName);
  if (fields.defaultAccountType) formData.append("defaultAccountType", fields.defaultAccountType);
  if (fields.columnMapping) {
    formData.append("columnMapping", JSON.stringify(fields.columnMapping));
  }
}

export async function inspectCsvImport(
  file: File,
  fields: { dimensionType?: string } = {}
) {
  const formData = new FormData();
  formData.append("file", file);
  if (fields.dimensionType) formData.append("dimensionType", fields.dimensionType);
  return apiPost<MetadataCsvInspectResult>("/import/csv/inspect", formData);
}

export async function previewCsvImport(
  file: File,
  fields: {
    projectId?: string;
    projectName?: string;
    dimensionType?: string;
    dimensionName?: string;
    defaultAccountType?: string;
    columnMapping?: MetadataCsvColumnMapping;
  } = {}
) {
  const formData = new FormData();
  formData.append("file", file);
  appendCsvImportFields(formData, fields);
  return apiPost<MetadataCsvPreviewResponse>("/import/csv/preview", formData);
}

export async function commitCsvImport(
  file: File,
  fields: {
    projectId?: string;
    projectName?: string;
    dimensionType?: string;
    dimensionName?: string;
    defaultAccountType?: string;
    columnMapping?: MetadataCsvColumnMapping;
  } = {}
) {
  const formData = new FormData();
  formData.append("file", file);
  appendCsvImportFields(formData, fields);
  return apiPost<{ project: ProjectRecord; preview: MetadataCsvPreviewResponse["preview"]; importSummary: Record<string, unknown> }>(
    "/import/csv/commit",
    formData
  );
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

export function bulkDeleteMembers(projectId: string, dimensionId: string, memberIds: string[]) {
  return apiPost<{ membersDeleted: number; relationshipsDeleted: number }>(
    `/projects/${projectId}/dimensions/${dimensionId}/members/bulk-delete`,
    { memberIds }
  );
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

export function bulkDeleteRelationships(projectId: string, dimensionId: string, relationshipIds: string[]) {
  return apiPost<{ relationshipsDeleted: number }>(
    `/projects/${projectId}/dimensions/${dimensionId}/relationships/bulk-delete`,
    { relationshipIds }
  );
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

// --- Impact Analysis API ---

import type { ImpactAnalysisRecord, ImpactAnalysisRequest, ImpactReport } from "../../shared/impactTypes";

export function runImpactAnalysis(projectId: string, request: ImpactAnalysisRequest) {
  return apiPost<{ id: string; results: ImpactReport; severity: string; summary: string }>(`/projects/${projectId}/impact-analysis`, request);
}

export function fetchImpactAnalyses(projectId: string) {
  return apiGet<Omit<ImpactAnalysisRecord, "scope" | "results" | "environmentId">[]>(`/projects/${projectId}/impact-analyses`);
}

export function fetchImpactAnalysis(id: string) {
  return apiGet<ImpactAnalysisRecord>(`/impact-analyses/${id}`);
}

export function runWhatIfAnalysis(projectId: string, request: Omit<ImpactAnalysisRequest, "type">) {
  return apiPost<{ id: string; results: ImpactReport; severity: string; summary: string }>(`/projects/${projectId}/what-if`, request);
}

// --- Multi-Environment Management API ---

import type { PromotionPipeline, PromotionStage, EnvironmentSyncStatus, EnvironmentOverride, PromotionRecord } from "../../shared/multiEnvTypes";
import type { SyncStatusSummary } from "../components/MultiEnvDashboard";

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

export function createEnvOverride(body: { environmentId: string; projectId: string; dimensionType: string; memberKey: string; propertyName: string; overrideValue: string; reason?: string }) {
  return apiPost<EnvironmentOverride>("/environments/env-overrides", body);
}

export function updateEnvOverride(id: string, body: { overrideValue?: string; reason?: string }) {
  return apiPatchJson<EnvironmentOverride>(`/environments/env-overrides/${id}`, body);
}

export function deleteEnvOverride(id: string) {
  return apiDelete(`/environments/env-overrides/${id}`);
}

// --- AI Intelligence (Feature 7) ---

export function fetchAIAnalysis(projectId: string) {
  return apiPost<{ suggestions: Array<{ id: string; suggestionType: string; targetMemberKey?: string; suggestion: Record<string, unknown>; confidence: number }>; totalGenerated: number }>(`/projects/${projectId}/ai/analyze`, {});
}

export function fetchDuplicateDetection(projectId: string) {
  return apiPost<Array<{ members: string[]; similarity: number; method: string }>>(`/projects/${projectId}/ai/duplicates`, {});
}

export function fetchNamingAnomalies(projectId: string) {
  // Naming anomalies come from the full analysis endpoint filtered by type
  return apiPost<{ suggestions: Array<{ id: string; suggestionType: string; targetMemberKey?: string; suggestion: Record<string, unknown>; confidence: number }>; totalGenerated: number }>(`/projects/${projectId}/ai/analyze`, { scope: { types: ['naming'] } });
}

export function fetchHierarchyOptimizations(projectId: string) {
  // Hierarchy optimizations come from the full analysis endpoint filtered by type
  return apiPost<{ suggestions: Array<{ id: string; suggestionType: string; targetMemberKey?: string; suggestion: Record<string, unknown>; confidence: number }>; totalGenerated: number }>(`/projects/${projectId}/ai/analyze`, { scope: { types: ['hierarchy'] } });
}

// --- Quality Scoring (Feature 16) ---

export function fetchQualityScores(projectId: string) {
  return apiGet<{ overallScore: number; dimensions: Array<{ dimensionType: string; overallScore: number; completeness: number; naming: number; structure: number }> }>(`/projects/${projectId}/quality/scores`);
}

export function fetchQualityGates(projectId: string) {
  return apiGet<Array<{ id: string; name: string; threshold: number; scope: string; action: string }>>(`/projects/${projectId}/quality/gates`);
}

// --- Audit Log (Feature 23) ---

export function fetchAuditLog(projectId: string) {
  return apiGet<Array<{ id: string; userId: string; action: string; entityType: string; entityId: string; changes: Record<string, unknown>; timestamp: string }>>(`/projects/${projectId}/audit-log`);
}

// --- Property defaults (global catalog in database) ---

export interface PropertyDefaultValueResponse {
  id: string;
  dimensionType: string;
  targetLevel: "dimension" | "member" | "relationship";
  propertyName: string;
  xmlName: string;
  defaultValue: string;
  enabled: boolean;
  updatedAt?: string;
}

export function fetchPropertyDefaults(projectId: string, dimensionType?: string) {
  const query = dimensionType ? `?dimensionType=${encodeURIComponent(dimensionType)}` : "";
  return apiGet<{
    values: Record<string, PropertyDefaultValueResponse[]>;
  }>(`/projects/${projectId}/property-defaults${query}`);
}

export function updatePropertyDefault(
  projectId: string,
  defaultId: string,
  body: { defaultValue?: string; enabled?: boolean }
) {
  return apiPatchJson<{ value: PropertyDefaultValueResponse }>(
    `/projects/${projectId}/property-defaults/${defaultId}`,
    body
  );
}

// --- Platform advisory panels (TASK-06 through TASK-17) ---

import type { ReadinessBand, ReadinessCategory } from "../../shared/readinessScore";
import type { EffectivePovReport } from "../../shared/effectivePov";
import type { XdXrayReport } from "../../shared/xdXray";
import type { RiskHeatmapReport } from "../../shared/riskHeatmap";
import type { PatternEvaluation, PatternProfile } from "../../shared/clientPatternProfiler";
import type { MigrationPreview, MigrationSession } from "../../shared/migrationCockpit";
import type { AssistantAnswer } from "../../shared/projectAssistant";
import type { ArtifactType, ProposedChangeImpact, ProposedChangeType } from "../../shared/artifactReferenceScanner";

export interface ReadinessResponse {
  score: number;
  band: ReadinessBand;
  generatedAt: string;
  exportWarning: boolean;
  minimumScoreForExportWarning: number;
  blockers: string[];
  topRecommendations: string[];
  categories: Array<Pick<ReadinessCategory, "key" | "label" | "score" | "status">>;
}

export interface ArtifactRecord {
  id: string;
  projectId: string;
  name: string;
  artifactType: ArtifactType;
  originalFileName: string;
  contentHash: string;
  uploadedBy: string;
  uploadedAt: string;
  scanStatus: "unscanned" | "scanned";
  scannedAt: string | null;
  referenceCount: number;
}

export type EffectivePovResponse = EffectivePovReport;

export function fetchReadiness(projectId: string, includeDetails = false) {
  const query = includeDetails ? "?includeDetails=true" : "";
  return apiGet<ReadinessResponse>(`/projects/${projectId}/readiness${query}`);
}

export function fetchArtifacts(projectId: string) {
  return apiGet<{ artifacts: ArtifactRecord[] }>(`/projects/${projectId}/artifacts`);
}

export function uploadArtifact(
  projectId: string,
  body: { name: string; fileName: string; content: string; artifactType?: ArtifactType }
) {
  return apiPost<{ artifact: ArtifactRecord }>(`/projects/${projectId}/artifacts/upload`, body);
}

export function scanArtifact(projectId: string, artifactId: string) {
  return apiPost<{ artifact: ArtifactRecord; references: unknown[] }>(
    `/projects/${projectId}/artifacts/${artifactId}/scan`,
    {}
  );
}

export function assessProposedArtifactChange(
  projectId: string,
  body: { dimensionType: string; memberKey: string; changeType: ProposedChangeType }
) {
  return apiPost<{ impact: ProposedChangeImpact }>(`/projects/${projectId}/impact/proposed-change`, body);
}

export function fetchEffectivePov(
  projectId: string,
  body: {
    targetType: "member" | "relationship" | "dimension";
    targetId?: string;
    dimensionId?: string;
    memberId?: string;
    memberKey?: string;
    parentKey?: string;
    childKey?: string;
    relationshipId?: string;
    context?: { cubeType?: string; scenarioType?: string; timeMember?: string };
    propertyNames?: string[];
  }
) {
  return apiPost<EffectivePovResponse>(`/projects/${projectId}/effective-pov`, body);
}

export function fetchXdXray(projectId: string) {
  return apiGet<XdXrayReport>(`/projects/${projectId}/extensibility/xray`);
}

export function fetchRiskHeatmap(projectId: string, severityFilter?: string[]) {
  const query = severityFilter?.length ? `?severity=${encodeURIComponent(severityFilter.join(","))}` : "";
  return apiGet<RiskHeatmapReport>(`/projects/${projectId}/risk-heatmap${query}`);
}

export function fetchPatternProfiles(projectId: string) {
  return apiGet<{ profiles: PatternProfile[] }>(`/projects/${projectId}/pattern-profiles`);
}

export function createPatternProfile(projectId: string) {
  return apiPost<{ profile: PatternProfile }>(`/projects/${projectId}/pattern-profiles`, {});
}

export function evaluatePatternProfile(projectId: string, profileId: string) {
  return apiPost<{ evaluation: PatternEvaluation }>(
    `/projects/${projectId}/pattern-profiles/${profileId}/evaluate`,
    {}
  );
}

export function fetchAssistantSuggestions(projectId: string) {
  return apiGet<{ suggestions: string[] }>(`/projects/${projectId}/assistant/suggestions`);
}

export function queryProjectAssistant(projectId: string, question: string) {
  return apiPost<{ question: string; answer: AssistantAnswer }>(`/projects/${projectId}/assistant/query`, { question });
}

export function createMigrationSession(
  projectId: string,
  body: { sourceType: string; fileName: string; content: string }
) {
  return apiPost<{ session: MigrationSession }>(`/projects/${projectId}/migration/sessions`, body);
}

export function previewMigration(projectId: string, sessionId: string) {
  return apiPost<{ preview: MigrationPreview; unresolvedDecisions: number }>(
    `/projects/${projectId}/migration/sessions/${sessionId}/preview`,
    {}
  );
}

export function commitMigration(projectId: string, sessionId: string, overrideUnresolved = false) {
  return apiPost<{ committed: { members: number; relationships: number; dimensions: number } }>(
    `/projects/${projectId}/migration/sessions/${sessionId}/commit`,
    { overrideUnresolved }
  );
}
