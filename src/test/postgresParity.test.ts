import { describe, expect, it } from "vitest";
import { applyMetadataCsvCommitPlan } from "../server/metadataCsvCommit";
import { runProjectValidation } from "../server/helpers/runValidation";
import { createRepositories } from "../server/db/repositories";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import { buildMetadataCsvCommitPlan } from "../shared/metadataCsvImport";
import {
  assertProjectExportWithinMemberLimit,
  ExportLimitError
} from "../shared/exportLimits";
import type { AppConfig } from "../shared/appConfigTypes";
import { createLargeHierarchyProject } from "./helpers/largeHierarchy";
import { withPostgresClient } from "./helpers/postgres";

const pgUrl = process.env.PG_TEST_URL;

const accountOnlyConfig: AppConfig = {
  ...defaultAppConfig,
  dimensions: {
    ...defaultAppConfig.dimensions,
    enabledTypes: ["Account"],
    displayOrder: ["Account"]
  }
};

describe.skipIf(!pgUrl)("postgres parity", () => {
  it("creates project, dimension, member on postgres", async () => {
    await withPostgresClient(async (client) => {
      const repos = createRepositories(client);
      const project = await repos.projects.create({
        name: "PG Test",
        description: "",
        sourceFileName: "",
        createdBy: "local-admin"
      });
      const dimension = await repos.dimensions.create({
        projectId: project.id,
        sheetName: "Accounts",
        dimensionType: "Account",
        dimensionName: "Accounts",
        description: "",
        accessGroup: "Everyone",
        maintenanceGroup: "Everyone",
        inheritedDimension: "",
        sortOrder: 1,
        metadata: {}
      });
      const member = await repos.members.create({
        dimensionId: dimension.id,
        memberKey: "Revenue",
        description: "Revenue",
        properties: { Account: "Revenue", Description: "Revenue" },
        rowOrder: 1,
        sourceRowNumber: 1,
        isActive: true
      });

      expect(project.id).toBeTruthy();
      expect(dimension.id).toBeTruthy();
      expect(member.id).toBeTruthy();
      expect(await repos.members.listByDimension(dimension.id)).toHaveLength(1);
    });
  });

  it("commits a minimal CSV import plan", async () => {
    await withPostgresClient(async (client) => {
      const repos = createRepositories(client);
      const { plan } = buildMetadataCsvCommitPlan({
        csvContent: "parent,member\n,Revenue\nRoot,ProductRevenue",
        enabledDimensionTypes: ["Account"],
        mode: "newProject",
        formDefaults: { dimensionType: "Account", dimensionName: "Accounts" }
      }, "parity.csv");

      expect(plan).not.toBeNull();
      const result = await applyMetadataCsvCommitPlan(repos, accountOnlyConfig, plan!);

      expect(result.projectId).toBeTruthy();
      expect(result.importSummary.membersImported).toBe(2);
      expect(await repos.members.listByProject(result.projectId)).toHaveLength(2);
      expect(await repos.relationships.listByProject(result.projectId)).toHaveLength(1);
    });
  });

  it("runs validation and stores issues on postgres", async () => {
    await withPostgresClient(async (client) => {
      const repos = createRepositories(client);
      const project = await repos.projects.create({
        name: "Validation parity",
        description: "",
        sourceFileName: "",
        createdBy: "local-admin"
      });
      const dimension = await repos.dimensions.create({
        projectId: project.id,
        sheetName: "Accounts",
        dimensionType: "Account",
        dimensionName: "Accounts",
        description: "",
        accessGroup: "Everyone",
        maintenanceGroup: "Everyone",
        inheritedDimension: "",
        sortOrder: 1,
        metadata: {}
      });
      await repos.members.create({
        dimensionId: dimension.id,
        memberKey: "Revenue",
        description: "Revenue",
        properties: { Account: "Revenue", Description: "Revenue" },
        rowOrder: 1,
        sourceRowNumber: 1,
        isActive: true
      });

      const issues = await runProjectValidation(repos, accountOnlyConfig, project.id);
      const stored = await repos.issues.listValidationIssuesForProject(project.id);

      expect(Array.isArray(issues)).toBe(true);
      expect(stored).toEqual(issues);
      expect(stored.length).toBeGreaterThan(0);
    });
  });

  it("enforces XML export member limits", async () => {
    await withPostgresClient(async (client) => {
      const repos = createRepositories(client);
      const limitedConfig: AppConfig = {
        ...accountOnlyConfig,
        operations: {
          ...accountOnlyConfig.operations!,
          exportMaxMembers: 5
        }
      };
      const { projectId } = await createLargeHierarchyProject(repos, limitedConfig, { memberCount: 10 });

      await expect(
        assertProjectExportWithinMemberLimit(repos, projectId, "xml", limitedConfig)
      ).rejects.toBeInstanceOf(ExportLimitError);

      const underLimitConfig: AppConfig = {
        ...limitedConfig,
        operations: {
          ...limitedConfig.operations!,
          exportMaxMembers: 10_000
        }
      };
      await expect(
        assertProjectExportWithinMemberLimit(repos, projectId, "xml", underLimitConfig)
      ).resolves.toBeUndefined();
    });
  });
});
