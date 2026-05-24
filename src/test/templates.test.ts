import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { AppDatabase } from "../server/db/database";
import { extractTemplateFromProject, buildTemplatePreview, getBuiltinTemplates } from "../server/templates/templateEngine";
import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord } from "../shared/types";
import type { Template } from "../shared/templateTypes";

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
    id: `m-${key}`, dimensionId: dimId, memberKey: key, description: `${key} desc`,
    properties: props, rowOrder: 1, sourceRowNumber: 1, isActive: true,
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

describe("Template Engine: extractTemplateFromProject", () => {
  it("extracts dimension data from project", () => {
    const dimensions = [dimFixture({ id: "dim-acc", dimensionType: "Account" })];
    const members = [
      memberFixture("Root", "dim-acc"),
      memberFixture("Revenue", "dim-acc", { AccountType: "Revenue" })
    ];
    const relationships = [relFixture("Root", "Revenue", "dim-acc")];

    const result = extractTemplateFromProject({ dimensions, members, relationships }, ["Account"]);
    expect(result.dimensions.length).toBe(1);
    expect(result.dimensions[0].dimensionType).toBe("Account");
    expect(result.dimensions[0].members.length).toBe(2);
    expect(result.dimensions[0].relationships.length).toBe(1);
  });

  it("only extracts requested dimension types", () => {
    const dimensions = [
      dimFixture({ id: "dim-acc", dimensionType: "Account" }),
      dimFixture({ id: "dim-ent", dimensionType: "Entity", dimensionName: "Entities" })
    ];
    const members = [
      memberFixture("Rev", "dim-acc"),
      memberFixture("Corp", "dim-ent")
    ];

    const result = extractTemplateFromProject({ dimensions, members, relationships: [] }, ["Account"]);
    expect(result.dimensions.length).toBe(1);
    expect(result.dimensions[0].dimensionType).toBe("Account");
  });

  it("preserves member properties in template", () => {
    const dimensions = [dimFixture({ id: "dim-acc", dimensionType: "Account" })];
    const members = [memberFixture("Rev", "dim-acc", { AccountType: "Revenue", Currency: "USD" })];

    const result = extractTemplateFromProject({ dimensions, members, relationships: [] }, ["Account"]);
    expect(result.dimensions[0].members[0].properties).toEqual({ AccountType: "Revenue", Currency: "USD" });
  });
});

describe("Template Engine: buildTemplatePreview", () => {
  it("builds preview with sample members", () => {
    const template: Template = {
      id: "tpl-1", name: "Test", description: "A test template",
      category: "custom", industry: null, dimensionTypes: ["Account"],
      templateData: {
        dimensions: [{
          dimensionType: "Account", dimensionName: "Accounts",
          members: [
            { memberKey: "Root", description: "", properties: {} },
            { memberKey: "Revenue", description: "", properties: {} }
          ],
          relationships: [{ parentKey: "Root", childKey: "Revenue" }]
        }]
      },
      tags: [], version: "1.0.0", isPublic: false, usageCount: 0,
      createdBy: "admin", createdAt: testTimestamp, updatedAt: testTimestamp
    };

    const preview = buildTemplatePreview(template);
    expect(preview.name).toBe("Test");
    expect(preview.dimensions.length).toBe(1);
    expect(preview.dimensions[0].memberCount).toBe(2);
    expect(preview.dimensions[0].relationshipCount).toBe(1);
    expect(preview.dimensions[0].sampleMembers).toContain("Root");
  });
});

describe("Template Engine: getBuiltinTemplates", () => {
  it("returns at least 2 builtin templates", () => {
    const builtins = getBuiltinTemplates();
    expect(builtins.length).toBeGreaterThanOrEqual(2);
  });

  it("builtin templates have valid structure", () => {
    const builtins = getBuiltinTemplates();
    for (const tpl of builtins) {
      expect(tpl.name.length).toBeGreaterThan(0);
      expect(tpl.templateData.dimensions.length).toBeGreaterThan(0);
      expect(tpl.dimensionTypes.length).toBeGreaterThan(0);
    }
  });
});

// --- API Integration Tests ---

