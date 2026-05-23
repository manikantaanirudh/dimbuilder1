import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { createRepositories, type Repositories } from "../server/db/repositories";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { AppDatabase } from "../server/db/database";

function workflowConfig(overrides: Partial<AppConfig["auth"]> = {}): AppConfig {
  return {
    ...defaultAppConfig,
    auth: {
      ...defaultAppConfig.auth,
      enabled: true,
      strategy: "local",
      jwt: {
        secret: "test-secret-for-workflow-tests",
        accessTokenExpiry: "15m",
        refreshTokenExpiry: "7d"
      },
      allowSelfRegistration: false,
      ...overrides
    },
    workflows: {
      enabled: true,
      requireApprovalForDeploy: true,
      defaultDefinition: "standard-review"
    }
  };
}

describe("workflow engine", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let db: AppDatabase;
  let repos: Repositories;
  let adminToken = "";
  let reviewerToken = "";
  let authorToken = "";

  beforeEach(async () => {
    const config = workflowConfig();
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

    // Create reviewer user via admin
    await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ email: "reviewer@test.com", password: "Password123!", displayName: "Reviewer", role: "reviewer" })
    });
    const reviewerLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "reviewer@test.com", password: "Password123!" })
    });
    const reviewerData = await reviewerLogin.json() as { accessToken: string };
    reviewerToken = reviewerData.accessToken;

    // Create author user via admin
    await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ email: "author@test.com", password: "Password123!", displayName: "Author", role: "author" })
    });
    const authorLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "author@test.com", password: "Password123!" })
    });
    const authorData = await authorLogin.json() as { accessToken: string };
    authorToken = authorData.accessToken;
  });

  afterEach(async () => {
    await closeServer();
    db.close();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function createProject(token: string): Promise<string> {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(token) },
      body: JSON.stringify({ name: "Test Project" })
    });
    const project = await res.json() as { id: string };
    return project.id;
  }

  function createDraftChangeSet(projectId: string): string {
    const cs = repos.changeSets.create({
      projectId,
      name: "Test Change Set",
      description: "For workflow testing",
      status: "draft",
      createdBy: "admin@test.com"
    });
    return cs.id;
  }

  it("lists the seeded default workflow definition", async () => {
    const res = await fetch(`${baseUrl}/api/workflows/definitions`, {
      headers: auth(adminToken)
    });
    expect(res.status).toBe(200);
    const defs = await res.json() as Array<{ id: string; name: string }>;
    expect(defs.length).toBeGreaterThanOrEqual(1);
    expect(defs.some(d => d.id === "standard-review")).toBe(true);
  });

  it("creates a new workflow definition (admin only)", async () => {
    const res = await fetch(`${baseUrl}/api/workflows/definitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(adminToken) },
      body: JSON.stringify({
        name: "Two-Step Review",
        description: "Requires two approvals",
        steps: [
          { name: "Peer Review", requiredRole: "reviewer", minApprovals: 1 },
          { name: "Admin Sign-off", requiredRole: "admin", minApprovals: 1 }
        ]
      })
    });
    expect(res.status).toBe(201);
    const def = await res.json() as { name: string; steps: unknown[] };
    expect(def.name).toBe("Two-Step Review");
    expect(def.steps).toHaveLength(2);
  });

  it("submits a change set into workflow", async () => {
    const projectId = await createProject(adminToken);
    const changeSetId = createDraftChangeSet(projectId);

    const res = await fetch(`${baseUrl}/api/workflows/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(adminToken) },
      body: JSON.stringify({ changeSetId, definitionId: "standard-review" })
    });
    expect(res.status).toBe(201);
    const instance = await res.json() as { id: string; status: string; changeSetId: string };
    expect(instance.status).toBe("in_progress");
    expect(instance.changeSetId).toBe(changeSetId);
  });

  it("approve → workflow advances and completes", async () => {
    const projectId = await createProject(adminToken);
    const changeSetId = createDraftChangeSet(projectId);

    // Submit as admin
    const submitRes = await fetch(`${baseUrl}/api/workflows/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(adminToken) },
      body: JSON.stringify({ changeSetId, definitionId: "standard-review" })
    });
    const instance = await submitRes.json() as { id: string };

    // Approve as reviewer
    const approveRes = await fetch(`${baseUrl}/api/workflows/instances/${instance.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(reviewerToken) },
      body: JSON.stringify({ comment: "Looks good" })
    });
    expect(approveRes.status).toBe(200);
    const detail = await approveRes.json() as { instance: { status: string } };
    expect(detail.instance.status).toBe("approved");

    // Change set should be approved
    const csRes = await fetch(`${baseUrl}/api/projects/${projectId}/change-sets/${changeSetId}`, {
      headers: auth(adminToken)
    });
    const csData = await csRes.json() as { changeSet: { status: string } };
    expect(csData.changeSet.status).toBe("approved");
  });

  it("reject → workflow rejected, change set status updated", async () => {
    const projectId = await createProject(adminToken);
    const changeSetId = createDraftChangeSet(projectId);

    const submitRes = await fetch(`${baseUrl}/api/workflows/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(adminToken) },
      body: JSON.stringify({ changeSetId })
    });
    const instance = await submitRes.json() as { id: string };

    const rejectRes = await fetch(`${baseUrl}/api/workflows/instances/${instance.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(reviewerToken) },
      body: JSON.stringify({ comment: "Not ready" })
    });
    expect(rejectRes.status).toBe(200);
    const detail = await rejectRes.json() as { instance: { status: string } };
    expect(detail.instance.status).toBe("rejected");

    const csRes = await fetch(`${baseUrl}/api/projects/${projectId}/change-sets/${changeSetId}`, {
      headers: auth(adminToken)
    });
    const csData = await csRes.json() as { changeSet: { status: string } };
    expect(csData.changeSet.status).toBe("rejected");
  });

  it("prevents self-approval", async () => {
    const projectId = await createProject(adminToken);
    const changeSetId = createDraftChangeSet(projectId);

    const submitRes = await fetch(`${baseUrl}/api/workflows/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(adminToken) },
      body: JSON.stringify({ changeSetId })
    });
    const instance = await submitRes.json() as { id: string };

    // Admin tries to approve their own submission
    const approveRes = await fetch(`${baseUrl}/api/workflows/instances/${instance.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(adminToken) },
      body: JSON.stringify({})
    });
    expect(approveRes.status).toBe(403);
    const body = await approveRes.json() as { code: string };
    expect(body.code).toBe("SELF_APPROVAL");
  });

  it("enforces role requirements", async () => {
    const projectId = await createProject(adminToken);
    const changeSetId = createDraftChangeSet(projectId);

    const submitRes = await fetch(`${baseUrl}/api/workflows/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(adminToken) },
      body: JSON.stringify({ changeSetId })
    });
    const instance = await submitRes.json() as { id: string };

    // Author role cannot approve (step requires "reviewer")
    const approveRes = await fetch(`${baseUrl}/api/workflows/instances/${instance.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(authorToken) },
      body: JSON.stringify({})
    });
    expect(approveRes.status).toBe(403);
    const body = await approveRes.json() as { code: string };
    expect(body.code).toBe("INSUFFICIENT_ROLE");
  });

  it("allows cancellation by submitter", async () => {
    const projectId = await createProject(adminToken);
    const changeSetId = createDraftChangeSet(projectId);

    const submitRes = await fetch(`${baseUrl}/api/workflows/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(adminToken) },
      body: JSON.stringify({ changeSetId })
    });
    const instance = await submitRes.json() as { id: string };

    const cancelRes = await fetch(`${baseUrl}/api/workflows/instances/${instance.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(adminToken) },
      body: JSON.stringify({})
    });
    expect(cancelRes.status).toBe(200);
    const detail = await cancelRes.json() as { instance: { status: string } };
    expect(detail.instance.status).toBe("cancelled");
  });

  it("lists pending workflows for a reviewer", async () => {
    const projectId = await createProject(adminToken);
    const changeSetId = createDraftChangeSet(projectId);

    await fetch(`${baseUrl}/api/workflows/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(adminToken) },
      body: JSON.stringify({ changeSetId })
    });

    const res = await fetch(`${baseUrl}/api/workflows/my-pending`, {
      headers: auth(reviewerToken)
    });
    expect(res.status).toBe(200);
    const pending = await res.json() as Array<{ id: string; status: string }>;
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending[0].status).toBe("in_progress");
  });
});
