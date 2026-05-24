import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { AppDatabase } from "../server/db/database";
import { computeDiff, mergeBranches } from "../server/vcs/vcsEngine";
import type { ProjectSnapshot } from "../shared/vcsTypes";

// --- Pure Engine Tests ---

describe("VCS Engine: computeDiff", () => {
  const base: ProjectSnapshot = {
    project: { name: "Test", description: "" },
    dimensions: [{
      dimensionType: "Account", dimensionName: "Accounts",
      members: [
        { memberKey: "Root", description: "", properties: {} },
        { memberKey: "Revenue", description: "Rev", properties: { AccountType: "Revenue" } }
      ],
      relationships: [{ parentKey: "Root", childKey: "Revenue" }]
    }]
  };

  it("detects added members", () => {
    const updated: ProjectSnapshot = {
      ...base,
      dimensions: [{
        ...base.dimensions[0],
        members: [...base.dimensions[0].members, { memberKey: "Expenses", description: "", properties: {} }]
      }]
    };
    const diff = computeDiff(base, updated);
    expect(diff.summary.added).toBe(1);
    expect(diff.entries.find(e => e.path.includes("Expenses"))).toBeDefined();
  });

  it("detects deleted members", () => {
    const updated: ProjectSnapshot = {
      ...base,
      dimensions: [{
        ...base.dimensions[0],
        members: [base.dimensions[0].members[0]]
      }]
    };
    const diff = computeDiff(base, updated);
    expect(diff.summary.deleted).toBe(1);
  });

  it("detects modified properties", () => {
    const updated: ProjectSnapshot = {
      ...base,
      dimensions: [{
        ...base.dimensions[0],
        members: [
          base.dimensions[0].members[0],
          { ...base.dimensions[0].members[1], properties: { AccountType: "Expense" } }
        ]
      }]
    };
    const diff = computeDiff(base, updated);
    expect(diff.summary.modified).toBe(1);
  });

  it("detects added dimensions", () => {
    const updated: ProjectSnapshot = {
      ...base,
      dimensions: [...base.dimensions, { dimensionType: "Entity", dimensionName: "Entities", members: [], relationships: [] }]
    };
    const diff = computeDiff(base, updated);
    expect(diff.entries.find(e => e.path === "dimensions.Entity" && e.changeType === 'added')).toBeDefined();
  });

  it("returns empty diff for identical snapshots", () => {
    const diff = computeDiff(base, base);
    expect(diff.entries.length).toBe(0);
  });
});

describe("VCS Engine: mergeBranches", () => {
  const base: ProjectSnapshot = {
    project: { name: "Test", description: "" },
    dimensions: [{
      dimensionType: "Account", dimensionName: "Accounts",
      members: [{ memberKey: "Root", description: "", properties: { Type: "Root" } }],
      relationships: []
    }]
  };

  it("detects no conflicts when changes don't overlap", () => {
    const source: ProjectSnapshot = {
      ...base,
      dimensions: [{ ...base.dimensions[0], members: [{ memberKey: "Root", description: "", properties: { Type: "Root" } }, { memberKey: "A", description: "", properties: {} }] }]
    };
    const target: ProjectSnapshot = {
      ...base,
      dimensions: [{ ...base.dimensions[0], members: [{ memberKey: "Root", description: "", properties: { Type: "Root" } }, { memberKey: "B", description: "", properties: {} }] }]
    };
    const result = mergeBranches(source, target, base);
    expect(result.success).toBe(true);
    expect(result.conflicts.length).toBe(0);
  });

  it("detects conflicts when both modify same member", () => {
    const source: ProjectSnapshot = {
      ...base,
      dimensions: [{ ...base.dimensions[0], members: [{ memberKey: "Root", description: "", properties: { Type: "Source" } }] }]
    };
    const target: ProjectSnapshot = {
      ...base,
      dimensions: [{ ...base.dimensions[0], members: [{ memberKey: "Root", description: "", properties: { Type: "Target" } }] }]
    };
    const result = mergeBranches(source, target, base);
    expect(result.success).toBe(false);
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].path).toContain("Root");
  });

  it("no conflict when both make same change", () => {
    const source: ProjectSnapshot = {
      ...base,
      dimensions: [{ ...base.dimensions[0], members: [{ memberKey: "Root", description: "", properties: { Type: "Same" } }] }]
    };
    const target: ProjectSnapshot = { ...source };
    const result = mergeBranches(source, target, base);
    expect(result.success).toBe(true);
  });
});

// --- API Integration Tests ---

