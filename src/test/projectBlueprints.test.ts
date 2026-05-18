import { describe, expect, it } from "vitest";
import { createDatabase } from "../server/db/database";
import { createRepositories } from "../server/db/repositories";
import { createProjectFromBlueprints } from "../server/projectBlueprints";
import type { AppConfig } from "../shared/appConfigTypes";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import { exportProjectXml } from "../shared/xmlExport";

describe("project blueprints", () => {
  if (false) {
    const db = createDatabase(":memory:");
    const repos = createRepositories(db);
    // @ts-expect-error repository transactions only support synchronous callbacks
    repos.transaction(async () => "async result");
    db.close();
  }

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
      expect(db.prepare("SELECT user_id FROM audit_logs").get()).toMatchObject({
        user_id: "finance-builder"
      });
    } finally {
      db.close();
    }
  });

  it("rejects thenable repository transactions and rolls back pre-return writes", () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);
      const transaction = repos.transaction as (action: () => unknown) => unknown;

      expect(() =>
        transaction(() => {
          repos.projects.create({
            name: "Async Boundary",
            description: "",
            sourceFileName: "",
            createdBy: "local-admin"
          });
          return Promise.resolve("later");
        })
      ).toThrow("Repository transactions only support synchronous callbacks.");

      expect(repos.projects.list()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("rejects native async transaction callbacks before post-await writes run", async () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);
      const transaction = repos.transaction as unknown as (action: () => unknown) => unknown;

      expect(() =>
        transaction(async () => {
          await Promise.resolve();
          repos.projects.create({
            name: "Post Await Write",
            description: "",
            sourceFileName: "",
            createdBy: "local-admin"
          });
        })
      ).toThrow("Repository transactions only support synchronous callbacks.");

      await Promise.resolve();

      expect(repos.projects.list()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("uses schema fallback values when a configured dimension blueprint is missing", () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);
      const {
        Account: _accountBlueprint,
        Entity: _entityBlueprint,
        ...blueprintsWithoutAccountAndEntity
      } = defaultAppConfig.dimensions.blueprints;
      const configWithoutAccountAndEntityBlueprints: AppConfig = {
        ...defaultAppConfig,
        dimensions: {
          ...defaultAppConfig.dimensions,
          enabledTypes: ["Entity", "Account"],
          displayOrder: ["Entity", "Account"],
          blueprints: blueprintsWithoutAccountAndEntity
        }
      };

      const project = createProjectFromBlueprints(repos, configWithoutAccountAndEntityBlueprints, {
        name: "Fallback Build",
        description: "",
        createdBy: "local-admin"
      });

      const dimensions = repos.dimensions.listByProject(project.id);
      const entity = dimensions.find((dimension) => dimension.dimensionType === "Entity");
      const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
      if (!entity || !account) throw new Error("Fallback dimensions were not created");
      const members = repos.members.listByDimension(entity.id);

      expect(dimensions).toHaveLength(2);
      expect(entity).toMatchObject({
        dimensionType: "Entity",
        dimensionName: "Entities"
      });
      expect(entity.metadata).toMatchObject({
        source: "blueprint",
        allowMultipleParents: true
      });
      expect(entity.metadata.relationshipDefaults).toEqual({
        percentConsol: 100,
        percentOwnership: 100,
        ownershipType: "FullConsolidation"
      });
      expect(account.metadata.relationshipDefaults).toEqual({ aggregationWeight: 1 });
      expect(members).toHaveLength(1);
      expect(members[0]).toMatchObject({
        memberKey: "Root",
        properties: { Entity: "Root", Description: "" }
      });
    } finally {
      db.close();
    }
  });

  it("rolls back the project when blueprint creation fails after project insert", () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);
      let createdProjectId = "";
      const createProject = repos.projects.create;
      repos.projects.create = (input) => {
        const project = createProject(input);
        createdProjectId = project.id;
        return project;
      };
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
      expect(repos.projects.get(createdProjectId)).toBeNull();
      expect(repos.dimensions.listByProject(createdProjectId)).toEqual([]);
      expect(repos.members.listByProject(createdProjectId)).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("preserves the original creation error under transaction rollback", () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);
      repos.audit.record = () => {
        throw new Error("audit insert failed");
      };

      expect(() =>
        createProjectFromBlueprints(repos, defaultAppConfig, {
          name: "Audit Failure",
          description: "",
          createdBy: "local-admin"
        })
      ).toThrow("audit insert failed");
    } finally {
      db.close();
    }
  });
});
