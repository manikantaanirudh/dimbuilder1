import { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createApp } from "../../server/app";
import { createDatabase } from "../../server/db/database";
import { defaultAppConfig } from "../../shared/appConfigDefaults";
import type { AppConfig } from "../../shared/appConfigTypes";
import { enablePlatformForTests } from "./modules";

export interface WorkflowHarness {
  baseUrl: string;
  exportsDirectory: string;
  close: () => Promise<void>;
}

/**
 * Spin up the full app against an in-memory database and a temp exports directory.
 * Used by the end-to-end regression suite (TASK-18) to exercise the real HTTP workflow.
 */
export async function startWorkflowHarness(overrides: Partial<AppConfig> = {}): Promise<WorkflowHarness> {
  const exportsDirectory = mkdtempSync(join(tmpdir(), "dimbuilder-e2e-"));
  const config: AppConfig = enablePlatformForTests({
    ...defaultAppConfig,
    ...overrides,
    paths: { ...defaultAppConfig.paths, exportsDirectory },
    dimensions: { ...defaultAppConfig.dimensions, enabledTypes: ["Account"], displayOrder: ["Account"] }
  });
  const db = createDatabase(":memory:");
  const server: Server = createApp(db, config).listen(0);
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    exportsDirectory,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
      db.close();
      rmSync(exportsDirectory, { recursive: true, force: true });
    }
  };
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok && response.status >= 500) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function createProject(baseUrl: string, name: string): Promise<{ id: string }> {
  const r = await fetch(`${baseUrl}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name })
  });
  return json<{ id: string }>(r);
}

export async function listDimensions(baseUrl: string, projectId: string): Promise<Array<{ id: string; dimensionType: string }>> {
  return json(await fetch(`${baseUrl}/api/projects/${projectId}/dimensions`));
}

export async function addMember(baseUrl: string, projectId: string, dimensionId: string, memberKey: string, properties: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/projects/${projectId}/dimensions/${dimensionId}/members`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberKey, properties })
  });
}

export async function addRelationship(baseUrl: string, projectId: string, dimensionId: string, parentKey: string, childKey: string) {
  return fetch(`${baseUrl}/api/projects/${projectId}/dimensions/${dimensionId}/relationships`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentKey, childKey, properties: { Parent: parentKey, Child: childKey } })
  });
}

export async function createBaseline(baseUrl: string, projectId: string, name: string): Promise<{ id: string }> {
  return json(await fetch(`${baseUrl}/api/projects/${projectId}/baselines`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, sourceType: "snapshot" })
  }));
}

export async function runDiff(baseUrl: string, projectId: string, baselineId: string): Promise<{ id: string }> {
  return json(await fetch(`${baseUrl}/api/projects/${projectId}/diff`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baselineId })
  }));
}
