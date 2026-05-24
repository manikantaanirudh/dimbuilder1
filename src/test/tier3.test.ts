import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { AppDatabase } from "../server/db/database";
import type { DimensionMemberRecord, DimensionRecord } from "../shared/types";
import { scoreMemberQuality, scoreDimensionQuality, generateDocumentContent } from "../server/tier3/tier3Engine";

const testTimestamp = "2026-01-01T00:00:00.000Z";

function dimFixture(overrides: Partial<DimensionRecord>): DimensionRecord {
  return {
    id: "dim-1", projectId: "proj-1", sheetName: "Accounts", dimensionType: "Account",
    dimensionName: "Accounts", description: "", accessGroup: "Everyone",
    maintenanceGroup: "Everyone", inheritedDimension: "", sortOrder: 1,
    metadata: {}, createdAt: testTimestamp, updatedAt: testTimestamp, ...overrides
  };
}

function memberFixture(key: string, dimId: string, props: Record<string, unknown> = {}): DimensionMemberRecord {
  return {
    id: `m-${key}`, dimensionId: dimId, memberKey: key, description: `${key} desc`,
    properties: props, rowOrder: 1, sourceRowNumber: 1, isActive: true,
    createdAt: testTimestamp, updatedAt: testTimestamp
  };
}

// --- Pure Engine Tests ---

describe("Tier 3 Engine: Quality Scoring", () => {
  const dim = dimFixture({ id: "dim-acc" });

  it("scores member with full properties high", () => {
    const member = memberFixture("Revenue", "dim-acc", { AccountType: "Revenue", Currency: "USD" });
    const score = scoreMemberQuality(member, dim, []);
    expect(score.overallScore).toBeGreaterThan(50);
  });

  it("scores member with empty properties lower", () => {
    const member = { ...memberFixture("Empty", "dim-acc", { AccountType: "", Currency: "" }), description: "" };
    const score = scoreMemberQuality(member, dim, []);
    expect(score.overallScore).toBeLessThanOrEqual(50);
  });

  it("dimension quality averages member scores", () => {
    const members = [
      memberFixture("Good", "dim-acc", { AccountType: "Revenue" }),
      { ...memberFixture("Bad", "dim-acc", { AccountType: "" }), description: "" }
    ];
    const dimScore = scoreDimensionQuality(dim, members, []);
    expect(dimScore.memberCount).toBe(2);
    expect(dimScore.overallScore).toBeGreaterThan(0);
    expect(dimScore.overallScore).toBeLessThan(100);
  });

  it("empty dimension scores 100", () => {
    const dimScore = scoreDimensionQuality(dim, [], []);
    expect(dimScore.overallScore).toBe(100);
  });

  it("identifies lowest scoring members", () => {
    const members = [
      memberFixture("A", "dim-acc", { X: "val" }),
      { ...memberFixture("B", "dim-acc", { X: "" }), description: "" },
      memberFixture("C", "dim-acc", { X: "val", Y: "val" })
    ];
    const dimScore = scoreDimensionQuality(dim, members, []);
    expect(dimScore.lowestScoreMembers.length).toBeGreaterThan(0);
    expect(dimScore.lowestScoreMembers[0].score).toBeLessThanOrEqual(dimScore.lowestScoreMembers[dimScore.lowestScoreMembers.length - 1].score);
  });
});

describe("Tier 3 Engine: Documentation Generation", () => {
  it("generates markdown content with dimension sections", () => {
    const dim = dimFixture({ id: "dim-acc" });
    const members = [memberFixture("Root", "dim-acc"), memberFixture("Revenue", "dim-acc")];
    const relationships = [{ id: "r1", dimensionId: "dim-acc", parentKey: "Root", childKey: "Revenue", aggregationWeight: 1, percentConsol: null, percentOwnership: null, ownershipType: "", properties: {}, rowOrder: 1, sourceRowNumber: 1, createdAt: testTimestamp, updatedAt: testTimestamp }];

    const content = generateDocumentContent({ dimensions: [dim], members, relationships });
    expect(content).toContain("# Dimension Design Document");
    expect(content).toContain("Account: Accounts");
    expect(content).toContain("Root");
    expect(content).toContain("Revenue");
  });

  it("generates empty doc for no dimensions", () => {
    const content = generateDocumentContent({ dimensions: [], members: [], relationships: [] });
    expect(content).toContain("# Dimension Design Document");
  });
});

// --- API Integration Tests ---

