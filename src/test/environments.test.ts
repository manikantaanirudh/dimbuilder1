import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { createRepositories, type Repositories } from "../server/db/repositories";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { AppDatabase } from "../server/db/database";

function envConfig(): AppConfig {
  return {
    ...defaultAppConfig,
    auth: {
      ...defaultAppConfig.auth,
      enabled: true,
      strategy: "local",
      jwt: {
        secret: "test-secret-for-env-tests",
        accessTokenExpiry: "15m",
        refreshTokenExpiry: "7d"
      },
      allowSelfRegistration: false
    }
  };
}

describe("environments & deployments", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let db: AppDatabase;
  let repos: Repositories;
  let adminToken = "";
  let viewerToken = "";

  beforeEach(async () => {
    const config = envConfig();
    db = createDatabase(":memory:");
    repos = createRepositories(db);
    const app = createApp(db, config);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

    // Register admin (first user)
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

    // Create viewer user
    await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ email: "viewer@test.com", password: "Password123!", displayName: "Viewer", role: "viewer" })
    });
    const viewerLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "viewer@test.com", password: "Password123!" })
    });
    const viewerData = await viewerLogin.json() as { accessToken: string };
    viewerToken = viewerData.accessToken;
  });

  afterEach(async () => {
    await closeServer();
    db.close();
  });

  function adminHeaders() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` };
  }

  function viewerHeaders() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${viewerToken}` };
  }

  describe("CRUD", () => {
    it("creates an environment and does not return clientSecret", async () => {
      const res = await fetch(`${baseUrl}/api/environments`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ name: "Test Env", type: "mock", baseUrl: "http://localhost", clientId: "cid", clientSecret: "secret123" })
      });
      expect(res.status).toBe(201);
      const env = await res.json() as Record<string, unknown>;
      expect(env.name).toBe("Test Env");
      expect(env.type).toBe("mock");
      expect(env.clientId).toBe("cid");
      expect(env).not.toHaveProperty("clientSecret");
    });

    it("lists environments without credentials", async () => {
      await fetch(`${baseUrl}/api/environments`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ name: "Env A", type: "mock", baseUrl: "", clientId: "", clientSecret: "s3cr3t" })
      });

      const res = await fetch(`${baseUrl}/api/environments`, { headers: adminHeaders() });
      expect(res.status).toBe(200);
      const envs = await res.json() as Record<string, unknown>[];
      expect(envs.length).toBe(1);
      expect(envs[0]).not.toHaveProperty("clientSecret");
    });

    it("updates an environment", async () => {
      const createRes = await fetch(`${baseUrl}/api/environments`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ name: "Original", type: "mock", baseUrl: "", clientId: "", clientSecret: "" })
      });
      const created = await createRes.json() as { id: string };

      const patchRes = await fetch(`${baseUrl}/api/environments/${created.id}`, {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify({ name: "Updated" })
      });
      expect(patchRes.status).toBe(200);
      const updated = await patchRes.json() as { name: string };
      expect(updated.name).toBe("Updated");
    });

    it("deletes an environment", async () => {
      const createRes = await fetch(`${baseUrl}/api/environments`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ name: "ToDelete", type: "mock", baseUrl: "", clientId: "", clientSecret: "" })
      });
      const created = await createRes.json() as { id: string };

      const delRes = await fetch(`${baseUrl}/api/environments/${created.id}`, {
        method: "DELETE",
        headers: adminHeaders()
      });
      expect(delRes.status).toBe(200);

      const listRes = await fetch(`${baseUrl}/api/environments`, { headers: adminHeaders() });
      const envs = await listRes.json() as unknown[];
      expect(envs.length).toBe(0);
    });
  });

  describe("auth guards", () => {
    it("blocks viewer from creating environments", async () => {
      const res = await fetch(`${baseUrl}/api/environments`, {
        method: "POST",
        headers: viewerHeaders(),
        body: JSON.stringify({ name: "X", type: "mock", baseUrl: "", clientId: "", clientSecret: "" })
      });
      expect(res.status).toBe(403);
    });

    it("blocks viewer from listing environments", async () => {
      const res = await fetch(`${baseUrl}/api/environments`, { headers: viewerHeaders() });
      expect(res.status).toBe(403);
    });
  });

  describe("test connection", () => {
    it("tests mock connection successfully", async () => {
      const createRes = await fetch(`${baseUrl}/api/environments`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ name: "MockConn", type: "mock", baseUrl: "", clientId: "", clientSecret: "" })
      });
      const env = await createRes.json() as { id: string };

      const testRes = await fetch(`${baseUrl}/api/environments/${env.id}/test-connection`, {
        method: "POST",
        headers: adminHeaders()
      });
      expect(testRes.status).toBe(200);
      const result = await testRes.json() as { success: boolean; message: string; latencyMs: number };
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("pull", () => {
    it("pulls dimensions from mock environment", async () => {
      const createRes = await fetch(`${baseUrl}/api/environments`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ name: "PullEnv", type: "mock", baseUrl: "", clientId: "", clientSecret: "" })
      });
      const env = await createRes.json() as { id: string };

      const pullRes = await fetch(`${baseUrl}/api/environments/${env.id}/pull`, {
        method: "POST",
        headers: adminHeaders()
      });
      expect(pullRes.status).toBe(200);
      const result = await pullRes.json() as { dimensionsXml: string; dimensionCount: number };
      expect(result.dimensionsXml).toContain("<Dimensions>");
      expect(result.dimensionCount).toBe(1);
    });
  });

  describe("deploy", () => {
    it("deploys project XML to mock environment and records history", async () => {
      // Create a project with a dimension
      const projectRes = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ name: "Deploy Test Project" })
      });
      const project = await projectRes.json() as { id: string };

      // Import some data via workbook or manual — create dimension directly via repos
      const dim = await repos.dimensions.create({
        projectId: project.id,
        sheetName: "Account",
        dimensionType: "Account",
        dimensionName: "Account",
        description: "",
        accessGroup: "",
        maintenanceGroup: "",
        inheritedDimension: "",
        sortOrder: 0,
        metadata: {}
      });

      await repos.members.create({
        dimensionId: dim.id, memberKey: "Revenue", description: "Revenue", properties: {}, rowOrder: 0, sourceRowNumber: 1, isActive: true
      });

      // Create mock environment
      const envRes = await fetch(`${baseUrl}/api/environments`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ name: "DeployEnv", type: "mock", baseUrl: "", clientId: "", clientSecret: "" })
      });
      const env = await envRes.json() as { id: string };

      // Deploy
      const deployRes = await fetch(`${baseUrl}/api/environments/${env.id}/deploy`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ projectId: project.id, dimensionIds: [dim.id], comment: "Initial deploy" })
      });
      expect(deployRes.status).toBe(201);
      const deployment = await deployRes.json() as { id: string; status: string; dimensionResults: { dimensionType: string; status: string }[]; comment: string };
      expect(deployment.status).toBe("success");
      expect(deployment.comment).toBe("Initial deploy");
      expect(deployment.dimensionResults.length).toBe(1);
      expect(deployment.dimensionResults[0].dimensionType).toBe("Account");
      expect(deployment.dimensionResults[0].status).toBe("success");

      // Verify deployment history
      const historyRes = await fetch(`${baseUrl}/api/environments/deployments?projectId=${project.id}`, {
        headers: adminHeaders()
      });
      expect(historyRes.status).toBe(200);
      const history = await historyRes.json() as unknown[];
      expect(history.length).toBe(1);

      // Verify deployment detail
      const detailRes = await fetch(`${baseUrl}/api/environments/deployments/${deployment.id}`, {
        headers: adminHeaders()
      });
      expect(detailRes.status).toBe(200);
      const detail = await detailRes.json() as { id: string; xmlPayload: string; dimensionResults: unknown[] };
      expect(detail.xmlPayload).toContain("Revenue");
      expect(detail.dimensionResults.length).toBe(1);
    });

    it("returns 404 for non-existent project", async () => {
      const envRes = await fetch(`${baseUrl}/api/environments`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ name: "E", type: "mock", baseUrl: "", clientId: "", clientSecret: "" })
      });
      const env = await envRes.json() as { id: string };

      const deployRes = await fetch(`${baseUrl}/api/environments/${env.id}/deploy`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ projectId: "nonexistent" })
      });
      expect(deployRes.status).toBe(404);
    });
  });
});