describe("VCS API endpoints", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let db: AppDatabase;
  let adminToken = "";
  let projectId = "";

  function testConfig(): AppConfig {
    return {
      ...defaultAppConfig,
      auth: { ...defaultAppConfig.auth, enabled: true, strategy: "local", jwt: { secret: "test-vcs", accessTokenExpiry: "15m", refreshTokenExpiry: "7d" }, allowSelfRegistration: false }
    };
  }

  beforeEach(async () => {
    const config = testConfig();
    db = createDatabase(":memory:");
    const app = createApp(db, config);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

    await fetch(`${baseUrl}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@test.com", password: "Password123!", displayName: "Admin" }) });
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@test.com", password: "Password123!" }) });
    adminToken = ((await loginRes.json()) as { accessToken: string }).accessToken;

    const projRes = await fetch(`${baseUrl}/api/projects`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ name: "VCS Test", description: "" }) });
    projectId = ((await projRes.json()) as { id: string }).id;
  });

  afterEach(async () => { await closeServer(); db.close(); });
  function authHeaders() { return { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }; }

  it("POST /api/projects/:id/vcs/branches → 201", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/vcs/branches`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "main" }) });
    expect(res.status).toBe(201);
    const data = await res.json() as { name: string; status: string };
    expect(data.name).toBe("main");
    expect(data.status).toBe("active");
  });

  it("GET /api/projects/:id/vcs/branches → lists branches", async () => {
    await fetch(`${baseUrl}/api/projects/${projectId}/vcs/branches`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "main" }) });
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/vcs/branches`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json() as Array<{ name: string }>;
    expect(data.length).toBe(1);
  });

  it("POST /api/projects/:id/vcs/commit → 201 creates commit", async () => {
    const branchRes = await fetch(`${baseUrl}/api/projects/${projectId}/vcs/branches`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "main" }) });
    const branch = await branchRes.json() as { id: string };

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/vcs/commit`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ branchId: branch.id, message: "Initial commit" }) });
    expect(res.status).toBe(201);
    const data = await res.json() as { message: string; id: string };
    expect(data.message).toBe("Initial commit");
  });

  it("GET /api/projects/:id/vcs/history → returns commits, branches, tags", async () => {
    const branchRes = await fetch(`${baseUrl}/api/projects/${projectId}/vcs/branches`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "main" }) });
    const branch = await branchRes.json() as { id: string };
    await fetch(`${baseUrl}/api/projects/${projectId}/vcs/commit`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ branchId: branch.id, message: "Test" }) });

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/vcs/history`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json() as { commits: unknown[]; branches: unknown[]; tags: unknown[] };
    expect(data.commits.length).toBe(1);
    expect(data.branches.length).toBe(1);
  });

  it("POST /api/projects/:id/vcs/tags → 201", async () => {
    const branchRes = await fetch(`${baseUrl}/api/projects/${projectId}/vcs/branches`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "main" }) });
    const branch = await branchRes.json() as { id: string };
    const commitRes = await fetch(`${baseUrl}/api/projects/${projectId}/vcs/commit`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ branchId: branch.id, message: "v1" }) });
    const commit = await commitRes.json() as { id: string };

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/vcs/tags`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "v1.0", commitId: commit.id, description: "Release 1.0" }) });
    expect(res.status).toBe(201);
    const tag = await res.json() as { name: string };
    expect(tag.name).toBe("v1.0");
  });

  it("GET /api/projects/:id/vcs/diff → computes diff", async () => {
    const branchRes = await fetch(`${baseUrl}/api/projects/${projectId}/vcs/branches`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "main" }) });
    const branch = await branchRes.json() as { id: string };
    const c1Res = await fetch(`${baseUrl}/api/projects/${projectId}/vcs/commit`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ branchId: branch.id, message: "first" }) });
    const c1 = await c1Res.json() as { id: string };
    const c2Res = await fetch(`${baseUrl}/api/projects/${projectId}/vcs/commit`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ branchId: branch.id, message: "second" }) });
    const c2 = await c2Res.json() as { id: string };

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/vcs/diff?from=${c1.id}&to=${c2.id}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json() as { summary: { added: number; modified: number; deleted: number } };
    expect(data.summary).toBeDefined();
  });

  it("POST /api/projects/:id/vcs/merge → merges branches", async () => {
    const mainRes = await fetch(`${baseUrl}/api/projects/${projectId}/vcs/branches`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "main" }) });
    const main = await mainRes.json() as { id: string };
    await fetch(`${baseUrl}/api/projects/${projectId}/vcs/commit`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ branchId: main.id, message: "init" }) });

    const featureRes = await fetch(`${baseUrl}/api/projects/${projectId}/vcs/branches`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "feature", baseBranchId: main.id }) });
    const feature = await featureRes.json() as { id: string };
    await fetch(`${baseUrl}/api/projects/${projectId}/vcs/commit`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ branchId: feature.id, message: "feature work" }) });

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/vcs/merge`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ sourceBranchId: feature.id, targetBranchId: main.id }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { success: boolean; commitId: string | null };
    expect(data.success).toBe(true);
    expect(data.commitId).toBeDefined();
  });

  it("GET nonexistent project → 404", async () => {
    const res = await fetch(`${baseUrl}/api/projects/nonexistent/vcs/branches`, { headers: authHeaders() });
    expect(res.status).toBe(404);
  });
});
