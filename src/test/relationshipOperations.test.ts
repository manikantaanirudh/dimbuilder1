import { describe, expect, it } from "vitest";
import {
  findMembersThatBecomeOrphanedAfterRelationshipDeletes,
  inferRelationshipOperationsFromDiff,
  planRelationshipLoadMode
} from "../shared/relationshipOperations";
import type { DimensionMemberRecord, DimensionRelationshipRecord, ProjectMetadataState } from "../shared/types";
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
  sheetName: "Accounts",
  metadata: { allowMultipleParents: false }
};

function member(memberKey: string): DimensionMemberRecord {
  return memberFixture({
    id: `member-${memberKey}`,
    dimensionId: accountDimension.id,
    memberKey,
    properties: { Account: memberKey, Description: memberKey }
  });
}

function relationship(parentKey: string, childKey: string, id = `${parentKey}-${childKey}`): DimensionRelationshipRecord {
  return relationshipFixture({
    id: `relationship-${id}`,
    dimensionId: accountDimension.id,
    parentKey,
    childKey,
    aggregationWeight: 1,
    properties: { Parent: parentKey, Child: childKey, "Aggregation Weight": 1 }
  });
}

function state(relationships: DimensionRelationshipRecord[]): ProjectMetadataState {
  return {
    project: sampleProject,
    dimensions: [accountDimension],
    members: ["Root", "OldParent", "NewParent", "AltParent", "Moved", "Copied", "Added", "Leaf"].map(member),
    relationships
  };
}

describe("relationship operation planning", () => {
  it("infers add, delete, move, copy, and property-update operations from diff items", () => {
    const operations = inferRelationshipOperationsFromDiff([
      {
        dimensionType: "Account",
        dimensionName: "Accounts",
        targetType: "relationship",
        changeType: "add",
        severity: "info",
        objectKey: "Root -> Added",
        parentKey: "Root",
        childKey: "Added",
        propertyName: "",
        oldValue: "",
        newValue: "Root -> Added",
        details: {}
      },
      {
        dimensionType: "Account",
        dimensionName: "Accounts",
        targetType: "relationship",
        changeType: "delete",
        severity: "warning",
        objectKey: "Root -> Leaf",
        parentKey: "Root",
        childKey: "Leaf",
        propertyName: "",
        oldValue: "Root -> Leaf",
        newValue: "",
        details: {}
      },
      {
        dimensionType: "Account",
        dimensionName: "Accounts",
        targetType: "relationship",
        changeType: "move",
        severity: "warning",
        objectKey: "NewParent -> Moved",
        parentKey: "NewParent",
        childKey: "Moved",
        propertyName: "",
        oldValue: "OldParent",
        newValue: "NewParent",
        details: { oldParentKey: "OldParent", newParentKey: "NewParent" }
      },
      {
        dimensionType: "Account",
        dimensionName: "Accounts",
        targetType: "relationship",
        changeType: "copy",
        severity: "info",
        objectKey: "AltParent -> Copied",
        parentKey: "AltParent",
        childKey: "Copied",
        propertyName: "",
        oldValue: "",
        newValue: "AltParent -> Copied",
        details: { retainedParents: ["Root"] }
      },
      {
        dimensionType: "Account",
        dimensionName: "Accounts",
        targetType: "property",
        changeType: "update",
        severity: "info",
        objectKey: "Root -> Copied",
        parentKey: "Root",
        childKey: "Copied",
        propertyName: "Aggregation Weight",
        oldValue: "1",
        newValue: "-1",
        details: { sourceTargetType: "relationship" }
      }
    ]);

    expect(operations.map((operation) => operation.operation)).toEqual(["add", "delete", "move", "copy", "update"]);
    expect(operations.find((operation) => operation.operation === "move")).toMatchObject({
      oldParentKey: "OldParent",
      newParentKey: "NewParent",
      childKey: "Moved"
    });
  });

  it("plans move and copy operations from a baseline and current project state", () => {
    const baseline = state([
      relationship("Root", "OldParent"),
      relationship("OldParent", "Moved"),
      relationship("Root", "Copied")
    ]);
    const target = state([
      relationship("Root", "OldParent"),
      relationship("NewParent", "Moved"),
      relationship("Root", "Copied"),
      relationship("AltParent", "Copied"),
      relationship("Root", "Added")
    ]);

    const plan = planRelationshipLoadMode(target, baseline, "moveCopy", { dimensionId: accountDimension.id });

    expect(plan.summary).toMatchObject({
      adds: 1,
      deletes: 0,
      moves: 1,
      copies: 1,
      warnings: 2,
      errors: 0
    });
    expect(plan.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: "move", oldParentKey: "OldParent", newParentKey: "NewParent", childKey: "Moved" }),
      expect.objectContaining({ operation: "copy", parentKey: "AltParent", childKey: "Copied" }),
      expect.objectContaining({ operation: "add", parentKey: "Root", childKey: "Added" })
    ]));
  });

  it("finds members that become orphaned after planned relationship deletes", () => {
    const relationships = [
      relationship("Root", "OldParent"),
      relationship("OldParent", "Leaf"),
      relationship("Root", "Copied")
    ];

    const orphaned = findMembersThatBecomeOrphanedAfterRelationshipDeletes(
      ["Root", "OldParent", "Leaf", "Copied"],
      relationships,
      [relationship("OldParent", "Leaf")]
    );

    expect(orphaned).toEqual(["Leaf"]);
  });

  it("reports missing baselines for break/build planning instead of inventing delete syntax", () => {
    const plan = planRelationshipLoadMode(state([relationship("Root", "Added")]), null, "breakBuild", {
      dimensionId: accountDimension.id
    });

    expect(plan.summary.errors).toBe(1);
    expect(plan.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "BREAK_BUILD_HAS_NO_BASELINE" })
    ]));
    expect(plan.items).toEqual([]);
  });
});
