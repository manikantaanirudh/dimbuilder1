import { describe, expect, it } from "vitest";
import { buildReleaseArtifacts, type ReleaseArtifactSnapshot } from "../shared/releaseArtifacts";
import type { ChangeSetDetail, ChangeSetItemRecord } from "../shared/types";
import { memberFixture, relationshipFixture, sampleProject, sampleScenarioDimension, testTimestamp } from "./fixtures";

const accountDimension = {
  ...sampleScenarioDimension,
  id: "dim-account",
  dimensionType: "Account" as const,
  dimensionName: "Accounts",
  sheetName: "Accounts"
};

function snapshot(): ReleaseArtifactSnapshot {
  return {
    project: sampleProject,
    dimensions: [accountDimension],
    members: [
      memberFixture({ id: "m-root", dimensionId: accountDimension.id, memberKey: "Root", properties: { Account: "Root" } }),
      memberFixture({ id: "m-rev", dimensionId: accountDimension.id, memberKey: "Revenue", properties: { Account: "Revenue", "Account Type": "Revenue" } }),
      memberFixture({ id: "m-new", dimensionId: accountDimension.id, memberKey: "NewAcct", properties: { Account: "NewAcct", "Account Type": "Expense" } })
    ],
    relationships: [
      relationshipFixture({ id: "r-rev", dimensionId: accountDimension.id, parentKey: "Root", childKey: "Revenue", rowOrder: 1 }),
      relationshipFixture({ id: "r-new", dimensionId: accountDimension.id, parentKey: "Root", childKey: "NewAcct", rowOrder: 2 })
    ]
  };
}

function item(overrides: Partial<ChangeSetItemRecord>): ChangeSetItemRecord {
  return {
    id: "ci-1",
    changeSetId: "cs-1",
    diffItemId: "di-1",
    itemType: "member",
    changeType: "update",
    severity: "info",
    dimensionType: "Account",
    objectKey: "Revenue",
    propertyName: "",
    oldValue: "",
    newValue: "",
    details: {},
    ...overrides
  };
}

function detail(items: ChangeSetItemRecord[]): ChangeSetDetail {
  return {
    changeSet: {
      id: "cs-1",
      projectId: sampleProject.id,
      baselineId: "b-1",
      diffRunId: "d-1",
      name: "Release 1",
      description: "",
      status: "approved",
      targetEnvironment: "",
      createdBy: "local-admin",
      createdAt: testTimestamp,
      updatedAt: testTimestamp
    },
    items,
    approvals: [],
    latestPackage: null
  };
}

describe("release artifacts", () => {
  it("always generates metadata-full.xml and rollback-instructions.md", () => {
    const result = buildReleaseArtifacts(detail([]), snapshot(), "full");
    expect(result.fileNames).toContain("metadata-full.xml");
    expect(result.fileNames).toContain("rollback-instructions.md");
  });

  it("generates add-only XML for added members", () => {
    const result = buildReleaseArtifacts(
      detail([item({ itemType: "member", changeType: "add", objectKey: "NewAcct" })]),
      snapshot(),
      "addOnly"
    );
    const adds = result.artifacts.find((a) => a.fileName === "metadata-adds.xml");
    expect(adds).toBeDefined();
    expect(adds!.content).toContain("NewAcct");
    expect(adds!.content).not.toContain("Revenue");
  });

  it("generates update-only XML for property updates", () => {
    const result = buildReleaseArtifacts(
      detail([item({ itemType: "property", changeType: "update", objectKey: "Revenue", propertyName: "Account Type", oldValue: "Revenue", newValue: "Expense" })]),
      snapshot(),
      "updateOnly"
    );
    expect(result.fileNames).toContain("metadata-updates.xml");
  });

  it("generates relationship-operations XML for relationship items", () => {
    const result = buildReleaseArtifacts(
      detail([item({ itemType: "relationship", changeType: "move", objectKey: "Root -> Revenue" })]),
      snapshot(),
      "relationshipOperations"
    );
    expect(result.fileNames).toContain("relationship-operations.xml");
  });

  it("generates reversible rollback.xml when all changes are property updates", () => {
    const result = buildReleaseArtifacts(
      detail([item({ itemType: "property", changeType: "update", objectKey: "Revenue", propertyName: "Account Type", oldValue: "Asset", newValue: "Revenue" })]),
      snapshot(),
      "rollback"
    );
    expect(result.rollback.generated).toBe(true);
    expect(result.rollback.requiresManualReview).toBe(false);
    const rollbackXml = result.artifacts.find((a) => a.fileName === "rollback.xml");
    expect(rollbackXml).toBeDefined();
    // Old value restored in rollback XML.
    expect(rollbackXml!.content).toContain("Asset");
  });

  it("flags manual review and omits rollback.xml when adds/deletes are present", () => {
    const result = buildReleaseArtifacts(
      detail([item({ itemType: "member", changeType: "add", objectKey: "NewAcct" })]),
      snapshot(),
      "rollback"
    );
    expect(result.rollback.generated).toBe(false);
    expect(result.rollback.requiresManualReview).toBe(true);
    expect(result.fileNames).not.toContain("rollback.xml");
    expect(result.fileNames).toContain("rollback-instructions.md");
    const instructions = result.artifacts.find((a) => a.fileName === "rollback-instructions.md");
    expect(instructions!.content).toMatch(/manual review/i);
  });
});
