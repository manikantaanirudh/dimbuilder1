import { describe, expect, it } from "vitest";
import {
  createComparableProjectState,
  diffProjectMetadata,
  summarizeDiff
} from "../shared/metadataDiff";
import { UNKNOWN_XML_DATA_KEY } from "../shared/xmlImport";
import {
  memberFixture,
  relationshipFixture,
  sampleProject,
  sampleScenarioDimension
} from "./fixtures";

const accountDimension = {
  ...sampleScenarioDimension,
  id: "dim-account",
  dimensionType: "Account" as const,
  dimensionName: "Accounts",
  sheetName: "Accounts"
};

const entityDimension = {
  ...sampleScenarioDimension,
  id: "dim-entity",
  dimensionType: "Entity" as const,
  dimensionName: "Entities",
  sheetName: "Entities"
};

describe("metadata diff engine", () => {
  it("detects member adds, updates, and deletes deterministically", () => {
    const baseline = createComparableProjectState({
      project: sampleProject,
      dimensions: [accountDimension],
      members: [
        memberFixture({ id: "m-root", dimensionId: accountDimension.id, memberKey: "Root", description: "Root" }),
        memberFixture({ id: "m-revenue", dimensionId: accountDimension.id, memberKey: "Revenue", description: "Revenue old" }),
        memberFixture({ id: "m-expense", dimensionId: accountDimension.id, memberKey: "Expense", description: "Expense" })
      ],
      relationships: []
    });
    const target = createComparableProjectState({
      project: sampleProject,
      dimensions: [accountDimension],
      members: [
        memberFixture({ id: "m-root-target", dimensionId: accountDimension.id, memberKey: "Root", description: "Root" }),
        memberFixture({ id: "m-revenue-target", dimensionId: accountDimension.id, memberKey: "Revenue", description: "Revenue new" }),
        memberFixture({ id: "m-cash", dimensionId: accountDimension.id, memberKey: "Cash", description: "Cash" })
      ],
      relationships: []
    });

    const result = diffProjectMetadata(baseline, target);

    expect(result.items.map((item) => [item.targetType, item.changeType, item.objectKey])).toEqual([
      ["member", "add", "Cash"],
      ["member", "delete", "Expense"],
      ["member", "update", "Revenue"]
    ]);
    expect(result.items.find((item) => item.objectKey === "Expense")?.severity).toBe("warning");
    expect(result.summary.members).toMatchObject({ adds: 1, updates: 1, deletes: 1 });
  });

  it("detects relationship adds, deletes, moves, and copies without double-counting classified changes", () => {
    const baseline = createComparableProjectState({
      project: sampleProject,
      dimensions: [accountDimension],
      members: [],
      relationships: [
        relationshipFixture({ id: "r-move", dimensionId: accountDimension.id, parentKey: "OldParent", childKey: "MovedChild" }),
        relationshipFixture({ id: "r-copy", dimensionId: accountDimension.id, parentKey: "Root", childKey: "CopiedChild" }),
        relationshipFixture({ id: "r-delete", dimensionId: accountDimension.id, parentKey: "Root", childKey: "DeletedChild" })
      ]
    });
    const target = createComparableProjectState({
      project: sampleProject,
      dimensions: [accountDimension],
      members: [],
      relationships: [
        relationshipFixture({ id: "r-move-target", dimensionId: accountDimension.id, parentKey: "NewParent", childKey: "MovedChild" }),
        relationshipFixture({ id: "r-copy-original", dimensionId: accountDimension.id, parentKey: "Root", childKey: "CopiedChild" }),
        relationshipFixture({ id: "r-copy-extra", dimensionId: accountDimension.id, parentKey: "AltParent", childKey: "CopiedChild" }),
        relationshipFixture({ id: "r-add", dimensionId: accountDimension.id, parentKey: "Root", childKey: "AddedChild" })
      ]
    });

    const result = diffProjectMetadata(baseline, target);

    expect(result.items.map((item) => [item.changeType, item.parentKey, item.childKey])).toEqual([
      ["add", "Root", "AddedChild"],
      ["copy", "AltParent", "CopiedChild"],
      ["delete", "Root", "DeletedChild"],
      ["move", "NewParent", "MovedChild"]
    ]);
    expect(result.summary.relationships).toMatchObject({ adds: 1, deletes: 1, moves: 1, copies: 1 });
    expect(result.items.filter((item) => item.childKey === "MovedChild")).toHaveLength(1);
  });

  it("detects member, relationship, and preserved XML property updates with risk warnings", () => {
    const baseline = createComparableProjectState({
      project: sampleProject,
      dimensions: [accountDimension, entityDimension],
      members: [
        memberFixture({
          id: "m-revenue",
          dimensionId: accountDimension.id,
          memberKey: "Revenue",
          properties: {
            Account: "Revenue",
            "Account Type": "Revenue",
            Text1: "Old",
            [UNKNOWN_XML_DATA_KEY]: {
              unknownAttributes: {},
              unknownElements: [{ name: "property", attributes: { name: "LegacyFlag", value: "Old" }, sourceOrder: 1 }],
              sourceOrder: 0
            }
          }
        })
      ],
      relationships: [
        relationshipFixture({
          id: "r-entity",
          dimensionId: entityDimension.id,
          parentKey: "Top",
          childKey: "Child",
          percentOwnership: 100,
          properties: { Parent: "Top", Child: "Child", "Percent Ownership": 100 }
        })
      ]
    });
    const target = createComparableProjectState({
      project: sampleProject,
      dimensions: [accountDimension, entityDimension],
      members: [
        memberFixture({
          id: "m-revenue-target",
          dimensionId: accountDimension.id,
          memberKey: "Revenue",
          properties: {
            Account: "Revenue",
            "Account Type": "Expense",
            Text1: "New",
            [UNKNOWN_XML_DATA_KEY]: {
              unknownAttributes: {},
              unknownElements: [{ name: "property", attributes: { name: "LegacyFlag", value: "New" }, sourceOrder: 1 }],
              sourceOrder: 0
            }
          }
        })
      ],
      relationships: [
        relationshipFixture({
          id: "r-entity-target",
          dimensionId: entityDimension.id,
          parentKey: "Top",
          childKey: "Child",
          percentOwnership: 75,
          properties: { Parent: "Top", Child: "Child", "Percent Ownership": 75 }
        })
      ]
    });

    const result = diffProjectMetadata(baseline, target);
    const propertyItems = result.items.filter((item) => item.targetType === "property");

    expect(propertyItems.map((item) => [item.objectKey, item.propertyName, item.oldValue, item.newValue, item.severity])).toEqual([
      ["Revenue", "Account Type", "Revenue", "Expense", "warning"],
      ["Revenue", "LegacyFlag", "Old", "New", "info"],
      ["Revenue", "Text1", "Old", "New", "info"],
      ["Top -> Child", "Percent Ownership", "100", "75", "warning"]
    ]);
    expect(summarizeDiff(result.items).properties.updates).toBe(4);
  });
});
