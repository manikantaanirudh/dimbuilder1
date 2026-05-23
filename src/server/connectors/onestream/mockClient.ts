import type { ConnectionTestResult, DeploymentDimensionResult, Environment, PullResult } from "../../../shared/environmentTypes";
import type { OneStreamApiClient } from "./types";

const SAMPLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<Dimensions>
  <Dimension DimensionType="Account" DimensionName="Account">
    <Members>
      <Member MemberName="TotalRevenue" Description="Total Revenue" />
      <Member MemberName="NetIncome" Description="Net Income" />
    </Members>
    <Relationships>
      <Relationship ParentName="TotalRevenue" ChildName="NetIncome" AggWeight="1" />
    </Relationships>
  </Dimension>
</Dimensions>`;

export function createMockClient(env: Environment): OneStreamApiClient {
  return {
    async testConnection(): Promise<ConnectionTestResult> {
      return {
        success: true,
        message: `Mock connection to "${env.name}" successful`,
        latencyMs: 42,
        testedAt: new Date().toISOString()
      };
    },

    async pullDimensions(_dimensionTypes?: string[]): Promise<PullResult> {
      return {
        environmentId: env.id,
        dimensionsXml: SAMPLE_XML,
        dimensionCount: 1,
        pulledAt: new Date().toISOString()
      };
    },

    async pushXml(_xml: string, dimensionTypes: string[]): Promise<{ success: boolean; results: DeploymentDimensionResult[] }> {
      const results: DeploymentDimensionResult[] = dimensionTypes.map(dt => ({
        dimensionType: dt,
        dimensionName: dt,
        status: "success" as const,
        message: `Successfully deployed ${dt} to mock environment`
      }));
      return { success: true, results };
    }
  };
}
