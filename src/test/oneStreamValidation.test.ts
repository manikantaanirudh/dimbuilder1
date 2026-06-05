import { describe, expect, it } from "vitest";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import { validateOneStreamProfile } from "../shared/oneStreamValidation";
import type { DimensionRelationshipRecord } from "../shared/types";
import {
  memberFixture,
  relationshipFixture,
  sampleProject,
  sampleScenarioDimension,
  testTimestamp
} from "./fixtures";

const baseProfile = defaultAppConfig.validation.oneStreamProfile;

const accountDimension = {
  ...sampleScenarioDimension,
  id: "dim-account",
  dimensionType: "Account" as const,
  dimensionName: "Accounts",
  sheetName: "Accounts"
};

describe("OneStream validation profile", () => {
  it("validates member naming conventions, reserved word casing, and aliases", () => {
    const issues = validateOneStreamProfile({
      project: sampleProject,
      dimension: accountDimension,
      members: [
        memberFixture({ id: "m-root", dimensionId: accountDimension.id, memberKey: "Root", properties: { Account: "Root" } }),
        memberFixture({ id: "m-root-case", dimensionId: accountDimension.id, memberKey: "root", properties: { Account: "root", "Account Type": "Expense" } }),
        memberFixture({
          id: "m-bad-name",
          dimensionId: accountDimension.id,
          memberKey: "Bad Name.Period<",
          properties: { Account: "Bad Name.Period<", Alias: "Display", "Account Type": "Expense" }
        }),
        memberFixture({
          id: "m-revenue",
          dimensionId: accountDimension.id,
          memberKey: "Revenue",
          properties: { Account: "Revenue", Alias: "Shared Alias", "Account Type": "Revenue" }
        }),
        memberFixture({
          id: "m-expense",
          dimensionId: accountDimension.id,
          memberKey: "Expense",
          properties: { Account: "Expense", Alias: "Shared Alias", "Account Type": "Expense" }
        }),
        memberFixture({
          id: "m-alias-member",
          dimensionId: accountDimension.id,
          memberKey: "AliasPointsToMember",
          properties: { Account: "AliasPointsToMember", Alias: "Revenue", "Account Type": "Expense" }
        })
      ],
      relationships: [],
      profile: {
        ...baseProfile,
        memberNameMaxLength: 8,
        duplicateAliasSeverity: "error"
      }
    });

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "MEMBER_NAME_TOO_LONG",
      "MEMBER_NAME_CONTAINS_SPACE",
      "MEMBER_NAME_CONTAINS_PERIOD",
      "MEMBER_NAME_QUERY_BRACKETS",
      "MEMBER_NAME_RESTRICTED_CHARACTER",
      "RESERVED_MEMBER_NAME_CASE_MISMATCH",
      "DUPLICATE_ALIAS",
      "ALIAS_DUPLICATES_MEMBER_NAME"
    ]));
    expect(issues.find((issue) => issue.code === "DUPLICATE_ALIAS")?.severity).toBe("error");
  });

  it("flags sort-order risks, shared members, and parent input warnings", () => {
    const dimension = { ...accountDimension, metadata: { allowMultipleParents: false } };
    const issues = validateOneStreamProfile({
      project: sampleProject,
      dimension,
      members: [
        memberFixture({ id: "m-root", dimensionId: dimension.id, memberKey: "Root", properties: { Account: "Root" } }),
        memberFixture({ id: "m-parent-1", dimensionId: dimension.id, memberKey: "Parent1", properties: { Account: "Parent1", "Account Type": "Expense", "Allow Input": "true" } }),
        memberFixture({ id: "m-parent-2", dimensionId: dimension.id, memberKey: "Parent2", properties: { Account: "Parent2", "Account Type": "Expense" } }),
        memberFixture({ id: "m-child", dimensionId: dimension.id, memberKey: "Child", properties: { Account: "Child", "Account Type": "Expense" } }),
        memberFixture({ id: "m-a", dimensionId: dimension.id, memberKey: "SiblingA", properties: { Account: "SiblingA", "Account Type": "Expense" } }),
        memberFixture({ id: "m-b", dimensionId: dimension.id, memberKey: "SiblingB", properties: { Account: "SiblingB", "Account Type": "Expense" } })
      ],
      relationships: [
        weightedRelationship({ id: "rel-root-parent", dimensionId: dimension.id, parentKey: "Root", childKey: "Parent1", rowOrder: 1 }),
        weightedRelationship({ id: "rel-zero", dimensionId: dimension.id, parentKey: "Parent1", childKey: "Child", rowOrder: 0 }),
        weightedRelationship({ id: "rel-shared", dimensionId: dimension.id, parentKey: "Parent2", childKey: "Child", rowOrder: 2 }),
        weightedRelationship({ id: "rel-a", dimensionId: dimension.id, parentKey: "Parent1", childKey: "SiblingA", rowOrder: 7 }),
        weightedRelationship({ id: "rel-b", dimensionId: dimension.id, parentKey: "Parent1", childKey: "SiblingB", rowOrder: 7 })
      ],
      profile: baseProfile
    });

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "SORT_ORDER_ZERO",
      "SORT_ORDER_DUPLICATE",
      "MULTIPLE_PARENT_NOT_ALLOWED",
      "PARENT_MEMBER_ALLOW_INPUT_WARNING"
    ]));
    expect(issues.find((issue) => issue.code === "MULTIPLE_PARENT_NOT_ALLOWED")?.severity).toBe("error");
  });

  it("emits shared member info when the dimension allows multiple parents", () => {
    const dimension = { ...accountDimension, metadata: { allowMultipleParents: true } };
    const issues = validateOneStreamProfile({
      project: sampleProject,
      dimension,
      members: [
        memberFixture({ id: "m-a", dimensionId: dimension.id, memberKey: "ParentA", properties: { Account: "ParentA", "Account Type": "Expense" } }),
        memberFixture({ id: "m-b", dimensionId: dimension.id, memberKey: "ParentB", properties: { Account: "ParentB", "Account Type": "Expense" } }),
        memberFixture({ id: "m-child", dimensionId: dimension.id, memberKey: "SharedChild", properties: { Account: "SharedChild", "Account Type": "Expense" } })
      ],
      relationships: [
        weightedRelationship({ id: "rel-a", dimensionId: dimension.id, parentKey: "ParentA", childKey: "SharedChild" }),
        weightedRelationship({ id: "rel-b", dimensionId: dimension.id, parentKey: "ParentB", childKey: "SharedChild" })
      ],
      profile: { ...baseProfile, sharedMemberSeverity: "info" }
    });

    expect(issues.find((issue) => issue.code === "SHARED_MEMBER_DETECTED")?.severity).toBe("info");
  });

  it("checks dimension-specific required metadata and entity ownership ranges", () => {
    const accountIssues = validateOneStreamProfile({
      project: sampleProject,
      dimension: accountDimension,
      members: [
        memberFixture({ id: "m-root", dimensionId: accountDimension.id, memberKey: "Root", properties: { Account: "Root" } }),
        memberFixture({ id: "m-revenue", dimensionId: accountDimension.id, memberKey: "Revenue", properties: { Account: "Revenue" } })
      ],
      relationships: [
        relationshipFixture({
          id: "rel-no-weight",
          dimensionId: accountDimension.id,
          parentKey: "Root",
          childKey: "Revenue",
          properties: { Parent: "Root", Child: "Revenue" }
        })
      ],
      profile: baseProfile
    });

    const entityDimension = {
      ...sampleScenarioDimension,
      id: "dim-entity",
      dimensionType: "Entity" as const,
      dimensionName: "Entities",
      sheetName: "Entities"
    };
    const entityIssues = validateOneStreamProfile({
      project: sampleProject,
      dimension: entityDimension,
      members: [
        memberFixture({ id: "m-root", dimensionId: entityDimension.id, memberKey: "Root", properties: { Entity: "Root" } }),
        memberFixture({ id: "m-us", dimensionId: entityDimension.id, memberKey: "US", properties: { Entity: "US" } })
      ],
      relationships: [
        relationshipFixture({
          id: "rel-entity",
          dimensionId: entityDimension.id,
          parentKey: "Root",
          childKey: "US",
          percentConsol: 125,
          percentOwnership: -1,
          ownershipType: "FullConsolidation",
          properties: { Parent: "Root", Child: "US", "Percent Consol": 125, "Percent Ownership": -1 }
        })
      ],
      profile: baseProfile
    });

    expect(accountIssues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "ACCOUNT_TYPE_MISSING",
      "RELATIONSHIP_WEIGHT_MISSING"
    ]));
    expect(entityIssues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "ENTITY_CURRENCY_MISSING",
      "ENTITY_OWNERSHIP_VALUE_INVALID"
    ]));
  });

  it("adds a OneStream duplicate warning for duplicate varying property contexts", () => {
    const issues = validateOneStreamProfile({
      project: sampleProject,
      dimension: accountDimension,
      members: [
        memberFixture({ id: "m-revenue", dimensionId: accountDimension.id, memberKey: "Revenue", properties: { Account: "Revenue", "Account Type": "Revenue" } })
      ],
      relationships: [],
      varyingPropertyValues: [
        {
          id: "varying-1",
          projectId: sampleProject.id,
          dimensionId: accountDimension.id,
          targetType: "member",
          targetId: "m-revenue",
          propertyName: "Text1",
          value: "A",
          cubeType: "Finance",
          scenarioType: "Actual",
          timeMember: "2026M1",
          isDefault: false,
          revertToDefaultScenarioType: false,
          source: "manual",
          metadata: {},
          createdAt: testTimestamp,
          updatedAt: testTimestamp
        },
        {
          id: "varying-2",
          projectId: sampleProject.id,
          dimensionId: accountDimension.id,
          targetType: "member",
          targetId: "m-revenue",
          propertyName: "Text1",
          value: "B",
          cubeType: "Finance",
          scenarioType: "Actual",
          timeMember: "2026M1",
          isDefault: false,
          revertToDefaultScenarioType: false,
          source: "manual",
          metadata: {},
          createdAt: testTimestamp,
          updatedAt: testTimestamp
        }
      ],
      profile: baseProfile
    });

    expect(issues.map((issue) => issue.code)).toContain("VARYING_PROPERTY_DUPLICATE");
  });

  it("does not flag single quote as a restricted character (not on official OneStream list)", () => {
    const issues = validateOneStreamProfile({
      project: sampleProject,
      dimension: accountDimension,
      members: [
        memberFixture({
          id: "m-apostrophe",
          dimensionId: accountDimension.id,
          memberKey: "O'Brien",
          properties: { Account: "O'Brien", "Account Type": "Expense" }
        })
      ],
      relationships: [],
      profile: baseProfile
    });

    const restrictedIssues = issues.filter((issue) => issue.code === "MEMBER_NAME_RESTRICTED_CHARACTER");
    expect(restrictedIssues).toHaveLength(0);
  });

  it("uses 500-character limit per official OneStream documentation", () => {
    const name499 = "A".repeat(499);
    const name500 = "A".repeat(500);
    const name501 = "A".repeat(501);

    const issues = validateOneStreamProfile({
      project: sampleProject,
      dimension: accountDimension,
      members: [
        memberFixture({ id: "m-499", dimensionId: accountDimension.id, memberKey: name499, properties: { Account: name499, "Account Type": "Expense" } }),
        memberFixture({ id: "m-500", dimensionId: accountDimension.id, memberKey: name500, properties: { Account: name500, "Account Type": "Expense" } }),
        memberFixture({ id: "m-501", dimensionId: accountDimension.id, memberKey: name501, properties: { Account: name501, "Account Type": "Expense" } })
      ],
      relationships: [],
      profile: baseProfile
    });

    const lengthIssues = issues.filter((issue) => issue.code === "MEMBER_NAME_TOO_LONG");
    expect(lengthIssues).toHaveLength(1);
    expect(lengthIssues[0].entityId).toBe("m-501");
  });

  it("flags all official OneStream restricted characters", () => {
    const restrictedChars = ["/", "|", "!", "@", "#", ",", ";", "^", "*", "+", "-", "=", "\\", "?", "<", ">", "\"", "{", "}", "&"];

    for (const char of restrictedChars) {
      const memberKey = `Test${char}Member`;
      const issues = validateOneStreamProfile({
        project: sampleProject,
        dimension: accountDimension,
        members: [
          memberFixture({
            id: `m-char-${restrictedChars.indexOf(char)}`,
            dimensionId: accountDimension.id,
            memberKey,
            properties: { Account: memberKey, "Account Type": "Expense" }
          })
        ],
        relationships: [],
        profile: baseProfile
      });

      const restrictedIssues = issues.filter((issue) => issue.code === "MEMBER_NAME_RESTRICTED_CHARACTER");
      expect(restrictedIssues.length, `Expected restricted character '${char}' to be flagged`).toBeGreaterThan(0);
    }
  });

  it("allows square brackets in stored member names", () => {
    const issues = validateOneStreamProfile({
      project: sampleProject,
      dimension: accountDimension,
      members: [
        memberFixture({
          id: "m-brackets",
          dimensionId: accountDimension.id,
          memberKey: "Not[Required]",
          properties: { Account: "Not[Required]", "Account Type": "Expense" }
        })
      ],
      relationships: [],
      profile: baseProfile
    });

    expect(issues.filter((issue) => issue.code === "MEMBER_NAME_RESTRICTED_CHARACTER")).toHaveLength(0);
  });

  it("flags reserved words with wrong casing from the full official list", () => {
    const issues = validateOneStreamProfile({
      project: sampleProject,
      dimension: accountDimension,
      members: [
        memberFixture({ id: "m-root-lower", dimensionId: accountDimension.id, memberKey: "root", properties: { Account: "root", "Account Type": "Expense" } }),
        memberFixture({ id: "m-scenario", dimensionId: accountDimension.id, memberKey: "scenario", properties: { Account: "scenario", "Account Type": "Expense" } }),
        memberFixture({ id: "m-xfcommon", dimensionId: accountDimension.id, memberKey: "xfcommon", properties: { Account: "xfcommon", "Account Type": "Expense" } }),
        memberFixture({ id: "m-all", dimensionId: accountDimension.id, memberKey: "all", properties: { Account: "all", "Account Type": "Expense" } })
      ],
      relationships: [],
      profile: baseProfile
    });

    const caseIssues = issues.filter((issue) => issue.code === "RESERVED_MEMBER_NAME_CASE_MISMATCH");
    expect(caseIssues).toHaveLength(4);
  });
});

function weightedRelationship(overrides: Partial<DimensionRelationshipRecord> & { parentKey: string; childKey: string }) {
  return relationshipFixture({
    aggregationWeight: 1,
    properties: {
      Parent: overrides.parentKey,
      Child: overrides.childKey,
      "Aggregation Weight": 1
    },
    ...overrides
  });
}
