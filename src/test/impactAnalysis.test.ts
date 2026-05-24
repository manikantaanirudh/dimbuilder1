import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { AppDatabase } from "../server/db/database";
import { runImpactAnalysis, type ProjectData } from "../server/impact/impactEngine";
import type { ImpactAnalysisRequest } from "../shared/impactTypes";
import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord } from "../shared/types";
import { memberFixture, relationshipFixture, sampleProject } from "./fixtures";

// --- Test Helpers ---

const accountDimension: DimensionRecord = {
  id: "dim-account",
  projectId: sampleProject.id,
  sheetName: "Accounts",
  dimensionType: "Account",
  dimensionName: "TestAccounts",
  description: "",
  accessGroup: "Everyone",
  maintenanceGroup: "Everyone",
  inheritedDimension: "",
  sortOrder: 1,
  metadata: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const entityDimension: DimensionRecord = {
  id: "dim-entity",
  projectId: sampleProject.id,
  sheetName: "Entities",
  dimensionType: "Entity",
  dimensionName: "TestEntities",
  description: "",
  accessGroup: "Finance",
  maintenanceGroup: "Everyone",
  inheritedDimension: "",
  sortOrder: 2,
  metadata: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function member(key: string, dimId = accountDimension.id): DimensionMemberRecord {
  return memberFixture({
    id: `member-${key}`,
    dimensionId: dimId,
    memberKey: key,
    properties: { Account: key, Description: `${key} description` }
  });
}

function rel(parent: string, child: string, dimId = accountDimension.id): DimensionRelationshipRecord {
  return relationshipFixture({
    id: `rel-${parent}-${child}`,
    dimensionId: dimId,
    parentKey: parent,
    childKey: child,
    aggregationWeight: 1,
    properties: { Parent: parent, Child: child }
  });
}

// --- Pure Engine Tests ---

describe("Impact Analysis Engine", () => {
  describe("hierarchy impact", () => {
    it("delete a leaf member → severity low, no orphans", () => {
      const projectData: ProjectData = {
        dimensions: [accountDimension],
        members: [member("Root"), member("Parent"), member("Leaf1"), member("Leaf2")],
        relationships: [rel("Root", "Parent"), rel("Parent", "Leaf1"), rel("Parent", "Leaf2")]
      };

      const request: ImpactAnalysisRequest = {
        type: "delete",
        scope: { dimensionType: "Account", memberKeys: ["Leaf1"], action: "delete" }
      };

      const report = runImpactAnalysis(request, projectData);
      expect(report.severity).toBe("low");
      expect(report.hierarchyImpact.orphanedMembers).toEqual([]);
    });

    it("delete a parent member with children → severity high, orphans detected", () => {
      const projectData: ProjectData = {
        dimensions: [accountDimension],
        members: [member("Root"), member("Parent"), member("Child1"), member("Child2")],
        relationships: [rel("Root", "Parent"), rel("Parent", "Child1"), rel("Parent", "Child2")]
      };

      const request: ImpactAnalysisRequest = {
        type: "delete",
        scope: { dimensionType: "Account", memberKeys: ["Parent"], action: "delete" }
      };

      const report = runImpactAnalysis(request, projectData);
      expect(report.severity).toBe("high");
      expect(report.hierarchyImpact.orphanedMembers).toContain("Child1");
      expect(report.hierarchyImpact.orphanedMembers).toContain("Child2");
    });

    it("move a member to new parent → consolidation paths changed", () => {
      const projectData: ProjectData = {
        dimensions: [accountDimension],
        members: [member("Root"), member("OldParent"), member("NewParent"), member("Moved")],
        relationships: [rel("Root", "OldParent"), rel("Root", "NewParent"), rel("OldParent", "Moved")]
      };

      const request: ImpactAnalysisRequest = {
        type: "move",
        scope: { dimensionType: "Account", memberKeys: ["Moved"], action: "move", targetParent: "NewParent" }
      };

      const report = runImpactAnalysis(request, projectData);
      expect(report.hierarchyImpact.consolidationPathsChanged).toBeGreaterThan(0);
      expect(report.hierarchyImpact.newParentPaths.length).toBeGreaterThan(0);
      expect(report.hierarchyImpact.newParentPaths[0].member).toBe("Moved");
    });
  });

  describe("cross-dimension reference detection", () => {
    it("detects member key referenced in another dimension's properties", () => {
      const projectData: ProjectData = {
        dimensions: [accountDimension, entityDimension],
        members: [
          member("Root"),
          member("Revenue"),
          member("US", entityDimension.id),
          memberFixture({
            id: "member-entity-ref",
            dimensionId: entityDimension.id,
            memberKey: "US_Revenue",
            properties: { Entity: "US_Revenue", LinkedAccount: "Revenue" }
          })
        ],
        relationships: [rel("Root", "Revenue")]
      };

      const request: ImpactAnalysisRequest = {
        type: "delete",
        scope: { dimensionType: "Account", memberKeys: ["Revenue"], action: "delete" }
      };

      const report = runImpactAnalysis(request, projectData);
      expect(report.crossDimensionImpact.totalReferences).toBeGreaterThan(0);
      expect(report.crossDimensionImpact.referencesFound[0].dimensionType).toBe("Entity");
      expect(report.crossDimensionImpact.referencesFound[0].memberKeys).toContain("Revenue");
    });

    it("no cross-dimension references when member is not referenced", () => {
      const projectData: ProjectData = {
        dimensions: [accountDimension, entityDimension],
        members: [
          member("Root"),
          member("Leaf"),
          member("US", entityDimension.id)
        ],
        relationships: [rel("Root", "Leaf")]
      };

      const request: ImpactAnalysisRequest = {
        type: "delete",
        scope: { dimensionType: "Account", memberKeys: ["Leaf"], action: "delete" }
      };

      const report = runImpactAnalysis(request, projectData);
      expect(report.crossDimensionImpact.totalReferences).toBe(0);
    });
  });

  describe("data impact", () => {
    it("leaf member has estimated data impact", () => {
      const projectData: ProjectData = {
        dimensions: [accountDimension],
        members: [member("Root"), member("Parent"), member("Leaf")],
        relationships: [rel("Root", "Parent"), rel("Parent", "Leaf")]
      };

      const request: ImpactAnalysisRequest = {
        type: "delete",
        scope: { dimensionType: "Account", memberKeys: ["Leaf"], action: "delete" }
      };

      const report = runImpactAnalysis(request, projectData);
      expect(report.dataImpact.hasData).toBe(true);
      expect(report.dataImpact.estimatedCellCount).toBeGreaterThan(0);
      expect(report.dataImpact.warning).toContain("unknown");
    });

    it("parent-only member has no direct data impact", () => {
      const projectData: ProjectData = {
        dimensions: [accountDimension],
        members: [member("Root"), member("Parent"), member("Child")],
        relationships: [rel("Root", "Parent"), rel("Parent", "Child")]
      };

      const request: ImpactAnalysisRequest = {
        type: "delete",
        scope: { dimensionType: "Account", memberKeys: ["Parent"], action: "delete" }
      };

      const report = runImpactAnalysis(request, projectData);
      // Parent is not a leaf, so data impact should be false
      expect(report.dataImpact.hasData).toBe(false);
    });
  });

  describe("security impact", () => {
    it("detects access group changes from relationship properties", () => {
      const projectData: ProjectData = {
        dimensions: [accountDimension],
        members: [member("Root"), member("Parent"), member("Child")],
        relationships: [
          rel("Root", "Parent"),
          relationshipFixture({
            id: "rel-parent-child-sec",
            dimensionId: accountDimension.id,
            parentKey: "Parent",
            childKey: "Child",
            aggregationWeight: 1,
            properties: { Parent: "Parent", Child: "Child", AccessGroup: "RestrictedGroup" }
          })
        ]
      };

      const request: ImpactAnalysisRequest = {
        type: "move",
        scope: { dimensionType: "Account", memberKeys: ["Child"], action: "move", targetParent: "Root" }
      };

      const report = runImpactAnalysis(request, projectData);
      expect(report.securityImpact.accessGroupChanges.length).toBeGreaterThan(0);
      expect(report.securityImpact.accessGroupChanges[0].member).toBe("Child");
    });
  });

  describe("severity calculation", () => {
    it("returns none when no impact detected", () => {
      const projectData: ProjectData = {
        dimensions: [accountDimension],
        members: [member("Root"), member("Parent"), member("Child")],
        relationships: [rel("Root", "Parent"), rel("Parent", "Child")]
      };

      // Restructure on an uninvolved member
      const request: ImpactAnalysisRequest = {
        type: "restructure",
        scope: { dimensionType: "Flow", memberKeys: ["NonExistent"], action: "restructure" }
      };

      const report = runImpactAnalysis(request, projectData);
      expect(report.severity).toBe("none");
    });
  });

  describe("recommendation generation", () => {
    it("recommends snapshot when orphans are created", () => {
      const projectData: ProjectData = {
        dimensions: [accountDimension],
        members: [member("Root"), member("Parent"), member("Child")],
        relationships: [rel("Root", "Parent"), rel("Parent", "Child")]
      };

      const request: ImpactAnalysisRequest = {
        type: "delete",
        scope: { dimensionType: "Account", memberKeys: ["Parent"], action: "delete" }
      };

      const report = runImpactAnalysis(request, projectData);
      expect(report.recommendations).toContain("Create a snapshot before proceeding");
    });

    it("recommends safe to proceed when no impact", () => {
      const projectData: ProjectData = {
        dimensions: [accountDimension],
        members: [member("Root")],
        relationships: []
      };

      const request: ImpactAnalysisRequest = {
        type: "restructure",
        scope: { dimensionType: "Flow", memberKeys: ["Nothing"], action: "restructure" }
      };

      const report = runImpactAnalysis(request, projectData);
      expect(report.recommendations).toContain("No impact detected — safe to proceed");
    });
  });
});

// --- API Integration Tests ---

function testConfig(): AppConfig {
  return {
    ...defaultAppConfig,
    auth: {
      ...defaultAppConfig.auth,
      enabled: true,
      strategy: "local",
      jwt: {
        secret: "test-secret-for-impact-tests",
        accessTokenExpiry: "15m",
        refreshTokenExpiry: "7d"
      },
      allowSelfRegistration: false
    }
  };
}

describe("Impact Analysis API", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;
  let db: AppDatabase;
  let adminToken = "";

  beforeEach(async () => {
    const config = testConfig();
    db = createDatabase(":memory:");
    const app = createApp(db, config);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

    // Register admin
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
  });

  afterEach(async () => {
    await closeServer();
    db.close();
  });

  function headers() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` };
  }

  async function createProject(): Promise<string> {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name: "Impact Test Project", description: "For impact testing" })
    });
    const data = await res.json() as { id: string };
    return data.id;
  }

  it("POST /api/projects/:id/impact-analysis runs and persists analysis", async () => {
    const projectId = await createProject();

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/impact-analysis`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        type: "delete",
        scope: { dimensionType: "Account", memberKeys: ["SomeMember"], action: "delete" }
      })
    });

    expect(res.status).toBe(201);
    const data = await res.json() as { id: string; severity: string; results: unknown };
    expect(data.id).toBeDefined();
    expect(data.severity).toBeDefined();
    expect(data.results).toBeDefined();
  });

  it("GET /api/projects/:id/impact-analyses lists past analyses", async () => {
    const projectId = await createProject();

    // Run an analysis first
    await fetch(`${baseUrl}/api/projects/${projectId}/impact-analysis`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        type: "delete",
        scope: { dimensionType: "Account", memberKeys: ["Member1"], action: "delete" }
      })
    });

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/impact-analyses`, { headers: headers() });
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(data.length).toBe(1);
  });

  it("GET /api/impact-analyses/:id returns specific analysis", async () => {
    const projectId = await createProject();

    const createRes = await fetch(`${baseUrl}/api/projects/${projectId}/impact-analysis`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        type: "move",
        scope: { dimensionType: "Entity", memberKeys: ["E1"], action: "move", targetParent: "Root" }
      })
    });
    const created = await createRes.json() as { id: string };

    const res = await fetch(`${baseUrl}/api/impact-analyses/${created.id}`, { headers: headers() });
    expect(res.status).toBe(200);
    const data = await res.json() as { id: string; analysisType: string; scope: unknown; results: unknown };
    expect(data.id).toBe(created.id);
    expect(data.analysisType).toBe("move");
    expect(data.scope).toBeDefined();
    expect(data.results).toBeDefined();
  });

  it("POST /api/projects/:id/what-if runs what-if simulation", async () => {
    const projectId = await createProject();

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/what-if`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        scope: { dimensionType: "Account", memberKeys: ["TestMember"], action: "whatIf" }
      })
    });

    expect(res.status).toBe(201);
    const data = await res.json() as { id: string; severity: string };
    expect(data.id).toBeDefined();
    expect(data.severity).toBeDefined();
  });

  it("returns 404 for missing project", async () => {
    const res = await fetch(`${baseUrl}/api/projects/nonexistent/impact-analysis`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        type: "delete",
        scope: { dimensionType: "Account", memberKeys: ["X"], action: "delete" }
      })
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for missing analysis ID", async () => {
    const res = await fetch(`${baseUrl}/api/impact-analyses/nonexistent`, { headers: headers() });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid request body", async () => {
    const projectId = await createProject();
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/impact-analysis`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ type: "invalid", scope: {} })
    });
    expect(res.status).toBe(400);
  });
});
