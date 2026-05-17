import type {
  DashboardSummary,
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  ProjectRecord,
  ValidationIssue
} from "../../shared/types";
import type { ClientAppConfig } from "../../shared/appConfigTypes";

export interface GridResponse<T> {
  rows: T[];
  total: number;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiText(path: string): Promise<string> {
  const response = await fetch(`/api${path}`);
  if (!response.ok) throw new Error(await response.text());
  return response.text();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body ?? {})
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPatch(path: string, body: unknown): Promise<void> {
  const response = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(`/api${path}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await response.text());
}

export function fetchProjects() {
  return apiGet<ProjectRecord[]>("/projects");
}

export function fetchAppConfig() {
  return apiGet<ClientAppConfig>("/config");
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

export function fetchMembers(projectId: string, dimensionId: string, offset = 0, limit = 300) {
  return apiGet<GridResponse<DimensionMemberRecord>>(`/projects/${projectId}/dimensions/${dimensionId}/members?offset=${offset}&limit=${limit}`);
}

export function fetchRelationships(projectId: string, dimensionId: string, offset = 0, limit = 300) {
  return apiGet<GridResponse<DimensionRelationshipRecord>>(`/projects/${projectId}/dimensions/${dimensionId}/relationships?offset=${offset}&limit=${limit}`);
}

export async function uploadWorkbook(file: File, projectName: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("projectName", projectName);
  return apiPost<{ project: ProjectRecord; importSummary: Record<string, unknown> }>("/import/workbook", formData);
}

export function validateProject(projectId: string, duplicateSeverity = "warning") {
  return apiPost<{ issues: ValidationIssue[] }>(`/validation/${projectId}/run`, { duplicateSeverity });
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
