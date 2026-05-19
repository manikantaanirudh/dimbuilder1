import { describe, expect, it } from "vitest";
import { previewBulkUpdate } from "../shared/bulkUpdate";
import type { ProjectMetadataState } from "../shared/types";
import { memberFixture, relationshipFixture, sampleProject, sampleScenarioDimension } from "./fixtures";

const accountDimension = {
  ...sampleScenarioDimension,
  id: "dim-account",
  dimensionType: "Account" as const,
  dimensionName: "Accounts",
  sheetName: "Accounts"
};

function state(): ProjectMetadataState {
  return {
    project: sampleProject,
    dimensions: [accountDimension],
    members: [
      memberFixture({
        id: "member-revenue",
        dimensionId: accountDimension.id,
        memberKey: "Revenue",
        description: "Old revenue",
        properties: { Account: "Revenue", Description: "Old revenue", Text1: "Legacy revenue alias", Text2: "" }
      }),
      memberFixture({
        id: "member-expense",
        dimensionId: accountDimension.id,
        memberKey: "Expense",
        description: "Old expense",
        properties: { Account: "Expense", Description: "Old expense", Text1: "Legacy expense alias", Text2: "" }
      }),
      memberFixture({
        id: "member-inactive",
        dimensionId: accountDimension.id,
        memberKey: "InactiveRevenue",
        description: "Inactive",
        properties: { Account: "InactiveRevenue", Text1: "Legacy inactive" },
        isActive: false
      })
    ],
    relationships: [
      relationshipFixture({
        id: "rel-revenue",
        dimensionId: accountDimension.id,
        parentKey: "Root",
        childKey: "Revenue",
        aggregationWeight: 1,
        properties: { Parent: "Root", Child: "Revenue", "Aggregation Weight": 1 }
      }),
      relationshipFixture({
        id: "rel-expense",
        dimensionId: accountDimension.id,
        parentKey: "Root",
        childKey: "Expense",
        aggregationWeight: 1,
        properties: { Parent: "Root", Child: "Expense", "Aggregation Weight": 1 }
      })
    ]
  };
}

describe("bulk update preview", () => {
  it("previews member set updates with exact old and new values", () => {
    const result = previewBulkUpdate(state(), {
      targetType: "member",
      operation: "set",
      propertyName: "Text2",
      value: "Reviewed",
      filter: {
        dimensionId: accountDimension.id,
        memberKeyStartsWith: "Rev"
      }
    });

    expect(result.affectedCount).toBe(1);
    expect(result.skippedCount).toBe(2);
    expect(result.previewItems).toMatchObject([
      {
        targetId: "member-revenue",
        targetKey: "Revenue",
        propertyName: "Text2",
        oldValue: "",
        newValue: "Reviewed",
        warnings: []
      }
    ]);
  });

  it("previews clear, replace text, and copy-from-property operations", () => {
    const cleared = previewBulkUpdate(state(), {
      targetType: "member",
      operation: "clear",
      propertyName: "Text1",
      filter: { dimensionId: accountDimension.id, memberKeyContains: "Expense" }
    });
    expect(cleared.previewItems[0]).toMatchObject({ targetKey: "Expense", oldValue: "Legacy expense alias", newValue: "" });

    const replaced = previewBulkUpdate(state(), {
      targetType: "member",
      operation: "replaceText",
      propertyName: "Text1",
      searchText: "Legacy",
      replaceText: "Current",
      filter: { dimensionId: accountDimension.id, memberKeyContains: "Revenue" }
    });
    expect(replaced.previewItems[0]).toMatchObject({ targetKey: "Revenue", oldValue: "Legacy revenue alias", newValue: "Current revenue alias" });

    const copied = previewBulkUpdate(state(), {
      targetType: "member",
      operation: "copyFromProperty",
      propertyName: "Text2",
      sourcePropertyName: "Description",
      filter: { dimensionId: accountDimension.id, memberKeyStartsWith: "Rev" }
    });
    expect(copied.previewItems[0]).toMatchObject({ targetKey: "Revenue", oldValue: "", newValue: "Old revenue" });
  });

  it("previews relationship updates and dictionary type warnings", () => {
    const result = previewBulkUpdate(state(), {
      targetType: "relationship",
      operation: "set",
      propertyName: "Aggregation Weight",
      value: "not-a-number",
      filter: {
        dimensionId: accountDimension.id,
        childKeyContains: "Revenue"
      }
    });

    expect(result.affectedCount).toBe(1);
    expect(result.previewItems[0]).toMatchObject({
      targetId: "rel-revenue",
      targetKey: "Root -> Revenue",
      oldValue: "1",
      newValue: "not-a-number"
    });
    expect(result.previewItems[0].warnings.join(" ")).toContain("expects a numeric value");
  });
});
