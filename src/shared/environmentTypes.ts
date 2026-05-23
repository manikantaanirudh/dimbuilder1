export type EnvironmentType = "onestream" | "mock";

export type DeploymentStatus = "pending" | "in_progress" | "success" | "failed";

export interface Environment {
  id: string;
  name: string;
  type: EnvironmentType;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  tenantId: string;
  appName: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Environment with credentials redacted — safe for GET responses */
export type EnvironmentSafe = Omit<Environment, "clientSecret"> & { clientSecret?: never };

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
  testedAt: string;
}

export interface PullResult {
  environmentId: string;
  dimensionsXml: string;
  dimensionCount: number;
  pulledAt: string;
}

export interface DeploymentDimensionResult {
  dimensionType: string;
  dimensionName: string;
  status: "success" | "failed" | "skipped";
  message: string;
}

export interface DeploymentRecord {
  id: string;
  environmentId: string;
  projectId: string;
  changeSetId: string | null;
  status: DeploymentStatus;
  dimensionResults: DeploymentDimensionResult[];
  xmlPayload: string;
  comment: string;
  initiatedBy: string;
  createdAt: string;
  completedAt: string | null;
}

export interface DeployRequest {
  projectId: string;
  changeSetId?: string;
  dimensionIds?: string[];
  comment?: string;
}

export interface CreateEnvironmentInput {
  name: string;
  type: EnvironmentType;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  tenantId?: string;
  appName?: string;
}

export interface UpdateEnvironmentInput {
  name?: string;
  type?: EnvironmentType;
  baseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  appName?: string;
  isActive?: boolean;
}
