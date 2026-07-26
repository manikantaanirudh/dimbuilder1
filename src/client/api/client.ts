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
import {
  apiDelete,
  apiDeleteJson,
  apiGet,
  apiPatch,
  apiPatchJson,
  apiPost,
  apiPut,
  apiText
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
export * from "./advisory";
export * from "./auth";
export * from "./connectors";
export * from "./environments";
export * from "./impact";
export * from "./intelligence";
export * from "./multiEnvironment";
export * from "./propertyDefaults";
export * from "./reports";
export * from "./workflows";

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


// Kept in the compatibility barrel because the overview branch added this helper
// after the domain API extraction began.
export function queryNaturalLanguage(projectId: string, question: string) {
  return apiPost<import("../../shared/aiTypes").NLQueryResult>(
    `/projects/${projectId}/ai/query`,
    { question }
  );
}
