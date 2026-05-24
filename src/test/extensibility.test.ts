import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { AppDatabase } from "../server/db/database";
import type { DimensionMemberRecord, DimensionRecord } from "../shared/types";
import { buildExtensibilityModel, detectAntiPatterns, whatIfExtension, generateDocumentation } from "../server/extensibility/extensibilityEngine";

const testTimestamp = "2026-01-01T00:00:00.000Z";

function dimFixture(overrides: Partial<DimensionRecord>): DimensionRecord {
  return {
    id: "dim-1", projectId: "proj-1", sheetName: "Sheet", dimensionType: "Account",
    dimensionName: "Accounts", description: "", accessGroup: "Everyone",
    maintenanceGroup: "Everyone", inheritedDimension: "", sortOrder: 1,
    metadata: {}, createdAt: testTimestamp, updatedAt: testTimestamp,
    ...overrides
  };
}

function memberFixture(key: string, dimId: string, props: Record<string, unknown> = {}): DimensionMemberRecord {
  return {
    id: `m-${dimId}-${key}`, dimensionId: dimId, memberKey: key, description: "",
    properties: props, rowOrder: 1, sourceRowNumber: 1, isActive: true,
    createdAt: testTimestamp, updatedAt: testTimestamp
  };
}

// --- Pure Engine Tests ---

describe("Extensibility Engine: buildExtensibilityModel", () => {
  it("identifies base dimensions (no inheritance)", () => {
    const dimensions = [dimFixture({ id: "dim-acc", dimensionType: "Account" })];
    const model = buildExtensibilityModel({ dimensions, members: [], relationships: [] });
    expect(model.cubeTypes.length).toBe(1);
    expect(model.cubeTypes[0].cubeType).toBe("base");
    expect(model.cubeTypes[0].depth).toBe(0);
  });

  it("identifies extended dimensions", () => {
    const dimensions = [
      dimFixture({ id: "dim-base", dimensionType: "UD3", dimensionName: "UD3_Corp" }),
      dimFixture({ id: "dim-ext", dimensionType: "UD4", dimensionName: "UD3_Local", inheritedDimension: "UD3_Corp" })
    ];
    const model = buildExtensibilityModel({ dimensions, members: [], relationships: [] });
    expect(model.dimensionExtensions.length).toBe(1);
    expect(model.dimensionExtensions[0].baseDimensionName).toBe("UD3_Corp");
  });

  it("separates local vs inherited members", () => {
    const dimensions = [
      dimFixture({ id: "dim-base", dimensionType: "UD3", dimensionName: "UD3_Corp" }),
      dimFixture({ id: "dim-ext", dimensionType: "UD4", dimensionName: "UD3_Local", inheritedDimension: "UD3_Corp" })
    ];
    const members = [
      memberFixture("Root", "dim-base"),
      memberFixture("Shared", "dim-base"),
      memberFixture("Root", "dim-ext"),
      memberFixture("Shared", "dim-ext"),
      memberFixture("LocalOnly", "dim-ext")
    ];
    const model = buildExtensibilityModel({ dimensions, members, relationships: [] });
    expect(model.dimensionExtensions[0].inheritedMembers).toContain("Root");
    expect(model.dimensionExtensions[0].inheritedMembers).toContain("Shared");
    expect(model.dimensionExtensions[0].localMembers).toContain("LocalOnly");
  });

  it("detects property overrides", () => {
    const dimensions = [
      dimFixture({ id: "dim-base", dimensionType: "UD3", dimensionName: "UD3_Corp" }),
      dimFixture({ id: "dim-ext", dimensionType: "UD4", dimensionName: "UD3_Local", inheritedDimension: "UD3_Corp" })
    ];
    const members = [
      memberFixture("Member1", "dim-base", { AccountType: "Revenue" }),
      memberFixture("Member1", "dim-ext", { AccountType: "Expense" })
    ];
    const model = buildExtensibilityModel({ dimensions, members, relationships: [] });
    expect(model.dimensionExtensions[0].overriddenProperties.length).toBe(1);
    expect(model.dimensionExtensions[0].overriddenProperties[0].baseValue).toBe("Revenue");
    expect(model.dimensionExtensions[0].overriddenProperties[0].extendedValue).toBe("Expense");
  });
});

