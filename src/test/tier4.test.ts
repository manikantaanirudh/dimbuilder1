import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { AppDatabase } from "../server/db/database";

describe("Tier 4 API endpoints", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let db: AppDatabase;
  let adminToken = "";
  let projectId = "";

  function testConfig(): AppConfig {
    return {
      ...defaultAppConfig,
      auth: { ...defaultAppConfig.auth, enabled: true, strategy: "local", jwt: { secret: "test-tier4", accessTokenExpiry: "15m", refreshTokenExpiry: "7d" }, allowSelfRegistration: false }
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

    const projRes = await fetch(`${baseUrl}/api/projects`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ name: "Tier4 Test", description: "" }) });
    projectId = ((await projRes.json()) as { id: string }).id;
  });

  afterEach(async () => { await closeServer(); db.close(); });
  function authHeaders() { return { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }; }

  // Feature 21: Multi-Tenant
  it("POST /api/tenants → 201", async () => {
    const res = await fetch(`${baseUrl}/api/tenants`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "Acme Corp", slug: "acme" }) });
    expect(res.status).toBe(201);
    const data = await res.json() as { name: string; slug: string; status: string };
    expect(data.name).toBe("Acme Corp");
    expect(data.status).toBe("active");
  });

  it("GET /api/tenants → 200", async () => {
    const res = await fetch(`${baseUrl}/api/tenants`, { headers: authHeaders() });
    expect(res.status).toBe(200);
  });

  it("GET /api/tenants/:slug/usage → 200", async () => {
    // Create tenant first
    await fetch(`${baseUrl}/api/tenants`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "Test Org", slug: "test-org" }) });
    const res = await fetch(`${baseUrl}/api/tenants/test-org/usage`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json() as { userCount: number };
    expect(data.userCount).toBe(0);
  });

  // Feature 22: Collaboration
  it("GET /api/projects/:id/presence → 200", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/presence`, { headers: authHeaders() });
    expect(res.status).toBe(200);
  });

  it("POST /api/projects/:id/comments → 201", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/comments`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ dimensionId: "dim-1", content: "Please review this member", mentions: ["user-2"] }) });
    expect(res.status).toBe(201);
    const data = await res.json() as { content: string; mentions: string[] };
    expect(data.content).toBe("Please review this member");
    expect(data.mentions).toContain("user-2");
  });

  it("GET /api/projects/:id/comments → 200", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/comments`, { headers: authHeaders() });
    expect(res.status).toBe(200);
  });

  // Feature 23: Audit & Compliance
  it("GET /api/projects/:id/audit-log → 200", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/audit-log`, { headers: authHeaders() });
    expect(res.status).toBe(200);
  });

  it("POST /api/audit-log → 201", async () => {
    const res = await fetch(`${baseUrl}/api/audit-log`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ action: "member.created", entityType: "member", entityId: "m-1", projectId }) });
    expect(res.status).toBe(201);
    const data = await res.json() as { action: string; timestamp: string };
    expect(data.action).toBe("member.created");
  });

  it("POST /api/retention-policies → 201", async () => {
    const res = await fetch(`${baseUrl}/api/retention-policies`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ entityType: "audit_log", retentionDays: 730 }) });
    expect(res.status).toBe(201);
    const data = await res.json() as { retentionDays: number };
    expect(data.retentionDays).toBe(730);
  });

  it("GET /api/compliance/report → 200", async () => {
    const res = await fetch(`${baseUrl}/api/compliance/report`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json() as { auditCompleteness: { coverage: number } };
    expect(data.auditCompleteness.coverage).toBe(100);
  });

  // Feature 24: Performance
  it("GET /api/performance/metrics → 200", async () => {
    const res = await fetch(`${baseUrl}/api/performance/metrics`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json() as { memoryUsageMb: number; avgResponseTimeMs: number };
    expect(data.memoryUsageMb).toBeGreaterThan(0);
  });

  it("GET /api/projects/:id/members/paginated → 200 with pagination", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/members/paginated?offset=0&limit=10`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json() as { data: unknown[]; pagination: { total: number; hasMore: boolean } };
    expect(data.pagination.total).toBeGreaterThanOrEqual(0);
    expect(typeof data.pagination.hasMore).toBe('boolean');
  });

  it("GET /api/background-jobs → 200", async () => {
    const res = await fetch(`${baseUrl}/api/background-jobs`, { headers: authHeaders() });
    expect(res.status).toBe(200);
  });

  // 404 handling
  it("GET nonexistent project presence → 404", async () => {
    const res = await fetch(`${baseUrl}/api/projects/nonexistent/presence`, { headers: authHeaders() });
    expect(res.status).toBe(404);
  });
});
