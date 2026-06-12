import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inspectMetadataCsvFile, suggestMetadataCsvColumnMapping } from "../shared/metadataCsvMapping";
import { buildMetadataCsvCommitPlan, previewMetadataCsvImport } from "../shared/metadataCsvImport";

describe("metadataCsvMapping", () => {
  it("suggests member, description, and hierarchy columns for Opex export", () => {
    const fixturePath = join(process.cwd(), "tests/fixtures/csv/OpexAccount_Export_3Jun.txt");
    const csvContent = readFileSync(fixturePath, "utf8");
    const inspection = inspectMetadataCsvFile(csvContent, "Account");

    expect(inspection.suggestedMapping.member).toBe("NK_GLAccountCode");
    expect(inspection.suggestedMapping.description).toBe("GLAccountName");
    expect(inspection.suggestedMapping.hierarchyMode).toBe("levelColumns");
    expect(inspection.suggestedMapping.hierarchyColumns).toEqual([
      "L01_OPEXGroup",
      "L02_OPEXGroup",
      "L03_OPEXGroup"
    ]);
  });

  it("honors explicit flat mapping even when level columns exist", () => {
    const fixturePath = join(process.cwd(), "tests/fixtures/csv/OpexAccount_Export_3Jun.txt");
    const csvContent = readFileSync(fixturePath, "utf8");
    const suggested = suggestMetadataCsvColumnMapping(
      inspectMetadataCsvFile(csvContent, "Account").headers,
      "Account"
    );

    const preview = previewMetadataCsvImport({
      csvContent,
      enabledDimensionTypes: ["Account"],
      mode: "newProject",
      formDefaults: { dimensionType: "Account", dimensionName: "Accounts" },
      columnMapping: {
        member: suggested.member,
        description: suggested.description,
        hierarchyMode: "none",
        properties: { Text1: "ActiveFlag" }
      }
    });

    expect(preview.ok).toBe(true);
    expect(preview.counts.membersToCreate).toBe(313);
    expect(preview.counts.relationshipsToCreate).toBe(0);
  });

  it("builds hierarchy from custom level column order (not L01,L02,L03 default)", () => {
    const fixturePath = join(process.cwd(), "tests/fixtures/csv/OpexAccount_Export_3Jun.txt");
    const csvContent = readFileSync(fixturePath, "utf8");
    const sampleRow = [
      ";NK_GLAccountCode;GLAccountName;L01_OPEXGroup;L02_OPEXGroup;L03_OPEXGroup",
      "1;619290;External Warehouse Fixed Cost;Operating Expenses Pro Forma;Gross Spending;Facilities"
    ].join("\n");

    const defaultPlan = buildMetadataCsvCommitPlan({
      csvContent: sampleRow,
      enabledDimensionTypes: ["Account"],
      mode: "newProject",
      formDefaults: { dimensionType: "Account", dimensionName: "Accounts" },
      columnMapping: {
        member: "NK_GLAccountCode",
        description: "GLAccountName",
        hierarchyMode: "levelColumns",
        hierarchyColumns: ["L01_OPEXGroup", "L02_OPEXGroup", "L03_OPEXGroup"]
      }
    }, "default.csv").plan!;

    const reversedPlan = buildMetadataCsvCommitPlan({
      csvContent: sampleRow,
      enabledDimensionTypes: ["Account"],
      mode: "newProject",
      formDefaults: { dimensionType: "Account", dimensionName: "Accounts" },
      columnMapping: {
        member: "NK_GLAccountCode",
        description: "GLAccountName",
        hierarchyMode: "levelColumns",
        hierarchyColumns: ["L03_OPEXGroup", "L02_OPEXGroup", "L01_OPEXGroup"]
      }
    }, "reversed.csv").plan!;

    const defaultParents = defaultPlan.relationshipsToCreate.map((rel) => `${rel.parentKey}->${rel.childKey}`);
    const reversedParents = reversedPlan.relationshipsToCreate.map((rel) => `${rel.parentKey}->${rel.childKey}`);

    expect(defaultParents).toContain("Operating Expenses Pro Forma->Gross Spending");
    expect(defaultParents).toContain("Gross Spending->Facilities");
    expect(defaultParents).toContain("Facilities->619290");

    expect(reversedParents).toContain("Facilities->Gross Spending");
    expect(reversedParents).toContain("Gross Spending->Operating Expenses Pro Forma");
    expect(reversedParents).toContain("Operating Expenses Pro Forma->619290");
    expect(reversedParents).not.toEqual(defaultParents);
  });

  it("warns when only the first level column is remapped and duplicates remain in the stack", () => {
    const sampleRow = [
      ";NK_GLAccountCode;GLAccountName;L01_OPEXGroup;L02_OPEXGroup;L03_OPEXGroup",
      "1;619290;External Warehouse Fixed Cost;Operating Expenses Pro Forma;Gross Spending;Facilities"
    ].join("\n");

    const partialPlan = buildMetadataCsvCommitPlan({
      csvContent: sampleRow,
      enabledDimensionTypes: ["Account"],
      mode: "newProject",
      formDefaults: { dimensionType: "Account", dimensionName: "Accounts" },
      columnMapping: {
        member: "NK_GLAccountCode",
        hierarchyMode: "levelColumns",
        hierarchyColumns: ["L03_OPEXGroup", "L02_OPEXGroup", "L03_OPEXGroup"]
      }
    }, "partial.csv").plan!;

    const parents = partialPlan.relationshipsToCreate.map((rel) => `${rel.parentKey}->${rel.childKey}`);
    expect(parents).toContain("Facilities->Gross Spending");
    expect(parents).toContain("Gross Spending->Facilities");
    expect(parents).not.toContain("Operating Expenses Pro Forma->619290");
  });

  it("infers levelColumns mode when hierarchyColumns are provided without hierarchyMode", () => {
    const sampleRow = [
      ";NK_GLAccountCode;GLAccountName;L01_OPEXGroup;L02_OPEXGroup;L03_OPEXGroup",
      "1;619290;External Warehouse Fixed Cost;Operating Expenses Pro Forma;Gross Spending;Facilities"
    ].join("\n");

    const preview = previewMetadataCsvImport({
      csvContent: sampleRow,
      enabledDimensionTypes: ["Account"],
      mode: "newProject",
      formDefaults: { dimensionType: "Account", dimensionName: "Accounts" },
      columnMapping: {
        member: "NK_GLAccountCode",
        hierarchyColumns: ["L03_OPEXGroup", "L02_OPEXGroup", "L01_OPEXGroup"]
      }
    });

    expect(preview.ok).toBe(true);
    expect(preview.counts.relationshipsToCreate).toBe(3);
  });
});
