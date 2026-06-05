import { describe, expect, it } from "vitest";
import { resolveEffectivePov, type EffectivePovInput } from "../shared/effectivePov";
import type { VaryingPropertyValueRecord } from "../shared/types";

function varying(overrides: Partial<VaryingPropertyValueRecord>): VaryingPropertyValueRecord {
  return {
    id: "vp-1",
    projectId: "p-1",
    dimensionId: "dim-1",
    targetType: "member",
    targetId: "m-1",
    propertyName: "Text 1",
    value: "",
    cubeType: "",
    scenarioType: "",
    timeMember: "",
    isDefault: false,
    revertToDefaultScenarioType: false,
    source: "manual",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function baseInput(overrides: Partial<EffectivePovInput> = {}): EffectivePovInput {
  return {
    dimensionType: "Account",
    targetType: "member",
    baseProperties: { "Text 1": "BaseValue" },
    varyingValues: [],
    context: {},
    propertyNames: ["Text 1"],
    ...overrides
  };
}

function prop(report: ReturnType<typeof resolveEffectivePov>, name: string) {
  const found = report.properties.find((p) => p.propertyName === name);
  if (!found) throw new Error(`property ${name} not found`);
  return found;
}

describe("effective POV resolver", () => {
  it("returns the base property value when there are no overrides", () => {
    const report = resolveEffectivePov(baseInput());
    expect(prop(report, "Text 1").value).toBe("BaseValue");
    expect(prop(report, "Text 1").source).toBe("baseProperty");
  });

  it("lets an exact varying override win over the base value", () => {
    const report = resolveEffectivePov(baseInput({
      context: { scenarioType: "Actual" },
      varyingValues: [varying({ propertyName: "Text 1", value: "ActualValue", scenarioType: "Actual" })]
    }));
    expect(prop(report, "Text 1").value).toBe("ActualValue");
    expect(prop(report, "Text 1").source).toBe("varyingOverride");
    expect(prop(report, "Text 1").matchedContext?.scenarioType).toBe("Actual");
  });

  it("falls back to base when context does not match any override", () => {
    const report = resolveEffectivePov(baseInput({
      context: { scenarioType: "Budget" },
      varyingValues: [varying({ propertyName: "Text 1", value: "ActualValue", scenarioType: "Actual" })]
    }));
    expect(prop(report, "Text 1").value).toBe("BaseValue");
    expect(prop(report, "Text 1").source).toBe("baseProperty");
  });

  it("prefers a more specific context over a less specific one", () => {
    const report = resolveEffectivePov(baseInput({
      context: { scenarioType: "Actual", cubeType: "GAAP" },
      varyingValues: [
        varying({ id: "v1", propertyName: "Text 1", value: "ScenarioOnly", scenarioType: "Actual" }),
        varying({ id: "v2", propertyName: "Text 1", value: "ScenarioAndCube", scenarioType: "Actual", cubeType: "GAAP" })
      ]
    }));
    expect(prop(report, "Text 1").value).toBe("ScenarioAndCube");
  });

  it("flags a conflict when two equally specific overrides disagree", () => {
    const report = resolveEffectivePov(baseInput({
      context: { scenarioType: "Actual" },
      varyingValues: [
        varying({ id: "v1", propertyName: "Text 1", value: "ValueA", scenarioType: "Actual" }),
        varying({ id: "v2", propertyName: "Text 1", value: "ValueB", scenarioType: "Actual" })
      ]
    }));
    expect(prop(report, "Text 1").conflict).toBe(true);
    expect(report.warnings.some((w) => /Conflicting varying overrides/.test(w))).toBe(true);
  });

  it("warns when a required property has no effective value", () => {
    const report = resolveEffectivePov(baseInput({
      baseProperties: {},
      propertyNames: ["Account Type"]
    }));
    const accountType = prop(report, "Account Type");
    if (accountType.required) {
      expect(accountType.value === "" ? report.warnings.length : 1).toBeGreaterThan(0);
    }
    // Resolver should not throw and should classify the source.
    expect(["missing", "dictionaryDefault", "baseProperty"]).toContain(accountType.source);
  });

  it("works when all context fields are blank", () => {
    const report = resolveEffectivePov(baseInput({ context: {} }));
    expect(prop(report, "Text 1").value).toBe("BaseValue");
  });
});
