import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { AppDatabase } from "../server/db/database";
import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord } from "../shared/types";
import { generateHealthReport, generateVelocityReport, generateCoverageReport, generateComplianceReport } from "../server/reporting/reportingEngine";

const testTimestamp = "2026-01-01T00:00:00.000Z";

function dimFixture(overrides: Partial<DimensionRecord>): DimensionRecord {
  return {
    id: "dim-1", projectId: "proj-1", sheetName: "Accounts", dimensionType: "Account",
    dimensionName: "Accounts", description: "", accessGroup: "Everyone",
    maintenanceGroup: "Everyone", inheritedDimension: "", sortOrder: 1,
    metadata: {}, createdAt: testTimestamp, updatedAt: testTimestamp,
    ...overrides
  };
}

function memberFixture(key: string, dimId: string, props: Record<string, unknown> = {}): DimensionMemberRecord {
  return {
    id: `m-${key}`, dimensionId: dimId, memberKey: key, description: `${key} desc`,
    properties: { Account: key, ...props }, rowOrder: 1, sourceRowNumber: 1, isActive: true,
    createdAt: testTimestamp, updatedAt: testTimestamp
  };
}

function relFixture(parent: string, child: string, dimId: string): DimensionRelationshipRecord {
  return {
    id: `r-${parent}-${child}`, dimensionId: dimId, parentKey: parent, childKey: child,
    aggregationWeight: 1, percentConsol: null, percentOwnership: null, ownershipType: "",
    properties: {}, rowOrder: 1, sourceRowNumber: 1, createdAt: testTimestamp, updatedAt: testTimestamp
  };
}

// --- Pure Engine Tests ---

describe("Reporting Engine: generateHealthReport", () => {
  it("calculates quality scores for each dimension", () => {
    const dim = dimFixture({ id: "dim-acc" });
    const members = [
      memberFixture("Root", "dim-acc", { AccountType: "Root" }),
      memberFixture("Revenue", "dim-acc", { AccountType: "Revenue" })
    ];
    const rels = [relFixture("Root", "Revenue", "dim-acc")];

    const report = generateHealthReport("proj-1", { dimensions: [dim], members, relationships: rels }, []);
    expect(report.snapshots.length).toBe(1);
    expect(report.snapshots[0].memberCount).toBe(2);
    expect(report.snapshots[0].qualityScore).toBeGreaterThan(0);
    expect(report.overallScore).toBeGreaterThan(0);
  });

  it("detects orphan members", () => {
    const dim = dimFixture({ id: "dim-acc" });
    const members = [
      memberFixture("Root", "dim-acc"),
      memberFixture("Revenue", "dim-acc"),
      memberFixture("Orphan", "dim-acc")
    ];
    const rels = [relFixture("Root", "Revenue", "dim-acc")];

    const report = generateHealthReport("proj-1", { dimensions: [dim], members, relationships: rels }, []);
    expect(report.snapshots[0].orphanCount).toBe(1);
  });

  it("trend is stable with no previous snapshots", () => {
    const dim = dimFixture({ id: "dim-acc" });
    const report = generateHealthReport("proj-1", { dimensions: [dim], members: [], relationships: [] }, []);
    expect(report.trend).toBe("stable");
  });
});

describe("Reporting Engine: generateVelocityReport", () => {
  it("groups changes by week", () => {
    const dim = dimFixture({ id: "dim-acc" });
    const members = [
      memberFixture("A", "dim-acc"),
      memberFixture("B", "dim-acc")
    ];

    const report = generateVelocityReport("proj-1", { dimensions: [dim], members, relationships: [] });
    expect(report.totalChanges).toBeGreaterThan(0);
    expect(report.periods.length).toBeGreaterThan(0);
  });

  it("returns empty periods for no members", () => {
    const report = generateVelocityReport("proj-1", { dimensions: [], members: [], relationships: [] });
    expect(report.totalChanges).toBe(0);
    expect(report.periods.length).toBe(0);
  });
});

describe("Reporting Engine: generateCoverageReport", () => {
  it("calculates property coverage", () => {
    const dim = dimFixture({ id: "dim-acc" });
    const members = [
      memberFixture("Root", "dim-acc", { AccountType: "Root", Currency: "USD" }),
      memberFixture("Rev", "dim-acc", { AccountType: "Revenue", Currency: "" })
    ];

    const report = generateCoverageReport("proj-1", { dimensions: [dim], members, relationships: [] });
    expect(report.dimensions.length).toBe(1);
    expect(report.dimensions[0].propertyCoverage).toBeLessThan(100);
    expect(report.overallCoverage).toBeGreaterThan(0);
  });

  it("calculates description coverage", () => {
    const dim = dimFixture({ id: "dim-acc" });
    const members = [
      { ...memberFixture("A", "dim-acc"), description: "Has desc" },
      { ...memberFixture("B", "dim-acc"), description: "" }
    ];

    const report = generateCoverageReport("proj-1", { dimensions: [dim], members, relationships: [] });
    expect(report.dimensions[0].descriptionCoverage).toBe(50);
  });
});