describe("Extensibility Engine: detectAntiPatterns", () => {
  it("detects orphaned extension", () => {
    const dimensions = [
      dimFixture({ id: "dim-ext", dimensionType: "UD3", dimensionName: "UD3_Local", inheritedDimension: "NonExistent" })
    ];
    const patterns = detectAntiPatterns({ dimensions, members: [], relationships: [] });
    const orphaned = patterns.find(p => p.type === 'orphaned_extension');
    expect(orphaned).toBeDefined();
    expect(orphaned!.severity).toBe("error");
  });

  it("returns empty for well-structured dimensions", () => {
    const dimensions = [
      dimFixture({ id: "dim-acc", dimensionType: "Account" }),
      dimFixture({ id: "dim-ent", dimensionType: "Entity" })
    ];
    const patterns = detectAntiPatterns({ dimensions, members: [], relationships: [] });
    expect(patterns.length).toBe(0);
  });
});

describe("Extensibility Engine: whatIfExtension", () => {
  it("calculates member count impact", () => {
    const dimensions = [dimFixture({ id: "dim-acc", dimensionType: "Account" })];
    const members = [memberFixture("Root", "dim-acc")];

    const result = whatIfExtension(
      { dimensionType: "Account", cubeType: "base", addMembers: ["A", "B", "C"] },
      { dimensions, members, relationships: [] }
    );
    expect(result.impact.memberCountChange).toBe(3);
    expect(result.impact.affectedCubeTypes).toContain("base");
  });
});

describe("Extensibility Engine: generateDocumentation", () => {
  it("generates documentation with base members and extensions", () => {
    const dimensions = [
      dimFixture({ id: "dim-base", dimensionType: "UD3", dimensionName: "UD3_Corp" }),
      dimFixture({ id: "dim-ext", dimensionType: "UD4", dimensionName: "UD3_Local", inheritedDimension: "UD3_Corp" })
    ];
    const members = [
      memberFixture("Root", "dim-base"),
      memberFixture("Root", "dim-ext"),
      memberFixture("Local", "dim-ext")
    ];
    const docs = generateDocumentation({ dimensions, members, relationships: [] });
    expect(docs.dimensions.length).toBeGreaterThan(0);
    expect(docs.generatedAt).toBeDefined();
  });
});

// --- API Integration Tests ---

describe("Extensibility API endpoints", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let db: AppDatabase;
  let adminToken = "";
  let projectId = "";

  function testConfig(): AppConfig {
    return {
      ...defaultAppConfig,
      auth: { ...defaultAppConfig.auth, enabled: true, strategy: "local", jwt: { secret: "test-ext", accessTokenExpiry: "15m", refreshTokenExpiry: "7d" }, allowSelfRegistration: false }
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

    const projRes = await fetch(`${baseUrl}/api/projects`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ name: "Ext Test", description: "" }) });
    projectId = ((await projRes.json()) as { id: string }).id;
  });

  afterEach(async () => { await closeServer(); db.close(); });
  function authHeaders() { return { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }; }

  it("GET /api/projects/:id/extensibility/model → 200", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/extensibility/model`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json() as { cubeTypes: unknown[]; dimensionExtensions: unknown[] };
    expect(Array.isArray(data.cubeTypes)).toBe(true);
    expect(Array.isArray(data.dimensionExtensions)).toBe(true);
  });

  it("GET /api/projects/:id/extensibility/anti-patterns → 200", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/extensibility/anti-patterns`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("POST /api/projects/:id/extensibility/what-if → 200", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/extensibility/what-if`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ dimensionType: "Account", cubeType: "base", addMembers: ["NewMember"] })
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { impact: { memberCountChange: number } };
    expect(data.impact.memberCountChange).toBe(1);
  });

  it("GET /api/projects/:id/extensibility/documentation → 200", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/extensibility/documentation`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json() as { generatedAt: string; antiPatterns: unknown[] };
    expect(data.generatedAt).toBeDefined();
  });

  it("GET nonexistent project → 404", async () => {
    const res = await fetch(`${baseUrl}/api/projects/nonexistent/extensibility/model`, { headers: authHeaders() });
    expect(res.status).toBe(404);
  });
});
