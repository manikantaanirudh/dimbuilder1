import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeXmlPropertyDefaults } from "../shared/propertyDefaults";

const fixturePath = join(process.cwd(), "tests/fixtures/onestream/xml/property-defaults-sample.xml");

describe("analyzeXmlPropertyDefaults", () => {
  const analysis = analyzeXmlPropertyDefaults(readFileSync(fixturePath, "utf8"), {
    sourceFileName: "property-defaults-sample.xml"
  });

  it("builds a profile with hash and grouped defaults by dimension type", () => {
    expect(analysis.profile.sourceFileName).toBe("property-defaults-sample.xml");
    expect(analysis.profile.sourceXmlHash).toMatch(/^[a-f0-9]{64}$/);
    expect(analysis.dimensionTypesAnalyzed).toEqual(expect.arrayContaining(["Account", "Entity", "Scenario", "Flow", "UD1"]));
    expect(analysis.values.length).toBeGreaterThan(0);
  });

  it("chooses the most common non-blank Account Type across dimensions of the same type", () => {
    const accountType = analysis.values.find(
      (value) => value.dimensionType === "Account" && value.targetLevel === "member" && value.propertyName === "Account Type"
    );
    expect(accountType).toBeDefined();
    expect(accountType?.defaultValue).toBe("Expense");
    expect(accountType?.sampleCount).toBe(4);
    expect(accountType?.nonBlankCount).toBe(4);
    expect(accountType?.distinctCount).toBe(2);
    expect(accountType?.confidence).toBe(0.75);
    expect(accountType?.sourceDimensionNames).toEqual(expect.arrayContaining(["AccountsA", "AccountsB"]));
    expect(accountType?.xmlName).toBe("AccountType");
  });

  it("includes Scenario, Entity, Flow, and UD member defaults", () => {
    const scenarioType = analysis.values.find(
      (value) => value.dimensionType === "Scenario" && value.propertyName === "Scenario Type"
    );
    expect(scenarioType?.defaultValue).toBe("Actual");
    expect(scenarioType?.confidence).toBe(0.5);

    const currency = analysis.values.find(
      (value) => value.dimensionType === "Entity" && value.propertyName === "Currency"
    );
    expect(currency?.defaultValue).toBe("USD");

    const flow = analysis.values.find(
      (value) => value.dimensionType === "Flow" && value.propertyName === "Flow Type"
    );
    expect(flow?.defaultValue).toBe("Standard");

    const udText = analysis.values.find(
      (value) => value.dimensionType === "UD1" && value.propertyName === "Text1"
    );
    expect(udText?.defaultValue).toBe("DefaultText");
  });

  it("includes Entity relationship ownership defaults", () => {
    const percentConsol = analysis.values.find(
      (value) =>
        value.dimensionType === "Entity"
        && value.targetLevel === "relationship"
        && value.propertyName === "Percent Consol"
    );
    expect(percentConsol?.defaultValue).toBe("100");
    expect(percentConsol?.xmlName).toBe("PercentConsolidation");
  });
});
