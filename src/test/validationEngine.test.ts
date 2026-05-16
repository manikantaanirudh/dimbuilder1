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
});

