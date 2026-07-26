import type { WorkflowStatusReport } from "@shared/workflowReadiness";
import type {
  SubmitWorkflowRequest,
  WorkflowActionRequest,
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowInstanceDetail,
  WorkflowNotification
} from "@shared/workflowTypes";
import { apiGet, apiPatchJson, apiPost } from "./core";

export function fetchWorkflowDefinitions() {
  return apiGet<WorkflowDefinition[]>("/workflows/definitions");
}

export function createWorkflowDefinition(body: {
  name: string;
  description?: string;
  steps: unknown[];
  dimensionTypes?: string;
  autoAdvanceRules?: Record<string, unknown>;
}) {
  return apiPost<WorkflowDefinition>("/workflows/definitions", body);
}

export function updateWorkflowDefinition(
  id: string,
  body: Partial<{ name: string; description: string; steps: unknown[]; dimensionTypes: string; isActive: boolean }>
) {
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

export function evaluateAutoAdvance(instanceId: string) {
  return apiPost<{
    instanceId: string;
    stepIndex: number;
    shouldAdvance: boolean;
    conditionsEvaluated: Array<{ condition: { type: string }; passed: boolean; detail: string }>;
  }>(`/workflows/instances/${instanceId}/auto-advance/evaluate`, {});
}

export function runAutoAdvanceCheck() {
  return apiPost<{ evaluated: number; advanced: number; results: Array<{ instanceId: string; advanced: boolean }> }>(
    "/workflows/auto-advance/run",
    {}
  );
}

export function fetchWorkflowStatus(projectId: string) {
  return apiGet<WorkflowStatusReport>(`/projects/${projectId}/workflow-status`);
}
