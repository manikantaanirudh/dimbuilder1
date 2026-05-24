import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { AppDatabase } from "../server/db/database";
import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord } from "../shared/types";
import { buildDimensionMap, whereUsed, buildInheritanceChains, validateCrossDimension } from "../server/crossDimension/crossDimensionEngine";
import type { CrossDimensionRule } from "../shared/crossDimensionTypes";

const testTimestamp = "2026-01-01T00:00:00.000Z";

function dimFixture(overrides: Partial<DimensionRecord>): DimensionRecord {
  return {
    id: "dim-1",
    projectId: "proj-1",
    sheetName: "Sheet",
    dimensionType: "Account",
    dimensionName: "Accounts",
    description: "",
    accessGroup: "Everyone",
    maintenanceGroup: "Everyone",
    inheritedDimension: "",
    sortOrder: 1,
    metadata: {},
    createdAt: testTimestamp,
    updatedAt: testTimestamp,
    ...overrides
  };
}

function memberFixture(key: string, dimId: string, props: Record<string, unknown> = {}): DimensionMemberRecord {
  return {
    id: `m-${dimId}-${key}`,
    dimensionId: dimId,
    memberKey: key,
    description: "",
    properties: { ...props },
    rowOrder: 1,
    sourceRowNumber: 1,
    isActive: true,
    createdAt: testTimestamp,
    updatedAt: testTimestamp
  };
}

function relFixture(parent: string, child: string, dimId: string): DimensionRelationshipRecord {
  return {
    id: `r-${dimId}-${parent}-${child}`,
    dimensionId: dimId,
    parentKey: parent,
    childKey: child,
    aggregationWeight: 1,
    percentConsol: null,
    percentOwnership: null,
    ownershipType: "",
    properties: {},
    rowOrder: 1,
    sourceRowNumber: 1,
    createdAt: testTimestamp,
    updatedAt: testTimestamp
  };
}

// --- Pure Engine Tests ---

describe("Cross-Dimension Engine: buildDimensionMap", () => {
  it("creates nodes for all dimensions with member counts", () => {
    const dimensions = [
      dimFixture({ id: "dim-acc", dimensionType: "Account", dimensionName: "Accounts" }),
      dimFixture({ id: "dim-ent", dimensionType: "Entity", dimensionName: "Entities" })
    ];
    const members = [
      memberFixture("Rev", "dim-acc"),
      memberFixture("Exp", "dim-acc"),
      memberFixture("Corp", "dim-ent")
    ];
    const map = buildDimensionMap({ dimensions, members, relationships: [] });
    expect(map.nodes.length).toBe(2);
    expect(map.nodes.find(n => n.dimensionType === "Account")!.memberCount).toBe(2);
    expect(map.nodes.find(n => n.dimensionType === "Entity")!.memberCount).toBe(1);
  });

  it("detects inheritance edges", () => {
    const dimensions = [
      dimFixture({ id: "dim-ud3", dimensionType: "UD3", dimensionName: "UD3_Local", inheritedDimension: "UD3_Corporate" }),
      dimFixture({ id: "dim-ud3corp", dimensionType: "UD3", dimensionName: "UD3_Corporate" })
    ];
    const map = buildDimensionMap({ dimensions, members: [], relationships: [] });
    const inhEdge = map.edges.find(e => e.edgeType === 'inheritance');
    expect(inhEdge).toBeDefined();
  });

  it("detects property reference edges", () => {
    const dimensions = [
      dimFixture({ id: "dim-acc", dimensionType: "Account", dimensionName: "Accounts" }),
      dimFixture({ id: "dim-ent", dimensionType: "Entity", dimensionName: "Entities" })
    ];
    const members = [
      memberFixture("Rev", "dim-acc", { DefaultEntity: "Corp" }),
      memberFixture("Corp", "dim-ent")
    ];
    const map = buildDimensionMap({ dimensions, members, relationships: [] });
    const refEdge = map.edges.find(e => e.edgeType === 'property_ref');
    expect(refEdge).toBeDefined();
    expect(refEdge!.source).toBe("Account");
    expect(refEdge!.target).toBe("Entity");
    expect(refEdge!.referenceCount).toBe(1);
  });

  it("counts multiple property references on same edge", () => {
    const dimensions = [
      dimFixture({ id: "dim-acc", dimensionType: "Account", dimensionName: "Accounts" }),
      dimFixture({ id: "dim-ent", dimensionType: "Entity", dimensionName: "Entities" })
    ];
    const members = [
      memberFixture("Rev", "dim-acc", { DefaultEntity: "Corp" }),
      memberFixture("Exp", "dim-acc", { DefaultEntity: "Corp" }),
      memberFixture("Corp", "dim-ent")
    ];
    const map = buildDimensionMap({ dimensions, members, relationships: [] });
    const refEdge = map.edges.find(e => e.edgeType === 'property_ref');
    expect(refEdge!.referenceCount).toBe(2);
  });
});

