import { describe, expect, it } from "vitest";
import { validateDimension } from "../shared/validationEngine";
import {
  memberFixture,
  relationshipFixture,
  sampleProject,
  sampleScenarioDimension
} from "./fixtures";

describe("validation engine", () => {
  it("detects duplicate members and missing relationship children", () => {
    const issues = validateDimension({
      project: sampleProject,
      dimension: sampleScenarioDimension,
      members: [
        memberFixture({ id: "m1", memberKey: "Actual", sourceRowNumber: 9 }),
        memberFixture({ id: "m2", memberKey: "Actual", sourceRowNumber: 10 })
      ],
      relationships: [
        relationshipFixture({ id: "r1", parentKey: "Root", childKey: "Forecast", sourceRowNumber: 16 })
      ],
      duplicateSeverity: "warning"
    });

    expect(issues.map((issue) => issue.code)).toContain("DUPLICATE_MEMBER");
    expect(issues.map((issue) => issue.code)).toContain("UNKNOWN_RELATIONSHIP_CHILD");
  });

  it("blocks invalid booleans, invalid numbers, and circular references", () => {
    const issues = validateDimension({
      project: sampleProject,
      dimension: sampleScenarioDimension,
      members: [
        memberFixture({
          id: "m1",
          memberKey: "A",
          properties: { Entity: "A", "Use In Workflow": "Maybe", "# of No Input Periods": "abc" }
        }),
        memberFixture({ id: "m2", memberKey: "B", properties: { Entity: "B" } })
      ],
      relationships: [
        relationshipFixture({ id: "r1", parentKey: "A", childKey: "B" }),
        relationshipFixture({ id: "r2", parentKey: "B", childKey: "A" })
      ]
    });

    expect(issues.filter((issue) => issue.severity === "error").map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["INVALID_BOOLEAN", "INVALID_NUMBER", "CIRCULAR_HIERARCHY"])
    );
  });

  it("blocks invalid numeric relationship properties for OneStream relationship fields", () => {
    const entityIssues = validateDimension({
      project: sampleProject,
      dimension: { ...sampleScenarioDimension, dimensionType: "Entity", dimensionName: "Entities", sheetName: "Entities" },
      members: [
        memberFixture({ id: "m1", memberKey: "Root", properties: { Entity: "Root" } }),
        memberFixture({ id: "m2", memberKey: "Child", properties: { Entity: "Child" } })
      ],
      relationships: [
        relationshipFixture({
          parentKey: "Root",
          childKey: "Child",
          properties: {
            Parent: "Root",
            Child: "Child",
            "Parent Sort Order": "first",
            "Percent Consol": "all",
            "Percent Ownership": "half"
          }
        })
      ]
    });

    const accountIssues = validateDimension({
      project: sampleProject,
      dimension: { ...sampleScenarioDimension, dimensionType: "Account", dimensionName: "Accounts", sheetName: "Accounts" },
      members: [
        memberFixture({ id: "m3", memberKey: "Root", properties: { Account: "Root" } }),
        memberFixture({ id: "m4", memberKey: "Cash", properties: { Account: "Cash" } })
      ],
      relationships: [
        relationshipFixture({
          parentKey: "Root",
          childKey: "Cash",
          properties: { Parent: "Root", Child: "Cash", "Aggregation Weight": "heavy" }
        })
      ]
    });

    const numericIssues = [...entityIssues, ...accountIssues].filter((issue) => issue.code === "INVALID_NUMBER");
    expect(numericIssues.map((issue) => issue.fieldName)).toEqual(
      expect.arrayContaining(["Parent Sort Order", "Percent Consol", "Percent Ownership", "Aggregation Weight"])
    );
  });

  it("allows OneStream account conditional consolidation and intercompany settings", () => {
    const issues = validateDimension({
      project: sampleProject,
      dimension: { ...sampleScenarioDimension, dimensionType: "Account", dimensionName: "Accounts", sheetName: "Accounts" },
      members: [
        memberFixture({
          memberKey: "Sales",
          properties: {
            Account: "Sales",
            "Is Consolidated": "Conditional",
            "Is IC": "Conditional"
          }
        })
      ],
      relationships: []
    });

    expect(issues.filter((issue) => issue.code === "INVALID_BOOLEAN").map((issue) => issue.fieldName)).not.toEqual(
      expect.arrayContaining(["Is Consolidated", "Is IC"])
    );
  });

  it("validates Flow Switch Type as a True or False setting", () => {
    const issues = validateDimension({
      project: sampleProject,
      dimension: { ...sampleScenarioDimension, dimensionType: "Flow", dimensionName: "Flows", sheetName: "Flow" },
      members: [
        memberFixture({
          memberKey: "Movement",
          properties: {
            "Flow Member": "Movement",
            "Switch Type": "Maybe"
          }
        })
      ],
      relationships: []
    });

    expect(issues.filter((issue) => issue.code === "INVALID_BOOLEAN").map((issue) => issue.fieldName)).toContain("Switch Type");
  });
});
