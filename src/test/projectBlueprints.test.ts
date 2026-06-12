import { describe, expect, it } from "vitest";
import { createDatabase } from "../server/db/database";
import { createRepositories } from "../server/db/repositories";
import { createProjectFromBlueprints } from "../server/projectBlueprints";
import type { AppConfig } from "../shared/appConfigTypes";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import { exportProjectXml } from "../shared/xmlExport";

describe("project blueprints", () => {
  it("creates a metadata project from configured dimension blueprints", async () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);

      const project = await createProjectFromBlueprints(repos, defaultAppConfig, {
        name: "Manual Build",
        description: "Built in the app",
        createdBy: "local-admin"
      });

      const dimensions = await repos.dimensions.listByProject(project.id);
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
      expect((await repos.members.listByDimension(account?.id ?? "")).map((member) => member.memberKey)).toEqual(["Root"]);
    } finally {
      db.close();
    }
  });

  it("exports XML from app-authored project data", async () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);

      const project = await createProjectFromBlueprints(repos, defaultAppConfig, {
        name: "Manual Export",
        description: "",
        createdBy: "local-admin"
      });
      const account = (await repos.dimensions.listByProject(project.id)).find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");

      await repos.members.create({
        dimensionId: account.id,
        memberKey: "Revenue",
        description: "Revenue",
        properties: { Account: "Revenue", Description: "Revenue" },
        rowOrder: 2,
        sourceRowNumber: 0,
        isActive: true
      });
      await repos.relationships.create({
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
        dimensions: await repos.dimensions.listByProject(project.id),
        members: await repos.members.listByProject(project.id),
        relationships: await repos.relationships.listByProject(project.id)
      });

      expect(xml).toContain('type="Account"');
      expect(xml).toContain('<member name="Revenue" alias="" description="Revenue"');
      expect(xml).toContain('<relationship parent="Root" child="Revenue" aggregationWeight="1" />');
    } finally {
      db.close();
    }
  });

  it("creates configured blueprint hierarchy members and relationships for XML export", async () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);
      const config = {
        ...defaultAppConfig,
        dimensions: {
          ...defaultAppConfig.dimensions,
          enabledTypes: ["Account"],
          displayOrder: ["Account"],
          blueprints: {
            Account: {
              defaultDimensionName: "Accounts",
              rootMembers: ["Root"],
              memberKeyField: "Account",
              relationshipDefaults: { aggregationWeight: 1 },
              allowMultipleParents: true,
              members: [
                { memberKey: "Revenue", description: "Revenue", properties: { "Account Type": "Revenue" } },
                { memberKey: "ProductRevenue", description: "Product Revenue" }
              ],
              relationships: [
                { parentKey: "Root", childKey: "Revenue" },
                { parentKey: "Revenue", childKey: "ProductRevenue", aggregationWeight: -1 }
              ]
            }
          }
        }
      } as AppConfig;

      const project = await createProjectFromBlueprints(repos, config, {
        name: "Configured Hierarchy",
        description: "",
        createdBy: "local-admin"
      });
      const account = (await repos.dimensions.listByProject(project.id)).find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");

      const members = await repos.members.listByDimension(account.id);
      const relationships = await repos.relationships.listByDimension(account.id);
      const xml = exportProjectXml({
        project,
        dimensions: [account],
        members,
        relationships
      });

      expect(members.map((member) => member.memberKey)).toEqual(["Root", "Revenue", "ProductRevenue"]);
      expect(members.find((member) => member.memberKey === "Revenue")?.properties).toMatchObject({
        Account: "Revenue",
        Description: "Revenue",
        "Account Type": "Revenue"
      });
      expect(relationships).toHaveLength(2);
      expect(relationships[0]).toMatchObject({
        parentKey: "Root",
        childKey: "Revenue",
        aggregationWeight: 1,
        properties: { Parent: "Root", Child: "Revenue", "Aggregation Weight": 1 }
      });
      expect(relationships[1]).toMatchObject({
        parentKey: "Revenue",
        childKey: "ProductRevenue",
        aggregationWeight: -1,
        properties: { Parent: "Revenue", Child: "ProductRevenue", "Aggregation Weight": -1 }
      });
      expect(xml).toContain('<member name="ProductRevenue" alias="" description="Product Revenue" />');
      expect(xml).toContain('<relationship parent="Root" child="Revenue" aggregationWeight="1" />');
      expect(xml).toContain('<relationship parent="Revenue" child="ProductRevenue" aggregationWeight="-1" />');
    } finally {
      db.close();
    }
  });

  it("enriches root members from configured blueprint member entries with the same key", async () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);
      const config = {
        ...defaultAppConfig,
        dimensions: {
          ...defaultAppConfig.dimensions,
          enabledTypes: ["Account"],
          displayOrder: ["Account"],
          blueprints: {
            Account: {
              defaultDimensionName: "Accounts",
              rootMembers: ["Root"],
              memberKeyField: "Account",
              relationshipDefaults: { aggregationWeight: 1 },
              allowMultipleParents: true,
              members: [
                {
                  memberKey: "Root",
                  description: "All accounts",
                  properties: { "Account Type": "BalanceRecurring" }
                }
              ]
            }
          }
        }
      } as AppConfig;

      const project = await createProjectFromBlueprints(repos, config, {
        name: "Enriched Root",
        description: "",
        createdBy: "local-admin"
      });
      const account = (await repos.dimensions.listByProject(project.id)).find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");

      const members = await repos.members.listByDimension(account.id);

      expect(members).toHaveLength(1);
      expect(members[0]).toMatchObject({
        memberKey: "Root",
        description: "All accounts",
        properties: {
          Account: "Root",
          Description: "All accounts",
          "Account Type": "BalanceRecurring"
        }
      });
    } finally {
      db.close();
    }
  });

  it("lets explicit blueprint relationship property fields override generated defaults", async () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);
      const config = {
        ...defaultAppConfig,
        dimensions: {
          ...defaultAppConfig.dimensions,
          enabledTypes: ["Account"],
          displayOrder: ["Account"],
          blueprints: {
            Account: {
              defaultDimensionName: "Accounts",
              rootMembers: ["Root"],
              memberKeyField: "Account",
              relationshipDefaults: { aggregationWeight: 1 },
              allowMultipleParents: true,
              members: [{ memberKey: "Revenue", description: "Revenue" }],
              relationships: [
                {
                  parentKey: "Root",
                  childKey: "Revenue",
                  properties: { "Aggregation Weight": -1 }
                }
              ]
            }
          }
        }
      } as AppConfig;

      const project = await createProjectFromBlueprints(repos, config, {
        name: "Property Override",
        description: "",
        createdBy: "local-admin"
      });
      const account = (await repos.dimensions.listByProject(project.id)).find((dimension) => dimension.dimensionType === "Account");
      if (!account) throw new Error("Account dimension was not created");

      const relationships = await repos.relationships.listByDimension(account.id);
      const xml = exportProjectXml({
        project,
        dimensions: [account],
        members: await repos.members.listByDimension(account.id),
        relationships
      });

      expect(relationships).toHaveLength(1);
      expect(relationships[0]).toMatchObject({
        aggregationWeight: -1,
        properties: { Parent: "Root", Child: "Revenue", "Aggregation Weight": -1 }
      });
      expect(xml).toContain('<relationship parent="Root" child="Revenue" aggregationWeight="-1" />');
    } finally {
      db.close();
    }
  });

  it("attributes project creation audit events to the project creator", async () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);

      const project = await createProjectFromBlueprints(repos, defaultAppConfig, {
        name: "Owned Build",
        description: "",
        createdBy: "finance-builder"
      });

      const row = db.prepare("SELECT user_id, action FROM audit_logs WHERE project_id = ?").get(project.id) as {
        user_id: string;
        action: string;
      };
      expect(row.action).toBe("project.create");
      expect(row.user_id).toBe("finance-builder");
    } finally {
      db.close();
    }
  });

  it("rolls back repository transaction writes when a later step fails", async () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);

      await expect(
        repos.transaction(async (tx) => {
          await tx.projects.create({
            name: "Async Boundary",
            description: "",
            sourceFileName: "",
            createdBy: "local-admin"
          });
          throw new Error("transaction failed");
        })
      ).rejects.toThrow("transaction failed");

      expect(await repos.projects.list()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("supports async transaction callbacks and rolls back on error", async () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);

      await expect(
        repos.transaction(async (tx) => {
          await tx.projects.create({
            name: "Async Write",
            description: "",
            sourceFileName: "",
            createdBy: "local-admin"
          });
          throw new Error("async rollback");
        })
      ).rejects.toThrow("async rollback");

      expect(await repos.projects.list()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("uses schema fallback values when a configured dimension blueprint is missing", async () => {
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

      const project = await createProjectFromBlueprints(repos, configWithoutAccountAndEntityBlueprints, {
        name: "Fallback Build",
        description: "",
        createdBy: "local-admin"
      });

      const dimensions = await repos.dimensions.listByProject(project.id);
      const entity = dimensions.find((dimension) => dimension.dimensionType === "Entity");
      const account = dimensions.find((dimension) => dimension.dimensionType === "Account");
      if (!entity || !account) throw new Error("Fallback dimensions were not created");
      const members = await repos.members.listByDimension(entity.id);

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

  it("rolls back the project when blueprint creation fails after project insert", async () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);
      let createdProjectId = "";
      const originalTransaction = repos.transaction.bind(repos);
      repos.transaction = async (fn) =>
        originalTransaction(async (tx) => {
          const originalMemberCreate = tx.members.create.bind(tx.members);
          tx.members.create = async (...args: Parameters<typeof originalMemberCreate>) => {
            const project = await tx.projects.list();
            if (project.length > 0) createdProjectId = project[0].id;
            await originalMemberCreate(...args);
            throw new Error("member insert failed");
          };
          return fn(tx);
        });

      await expect(
        createProjectFromBlueprints(repos, defaultAppConfig, {
          name: "Partial Build",
          description: "",
          createdBy: "local-admin"
        })
      ).rejects.toThrow("member insert failed");

      expect(await repos.projects.list()).toEqual([]);
      if (createdProjectId) {
        expect(await repos.projects.get(createdProjectId)).toBeNull();
        expect(await repos.dimensions.listByProject(createdProjectId)).toEqual([]);
        expect(await repos.members.listByProject(createdProjectId)).toEqual([]);
      }
    } finally {
      db.close();
    }
  });

  it("preserves the original creation error under transaction rollback", async () => {
    const db = createDatabase(":memory:");
    try {
      const repos = createRepositories(db);
      const originalTransaction = repos.transaction.bind(repos);
      repos.transaction = async (fn) =>
        originalTransaction(async (tx) => {
          tx.audit.record = async () => {
            throw new Error("audit insert failed");
          };
          return fn(tx);
        });

      await expect(
        createProjectFromBlueprints(repos, defaultAppConfig, {
          name: "Audit Failure",
          description: "",
          createdBy: "local-admin"
        })
      ).rejects.toThrow("audit insert failed");
    } finally {
      db.close();
    }
  });
});