describe("Cross-Dimension Engine: whereUsed", () => {
  it("finds references to a member across dimensions", () => {
    const dimensions = [
      dimFixture({ id: "dim-acc", dimensionType: "Account" }),
      dimFixture({ id: "dim-ent", dimensionType: "Entity" })
    ];
    const members = [
      memberFixture("Corp", "dim-ent"),
      memberFixture("Rev", "dim-acc", { Entity: "Corp" }),
      memberFixture("Exp", "dim-acc", { Entity: "Corp" })
    ];
    const result = whereUsed("Corp", "Entity", { dimensions, members, relationships: [] });
    expect(result.totalReferences).toBe(2);
    expect(result.references[0].dimensionType).toBe("Account");
    expect(result.references[0].propertyName).toBe("Entity");
  });

  it("returns empty when no references exist", () => {
    const dimensions = [
      dimFixture({ id: "dim-acc", dimensionType: "Account" }),
      dimFixture({ id: "dim-ent", dimensionType: "Entity" })
    ];
    const members = [
      memberFixture("Corp", "dim-ent"),
      memberFixture("Rev", "dim-acc", { Description: "Revenue" })
    ];
    const result = whereUsed("Corp", "Entity", { dimensions, members, relationships: [] });
    expect(result.totalReferences).toBe(0);
  });

  it("does not include self-references from same dimension", () => {
    const dimensions = [dimFixture({ id: "dim-acc", dimensionType: "Account" })];
    const members = [
      memberFixture("Rev", "dim-acc", { Parent: "Rev" }),
      memberFixture("Rev2", "dim-acc", { RelatedTo: "Rev" })
    ];
    const result = whereUsed("Rev", "Account", { dimensions, members, relationships: [] });
    expect(result.totalReferences).toBe(0);
  });
});

describe("Cross-Dimension Engine: buildInheritanceChains", () => {
  it("builds chain for dimension with inheritance", () => {
    const dimensions = [
      dimFixture({ id: "dim-ud3", dimensionType: "UD3", dimensionName: "UD3_Local", inheritedDimension: "UD3_Corporate" }),
      dimFixture({ id: "dim-ud3corp", dimensionType: "UD3", dimensionName: "UD3_Corporate" })
    ];
    const chains = buildInheritanceChains(dimensions);
    expect(chains.length).toBe(1);
    expect(chains[0].dimensionType).toBe("UD3");
    expect(chains[0].inheritsFrom).toBe("UD3_Corporate");
    expect(chains[0].depth).toBe(1);
  });

  it("returns empty for dimensions without inheritance", () => {
    const dimensions = [
      dimFixture({ id: "dim-acc", dimensionType: "Account" }),
      dimFixture({ id: "dim-ent", dimensionType: "Entity" })
    ];
    const chains = buildInheritanceChains(dimensions);
    expect(chains.length).toBe(0);
  });
});

