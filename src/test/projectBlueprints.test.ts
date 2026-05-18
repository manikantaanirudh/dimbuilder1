import { describe, expect, it } from "vitest";
import { createDatabase } from "../server/db/database";
import { createRepositories } from "../server/db/repositories";
import { createProjectFromBlueprints } from "../server/projectBlueprints";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import { exportProjectXml } from "../shared/xmlExport";

describe("project blueprints", () => {
  it("creates a metadata project from configured dimension blueprints", () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);

      const project = createProjectFromBlueprints(repos, defaultAppConfig, {
        name: "Manual Build",
        description: "Built in the app",
        createdBy: "local-admin"
      });

      const dimensions = repos.dimensions.listByProject(project.id);
      const account = dimensions.find((dimension) => dimension.dimensionType === "Account");

      expect(project.name).toBe("Manual Build");
      expect(project.sourceFileName).toBe("");
      expect(dimensions.map((dimension) => dimension.dimensionType)).toEqual(defaultAppConfig.dimensions.displayOrder);
      expect(account?.dimensionName).toBe("Accounts");
      expect(account?.metadata).toMatchObject({
        source: "blueprint",
        allowMultipleParents: true,
        relationshipDefaults: { aggregationWeight: 1 }
      });
      expect(repos.members.listByDimension(account?.id ?? "").map((member) => member.memberKey)).toEqual(["Root"]);
    } finally {
      db.close();
    }
  });

  it("exports XML from app-authored project data", () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);

      const project = createProjectFromBlueprints(repos, defaultAppConfig, {
        name: "Manual Export",
        description: "",
        createdBy: "local-admin"
      });
      const account = repos.dimensions.listByProject(project.id).find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");

      repos.members.create({
        dimensionId: account.id,
        memberKey: "Revenue",
        description: "Revenue",
        properties: { Account: "Revenue", Description: "Revenue" },
        rowOrder: 2,
        sourceRowNumber: 0,
        isActive: true
      });
      repos.relationships.create({
        dimensionId: account.id,
        parentKey: "Root",
        childKey: "Revenue",
        aggregationWeight: 1,
        percentConsol: null,
        percentOwnership: null,
        ownershipType: "",
        properties: { Parent: "Root", Child: "Revenue", "Aggregation Weight": 1 },
        rowOrder: 1,
        sourceRowNumber: 0
      });

      const xml = exportProjectXml({
        project,
        dimensions: repos.dimensions.listByProject(project.id),
        members: repos.members.listByProject(project.id),
        relationships: repos.relationships.listByProject(project.id)
      });

      expect(xml).toContain('type="Account"');
      expect(xml).toContain('<member name="Revenue" alias="" description="Revenue"');
      expect(xml).toContain('<relationship parent="Root" child="Revenue" aggregationWeight="1" />');
    } finally {
      db.close();
    }
  });

  it("attributes project creation audit events to the project creator", () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);
      const auditEvents: Parameters<typeof repos.audit.record>[0][] = [];
      const recordAudit = repos.audit.record;
      repos.audit.record = (input) => {
        auditEvents.push(input);
        recordAudit(input);
      };

      createProjectFromBlueprints(repos, defaultAppConfig, {
        name: "Owned Build",
        description: "",
        createdBy: "finance-builder"
      });

      expect(auditEvents).toHaveLength(1);
      expect(auditEvents[0]).toMatchObject({
        action: "project.create",
        userId: "finance-builder"
      });
    } finally {
      db.close();
    }
  });

  it("rolls back the project when blueprint creation fails after project insert", () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);
      repos.members.create = () => {
        throw new Error("member insert failed");
      };

      expect(() =>
        createProjectFromBlueprints(repos, defaultAppConfig, {
          name: "Partial Build",
          description: "",
          createdBy: "local-admin"
        })
      ).toThrow("member insert failed");

      expect(repos.projects.list()).toEqual([]);
    } finally {
      db.close();
    }
  });
});
