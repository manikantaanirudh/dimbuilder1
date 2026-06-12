import type { Repositories } from "../db/repositories";
import type { WorkflowInstance, WorkflowInstanceDetail, WorkflowStepDefinition } from "../../shared/workflowTypes";
import type { SystemRole } from "../../shared/authTypes";

export interface WorkflowEngineError {
  code: string;
  message: string;
  status: number;
}

function err(code: string, message: string, status: number): WorkflowEngineError {
  return { code, message, status };
}

function isRoleSufficient(userRole: SystemRole, requiredRole: string): boolean {
  const hierarchy: Record<string, number> = { viewer: 0, author: 1, reviewer: 2, admin: 3 };
  return (hierarchy[userRole] ?? 0) >= (hierarchy[requiredRole] ?? 0);
}

export async function submitWorkflow(
  repos: Repositories,
  changeSetId: string,
  projectId: string,
  submittedBy: string,
  definitionId?: string
): Promise<WorkflowInstance | WorkflowEngineError> {
  // Find the change set
  const changeSet = await repos.changeSets.get(projectId, changeSetId);
  if (!changeSet) return err("CHANGE_SET_NOT_FOUND", "Change set not found", 404);

  // Verify change set status
  if (changeSet.status !== "draft" && changeSet.status !== "validated") {
    return err("INVALID_STATUS", "Change set must be in 'draft' or 'validated' status to submit for workflow", 409);
  }

  // Check no active workflow exists for this change set
  const existingInstance = await repos.workflows.instances.getByChangeSet(changeSetId);
  if (existingInstance && existingInstance.status === "in_progress") {
    return err("ALREADY_IN_WORKFLOW", "Change set already has an active workflow", 409);
  }

  // Resolve definition
  let defId = definitionId;
  if (!defId) {
    const definitions = await repos.workflows.definitions.list();
    if (definitions.length === 0) return err("NO_DEFINITION", "No active workflow definitions found", 404);
    defId = definitions[0].id;
  }

  const definition = await repos.workflows.definitions.get(defId);
  if (!definition) return err("DEFINITION_NOT_FOUND", "Workflow definition not found", 404);
  if (!definition.isActive) return err("DEFINITION_INACTIVE", "Workflow definition is not active", 409);

  // Create the workflow instance
  const instance = await repos.workflows.instances.create({
    definitionId: definition.id,
    changeSetId,
    projectId,
    submittedBy
  });

  // Notify eligible reviewers for step 0
  const firstStep = definition.steps[0];
  if (firstStep) {
    await notifyReviewers(repos, instance.id, firstStep, changeSet.name, submittedBy);
  }

  return instance;
}

export async function approveStep(
  repos: Repositories,
  instanceId: string,
  actorId: string,
  actorRole: SystemRole,
  comment?: string
): Promise<WorkflowInstanceDetail | WorkflowEngineError> {
  const instance = await repos.workflows.instances.get(instanceId);
  if (!instance) return err("INSTANCE_NOT_FOUND", "Workflow instance not found", 404);
  if (instance.status !== "in_progress") return err("NOT_IN_PROGRESS", "Workflow is not in progress", 409);

  // Self-approval check
  if (instance.submittedBy === actorId) {
    return err("SELF_APPROVAL", "Cannot approve your own submission", 403);
  }

  const definition = await repos.workflows.definitions.get(instance.definitionId);
  if (!definition) return err("DEFINITION_NOT_FOUND", "Workflow definition not found", 500);

  const currentStep = definition.steps[instance.currentStepIndex] as WorkflowStepDefinition | undefined;
  if (!currentStep) return err("STEP_NOT_FOUND", "Current step not found in definition", 500);

  // Role check
  if (!isRoleSufficient(actorRole, currentStep.requiredRole)) {
    return err("INSUFFICIENT_ROLE", `Role '${currentStep.requiredRole}' or higher required for this step`, 403);
  }

  // Record the approve action
  await repos.workflows.stepActions.record({
    instanceId,
    stepIndex: instance.currentStepIndex,
    action: "approve",
    actorId,
    comment
  });

  // Check if we have enough approvals
  const approvalCount = await repos.workflows.stepActions.countApprovalsForStep(instanceId, instance.currentStepIndex);
  if (approvalCount >= currentStep.minApprovals) {
    const nextStepIndex = instance.currentStepIndex + 1;
    if (nextStepIndex >= definition.steps.length) {
      // Workflow complete
      const completedAt = new Date().toISOString();
      await repos.workflows.instances.updateStatus(instanceId, "approved", completedAt);
      // Update change set status
      await repos.changeSets.update(instance.projectId, instance.changeSetId, { status: "approved" });
    } else {
      // Advance to next step
      await repos.workflows.instances.advanceStep(instanceId, nextStepIndex);
      // Notify reviewers for next step
      const nextStep = definition.steps[nextStepIndex];
      const changeSet = await repos.changeSets.get(instance.projectId, instance.changeSetId);
      if (nextStep && changeSet) {
        await notifyReviewers(repos, instanceId, nextStep, changeSet.name, instance.submittedBy);
      }
    }
  }

  const detail = await getInstanceDetail(repos, instanceId);
  if (!detail) return err("INSTANCE_NOT_FOUND", "Workflow instance not found", 404);
  return detail;
}

