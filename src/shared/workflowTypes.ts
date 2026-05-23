export type WorkflowStatus = "in_progress" | "approved" | "rejected" | "cancelled";
export type WorkflowStepAction = "approve" | "reject" | "comment" | "delegate" | "escalate";

export interface WorkflowStepDefinition {
  name: string;
  requiredRole: "admin" | "author" | "reviewer" | "viewer";
  minApprovals: number;
  slaHours?: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  dimensionTypes: string;
  steps: WorkflowStepDefinition[];
  autoAdvanceRules: Record<string, unknown>;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowInstance {
  id: string;
  definitionId: string;
  changeSetId: string;
  projectId: string;
  currentStepIndex: number;
  status: WorkflowStatus;
  submittedBy: string;
  submittedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStepActionRecord {
  id: string;
  instanceId: string;
  stepIndex: number;
  action: WorkflowStepAction;
  actorId: string;
  comment: string;
  createdAt: string;
}

export interface WorkflowNotification {
  id: string;
  instanceId: string;
  recipientId: string;
  channel: string;
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface WorkflowInstanceDetail {
  instance: WorkflowInstance;
  definition: WorkflowDefinition;
  actions: WorkflowStepActionRecord[];
  notifications: WorkflowNotification[];
}

export interface SubmitWorkflowRequest {
  changeSetId: string;
  definitionId?: string;
}

export interface WorkflowActionRequest {
  comment?: string;
}