describe("Cross-Dimension Engine: validateCrossDimension", () => {
  const accountDim = dimFixture({ id: "dim-acc", dimensionType: "Account", dimensionName: "Accounts" });
  const entityDim = dimFixture({ id: "dim-ent", dimensionType: "Entity", dimensionName: "Entities" });

  it("member_exists rule detects missing members", () => {
    const members = [
      memberFixture("Corp", "dim-ent"),
      memberFixture("Rev", "dim-acc"),
      memberFixture("Exp", "dim-acc")
    ];
    const rules: CrossDimensionRule[] = [{
      id: "rule-1", projectId: "proj-1", name: "Entity must have Account",
      sourceDimensionType: "Entity", targetDimensionType: "Account",
      ruleType: "member_exists", ruleConfig: {},
      severity: "warning", isActive: true, createdBy: "admin", createdAt: testTimestamp
    }];
    const result = validateCrossDimension(rules, {
      dimensions: [accountDim, entityDim], members, relationships: []
    });
    expect(result.totalViolations).toBe(1);
    expect(result.rules[0].violations[0].sourceMemberKey).toBe("Corp");
  });

  it("member_exists rule respects excludePatterns", () => {
    const members = [
      memberFixture("Root", "dim-ent"),
      memberFixture("Corp", "dim-ent"),
      memberFixture("Corp", "dim-acc")
    ];
    const rules: CrossDimensionRule[] = [{
      id: "rule-1", projectId: "proj-1", name: "Entity must have Account",
      sourceDimensionType: "Entity", targetDimensionType: "Account",
      ruleType: "member_exists", ruleConfig: { excludePatterns: ["^Root$"] },
      severity: "warning", isActive: true, createdBy: "admin", createdAt: testTimestamp
    }];
    const result = validateCrossDimension(rules, {
      dimensions: [accountDim, entityDim], members, relationships: []
    });
    expect(result.totalViolations).toBe(0);
  });

  it("property_maps rule detects invalid references", () => {
    const members = [
      memberFixture("Rev", "dim-acc", { Entity: "NonExistent" }),
      memberFixture("Corp", "dim-ent")
    ];
    const rules: CrossDimensionRule[] = [{
      id: "rule-2", projectId: "proj-1", name: "Account Entity property must map to Entity dim",
      sourceDimensionType: "Account", targetDimensionType: "Entity",
      ruleType: "property_maps", ruleConfig: { propertyName: "Entity" },
      severity: "error", isActive: true, createdBy: "admin", createdAt: testTimestamp
    }];
    const result = validateCrossDimension(rules, {
      dimensions: [accountDim, entityDim], members, relationships: []
    });
    expect(result.totalViolations).toBe(1);
    expect(result.rules[0].violations[0].message).toContain("NonExistent");
  });

  it("property_maps rule passes for valid references", () => {
    const members = [
      memberFixture("Rev", "dim-acc", { Entity: "Corp" }),
      memberFixture("Corp", "dim-ent")
    ];
    const rules: CrossDimensionRule[] = [{
      id: "rule-2", projectId: "proj-1", name: "Account Entity maps to Entity",
      sourceDimensionType: "Account", targetDimensionType: "Entity",
      ruleType: "property_maps", ruleConfig: { propertyName: "Entity" },
      severity: "error", isActive: true, createdBy: "admin", createdAt: testTimestamp
    }];
    const result = validateCrossDimension(rules, {
      dimensions: [accountDim, entityDim], members, relationships: []
    });
    expect(result.totalViolations).toBe(0);
  });

  it("hierarchy_mirrors rule detects missing relationships", () => {
    const members = [
      memberFixture("Root", "dim-acc"),
      memberFixture("Rev", "dim-acc"),
      memberFixture("Root", "dim-ent"),
      memberFixture("Rev", "dim-ent")
    ];
    const relationships = [
      relFixture("Root", "Rev", "dim-acc")
      // Missing Root→Rev in entity dimension
    ];
    const rules: CrossDimensionRule[] = [{
      id: "rule-3", projectId: "proj-1", name: "Account hierarchy mirrors Entity",
      sourceDimensionType: "Account", targetDimensionType: "Entity",
      ruleType: "hierarchy_mirrors", ruleConfig: {},
      severity: "warning", isActive: true, createdBy: "admin", createdAt: testTimestamp
    }];
    const result = validateCrossDimension(rules, {
      dimensions: [accountDim, entityDim], members, relationships
    });
    expect(result.totalViolations).toBe(1);
  });

  it("skips inactive rules", () => {
    const members = [memberFixture("Corp", "dim-ent")];
    const rules: CrossDimensionRule[] = [{
      id: "rule-1", projectId: "proj-1", name: "Inactive Rule",
      sourceDimensionType: "Entity", targetDimensionType: "Account",
      ruleType: "member_exists", ruleConfig: {},
      severity: "warning", isActive: false, createdBy: "admin", createdAt: testTimestamp
    }];
    const result = validateCrossDimension(rules, {
      dimensions: [accountDim, entityDim], members, relationships: []
    });
    expect(result.totalRules).toBe(0);
  });
});

// --- API Integration Tests ---

