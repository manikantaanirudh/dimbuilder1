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
      sourceFileName: "",
      createdBy: "local-admin"
    });

    expect(project.sourceFileName).toBe("");

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

  it("seeds property default catalog on database startup", () => {
    const db = createDatabase(":memory:");
    const repos = createRepositories(db);
    const count = Number(db.prepare("SELECT COUNT(*) AS count FROM property_default_catalog").get()?.count ?? 0);
    expect(count).toBeGreaterThan(0);
    db.close();
  });
});
