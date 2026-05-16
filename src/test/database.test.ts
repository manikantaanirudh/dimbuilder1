import { describe, expect, it } from "vitest";
import { createDatabase } from "../server/db/database";
import { createRepositories } from "../server/db/repositories";

describe("database", () => {
  it("creates a project and stores dimensions", () => {
    const db = createDatabase(":memory:");
    const repos = createRepositories(db);
    const project = repos.projects.create({
      name: "Test",
      description: "Import test",
      sourceFileName: "template.xlsx",
      createdBy: "local-admin"
    });

    const dimension = repos.dimensions.create({
      projectId: project.id,
      sheetName: "Scenarios",
      dimensionType: "Scenario",
      dimensionName: "SampleScenario",
      description: "",
      accessGroup: "Everyone",
      maintenanceGroup: "Everyone",
      inheritedDimension: "",
      sortOrder: 1,
      metadata: {}
    });

    expect(repos.dimensions.listByProject(project.id)).toEqual([dimension]);
    db.close();
  });
});