describe("Cross-Dimension API endpoints", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let db: AppDatabase;
  let adminToken = "";
  let projectId = "";

  function testConfig(): AppConfig {
    return {
      ...defaultAppConfig,
      auth: {
        ...defaultAppConfig.auth,
        enabled: true,
        strategy: "local",
        jwt: {
          secret: "test-secret-cross-dim",
          accessTokenExpiry: "15m",
          refreshTokenExpiry: "7d"
        },
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.com", password: "Password123!", displayName: "Admin" })
    });
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.com", password: "Password123!" })
    });
    const loginData = await loginRes.json() as { accessToken: string };
    adminToken = loginData.accessToken;

    const projRes = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: "CrossDim Test", description: "Test" })
    });
    const projData = await projRes.json() as { id: string };
    projectId = projData.id;
  });

  afterEach(async () => {
    await closeServer();
    db.close();
  });

  function authHeaders() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` };
  }

  it("GET /api/projects/:id/cross-dimension/map → 200 with nodes and edges", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/cross-dimension/map`, {
      headers: authHeaders()
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { nodes: unknown[]; edges: unknown[] };
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(Array.isArray(data.edges)).toBe(true);
  });

  it("GET /api/projects/:id/cross-dimension/where-used → 400 without params", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/cross-dimension/where-used`, {
      headers: authHeaders()
    });
    expect(res.status).toBe(400);
  });

  it("GET /api/projects/:id/cross-dimension/where-used → 200 with params", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/cross-dimension/where-used?memberKey=Corp&dimensionType=Entity`, {
      headers: authHeaders()
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { memberKey: string; totalReferences: number };
    expect(data.memberKey).toBe("Corp");
    expect(data.totalReferences).toBe(0);
  });

  it("GET /api/projects/:id/cross-dimension/inheritance → 200", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/cross-dimension/inheritance`, {
      headers: authHeaders()
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("POST /api/projects/:id/cross-dimension/validate → 200", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/cross-dimension/validate`, {
      method: "POST",
      headers: authHeaders()
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { totalViolations: number; totalRules: number };
    expect(data.totalRules).toBe(0);
    expect(data.totalViolations).toBe(0);
  });

  it("POST /api/projects/:id/cross-dimension/rules → 201 creates rule", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/cross-dimension/rules`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        name: "Entity exists in Account",
        sourceDimensionType: "Entity",
        targetDimensionType: "Account",
        ruleType: "member_exists"
      })
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { id: string; name: string; ruleType: string };
    expect(data.name).toBe("Entity exists in Account");
    expect(data.ruleType).toBe("member_exists");
  });

  it("GET /api/projects/:id/cross-dimension/rules → lists rules", async () => {
    await fetch(`${baseUrl}/api/projects/${projectId}/cross-dimension/rules`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        name: "Test Rule",
        sourceDimensionType: "Entity",
        targetDimensionType: "Account",
        ruleType: "member_exists"
      })
    });
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/cross-dimension/rules`, {
      headers: authHeaders()
    });
    expect(res.status).toBe(200);
    const data = await res.json() as Array<{ name: string }>;
    expect(data.length).toBe(1);
    expect(data[0].name).toBe("Test Rule");
  });

  it("PATCH /api/projects/:id/cross-dimension/rules/:ruleId → updates rule", async () => {
    const createRes = await fetch(`${baseUrl}/api/projects/${projectId}/cross-dimension/rules`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        name: "Original",
        sourceDimensionType: "Entity",
        targetDimensionType: "Account",
        ruleType: "member_exists"
      })
    });
    const rule = await createRes.json() as { id: string };

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/cross-dimension/rules/${rule.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ name: "Updated", isActive: false })
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { name: string; isActive: boolean };
    expect(data.name).toBe("Updated");
    expect(data.isActive).toBe(false);
  });

  it("DELETE /api/projects/:id/cross-dimension/rules/:ruleId → 204", async () => {
    const createRes = await fetch(`${baseUrl}/api/projects/${projectId}/cross-dimension/rules`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        name: "ToDelete",
        sourceDimensionType: "Entity",
        targetDimensionType: "Account",
        ruleType: "member_exists"
      })
    });
    const rule = await createRes.json() as { id: string };

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/cross-dimension/rules/${rule.id}`, {
      method: "DELETE",
      headers: authHeaders()
    });
    expect(res.status).toBe(204);
  });

  it("POST /api/projects/:id/cross-dimension/rules → 400 for invalid input", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/cross-dimension/rules`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name: "" })
    });
    expect(res.status).toBe(400);
  });

  it("PATCH nonexistent rule → 404", async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/cross-dimension/rules/nonexistent`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ name: "X" })
    });
    expect(res.status).toBe(404);
  });

  it("GET nonexistent project → 404", async () => {
    const res = await fetch(`${baseUrl}/api/projects/nonexistent/cross-dimension/map`, {
      headers: authHeaders()
    });
    expect(res.status).toBe(404);
  });
});
