import { describe, expect, it } from "vitest";
import { resolveEffectiveProperties, type PropertyDefaultResolutionEntry } from "../shared/effectiveProperties";

const accountDefaults: PropertyDefaultResolutionEntry[] = [
  {
    dimensionType: "Account",
    targetLevel: "member",
    propertyName: "Account Type",
    xmlName: "AccountType",
    defaultValue: "Expense",
    enabled: true
  }
];

describe("resolveEffectiveProperties", () => {
  it("inherits enabled defaults for missing properties", () => {
    const effective = resolveEffectiveProperties({}, accountDefaults);
    expect(effective["Account Type"]).toBe("Expense");
  });

  it("keeps explicit overrides over defaults", () => {
    const effective = resolveEffectiveProperties({ "Account Type": "Revenue" }, accountDefaults);
    expect(effective["Account Type"]).toBe("Revenue");
  });

  it("treats empty string as inherit when configured", () => {
    const effective = resolveEffectiveProperties({ "Account Type": "" }, accountDefaults);
    expect(effective["Account Type"]).toBe("Expense");
  });

  it("does not apply disabled defaults", () => {
    const effective = resolveEffectiveProperties(
      {},
      [{ ...accountDefaults[0], enabled: false }]
    );
    expect(effective["Account Type"]).toBeUndefined();
  });
});
