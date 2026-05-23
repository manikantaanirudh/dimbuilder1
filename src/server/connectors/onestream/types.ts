import type { ConnectionTestResult, DeploymentDimensionResult, PullResult } from "../../../shared/environmentTypes";

export interface OneStreamApiClient {
  testConnection(): Promise<ConnectionTestResult>;
  pullDimensions(dimensionTypes?: string[]): Promise<PullResult>;
  pushXml(xml: string, dimensionTypes: string[]): Promise<{ success: boolean; results: DeploymentDimensionResult[] }>;
}
