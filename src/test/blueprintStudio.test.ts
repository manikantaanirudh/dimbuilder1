import { describe, expect, it } from "vitest";
import {
  blueprintFromProjectDimension,
  blueprintToYamlFragment,
  compareBlueprints,
  validateBlueprintDraft
} from "../shared/blueprintStudio";
import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord } from "../shared/types";

const accountDimension: DimensionRecord = {
  id: "dim-account",
  projectId: "project-1",
  sheetName: "Accounts",
  dimensionType: "Account",
  dimensionName: "Corporate Accounts",
  description: "",
  accessGroup: "",
  maintenanceGroup: "",
  inheritedDimension: "",
  sortOrder: 1,
  metadata: {
    source: "blueprint",
    allowMultipleParents: false,
    relationshipDefaults: { aggregationWeight: 1 }
  },
  createdAt: "2026-05-19T00:00:00.000Z",
  updatedAt: "2026-05-19T00:00:00.000Z"
};

const members: DimensionMemberRecord[] = [
  {
    id: "member-root",
    dimensionId: accountDimension.id,
    memberKey: "Root",
    description: "Root",
    properties: { Account: "Root", Description: "Root" },
    rowOrder: 1,
    sourceRowNumber: 0,
    isActive: true,
    createdAt: accountDimension.createdAt,
    updatedAt: accountDimension.updatedAt
  },
  {
    id: "member-revenue",
    dimensionId: accountDimension.id,
    memberKey: "Revenue",
    description: "Revenue",
    properties: { Account: "Revenue", Description: "Revenue", "Account Type": "Revenue" },
    rowOrder: 2,
    sourceRowNumber: 0,
    isActive: true,
    createdAt: accountDimension.createdAt,
    updatedAt: accountDimension.updatedAt
  }
];

const relationships: DimensionRelationshipRecord[] = [
  {
    id: "rel-revenue",
    dimensionId: accountDimension.id,
    parentKey: "Root",
    childKey: "Revenue",
    aggregationWeight: 1,
    percentConsol: null,
    percentOwnership: null,
    ownershipType: "",
    properties: { Parent: "Root", Child: "Revenue", "Aggregation Weight": 1 },
    rowOrder: 1,
    sourceRowNumber: 0,
    createdAt: accountDimension.createdAt,
    updatedAt: accountDimension.updatedAt
  }
];

describe("Blueprint Studio helpers", () => {
  it("validates and normalizes a valid blueprint draft", () => {
    const result = validateBlueprintDraft("Account", {
      defaultDimensionName: " Corporate Accounts ",
      rootMembers: ["Root", "Root", "NetIncome"],
      memberKeyField: "Account",
      relationshipDefaults: { aggregationWeight: 1 },
      allowMultipleParents: true,
      members: [
        { memberKey: "Revenue", description: "Revenue", properties: { "Account Type": "Revenue" } }
      ],
      relationships: [
        { parentKey: "Root", childKey: "Revenue", aggregationWeight: 1 }
      ]
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.blueprint).toMatchObject({
      defaultDimensionName: "Corporate Accounts",
      rootMembers: ["Root", "NetIncome"],
      memberKeyField: "Account",
      relationshipDefaults: { aggregationWeight: 1 },
      allowMultipleParents: true
    });
  });

  it("returns validation errors without throwing for invalid member key fields", () => {
    const result = validateBlueprintDraft("Account", {
      defaultDimensionName: "Accounts",
      rootMembers: ["Root"],
      memberKeyField: "Not A Field",
      relationshipDefaults: { aggregationWeight: 1 },
      allowMultipleParents: true
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(["Blueprint for 'Account' uses unsupported memberKeyField 'Not A Field'."]);
  });

  it("generates deterministic YAML fragments for a blueprint", () => {
    const result = validateBlueprintDraft("Account", {
      defaultDimensionName: "Accounts",
      rootMembers: ["Root"],
      memberKeyField: "Account",
      relationshipDefaults: { aggregationWeight: 1 },
      allowMultipleParents: true
    });
    if (!result.blueprint) throw new Error("Blueprint should be valid");

    const yaml = blueprintToYamlFragment("Account", result.blueprint);

    expect(yaml).toContain("dimensions:");
    expect(yaml).toContain("blueprints:");
    expect(yaml).toContain("Account:");
    expect(yaml).toContain("defaultDimensionName: Accounts");
    expect(yaml.indexOf("defaultDimensionName")).toBeLessThan(yaml.indexOf("rootMembers"));
  });

  it("derives a blueprint draft from an existing project dimension", () => {
    const blueprint = blueprintFromProjectDimension(accountDimension, members, relationships);

    expect(blueprint).toMatchObject({
      defaultDimensionName: "Corporate Accounts",
      rootMembers: ["Root"],
      memberKeyField: "Account",
      relationshipDefaults: { aggregationWeight: 1 },
      allowMultipleParents: false,
      members: [
        { memberKey: "Revenue", description: "Revenue", properties: { "Account Type": "Revenue" } }
      ],
      relationships: [
        { parentKey: "Root", childKey: "Revenue", aggregationWeight: 1 }
      ]
    });
  });

  it("compares blueprint drafts by path", () => {
    const changes = compareBlueprints(
      {
        defaultDimensionName: "Accounts",
        rootMembers: ["Root"],
        memberKeyField: "Account",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      {
        defaultDimensionName: "Corporate Accounts",
        rootMembers: ["Root", "NetIncome"],
        memberKeyField: "Account",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: false
      }
    );

    expect(changes).toEqual([
      { path: "allowMultipleParents", oldValue: true, newValue: false },
      { path: "defaultDimensionName", oldValue: "Accounts", newValue: "Corporate Accounts" },
      { path: "rootMembers", oldValue: ["Root"], newValue: ["Root", "NetIncome"] }
    ]);
  });
});