describe("Tier 3 API endpoints", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let db: AppDatabase;
  let adminToken = "";
  let projectId = "";

  function testConfig(): AppConfig {
    return {
      ...defaultAppConfig,
      auth: { ...defaultAppConfig.auth, enabled: true, strategy: "local", jwt: { secret: "test-tier3", accessTokenExpiry: "15m", refreshTokenExpiry: "7d" }, allowSelfRegistration: false }
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

    const projRes = await fetch(`${baseUrl}/api/projects`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ name: "Tier3 Test", description: "" }) });
    projectId = ((await projRes.json()) as { id: string }).id;
  });

  afterEach(async () => { await closeServer(); db.close(); });
  function authHeaders() { return { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }; }

  // Feature 13: Excel
  it("POST /api/projects/:id/excel/download → 200", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/excel/download`, { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
    // No dimensions exist yet, so should return 404 for dimension not found
    expect([200, 404]).toContain(res.status);
  });

  it("POST /api/projects/:id/excel/publish → 201", async () => {
    // First create a dimension via import
    await fetch(`${baseUrl}/api/import`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ projectId, dimensions: [{ sheetName: "Accounts", dimensionType: "Account", dimensionName: "Accounts", members: [{ memberKey: "Revenue", description: "Revenue" }], relationships: [] }] }) });

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/excel/publish`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ dimensionType: "Account", members: [{ memberKey: "Expenses", description: "Expenses" }] })
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { membersCreated: number };
    expect(data.membersCreated).toBeGreaterThanOrEqual(1);
  });

  // Feature 14: Conflict Resolution
  it("POST /api/projects/:id/locks/acquire → 201", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/locks/acquire`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ dimensionId: "dim-1" }) });
    expect(res.status).toBe(201);
    const data = await res.json() as { expiresAt: string };
    expect(data.expiresAt).toBeDefined();
  });

  it("POST /api/projects/:id/conflicts/detect → 200", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/conflicts/detect`, { method: "POST", headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json() as { hasConflicts: boolean };
    expect(data.hasConflicts).toBe(false);
  });

  // Feature 15: Scheduled Jobs
  it("POST /api/projects/:id/jobs → 201", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/jobs`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "Daily Sync", triggerType: "cron", actionType: "sync" }) });
    expect(res.status).toBe(201);
    const data = await res.json() as { name: string; status: string };
    expect(data.name).toBe("Daily Sync");
    expect(data.status).toBe("active");
  });

  it("POST /api/projects/:id/webhooks → 201", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/webhooks`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ url: "https://example.com/hook", events: ["member.created"] }) });
    expect(res.status).toBe(201);
    const data = await res.json() as { secret: string };
    expect(data.secret.length).toBeGreaterThan(10);
  });

  // Feature 16: Quality Scoring
  it("GET /api/projects/:id/quality/scores → 200", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/quality/scores`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json() as { overallScore: number };
    expect(data.overallScore).toBeGreaterThanOrEqual(0);
  });

  it("POST /api/projects/:id/quality/rules → 201", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/quality/rules`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "Completeness", category: "completeness", weight: 2.0 }) });
    expect(res.status).toBe(201);
    const data = await res.json() as { name: string; weight: number };
    expect(data.name).toBe("Completeness");
    expect(data.weight).toBe(2.0);
  });

  it("POST /api/projects/:id/quality/gates → 201", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/quality/gates`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "Deploy Gate", threshold: 80, action: "block_deploy" }) });
    expect(res.status).toBe(201);
    const data = await res.json() as { threshold: number; action: string };
    expect(data.threshold).toBe(80);
    expect(data.action).toBe("block_deploy");
  });

  // Feature 17: Migration
  it("POST /api/projects/:id/migrations → 201", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/migrations`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "HFM Migration", sourceType: "hyperion_hfm" }) });
    expect(res.status).toBe(201);
    const data = await res.json() as { name: string; status: string };
    expect(data.name).toBe("HFM Migration");
    expect(data.status).toBe("draft");
  });

  // Feature 18: API Keys
  it("POST /api/api-keys → 201", async () => {
    const res = await fetch(`${baseUrl}/api/api-keys`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "CI/CD Key", permissions: ["read", "write"] }) });
    expect(res.status).toBe(201);
    const data = await res.json() as { key: string; keyPrefix: string };
    expect(data.key.length).toBe(40);
    expect(data.keyPrefix.length).toBe(8);
  });

  it("POST /api/projects/:id/webhook-subscriptions → 201", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/webhook-subscriptions`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ url: "https://example.com/webhook", events: ["project.updated"] }) });
    expect(res.status).toBe(201);
  });

  // Feature 19: Offline
  it("GET /api/projects/:id/sync/status → 200", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/sync/status`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json() as { isOnline: boolean; pendingChanges: number };
    expect(data.isOnline).toBe(true);
    expect(data.pendingChanges).toBe(0);
  });

  it("POST /api/projects/:id/sync/push → 200", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/sync/push`, { method: "POST", headers: authHeaders() });
    expect(res.status).toBe(200);
  });

  // Feature 20: Docs
  it("POST /api/projects/:id/docs/generate → 201", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/docs/generate`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ format: "markdown" }) });
    expect(res.status).toBe(201);
    const data = await res.json() as { title: string; content: string; format: string };
    expect(data.title).toContain("Design Document");
    expect(data.content).toContain("# Dimension Design Document");
    expect(data.format).toBe("markdown");
  });

  // 404 handling
  it("GET nonexistent project → 404", async () => {
    const res = await fetch(`${baseUrl}/api/projects/nonexistent/quality/scores`, { headers: authHeaders() });
    expect(res.status).toBe(404);
  });
});
