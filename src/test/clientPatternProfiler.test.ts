import { describe, expect, it } from "vitest";
import {
  buildPatternProfile,
  evaluatePatternProfile,
  type ProfilerDimension
} from "../shared/clientPatternProfiler";

function members(keys: string[], extras: Partial<{ description: string; properties: Record<string, unknown> }> = {}) {
  return keys.map((memberKey) => ({
    memberKey,
    description: extras.description ?? "A description",
    properties: extras.properties ?? {}
  }));
}

describe("client pattern profiler", () => {
  it("detects a member naming prefix convention", () => {
    const dimensions: ProfilerDimension[] = [
      { dimensionType: "Account", members: members(["ACC_Sales", "ACC_COGS", "ACC_Tax", "ACC_Other"]) }
    ];
    const profile = buildPatternProfile("p-1", "Demo", dimensions);
    const prefixRule = profile.rules.find((r) => r.kind === "namingPrefix");
    expect(prefixRule).toBeDefined();
    expect(prefixRule!.details.prefix).toBe("ACC");
    expect(prefixRule!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("detects a required description convention", () => {
    const dimensions: ProfilerDimension[] = [
      { dimensionType: "Entity", members: members(["E1", "E2", "E3", "E4"], { description: "desc" }) }
    ];
    const profile = buildPatternProfile("p-1", "Demo", dimensions);
    expect(profile.rules.some((r) => r.kind === "descriptionCompleteness")).toBe(true);
  });

  it("does not retain low-confidence patterns", () => {
    // Mixed prefixes -> no dominant prefix above threshold.
    const dimensions: ProfilerDimension[] = [
      { dimensionType: "UD1", members: members(["AAA", "BBB", "CCC", "DDD"]) }
    ];
    const profile = buildPatternProfile("p-1", "Demo", dimensions, { minimumConfidence: 0.7 });
    expect(profile.rules.some((r) => r.kind === "namingPrefix")).toBe(false);
  });

  it("flags deviations when evaluating a project against a learned profile", () => {
    const learned: ProfilerDimension[] = [
      { dimensionType: "Account", members: members(["ACC_Sales", "ACC_COGS", "ACC_Tax", "ACC_Other"]) }
    ];
    const profile = buildPatternProfile("p-1", "Demo", learned);

    const drifted: ProfilerDimension[] = [
      { dimensionType: "Account", members: members(["ACC_Sales", "XYZ_Bad", "ACC_Tax", "ACC_Other"]) }
    ];
    const evaluation = evaluatePatternProfile(profile, drifted);
    const prefixDeviation = evaluation.deviations.find((d) => d.kind === "namingPrefix");
    expect(prefixDeviation).toBeDefined();
    expect(prefixDeviation!.affectedMembers).toContain("XYZ_Bad");
    expect(prefixDeviation!.suggestedRemediation.length).toBeGreaterThan(0);
  });

  it("detects property completeness for Entity Currency", () => {
    const dimensions: ProfilerDimension[] = [
      { dimensionType: "Entity", members: members(["E1", "E2", "E3", "E4"], { properties: { Currency: "USD" } }) }
    ];
    const profile = buildPatternProfile("p-1", "Demo", dimensions);
    expect(profile.rules.some((r) => r.kind === "propertyCompleteness" && r.details.property === "Currency")).toBe(true);
  });
});
