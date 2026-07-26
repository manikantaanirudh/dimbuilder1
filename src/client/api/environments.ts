import type {
  ConnectionTestResult,
  CreateEnvironmentInput,
  DeploymentRecord,
  DeployRequest,
  EnvironmentSafe,
  PullResult,
  UpdateEnvironmentInput
} from "@shared/environmentTypes";
import { apiDelete, apiGet, apiPatchJson, apiPost } from "./core";

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
  return apiGet<Omit<DeploymentRecord, "xmlPayload" | "dimensionResults">[]>(
    `/environments/deployments${qs ? `?${qs}` : ""}`
  );
}

export function fetchDeployment(id: string) {
  return apiGet<DeploymentRecord>(`/environments/deployments/${id}`);
}
