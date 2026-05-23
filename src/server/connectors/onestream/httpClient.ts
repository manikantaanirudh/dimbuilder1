import type { ConnectionTestResult, DeploymentDimensionResult, Environment, PullResult } from "../../../shared/environmentTypes";
import type { OneStreamApiClient } from "./types";

/**
 * Real HTTP client for OneStream REST API using OAuth2 client credentials.
 * This is a structural skeleton — actual API endpoints are subject to
 * the target OneStream environment's version and configuration.
 */
export function createHttpClient(env: Environment): OneStreamApiClient {
  async function getAccessToken(): Promise<string> {
    const tokenUrl = `${env.baseUrl}/connect/token`;
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: env.clientId,
        client_secret: env.clientSecret,
        scope: "OneStreamAPI"
      })
    });
    if (!response.ok) {
      throw new Error(`OAuth token request failed: ${response.status} ${response.statusText}`);
    }
    const data = await response.json() as { access_token: string };
    return data.access_token;
  }

  async function authenticatedFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const token = await getAccessToken();
    return fetch(`${env.baseUrl}${path}`, {
      ...options,
      headers: {
        ...options.headers as Record<string, string>,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
  }

  return {
    async testConnection(): Promise<ConnectionTestResult> {
      const start = Date.now();
      try {
        const response = await authenticatedFetch("/api/v1/health");
        const latencyMs = Date.now() - start;
        if (response.ok) {
          return { success: true, message: "Connection successful", latencyMs, testedAt: new Date().toISOString() };
        }
        return { success: false, message: `Server returned ${response.status}`, latencyMs, testedAt: new Date().toISOString() };
      } catch (err) {
        const latencyMs = Date.now() - start;
        return { success: false, message: err instanceof Error ? err.message : "Connection failed", latencyMs, testedAt: new Date().toISOString() };
      }
    },

    async pullDimensions(dimensionTypes?: string[]): Promise<PullResult> {
      const query = dimensionTypes?.length ? `?types=${dimensionTypes.join(",")}` : "";
      const response = await authenticatedFetch(`/api/v1/dimensions/export${query}`);
      if (!response.ok) {
        throw new Error(`Pull failed: ${response.status} ${response.statusText}`);
      }
      const data = await response.json() as { xml: string; count: number };
      return {
        environmentId: env.id,
        dimensionsXml: data.xml,
        dimensionCount: data.count,
        pulledAt: new Date().toISOString()
      };
    },

    async pushXml(xml: string, dimensionTypes: string[]): Promise<{ success: boolean; results: DeploymentDimensionResult[] }> {
      const response = await authenticatedFetch("/api/v1/dimensions/import", {
        method: "POST",
        body: JSON.stringify({ xml, dimensionTypes })
      });
      if (!response.ok) {
        throw new Error(`Deploy failed: ${response.status} ${response.statusText}`);
      }
      return response.json() as Promise<{ success: boolean; results: DeploymentDimensionResult[] }>;
    }
  };
}
