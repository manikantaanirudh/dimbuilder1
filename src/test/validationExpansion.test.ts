import { describe, expect, it } from "vitest";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import { validateOneStreamProfile } from "../shared/oneStreamValidation";
import { validateProjectStructure } from "../shared/projectValidation";
import type { AppConfig } from "../shared/appConfigTypes";
import type { DimensionRecord } from "../shared/types";
import { memberFixture, sampleProject, sampleScenarioDimension } from "./fixtures";

const baseProfile = defaultAppConfig.validation.oneStreamProfile;

const entityDimension: DimensionRecord = {
  ...sampleScenarioDimension,
  id: "dim-entity",
  dimensionType: "Entity",
  dimensionName: "Entities",
  sheetName: "Entities"
};

describe("CROSS_DIMENSION_CURRENCY_INVALID", () => {
  it("flags an entity currency not in the configured list", () => {
    const issues = validateOneStreamProfile({
      project: sampleProject,
      dimension: entityDimension,
      members: [
        memberFixture({ id: "e-usd", dimensionId: entityDimension.id, memberKey: "US01", properties: { Entity: "US01", Currency: "USD" } }),
        memberFixture({ id: "e-bad", dimensionId: entityDimension.id, memberKey: "ZZ01", properties: { Entity: "ZZ01", Currency: "XYZ" } })
      ],
      relationships: [],
      profile: { ...baseProfile, validCurrencyCodes: ["USD", "EUR"] }
    });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("CROSS_DIMENSION_CURRENCY_INVALID");
    const bad = issues.find((i) => i.code === "CROSS_DIMENSION_CURRENCY_INVALID");
    expect(bad?.entityId).toBe("e-bad");
  });

  it("does not run when no valid currency codes are configured", () => {
    const issues = validateOneStreamProfile({
      project: sampleProject,
      dimension: entityDimension,
      members: [
        memberFixture({ id: "e-bad", dimensionId: entityDimension.id, memberKey: "ZZ01", properties: { Entity: "ZZ01", Currency: "XYZ" } })
      ],
      relationships: [],
      profile: { ...baseProfile, validCurrencyCodes: [] }
    });
    expect(issues.map((i) => i.code)).not.toContain("CROSS_DIMENSION_CURRENCY_INVALID");
  });
});

describe("SECURITY_GROUP_REFERENCE_MISSING", () => {
  it("flags an access group not in the configured known groups", () => {
    const issues = validateOneStreamProfile({
      project: sampleProject,
      dimension: entityDimension,
      members: [
        memberFixture({ id: "e1", dimensionId: entityDimension.id, memberKey: "US01", properties: { Entity: "US01", Currency: "USD", "Access Group": "Unknown Group" } })
      ],
      relationships: [],
      profile: { ...baseProfile, securityGroups: ["Everyone", "Admins"] }
    });
    expect(issues.map((i) => i.code)).toContain("SECURITY_GROUP_REFERENCE_MISSING");
  });

  it("does not flag a resolved group reference", () => {
    const issues = validateOneStreamProfile({
      project: sampleProject,
      dimension: entityDimension,
      members: [
        memberFixture({ id: "e1", dimensionId: entityDimension.id, memberKey: "US01", properties: { Entity: "US01", Currency: "USD", "Access Group": "Everyone" } })
      ],
      relationships: [],
      profile: { ...baseProfile, securityGroups: ["Everyone", "Admins"] }
    });
    expect(issues.map((i) => i.code)).not.toContain("SECURITY_GROUP_REFERENCE_MISSING");
  });
});

describe("DIMENSION_MISSING_FROM_PROJECT", () => {
  function configWithExpected(types: AppConfig["dimensions"]["enabledTypes"]): AppConfig {
    return {
      ...defaultAppConfig,
      validation: {
        ...defaultAppConfig.validation,
        oneStreamProfile: { ...baseProfile, expectedDimensionTypes: types }
      }
    };
  }

  it("reports an expected dimension type that is absent", () => {
    const issues = validateProjectStructure({
      project: sampleProject,
      dimensions: [{ ...entityDimension }],
      config: configWithExpected(["Entity", "Account"])
    });
    const missing = issues.filter((i) => i.code === "DIMENSION_MISSING_FROM_PROJECT");
    expect(missing).toHaveLength(1);
    expect(missing[0].message).toContain("Account");
    expect(missing[0].entityType).toBe("project");
  });

  it("reports nothing when all expected dimensions are present", () => {
    const issues = validateProjectStructure({
      project: sampleProject,
      dimensions: [{ ...entityDimension }, { ...entityDimension, id: "dim-acct", dimensionType: "Account" }],
      config: configWithExpected(["Entity", "Account"])
    });
    expect(issues).toHaveLength(0);
  });
});

describe("maxHierarchyDepth config", () => {
  it("defaults are present on the profile", () => {
    expect(baseProfile.maxHierarchyDepth).toBe(30);
  });
});