describe("Reporting Engine: generateComplianceReport", () => {
  it("calculates compliance scores", () => {
    const dim = dimFixture({ id: "dim-acc" });
    const members = [memberFixture("A", "dim-acc"), memberFixture("B", "dim-acc")];
    const summaries = [{ dimensionType: "Account", errorCount: 1, warningCount: 2 }];

    const report = generateComplianceReport("proj-1", { dimensions: [dim], members, relationships: [] }, summaries);
    expect(report.totalMembers).toBe(2);
    expect(report.validationPassRate).toBe(50);
  });

  it("100% pass rate with no errors", () => {
    const dim = dimFixture({ id: "dim-acc" });
    const members = [memberFixture("A", "dim-acc")];
    const report = generateComplianceReport("proj-1", { dimensions: [dim], members, relationships: [] }, []);
    expect(report.validationPassRate).toBe(100);
  });
});

// --- API Integration Tests ---

describe("Reporting API endpoints", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let db: AppDatabase;
  let adminToken = "";
  let projectId = "";

  function testConfig(): AppConfig {
    return {
      ...defaultAppConfig,
      auth: {
        ...defaultAppConfig.auth, enabled: true, strategy: "local",
        jwt: { secret: "test-secret-reporting", accessTokenExpiry: "15m", refreshTokenExpiry: "7d" },
        allowSelfRegistration: false
      }
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

    await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.com", password: "Password123!", displayName: "Admin" })
    });
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.com", password: "Password123!" })
    });
    adminToken = ((await loginRes.json()) as { accessToken: string }).accessToken;

    const projRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: "Report Test", description: "" })
    });
    projectId = ((await projRes.json()) as { id: string }).id;
  });

  afterEach(async () => { await closeServer(); db.close(); });
  function authHeaders() { return { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }; }

  it("POST /api/reports/definitions → 201", async () => {
    const res = await fetch(`${baseUrl}/api/reports/definitions`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ name: "Weekly Health", reportType: "health" })
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { id: string; reportType: string };
    expect(data.reportType).toBe("health");
  });

  it("GET /api/reports/definitions → 200", async () => {
    await fetch(`${baseUrl}/api/reports/definitions`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ name: "Test", reportType: "velocity" })
    });
    const res = await fetch(`${baseUrl}/api/reports/definitions`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json() as Array<{ name: string }>;
    expect(data.length).toBe(1);
  });

  it("GET /api/reports/definitions?type=health → filters", async () => {
    await fetch(`${baseUrl}/api/reports/definitions`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "H", reportType: "health" }) });
    await fetch(`${baseUrl}/api/reports/definitions`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "V", reportType: "velocity" }) });
    const res = await fetch(`${baseUrl}/api/reports/definitions?type=health`, { headers: authHeaders() });
    const data = await res.json() as Array<{ reportType: string }>;
    expect(data.length).toBe(1);
    expect(data[0].reportType).toBe("health");
  });

  it("DELETE /api/reports/definitions/:id → 204", async () => {
    const createRes = await fetch(`${baseUrl}/api/reports/definitions`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: "Del", reportType: "health" }) });
    const def = await createRes.json() as { id: string };
    const res = await fetch(`${baseUrl}/api/reports/definitions/${def.id}`, { method: "DELETE", headers: authHeaders() });
    expect(res.status).toBe(204);
  });

  it("POST /api/reports/generate/health → 200", async () => {
    const res = await fetch(`${baseUrl}/api/reports/generate/health`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ projectId })
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { overallScore: number; trend: string };
    expect(data.overallScore).toBeGreaterThanOrEqual(0);
    expect(['improving', 'stable', 'declining']).toContain(data.trend);
  });

  it("POST /api/reports/generate/velocity → 200", async () => {
    const res = await fetch(`${baseUrl}/api/reports/generate/velocity`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ projectId })
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { totalChanges: number };
    expect(data.totalChanges).toBeGreaterThanOrEqual(0);
  });

  it("POST /api/reports/generate/coverage → 200", async () => {
    const res = await fetch(`${baseUrl}/api/reports/generate/coverage`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ projectId })
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { overallCoverage: number };
    expect(data.overallCoverage).toBeGreaterThanOrEqual(0);
  });

  it("POST /api/reports/generate/compliance → 200", async () => {
    const res = await fetch(`${baseUrl}/api/reports/generate/compliance`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ projectId })
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { validationPassRate: number };
    expect(data.validationPassRate).toBe(100);
  });

  it("GET /api/reports/health-history/:projectId → 200", async () => {
    // Generate a health report first to create snapshots
    await fetch(`${baseUrl}/api/reports/generate/health`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ projectId })
    });
    const res = await fetch(`${baseUrl}/api/reports/health-history/${projectId}`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("POST /api/reports/generate/health with nonexistent project → 404", async () => {
    const res = await fetch(`${baseUrl}/api/reports/generate/health`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ projectId: "nonexistent" })
    });
    expect(res.status).toBe(404);
  });
});
