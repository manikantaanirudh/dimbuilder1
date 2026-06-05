import { describe, expect, it } from "vitest";
import { previewBulkUpdateFromCsv } from "../shared/bulkUpdateCsv";
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
        properties: { Account: "Revenue", Description: "Old revenue", Text1: "Legacy", Text2: "" }
      })
    ],
    relationships: [
      relationshipFixture({
        id: "rel-revenue",
        dimensionId: accountDimension.id,
        parentKey: "Root",
        childKey: "Revenue",
        properties: { Parent: "Root", Child: "Revenue", "Aggregation Weight": "1" }
      })
    ]
  };
}

describe("bulk update CSV mapping", () => {
  it("previews member property updates from a key column and property columns", () => {
    const csv = [
      "Member,Text1,Text2",
      "Revenue,Updated alias,Reviewed"
    ].join("\n");

    const preview = previewBulkUpdateFromCsv(state(), {
      targetType: "member",
      dimensionId: accountDimension.id,
      keyColumn: "Member"
    }, csv);

    expect(preview.rowCount).toBe(1);
    expect(preview.affectedCount).toBe(2);
    expect(preview.previewItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetId: "member-revenue",
        propertyName: "Text1",
        oldValue: "Legacy",
        newValue: "Updated alias"
      }),
      expect.objectContaining({
        propertyName: "Text2",
        oldValue: "",
        newValue: "Reviewed"
      })
    ]));
  });

  it("previews relationship property updates from parent and child columns", () => {
    const csv = [
      "Parent,Child,Aggregation Weight",
      "Root,Revenue,2"
    ].join("\n");

    const preview = previewBulkUpdateFromCsv(state(), {
      targetType: "relationship",
      dimensionId: accountDimension.id
    }, csv);

    expect(preview.affectedCount).toBe(1);
    expect(preview.previewItems[0]).toMatchObject({
      targetId: "rel-revenue",
      propertyName: "Aggregation Weight",
      oldValue: "1",
      newValue: "2"
    });
  });

  it("warns when a CSV member key is not found", () => {
    const csv = "Member,Text1\nMissing,Value\n";
    const preview = previewBulkUpdateFromCsv(state(), {
      targetType: "member",
      dimensionId: accountDimension.id,
      keyColumn: "Member"
    }, csv);

    expect(preview.affectedCount).toBe(0);
    expect(preview.warnings.some((warning) => warning.includes("Missing"))).toBe(true);
  });
});