describe("Template API endpoints", () => {
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
        jwt: { secret: "test-secret-templates", accessTokenExpiry: "15m", refreshTokenExpiry: "7d" },
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
      body: JSON.stringify({ name: "Template Test Project", description: "Test" })
    });
    projectId = ((await projRes.json()) as { id: string }).id;
  });

  afterEach(async () => { await closeServer(); db.close(); });

  function authHeaders() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` };
  }

  it("POST /api/templates → 201 creates template", async () => {
    const res = await fetch(`${baseUrl}/api/templates`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({
        name: "My Template",
        dimensionTypes: ["Account"],
        templateData: {
          dimensions: [{ dimensionType: "Account", dimensionName: "Accts", members: [{ memberKey: "Root", description: "", properties: {} }], relationships: [] }]
        }
      })
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { id: string; name: string };
    expect(data.name).toBe("My Template");
    expect(data.id).toBeDefined();
  });

  it("GET /api/templates → 200 lists templates", async () => {
    await fetch(`${baseUrl}/api/templates`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ name: "Tpl1", dimensionTypes: ["Account"], templateData: { dimensions: [] } })
    });
    const res = await fetch(`${baseUrl}/api/templates`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json() as Array<{ name: string }>;
    expect(data.length).toBe(1);
  });

  it("GET /api/templates?search= → filters by name", async () => {
    await fetch(`${baseUrl}/api/templates`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ name: "Manufacturing CoA", dimensionTypes: ["Account"], templateData: { dimensions: [] } })
    });
    await fetch(`${baseUrl}/api/templates`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ name: "Entity Hierarchy", dimensionTypes: ["Entity"], templateData: { dimensions: [] } })
    });
    const res = await fetch(`${baseUrl}/api/templates?search=Manufacturing`, { headers: authHeaders() });
    const data = await res.json() as Array<{ name: string }>;
    expect(data.length).toBe(1);
    expect(data[0].name).toBe("Manufacturing CoA");
  });

  it("GET /api/templates/:id/preview → 200 with preview", async () => {
    const createRes = await fetch(`${baseUrl}/api/templates`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({
        name: "Preview Test",
        dimensionTypes: ["Account"],
        templateData: { dimensions: [{ dimensionType: "Account", dimensionName: "Accts", members: [{ memberKey: "Root", description: "", properties: {} }], relationships: [] }] }
      })
    });
    const tpl = await createRes.json() as { id: string };

    const res = await fetch(`${baseUrl}/api/templates/${tpl.id}/preview`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json() as { name: string; dimensions: Array<{ memberCount: number }> };
    expect(data.name).toBe("Preview Test");
    expect(data.dimensions[0].memberCount).toBe(1);
  });

  it("POST /api/templates/:id/apply → 201 applies template to project", async () => {
    const createRes = await fetch(`${baseUrl}/api/templates`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({
        name: "Apply Test",
        dimensionTypes: ["Account"],
        templateData: { dimensions: [{ dimensionType: "Account", dimensionName: "Accounts", members: [{ memberKey: "Root", description: "Root", properties: {} }, { memberKey: "Revenue", description: "Rev", properties: {} }], relationships: [{ parentKey: "Root", childKey: "Revenue" }] }] }
      })
    });
    const tpl = await createRes.json() as { id: string };

    const res = await fetch(`${baseUrl}/api/templates/${tpl.id}/apply`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ projectId })
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { membersCreated: number; relationshipsCreated: number; applicationId: string };
    expect(data.membersCreated).toBe(2);
    expect(data.relationshipsCreated).toBe(1);
    expect(data.applicationId).toBeDefined();
  });

  it("POST /api/templates/:id/apply with renameMapping → renames members", async () => {
    const createRes = await fetch(`${baseUrl}/api/templates`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({
        name: "Rename Test",
        dimensionTypes: ["Entity"],
        templateData: { dimensions: [{ dimensionType: "Entity", dimensionName: "Entities", members: [{ memberKey: "Corp", description: "", properties: {} }], relationships: [] }] }
      })
    });
    const tpl = await createRes.json() as { id: string };

    const res = await fetch(`${baseUrl}/api/templates/${tpl.id}/apply`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ projectId, renameMapping: { "Corp": "MyCorp" } })
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { membersCreated: number };
    expect(data.membersCreated).toBe(1);
  });

  it("POST /api/templates/from-project → 201 extracts template", async () => {
    // First apply a template to create some data
    const createRes = await fetch(`${baseUrl}/api/templates`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({
        name: "Source",
        dimensionTypes: ["Account"],
        templateData: { dimensions: [{ dimensionType: "Account", dimensionName: "Accounts", members: [{ memberKey: "Root", description: "", properties: {} }], relationships: [] }] }
      })
    });
    const tpl = await createRes.json() as { id: string };
    await fetch(`${baseUrl}/api/templates/${tpl.id}/apply`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ projectId })
    });

    // Now extract from project
    const res = await fetch(`${baseUrl}/api/templates/from-project`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ projectId, dimensionTypes: ["Account"], name: "Extracted" })
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { name: string; templateData: { dimensions: Array<{ members: unknown[] }> } };
    expect(data.name).toBe("Extracted");
    expect(data.templateData.dimensions[0].members.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/templates/seed → seeds builtin templates", async () => {
    const res = await fetch(`${baseUrl}/api/templates/seed`, {
      method: "POST", headers: authHeaders()
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { seeded: number };
    expect(data.seeded).toBeGreaterThanOrEqual(2);
  });

  it("DELETE /api/templates/:id → 204", async () => {
    const createRes = await fetch(`${baseUrl}/api/templates`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ name: "ToDelete", dimensionTypes: ["Account"], templateData: { dimensions: [] } })
    });
    const tpl = await createRes.json() as { id: string };

    const res = await fetch(`${baseUrl}/api/templates/${tpl.id}`, {
      method: "DELETE", headers: authHeaders()
    });
    expect(res.status).toBe(204);
  });

  it("GET /api/templates/nonexistent/preview → 404", async () => {
    const res = await fetch(`${baseUrl}/api/templates/nonexistent/preview`, { headers: authHeaders() });
    expect(res.status).toBe(404);
  });

  it("POST /api/templates/:id/apply with nonexistent project → 404", async () => {
    const createRes = await fetch(`${baseUrl}/api/templates`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ name: "X", dimensionTypes: ["Account"], templateData: { dimensions: [] } })
    });
    const tpl = await createRes.json() as { id: string };

    const res = await fetch(`${baseUrl}/api/templates/${tpl.id}/apply`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ projectId: "nonexistent" })
    });
    expect(res.status).toBe(404);
  });
});
