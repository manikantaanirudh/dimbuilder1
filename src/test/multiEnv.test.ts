import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { createRepositories, type Repositories } from "../server/db/repositories";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { AppDatabase } from "../server/db/database";
import { computeLocalHash, refreshSyncStatus, getSyncStatusSummary } from "../server/environments/syncStatus";

function testConfig(): AppConfig {
  return {
    ...defaultAppConfig,
    auth: {
      ...defaultAppConfig.auth,
      enabled: true,
      strategy: "local",
      jwt: {
        secret: "test-secret-for-multi-env-tests",
        accessTokenExpiry: "15m",
        refreshTokenExpiry: "7d"
      },
      allowSelfRegistration: false
    }
  };
}

describe("multi-environment management", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let db: AppDatabase;
  let repos: Repositories;
  let adminToken = "";

  beforeEach(async () => {
    const config = testConfig();
    db = createDatabase(":memory:");
    repos = createRepositories(db);
    const app = createApp(db, config);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

    // Register admin
    await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.com", password: "Password123!", displayName: "Admin" })
    });
    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.com", password: "Password123!" })
    });
    const adminData = await adminLogin.json() as { accessToken: string };
    adminToken = adminData.accessToken;
  });

  afterEach(async () => {
    await closeServer();
    db.close();
  });

  function headers() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` };
  }

  // --- Helper: create environments and project ---

  async function createEnv(name: string) {
    const res = await fetch(`${baseUrl}/api/environments`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name, type: "mock", baseUrl: "http://localhost", clientId: "cid", clientSecret: "secret" })
    });
    return res.json() as Promise<{ id: string; name: string }>;
  }

  async function createProject(name: string) {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name, description: "Test project" })
    });
    return res.json() as Promise<{ id: string; name: string }>;
  }

  // --- Promotion Pipeline CRUD ---

  describe("promotion pipelines", () => {
    it("creates a pipeline with stages", async () => {
      const dev = await createEnv("Development");
      const prod = await createEnv("Production");

      const res = await fetch(`${baseUrl}/api/environments/pipelines`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: "Dev to Prod",
          stages: [
            { environmentId: dev.id, order: 0, name: "Dev", requiresApproval: false },
            { environmentId: prod.id, order: 1, name: "Prod", requiresApproval: true }
          ]
        })
      });
      expect(res.status).toBe(201);
      const pipeline = await res.json() as Record<string, unknown>;
      expect(pipeline.name).toBe("Dev to Prod");
      expect(pipeline.isActive).toBe(true);
      expect((pipeline.stages as unknown[]).length).toBe(2);
    });

    it("lists pipelines", async () => {
      const dev = await createEnv("Development");
      const prod = await createEnv("Production");

      await fetch(`${baseUrl}/api/environments/pipelines`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: "Pipeline A",
          stages: [
            { environmentId: dev.id, order: 0, name: "Dev", requiresApproval: false },
            { environmentId: prod.id, order: 1, name: "Prod", requiresApproval: true }
          ]
        })
      });

      const res = await fetch(`${baseUrl}/api/environments/pipelines`, { headers: headers() });
      expect(res.status).toBe(200);
      const list = await res.json() as unknown[];
      expect(list.length).toBe(1);
    });

    it("updates a pipeline", async () => {
      const dev = await createEnv("Dev");
      const prod = await createEnv("Prod");
      const createRes = await fetch(`${baseUrl}/api/environments/pipelines`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: "Old Name",
          stages: [
            { environmentId: dev.id, order: 0, name: "Dev", requiresApproval: false },
            { environmentId: prod.id, order: 1, name: "Prod", requiresApproval: true }
          ]
        })
      });
      const created = await createRes.json() as { id: string };

      const res = await fetch(`${baseUrl}/api/environments/pipelines/${created.id}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ name: "New Name" })
      });
      expect(res.status).toBe(200);
      const updated = await res.json() as Record<string, unknown>;
      expect(updated.name).toBe("New Name");
    });

    it("deletes a pipeline", async () => {
      const dev = await createEnv("Dev");
      const prod = await createEnv("Prod");
      const createRes = await fetch(`${baseUrl}/api/environments/pipelines`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: "To Delete",
          stages: [
            { environmentId: dev.id, order: 0, name: "Dev", requiresApproval: false },
            { environmentId: prod.id, order: 1, name: "Prod", requiresApproval: true }
          ]
        })
      });
      const created = await createRes.json() as { id: string };

      const res = await fetch(`${baseUrl}/api/environments/pipelines/${created.id}`, {
        method: "DELETE",
        headers: headers()
      });
      expect(res.status).toBe(200);

      const listRes = await fetch(`${baseUrl}/api/environments/pipelines`, { headers: headers() });
      const list = await listRes.json() as unknown[];
      expect(list.length).toBe(0);
    });

    it("rejects pipeline with fewer than 2 stages", async () => {
      const dev = await createEnv("Dev");
      const res = await fetch(`${baseUrl}/api/environments/pipelines`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: "Bad Pipeline",
          stages: [{ environmentId: dev.id, order: 0, name: "Dev", requiresApproval: false }]
        })
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent pipeline update", async () => {
      const res = await fetch(`${baseUrl}/api/environments/pipelines/nonexistent`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ name: "Whatever" })
      });
      expect(res.status).toBe(404);
    });
  });

  // --- Promotion ---

  describe("promotion", () => {
    it("promotes from one stage to another", async () => {
      const dev = await createEnv("Dev");
      const prod = await createEnv("Prod");
      const project = await createProject("Test Project");

      const pipelineRes = await fetch(`${baseUrl}/api/environments/pipelines`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: "Main Pipeline",
          stages: [
            { environmentId: dev.id, order: 0, name: "Dev", requiresApproval: false },
            { environmentId: prod.id, order: 1, name: "Prod", requiresApproval: true }
          ]
        })
      });
      const pipeline = await pipelineRes.json() as { id: string };

      const res = await fetch(`${baseUrl}/api/environments/pipelines/${pipeline.id}/promote`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ projectId: project.id, fromStageIndex: 0, toStageIndex: 1 })
      });
      expect(res.status).toBe(201);
      const record = await res.json() as Record<string, unknown>;
      expect(record.status).toBe("success");
      expect(record.fromEnvironmentId).toBe(dev.id);
      expect(record.toEnvironmentId).toBe(prod.id);
    });

    it("rejects invalid stage index", async () => {
      const dev = await createEnv("Dev");
      const prod = await createEnv("Prod");
      const project = await createProject("Test Project");

      const pipelineRes = await fetch(`${baseUrl}/api/environments/pipelines`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: "Pipeline",
          stages: [
            { environmentId: dev.id, order: 0, name: "Dev", requiresApproval: false },
            { environmentId: prod.id, order: 1, name: "Prod", requiresApproval: true }
          ]
        })
      });
      const pipeline = await pipelineRes.json() as { id: string };

      const res = await fetch(`${baseUrl}/api/environments/pipelines/${pipeline.id}/promote`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ projectId: project.id, fromStageIndex: 0, toStageIndex: 5 })
      });
      expect(res.status).toBe(400);
    });
  });

  // --- Sync Status ---

  describe("sync status", () => {
    it("computeLocalHash returns consistent hash for same data", () => {
      const project = repos.projects.create({ name: "Hash Test", description: "", sourceFileName: "", createdBy: "admin" });
      const dim = repos.dimensions.create({
        projectId: project.id,
        sheetName: "Accounts",
        dimensionType: "Account",
        dimensionName: "TestAccounts",
        description: "",
        accessGroup: "",
        maintenanceGroup: "",
        inheritedDimension: "",
        sortOrder: 1,
        metadata: {}
      });
      repos.members.bulkInsert([{
        id: "m1", dimensionId: dim.id, memberKey: "Revenue",
        description: "Revenue account", properties: { Account: "Revenue" },
        rowOrder: 1, sourceRowNumber: 1, isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
      }]);

      const hash1 = computeLocalHash(repos, project.id, "Account");
      const hash2 = computeLocalHash(repos, project.id, "Account");
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex
    });

    it("computeLocalHash returns empty string for unknown dimension type", () => {
      const project = repos.projects.create({ name: "Hash Test", description: "", sourceFileName: "", createdBy: "admin" });
      const hash = computeLocalHash(repos, project.id, "NonExistent");
      expect(hash).toBe("");
    });

    it("refreshSyncStatus computes statuses for all environments", () => {
      const project = repos.projects.create({ name: "Sync Test", description: "", sourceFileName: "", createdBy: "admin" });
      const dim = repos.dimensions.create({
        projectId: project.id,
        sheetName: "Entities",
        dimensionType: "Entity",
        dimensionName: "TestEntities",
        description: "",
        accessGroup: "",
        maintenanceGroup: "",
        inheritedDimension: "",
        sortOrder: 1,
        metadata: {}
      });
      repos.members.bulkInsert([{
        id: "m-sync-1", dimensionId: dim.id, memberKey: "Corp",
        description: "Corporate", properties: { Entity: "Corp" },
        rowOrder: 1, sourceRowNumber: 1, isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
      }]);
      repos.environments.create({ name: "Dev", type: "mock", baseUrl: "", clientId: "", clientSecret: "", createdBy: "admin" });

      const statuses = refreshSyncStatus(repos, project.id);
      expect(statuses.length).toBe(1);
      expect(statuses[0].syncStatus).toBe("local_ahead");
      expect(statuses[0].dimensionType).toBe("Entity");
    });

    it("getSyncStatusSummary aggregates by environment", () => {
      const project = repos.projects.create({ name: "Summary Test", description: "", sourceFileName: "", createdBy: "admin" });
      const dim = repos.dimensions.create({
        projectId: project.id,
        sheetName: "Accounts",
        dimensionType: "Account",
        dimensionName: "Accounts",
        description: "",
        accessGroup: "",
        maintenanceGroup: "",
        inheritedDimension: "",
        sortOrder: 1,
        metadata: {}
      });
      repos.members.bulkInsert([{
        id: "m-sum-1", dimensionId: dim.id, memberKey: "A1",
        description: "", properties: {},
        rowOrder: 1, sourceRowNumber: 1, isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
      }]);
      repos.environments.create({ name: "Staging", type: "mock", baseUrl: "", clientId: "", clientSecret: "", createdBy: "admin" });
      refreshSyncStatus(repos, project.id);

      const summaries = getSyncStatusSummary(repos, project.id);
      expect(summaries.length).toBe(1);
      expect(summaries[0].environmentName).toBe("Staging");
      expect(summaries[0].localAhead).toBe(1);
    });

    it("GET sync-status endpoint returns summary", async () => {
      const project = await createProject("API Sync Test");
      const res = await fetch(`${baseUrl}/api/environments/projects/${project.id}/sync-status`, { headers: headers() });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it("POST sync-status/refresh requires projectId", async () => {
      const res = await fetch(`${baseUrl}/api/environments/sync-status/refresh`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({})
      });
      expect(res.status).toBe(400);
    });

    it("POST sync-status/refresh returns statuses", async () => {
      const project = await createProject("Refresh Test");
      await createEnv("Env1");

      const res = await fetch(`${baseUrl}/api/environments/sync-status/refresh`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ projectId: project.id })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // --- Environment Overrides ---

  describe("environment overrides", () => {
    it("creates an override", async () => {
      const env = await createEnv("Override Env");
      const project = await createProject("Override Project");

      const res = await fetch(`${baseUrl}/api/environments/env-overrides`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          environmentId: env.id,
          projectId: project.id,
          dimensionType: "Account",
          memberKey: "Revenue",
          propertyName: "Description",
          overrideValue: "Prod Revenue",
          reason: "Production-specific naming"
        })
      });
      expect(res.status).toBe(201);
      const override = await res.json() as Record<string, unknown>;
      expect(override.memberKey).toBe("Revenue");
      expect(override.overrideValue).toBe("Prod Revenue");
      expect(override.reason).toBe("Production-specific naming");
    });

    it("lists overrides filtered by environmentId", async () => {
      const env1 = await createEnv("Env A");
      const env2 = await createEnv("Env B");
      const project = await createProject("Filter Project");

      await fetch(`${baseUrl}/api/environments/env-overrides`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ environmentId: env1.id, projectId: project.id, dimensionType: "Account", memberKey: "A", propertyName: "Desc", overrideValue: "v1" })
      });
      await fetch(`${baseUrl}/api/environments/env-overrides`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ environmentId: env2.id, projectId: project.id, dimensionType: "Account", memberKey: "B", propertyName: "Desc", overrideValue: "v2" })
      });

      const res = await fetch(`${baseUrl}/api/environments/env-overrides?environmentId=${env1.id}`, { headers: headers() });
      expect(res.status).toBe(200);
      const list = await res.json() as unknown[];
      expect(list.length).toBe(1);
    });

    it("updates an override", async () => {
      const env = await createEnv("Update Env");
      const project = await createProject("Update Project");

      const createRes = await fetch(`${baseUrl}/api/environments/env-overrides`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ environmentId: env.id, projectId: project.id, dimensionType: "Entity", memberKey: "Corp", propertyName: "Name", overrideValue: "Old" })
      });
      const created = await createRes.json() as { id: string };

      const res = await fetch(`${baseUrl}/api/environments/env-overrides/${created.id}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ overrideValue: "New", reason: "Updated reason" })
      });
      expect(res.status).toBe(200);
      const updated = await res.json() as Record<string, unknown>;
      expect(updated.overrideValue).toBe("New");
      expect(updated.reason).toBe("Updated reason");
    });

    it("deletes an override", async () => {
      const env = await createEnv("Delete Env");
      const project = await createProject("Delete Project");

      const createRes = await fetch(`${baseUrl}/api/environments/env-overrides`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ environmentId: env.id, projectId: project.id, dimensionType: "Account", memberKey: "X", propertyName: "P", overrideValue: "V" })
      });
      const created = await createRes.json() as { id: string };

      const res = await fetch(`${baseUrl}/api/environments/env-overrides/${created.id}`, {
        method: "DELETE",
        headers: headers()
      });
      expect(res.status).toBe(200);

      const listRes = await fetch(`${baseUrl}/api/environments/env-overrides?projectId=${project.id}`, { headers: headers() });
      const list = await listRes.json() as unknown[];
      expect(list.length).toBe(0);
    });

    it("returns 404 for non-existent override update", async () => {
      const res = await fetch(`${baseUrl}/api/environments/env-overrides/nonexistent`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ overrideValue: "x" })
      });
      expect(res.status).toBe(404);
    });

    it("returns 404 for non-existent override delete", async () => {
      const res = await fetch(`${baseUrl}/api/environments/env-overrides/nonexistent`, {
        method: "DELETE",
        headers: headers()
      });
      expect(res.status).toBe(404);
    });

    it("rejects override with missing required fields", async () => {
      const res = await fetch(`${baseUrl}/api/environments/env-overrides`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ environmentId: "some-id" })
      });
      expect(res.status).toBe(400);
    });
  });
});
