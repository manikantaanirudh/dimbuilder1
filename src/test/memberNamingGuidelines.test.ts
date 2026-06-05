import { describe, expect, it } from "vitest";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import {
  formatQueryMemberReference,
  memberNameRequiresQueryBrackets,
  ONESTREAM_MEMBER_NAME_RESTRICTED_CHARACTERS
} from "../shared/memberNamingGuidelines";
import { validateMemberKey } from "../shared/memberKeyValidation";
import { validateMemberUniquenessAcrossDimensionTypes } from "../shared/memberUniquenessValidation";
import { validateOneStreamProfile } from "../shared/oneStreamValidation";
import { memberFixture, sampleProject, testTimestamp } from "./fixtures";

const profile = defaultAppConfig.validation.oneStreamProfile!;

describe("memberNamingGuidelines", () => {
  it("allows spaces and periods in stored member names", () => {
    expect(validateMemberKey("Gross Income", profile)).toBeNull();
    expect(validateMemberKey("Quebec.City", profile)).toBeNull();
  });

  it("does not treat square brackets as restricted in stored names", () => {
    expect(ONESTREAM_MEMBER_NAME_RESTRICTED_CHARACTERS).not.toContain("[");
    expect(ONESTREAM_MEMBER_NAME_RESTRICTED_CHARACTERS).not.toContain("]");
    expect(validateMemberKey("Bracket[Name]", profile)).toBeNull();
  });

  it("formats query references with brackets for space or period names", () => {
    expect(memberNameRequiresQueryBrackets("Quebec.City")).toBe(true);
    expect(formatQueryMemberReference("Entity", "Quebec.City")).toBe("E#[Quebec.City]");
    expect(formatQueryMemberReference("Account", "GrossIncome")).toBe("A#GrossIncome");
  });

  it("emits info (not error) for spaces and query-bracket guidance", () => {
    const dimension = {
      id: "dim-acc",
      projectId: sampleProject.id,
      sheetName: "Accounts",
      dimensionType: "Account" as const,
      dimensionName: "Accounts",
      description: "",
      accessGroup: "Everyone",
      maintenanceGroup: "Everyone",
      inheritedDimension: "",
      sortOrder: 1,
      metadata: {},
      createdAt: testTimestamp,
      updatedAt: testTimestamp
    };

    const issues = validateOneStreamProfile({
      project: sampleProject,
      dimension,
      members: [
        memberFixture({
          id: "m-space",
          dimensionId: dimension.id,
          memberKey: "Gross Income",
          properties: { Account: "Gross Income", "Account Type": "Expense" }
        })
      ],
      relationships: [],
      profile
    });

    const spaceIssue = issues.find((issue) => issue.code === "MEMBER_NAME_CONTAINS_SPACE");
    const bracketIssue = issues.find((issue) => issue.code === "MEMBER_NAME_QUERY_BRACKETS");
    expect(spaceIssue?.severity).toBe("info");
    expect(bracketIssue?.severity).toBe("info");
    expect(bracketIssue?.message).toContain("E#[Gross Income]");
  });

  it("flags duplicate member keys across dimensions of the same type", () => {
    const dimA = {
      id: "dim-a",
      projectId: sampleProject.id,
      sheetName: "Accounts",
      dimensionType: "Account" as const,
      dimensionName: "CorpAccounts",
      description: "",
      accessGroup: "Everyone",
      maintenanceGroup: "Everyone",
      inheritedDimension: "",
      sortOrder: 1,
      metadata: {},
      createdAt: testTimestamp,
      updatedAt: testTimestamp
    };
    const dimB = { ...dimA, id: "dim-b", dimensionName: "LocalAccounts" };

    const issues = validateMemberUniquenessAcrossDimensionTypes({
      project: sampleProject,
      dimensions: [dimA, dimB],
      members: [
        memberFixture({ id: "m1", dimensionId: dimA.id, memberKey: "GrossIncome", properties: { Account: "GrossIncome" } }),
        memberFixture({ id: "m2", dimensionId: dimB.id, memberKey: "GrossIncome", properties: { Account: "GrossIncome" } })
      ]
    });

    expect(issues).toHaveLength(2);
    expect(issues.every((issue) => issue.code === "DUPLICATE_MEMBER_ACROSS_DIMENSION_TYPE")).toBe(true);
  });
});
