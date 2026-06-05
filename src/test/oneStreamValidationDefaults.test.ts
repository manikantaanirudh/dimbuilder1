import { describe, expect, it } from "vitest";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import { validateOneStreamProfile } from "../shared/oneStreamValidation";
import type { DimensionMemberRecord, DimensionRecord, ProjectRecord } from "../shared/types";

describe("validateOneStreamProfile with property defaults", () => {
  const project: ProjectRecord = {
    id: "p1",
    name: "Test",
    description: "",
    sourceFileName: "",
    createdBy: "local-admin",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };

  const dimension: DimensionRecord = {
    id: "dim-account",
    projectId: project.id,
    sheetName: "Accounts",
    dimensionType: "Account",
    dimensionName: "Accounts",
    description: "",
    accessGroup: "",
    maintenanceGroup: "",
    inheritedDimension: "",
    sortOrder: 1,
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };

  const member: DimensionMemberRecord = {
    id: "m1",
    dimensionId: dimension.id,
    memberKey: "NoType",
    description: "",
    properties: { Account: "NoType" },
    rowOrder: 1,
    sourceRowNumber: 2,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };

  it("does not flag missing Account Type when an active default exists", () => {
    const issues = validateOneStreamProfile({
      project,
      dimension,
      members: [member],
      relationships: [],
      profile: defaultAppConfig.validation.oneStreamProfile,
      propertyDefaults: [{
        dimensionType: "Account",
        targetLevel: "member",
        propertyName: "Account Type",
        xmlName: "AccountType",
        defaultValue: "Expense",
        enabled: true
      }]
    });

    expect(issues.some((issue) => issue.code === "ACCOUNT_TYPE_MISSING")).toBe(false);
  });

  it("still flags missing Account Type when defaults are disabled", () => {
    const issues = validateOneStreamProfile({
      project,
      dimension,
      members: [member],
      relationships: [],
      profile: defaultAppConfig.validation.oneStreamProfile,
      propertyDefaults: [{
        dimensionType: "Account",
        targetLevel: "member",
        propertyName: "Account Type",
        xmlName: "AccountType",
        defaultValue: "Expense",
        enabled: false
      }]
    });

    expect(issues.some((issue) => issue.code === "ACCOUNT_TYPE_MISSING")).toBe(true);
  });
});
