import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { AppDatabase } from "../server/db/database";
import {
  applyTransform,
  applyFilterRules,
  applyFieldMappings,
  buildHierarchy,
  detectConflicts,
  executeMappingPipeline
} from "../server/connectors/mapping/mappingEngine";

function testConfig(): AppConfig {
  return {
    ...defaultAppConfig,
    auth: {
      ...defaultAppConfig.auth,
      enabled: true,
      strategy: "local",
      jwt: {
        secret: "test-secret-for-connector-tests",
        accessTokenExpiry: "15m",
        refreshTokenExpiry: "7d"
      },
      allowSelfRegistration: false
    }
  };
}

describe("ERP connectors", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let db: AppDatabase;
  let adminToken = "";
  let authorToken = "";
  let viewerToken = "";

  beforeEach(async () => {
    const config = testConfig();
    db = createDatabase(":memory:");
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

    // Create author user
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

  function authorHeaders() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${authorToken}` };
  }

  function viewerHeaders() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${viewerToken}` };
  }

  async function createConnector(overrides = {}) {
    const body = {
      name: "Test SAP",
      connectorType: "rest",
      connectionConfig: { host: "erp.example.com", apiKey: "secret-key-123" },
      extractionConfig: { batchSize: 1000 },
      ...overrides
    };
    const res = await fetch(`${baseUrl}/api/connectors`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify(body)
    });
    return res;
  }

  describe("Connector CRUD", () => {
    it("creates a connector and redacts secrets in response", async () => {
      const res = await createConnector();
      expect(res.status).toBe(201);
      const data = await res.json() as Record<string, unknown>;
      expect(data.name).toBe("Test SAP");
      expect(data.connectorType).toBe("rest");
      expect((data.connectionConfig as Record<string, unknown>).apiKey).toBe("***REDACTED***");
      expect((data.connectionConfig as Record<string, unknown>).host).toBe("erp.example.com");
    });

    it("lists connectors with redacted secrets", async () => {
      await createConnector();
      await createConnector({ name: "Test Oracle" });

      const res = await fetch(`${baseUrl}/api/connectors`, { headers: adminHeaders() });
      expect(res.status).toBe(200);
      const data = await res.json() as Record<string, unknown>[];
      expect(data.length).toBe(2);
      expect((data[0].connectionConfig as Record<string, unknown>).apiKey).toBe("***REDACTED***");
    });

    it("updates a connector", async () => {
      const createRes = await createConnector();
      const created = await createRes.json() as Record<string, unknown>;

      const res = await fetch(`${baseUrl}/api/connectors/${created.id}`, {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify({ name: "Updated SAP" })
      });
      expect(res.status).toBe(200);
      const updated = await res.json() as Record<string, unknown>;
      expect(updated.name).toBe("Updated SAP");
    });

    it("deletes a connector", async () => {
      const createRes = await createConnector();
      const created = await createRes.json() as Record<string, unknown>;

      const res = await fetch(`${baseUrl}/api/connectors/${created.id}`, {
        method: "DELETE",
        headers: adminHeaders()
      });
      expect(res.status).toBe(200);

      const listRes = await fetch(`${baseUrl}/api/connectors`, { headers: adminHeaders() });
      const data = await listRes.json() as Record<string, unknown>[];
      expect(data.length).toBe(0);
    });

    it("rejects connector creation by viewer", async () => {
      const res = await fetch(`${baseUrl}/api/connectors`, {
        method: "POST",
        headers: viewerHeaders(),
        body: JSON.stringify({ name: "Hack", connectorType: "rest", connectionConfig: {}, extractionConfig: {} })
      });
      expect(res.status).toBe(403);
    });

    it("tests a connector connection", async () => {
      const createRes = await createConnector();
      const created = await createRes.json() as Record<string, unknown>;

      const res = await fetch(`${baseUrl}/api/connectors/${created.id}/test`, {
        method: "POST",
        headers: adminHeaders()
      });
      expect(res.status).toBe(200);
      const data = await res.json() as Record<string, unknown>;
      expect(data.success).toBe(true);
    });
  });

  describe("Mapping Rules CRUD", () => {
    it("creates a mapping rule for a connector", async () => {
      const createRes = await createConnector();
      const connector = await createRes.json() as Record<string, unknown>;

      const res = await fetch(`${baseUrl}/api/connectors/${connector.id}/mappings`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
          name: "Cost Center Mapping",
          sourceEntity: "cost_centers",
          targetDimensionType: "Entity",
          fieldMappings: [
            { source: "id", target: "memberKey", transform: 'prefix("CC_")' },
            { source: "name", target: "description" }
          ],
          hierarchyRules: { parentField: "parent", rootParent: "Root", parentTransform: 'prefix("CC_")' },
          filterRules: [{ field: "id", operator: "starts_with", values: ["CC"] }]
        })
      });
      expect(res.status).toBe(201);
      const rule = await res.json() as Record<string, unknown>;
      expect(rule.name).toBe("Cost Center Mapping");
      expect(rule.sourceEntity).toBe("cost_centers");
    });

    it("lists mapping rules for a connector", async () => {
      const createRes = await createConnector();
      const connector = await createRes.json() as Record<string, unknown>;

      await fetch(`${baseUrl}/api/connectors/${connector.id}/mappings`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
          name: "Rule A",
          sourceEntity: "cost_centers",
          targetDimensionType: "Entity",
          fieldMappings: [{ source: "id", target: "memberKey" }]
        })
      });

      const res = await fetch(`${baseUrl}/api/connectors/${connector.id}/mappings`, { headers: adminHeaders() });
      expect(res.status).toBe(200);
      const rules = await res.json() as Record<string, unknown>[];
      expect(rules.length).toBe(1);
    });

    it("updates a mapping rule", async () => {
      const createRes = await createConnector();
      const connector = await createRes.json() as Record<string, unknown>;

      const ruleRes = await fetch(`${baseUrl}/api/connectors/${connector.id}/mappings`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
          name: "Rule A",
          sourceEntity: "cost_centers",
          targetDimensionType: "Entity",
          fieldMappings: [{ source: "id", target: "memberKey" }]
        })
      });
      const rule = await ruleRes.json() as Record<string, unknown>;

      const updateRes = await fetch(`${baseUrl}/api/mappings/${rule.id}`, {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify({ name: "Updated Rule A" })
      });
      expect(updateRes.status).toBe(200);
      const updated = await updateRes.json() as Record<string, unknown>;
      expect(updated.name).toBe("Updated Rule A");
    });

    it("deletes a mapping rule", async () => {
      const createRes = await createConnector();
      const connector = await createRes.json() as Record<string, unknown>;

      const ruleRes = await fetch(`${baseUrl}/api/connectors/${connector.id}/mappings`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
          name: "Rule A",
          sourceEntity: "cost_centers",
          targetDimensionType: "Entity",
          fieldMappings: [{ source: "id", target: "memberKey" }]
        })
      });
      const rule = await ruleRes.json() as Record<string, unknown>;

      const delRes = await fetch(`${baseUrl}/api/mappings/${rule.id}`, {
        method: "DELETE",
        headers: adminHeaders()
      });
      expect(delRes.status).toBe(200);
    });
  });

  describe("Sync Jobs and Runs", () => {
    async function setupFullPipeline() {
      // Create a project
      const projRes = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ name: "Sync Test Project", description: "For sync testing" })
      });
      const project = await projRes.json() as Record<string, unknown>;

      // Create connector
      const connRes = await createConnector();
      const connector = await connRes.json() as Record<string, unknown>;

      // Create mapping rule
      const ruleRes = await fetch(`${baseUrl}/api/connectors/${connector.id}/mappings`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
          name: "CC Sync Rule",
          sourceEntity: "cost_centers",
          targetDimensionType: "Entity",
          fieldMappings: [
            { source: "id", target: "memberKey" },
            { source: "description", target: "description" }
          ],
          hierarchyRules: { parentField: "parent", rootParent: "Root" }
        })
      });
      const rule = await ruleRes.json() as Record<string, unknown>;

      return { project, connector, rule };
    }

    it("creates a sync job", async () => {
      const { project, connector, rule } = await setupFullPipeline();

      const res = await fetch(`${baseUrl}/api/sync-jobs`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
          connectorId: connector.id,
          mappingRuleId: rule.id,
          projectId: project.id
        })
      });
      expect(res.status).toBe(201);
      const job = await res.json() as Record<string, unknown>;
      expect(job.connectorId).toBe(connector.id);
      expect(job.isActive).toBe(true);
    });

    it("runs a sync job and records statistics", async () => {
      const { project, connector, rule } = await setupFullPipeline();

      const jobRes = await fetch(`${baseUrl}/api/sync-jobs`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
          connectorId: connector.id,
          mappingRuleId: rule.id,
          projectId: project.id
        })
      });
      const job = await jobRes.json() as Record<string, unknown>;

      const runRes = await fetch(`${baseUrl}/api/sync-jobs/${job.id}/run`, {
        method: "POST",
        headers: adminHeaders()
      });
      expect(runRes.status).toBe(200);
      const run = await runRes.json() as Record<string, unknown>;
      expect(run.status).toBe("success");
      expect(run.sourceRecordsRead).toBe(5);
      expect(run.membersCreated).toBe(5);
      expect(run.relationshipsCreated).toBe(5);
      expect(run.completedAt).not.toBeNull();
    });

    it("lists runs for a sync job", async () => {
      const { project, connector, rule } = await setupFullPipeline();

      const jobRes = await fetch(`${baseUrl}/api/sync-jobs`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ connectorId: connector.id, mappingRuleId: rule.id, projectId: project.id })
      });
      const job = await jobRes.json() as Record<string, unknown>;

      await fetch(`${baseUrl}/api/sync-jobs/${job.id}/run`, { method: "POST", headers: adminHeaders() });
      await fetch(`${baseUrl}/api/sync-jobs/${job.id}/run`, { method: "POST", headers: adminHeaders() });

      const runsRes = await fetch(`${baseUrl}/api/sync-jobs/${job.id}/runs`, { headers: adminHeaders() });
      expect(runsRes.status).toBe(200);
      const runs = await runsRes.json() as Record<string, unknown>[];
      expect(runs.length).toBe(2);
    });

    it("populates member source registry after sync", async () => {
      const { project, connector, rule } = await setupFullPipeline();

      const jobRes = await fetch(`${baseUrl}/api/sync-jobs`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ connectorId: connector.id, mappingRuleId: rule.id, projectId: project.id })
      });
      const job = await jobRes.json() as Record<string, unknown>;

      await fetch(`${baseUrl}/api/sync-jobs/${job.id}/run`, { method: "POST", headers: adminHeaders() });

      const regRes = await fetch(`${baseUrl}/api/projects/${project.id}/source-registry`, { headers: adminHeaders() });
      expect(regRes.status).toBe(200);
      const registry = await regRes.json() as Record<string, unknown>[];
      expect(registry.length).toBe(5);
      expect(registry[0].sourceSystem).toBe("Test SAP");
    });

    it("author role can run sync jobs", async () => {
      const { project, connector, rule } = await setupFullPipeline();

      const jobRes = await fetch(`${baseUrl}/api/sync-jobs`, {
        method: "POST",
        headers: authorHeaders(),
        body: JSON.stringify({ connectorId: connector.id, mappingRuleId: rule.id, projectId: project.id })
      });
      expect(jobRes.status).toBe(201);
    });

    it("viewer cannot create sync jobs", async () => {
      const { project, connector, rule } = await setupFullPipeline();

      const jobRes = await fetch(`${baseUrl}/api/sync-jobs`, {
        method: "POST",
        headers: viewerHeaders(),
        body: JSON.stringify({ connectorId: connector.id, mappingRuleId: rule.id, projectId: project.id })
      });
      expect(jobRes.status).toBe(403);
    });

    it("previews extraction with mapping", async () => {
      const { connector, rule } = await setupFullPipeline();

      const res = await fetch(`${baseUrl}/api/connectors/${connector.id}/preview`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ mappingRuleId: rule.id })
      });
      expect(res.status).toBe(200);
      const preview = await res.json() as Record<string, unknown>;
      expect(preview.membersToCreate).toBe(5);
      expect(preview.relationshipsToCreate).toBe(5);
      expect((preview.sampleRecords as unknown[]).length).toBeGreaterThan(0);
    });
  });

  describe("Mapping Engine Unit Tests", () => {
    describe("applyTransform", () => {
      it("applies prefix transform", () => {
        expect(applyTransform("001", 'prefix("CC_")')).toBe("CC_001");
      });

      it("applies suffix transform", () => {
        expect(applyTransform("001", 'suffix("_END")')).toBe("001_END");
      });

      it("applies trim transform", () => {
        expect(applyTransform("  hello  ", "trim")).toBe("hello");
      });

      it("applies uppercase transform", () => {
        expect(applyTransform("hello", "uppercase")).toBe("HELLO");
      });

      it("applies lowercase transform", () => {
        expect(applyTransform("HELLO", "lowercase")).toBe("hello");
      });

      it("returns value unchanged for unknown transform", () => {
        expect(applyTransform("value", "unknown_transform")).toBe("value");
      });

      it("returns value unchanged for empty transform", () => {
        expect(applyTransform("value", "")).toBe("value");
      });
    });

    describe("applyFilterRules", () => {
      const records = [
        { id: "CC001", name: "Eng", dept: "tech" },
        { id: "CC002", name: "Mkt", dept: "business" },
        { id: "XX003", name: "Ops", dept: "tech" }
      ];

      it("filters with 'in' operator", () => {
        const result = applyFilterRules(records, [{ field: "id", operator: "in", values: ["CC001", "CC002"] }]);
        expect(result.length).toBe(2);
      });

      it("filters with 'not_in' operator", () => {
        const result = applyFilterRules(records, [{ field: "id", operator: "not_in", values: ["XX003"] }]);
        expect(result.length).toBe(2);
      });

      it("filters with 'equals' operator", () => {
        const result = applyFilterRules(records, [{ field: "dept", operator: "equals", values: ["tech"] }]);
        expect(result.length).toBe(2);
      });

      it("filters with 'not_equals' operator", () => {
        const result = applyFilterRules(records, [{ field: "dept", operator: "not_equals", values: ["tech"] }]);
        expect(result.length).toBe(1);
      });

      it("filters with 'starts_with' operator", () => {
        const result = applyFilterRules(records, [{ field: "id", operator: "starts_with", values: ["CC"] }]);
        expect(result.length).toBe(2);
      });

      it("filters with 'contains' operator", () => {
        const result = applyFilterRules(records, [{ field: "name", operator: "contains", values: ["ng"] }]);
        expect(result.length).toBe(1);
      });

      it("returns all records when no filter rules", () => {
        const result = applyFilterRules(records, []);
        expect(result.length).toBe(3);
      });

      it("applies multiple filter rules (AND logic)", () => {
        const result = applyFilterRules(records, [
          { field: "id", operator: "starts_with", values: ["CC"] },
          { field: "dept", operator: "equals", values: ["tech"] }
        ]);
        expect(result.length).toBe(1);
        expect(result[0].id).toBe("CC001");
      });
    });

    describe("applyFieldMappings", () => {
      it("maps source fields to target fields", () => {
        const record = { code: "001", desc: "Test Item", extra: "ignored" };
        const result = applyFieldMappings(record, [
          { source: "code", target: "memberKey" },
          { source: "desc", target: "description" }
        ]);
        expect(result.memberKey).toBe("001");
        expect(result.description).toBe("Test Item");
      });

      it("applies transforms during mapping", () => {
        const record = { code: "001", desc: "  Test  " };
        const result = applyFieldMappings(record, [
          { source: "code", target: "memberKey", transform: 'prefix("ENT_")' },
          { source: "desc", target: "description", transform: "trim" }
        ]);
        expect(result.memberKey).toBe("ENT_001");
        expect(result.description).toBe("Test");
      });

      it("maps extra fields to properties", () => {
        const record = { code: "001", dept: "Sales" };
        const result = applyFieldMappings(record, [
          { source: "code", target: "memberKey" },
          { source: "dept", target: "department" }
        ]);
        expect(result.properties.department).toBe("Sales");
      });
    });

    describe("buildHierarchy", () => {
      it("creates parent-child relationships", () => {
        const records = [
          { id: "A", parent: "Root" },
          { id: "B", parent: "A" },
          { id: "C", parent: "A" }
        ];
        const result = buildHierarchy(
          records,
          { parentField: "parent", rootParent: "Root" },
          [{ source: "id", target: "memberKey" }]
        );
        expect(result.length).toBe(3);
        expect(result[0]).toEqual({ parentKey: "Root", childKey: "A" });
        expect(result[1]).toEqual({ parentKey: "A", childKey: "B" });
      });

      it("applies transforms to parent field", () => {
        const records = [{ id: "001", parent: "000" }];
        const result = buildHierarchy(
          records,
          { parentField: "parent", parentTransform: 'prefix("CC_")', rootParent: "Root" },
          [{ source: "id", target: "memberKey", transform: 'prefix("CC_")' }]
        );
        expect(result[0]).toEqual({ parentKey: "CC_000", childKey: "CC_001" });
      });
    });

    describe("detectConflicts", () => {
      it("returns no conflicts with source_wins resolution", () => {
        const members = [{ memberKey: "A", description: "", properties: {} }];
        const existing = new Set(["A"]);
        const result = detectConflicts(members, existing, "source_wins");
        expect(result.length).toBe(0);
      });

      it("detects conflicts with target_wins resolution", () => {
        const members = [
          { memberKey: "A", description: "", properties: {} },
          { memberKey: "B", description: "", properties: {} }
        ];
        const existing = new Set(["A"]);
        const result = detectConflicts(members, existing, "target_wins");
        expect(result.length).toBe(1);
        expect(result[0].memberKey).toBe("A");
      });

      it("detects conflicts with skip resolution", () => {
        const members = [{ memberKey: "X", description: "", properties: {} }];
        const existing = new Set(["X", "Y"]);
        const result = detectConflicts(members, existing, "skip");
        expect(result.length).toBe(1);
      });
    });

    describe("executeMappingPipeline", () => {
      it("runs full pipeline: filter, map, hierarchy, detect conflicts", () => {
        const records = [
          { id: "CC001", name: "Engineering", parent: "Root" },
          { id: "CC002", name: "Marketing", parent: "Root" },
          { id: "XX003", name: "Excluded", parent: "Root" }
        ];

        const result = executeMappingPipeline(records, {
          fieldMappings: [
            { source: "id", target: "memberKey" },
            { source: "name", target: "description" }
          ],
          hierarchyRules: { parentField: "parent", rootParent: "Root" },
          filterRules: [{ field: "id", operator: "starts_with", values: ["CC"] }],
          conflictResolution: "source_wins"
        });

        expect(result.sourceRecordsRead).toBe(3);
        expect(result.filteredOut).toBe(1);
        expect(result.members.length).toBe(2);
        expect(result.relationships.length).toBe(2);
        expect(result.conflicts.length).toBe(0);
      });

      it("reports conflicts when members already exist", () => {
        const records = [{ id: "A", name: "Existing" }];
        const result = executeMappingPipeline(
          records,
          {
            fieldMappings: [{ source: "id", target: "memberKey" }],
            hierarchyRules: null,
            filterRules: [],
            conflictResolution: "manual"
          },
          new Set(["A"])
        );
        expect(result.conflicts.length).toBe(1);
        expect(result.conflicts[0].memberKey).toBe("A");
      });
    });
  });
});
