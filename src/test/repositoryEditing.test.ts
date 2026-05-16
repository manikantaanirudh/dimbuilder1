import { describe, expect, it } from "vitest";
import { createDatabase } from "../server/db/database";
import { createRepositories } from "../server/db/repositories";

describe("grid editing repositories", () => {
  it("lists and updates member and relationship rows by dimension", () => {
    const db = createDatabase(":memory:");
    const repos = createRepositories(db);
    const project = repos.projects.create({
      name: "Test",
      description: "",
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
    const member = repos.members.create({
      dimensionId: dimension.id,
      memberKey: "Actual",
      description: "Actual scenario",
      properties: { Entity: "Actual", Description: "Actual scenario" },
      rowOrder: 1,
      sourceRowNumber: 9,
      isActive: true
    });
    const relationship = repos.relationships.create({
      dimensionId: dimension.id,
      parentKey: "Root",
      childKey: "Actual",
      aggregationWeight: null,
      percentConsol: null,
      percentOwnership: null,
      ownershipType: "",
      properties: { Parent: "Root", Child: "Actual" },
      rowOrder: 1,
      sourceRowNumber: 16
    });

    repos.members.update(member.id, {
      memberKey: "Actuals",
      properties: { Entity: "Actuals", Description: "Actual scenario" }
    });
    repos.relationships.update(relationship.id, {
      parentKey: "Root",
      childKey: "Actuals",
      properties: { Parent: "Root", Child: "Actuals" }
    });

    expect(repos.members.listByDimension(dimension.id)[0].memberKey).toBe("Actuals");
    expect(repos.relationships.listByDimension(dimension.id)[0].childKey).toBe("Actuals");
    db.close();
  });
});