export async function rejectWorkflow(
  repos: Repositories,
  instanceId: string,
  actorId: string,
  actorRole: SystemRole,
  comment?: string
): Promise<WorkflowInstanceDetail | WorkflowEngineError> {
  const instance = await repos.workflows.instances.get(instanceId);
  if (!instance) return err("INSTANCE_NOT_FOUND", "Workflow instance not found", 404);
  if (instance.status !== "in_progress") return err("NOT_IN_PROGRESS", "Workflow is not in progress", 409);

  const definition = await repos.workflows.definitions.get(instance.definitionId);
  if (!definition) return err("DEFINITION_NOT_FOUND", "Workflow definition not found", 500);

  const currentStep = definition.steps[instance.currentStepIndex] as WorkflowStepDefinition | undefined;
  if (!currentStep) return err("STEP_NOT_FOUND", "Current step not found in definition", 500);

  // Role check
  if (!isRoleSufficient(actorRole, currentStep.requiredRole)) {
    return err("INSUFFICIENT_ROLE", `Role '${currentStep.requiredRole}' or higher required for this step`, 403);
  }

  await repos.workflows.stepActions.record({
    instanceId,
    stepIndex: instance.currentStepIndex,
    action: "reject",
    actorId,
    comment
  });

  const completedAt = new Date().toISOString();
  await repos.workflows.instances.updateStatus(instanceId, "rejected", completedAt);
  await repos.changeSets.update(instance.projectId, instance.changeSetId, { status: "rejected" });

  const detail = await getInstanceDetail(repos, instanceId);
  if (!detail) return err("INSTANCE_NOT_FOUND", "Workflow instance not found", 404);
  return detail;
}

export async function cancelWorkflow(
  repos: Repositories,
  instanceId: string,
  actorId: string,
  actorRole: SystemRole
): Promise<WorkflowInstanceDetail | WorkflowEngineError> {
  const instance = await repos.workflows.instances.get(instanceId);
  if (!instance) return err("INSTANCE_NOT_FOUND", "Workflow instance not found", 404);
  if (instance.status !== "in_progress") return err("NOT_IN_PROGRESS", "Workflow is not in progress", 409);

  // Only submitter or admin can cancel
  if (instance.submittedBy !== actorId && actorRole !== "admin") {
    return err("NOT_AUTHORIZED", "Only the submitter or an admin can cancel a workflow", 403);
  }

  const completedAt = new Date().toISOString();
  await repos.workflows.instances.updateStatus(instanceId, "cancelled", completedAt);

  const detail = await getInstanceDetail(repos, instanceId);
  if (!detail) return err("INSTANCE_NOT_FOUND", "Workflow instance not found", 404);
  return detail;
}

export async function getInstanceDetail(repos: Repositories, instanceId: string): Promise<WorkflowInstanceDetail | null> {
  const instance = await repos.workflows.instances.get(instanceId);
  if (!instance) return null;

  const definition = await repos.workflows.definitions.get(instance.definitionId);
  if (!definition) return null;

  const actions = await repos.workflows.stepActions.listByInstance(instanceId);
  const notifications = await repos.workflows.notifications.listByInstance(instanceId);

  return { instance, definition, actions, notifications };
}

export function isWorkflowEngineError(value: unknown): value is WorkflowEngineError {
  return typeof value === "object" && value !== null && "code" in value && "message" in value && "status" in value;
}

async function notifyReviewers(
  repos: Repositories,
  instanceId: string,
  step: WorkflowStepDefinition,
  changeSetName: string,
  submittedBy: string
): Promise<void> {
  const reviewers = await repos.workflows.getEligibleReviewers(step.requiredRole);
  for (const reviewer of reviewers) {
    if (reviewer.id === submittedBy) continue;
    await repos.workflows.notifications.create({
      instanceId,
      recipientId: reviewer.id,
      subject: `Approval needed: ${changeSetName}`,
      body: `Step "${step.name}" requires your approval for change set "${changeSetName}".`
    });
  }
}
