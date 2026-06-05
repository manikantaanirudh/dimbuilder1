import { describe, expect, it } from "vitest";
import { buildAcmHandoff } from "../shared/acmHandoff";
import { buildEpmwareHandoff } from "../shared/epmwareHandoff";
import { computeReadinessScore } from "../shared/readinessScore";
import type { ChangeSetDetail, ChangeSetItemRecord } from "../shared/types";

function item(overrides: Partial<ChangeSetItemRecord>): ChangeSetItemRecord {
  return {
    id: "ci-1",
    changeSetId: "cs-1",
    diffItemId: "di-1",
    itemType: "member",
    changeType: "add",
    severity: "info",
    dimensionType: "Account",
    objectKey: "Sales",
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
      projectId: "p-1",
      baselineId: "base-1",
      diffRunId: "d-1",
      name: "Release 1",
      description: "Promote revenue accounts",
      status: "approved",
      targetEnvironment: "Production",
      createdBy: "local-admin",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    items,
    approvals: [{ id: "a1", changeSetId: "cs-1", action: "approve", comment: "Looks good", createdBy: "approver", createdAt: "2026-01-02T00:00:00.000Z" }],
    latestPackage: null
  };
}

const readiness = computeReadinessScore({
  issues: [],
  dimensions: [{ dimensionType: "Account" }],
  expectedDimensionTypes: [],
  certification: null,
  exportBlockedBySeverities: ["error"]
});

describe("ACM handoff", () => {
  it("maps a member add to an ACM row and includes a manifest", () => {
    const result = buildAcmHandoff({
      detail: detail([item({ changeType: "add", objectKey: "Sales" })]),
      projectName: "Demo",
      issues: [],
      validationStatus: "Passed",
      readinessScore: readiness.score
    });
    expect(result.fileNames).toContain("acm-change-request.csv");
    expect(result.fileNames).toContain("manifest.json");
    const csv = result.files.find((f) => f.fileName === "acm-change-request.csv")!.content;
    expect(csv).toContain("Sales");
    expect(csv).toContain("Add");
  });

  it("maps property updates with old and new values", () => {
    const result = buildAcmHandoff({
      detail: detail([item({ itemType: "property", changeType: "update", objectKey: "Sales", propertyName: "Account Type", oldValue: "Asset", newValue: "Revenue" })]),
      projectName: "Demo",
      issues: [],
      validationStatus: "Passed",
      readinessScore: readiness.score
    });
    const csv = result.files.find((f) => f.fileName === "acm-change-request.csv")!.content;
    expect(csv).toContain("Asset");
    expect(csv).toContain("Revenue");
  });

  it("maps a relationship move to parent/child details", () => {
    const result = buildAcmHandoff({
      detail: detail([item({ itemType: "relationship", changeType: "move", objectKey: "Root -> Sales" })]),
      projectName: "Demo",
      issues: [],
      validationStatus: "Passed",
      readinessScore: readiness.score
    });
    const csv = result.files.find((f) => f.fileName === "acm-change-request.csv")!.content;
    expect(csv).toContain("Root");
    expect(csv).toContain("Relationship Update");
  });
});

describe("EPMware handoff", () => {
  it("generates the expected CSV and includes manifest + readiness", () => {
    const result = buildEpmwareHandoff({
      detail: detail([item({ changeType: "add", objectKey: "Sales" })]),
      projectName: "Demo",
      issues: [],
      validationStatus: "Passed",
      readiness
    });
    expect(result.fileNames).toContain("epmware-request.csv");
    expect(result.fileNames).toContain("readiness-report.json");
    expect(result.fileNames).toContain("manifest.json");
    const csv = result.files.find((f) => f.fileName === "epmware-request.csv")!.content;
    expect(csv).toContain("Sales");
  });

  it("warns (not crashes) when a property has no mapping", () => {
    const result = buildEpmwareHandoff({
      detail: detail([item({ itemType: "property", changeType: "update", objectKey: "Sales", propertyName: "Account Type", oldValue: "A", newValue: "B" })]),
      projectName: "Demo",
      issues: [],
      validationStatus: "Passed",
      readiness,
      config: { propertyMappings: { "Some Other Property": "X" } }
    });
    expect(result.warnings.some((w) => /No EPMware property mapping/.test(w))).toBe(true);
    expect(result.fileNames).toContain("epmware-request.csv");
  });

  it("applies configured dimension and property mappings", () => {
    const result = buildEpmwareHandoff({
      detail: detail([item({ itemType: "property", changeType: "update", objectKey: "Sales", propertyName: "Account Type", oldValue: "A", newValue: "B" })]),
      projectName: "Demo",
      issues: [],
      validationStatus: "Passed",
      readiness,
      config: { dimensionMappings: { Account: "GL_ACCOUNT" }, propertyMappings: { "Account Type": "ACCT_TYPE" } }
    });
    const csv = result.files.find((f) => f.fileName === "epmware-request.csv")!.content;
    expect(csv).toContain("GL_ACCOUNT");
    expect(csv).toContain("ACCT_TYPE");
    const map = result.files.find((f) => f.fileName === "epmware-property-map.csv")!.content;
    expect(map).toContain("Account Type");
  });
});
