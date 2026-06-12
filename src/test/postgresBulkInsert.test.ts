import { describe, expect, it } from "vitest";
import { createRepositories } from "../server/db/repositories";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import { createLargeHierarchyProject } from "./helpers/largeHierarchy";
import { withPostgresClient } from "./helpers/postgres";

const pgUrl = process.env.PG_TEST_URL;

function buildUnlimitedExportConfig(): AppConfig {
  return {
    ...defaultAppConfig,
    operations: {
      ...defaultAppConfig.operations!,
      exportMaxMembers: 0
    },
    dimensions: {
      ...defaultAppConfig.dimensions,
      enabledTypes: ["Account"],
      displayOrder: ["Account"]
    }
  };
}

describe.skipIf(!pgUrl)("postgres bulk insert benchmark", () => {
  it("inserts 5000 members via bulkInsert in under 30 seconds", async () => {
    await withPostgresClient(async (client) => {
      const repos = createRepositories(client);
      const config = buildUnlimitedExportConfig();
      const startedAt = Date.now();

      const { projectId } = await createLargeHierarchyProject(repos, config, {
        memberCount: 5000,
        projectName: "Bulk insert benchmark"
      });

      const elapsedMs = Date.now() - startedAt;
      const memberCount = await repos.members.countByProject(projectId);

      expect(memberCount).toBe(5000);
      expect(elapsedMs).toBeLessThan(30_000);
    });
  }, 35_000);
});
