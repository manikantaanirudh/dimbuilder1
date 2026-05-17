import { describe, expect, it } from "vitest";
import { validateDimension } from "../shared/validationEngine";
import { parseWorkbook } from "../shared/workbookParser";
import { exportProjectXml } from "../shared/xmlExport";

const workbookPath = "XF Dimensions Template - 29.04.2026.xlsx";

describe("workbook parser", () => {
  it("imports all supported sheets from the supplied template", async () => {
    const parsed = await parseWorkbook(workbookPath, {
      projectName: "XF Dimensions Template",
      createdBy: "local-admin"
    });

    expect(parsed.importSummary.sheetsDetected).toBe(12);
    expect(parsed.importSummary.dimensionsImported).toBe(11);
    expect(parsed.importSummary.errors).toEqual([]);
    expect(parsed.dimensions.map((dimension) => dimension.sheetName)).toContain("UD3 OUC");
    expect(parsed.dimensions.filter((dimension) => dimension.dimensionType === "UD3" && dimension.dimensionName === "OUC")).toHaveLength(1);
    expect(parsed.dimensions.find((dimension) => dimension.dimensionType === "UD3" && dimension.dimensionName === "OUC")?.metadata.sourceSheetNames).toEqual([
      "UD3 OUC (2)",
      "UD3 OUC"
    ]);
    expect(parsed.members.length).toBeGreaterThan(32000);
    expect(parsed.relationships.some((relationship) => relationship.parentKey === "Root")).toBe(true);

    const issues = parsed.dimensions.flatMap((dimension) => validateDimension({
      project: parsed.project,
      dimension,
      members: parsed.members.filter((member) => member.dimensionId === dimension.id),
      relationships: parsed.relationships.filter((relationship) => relationship.dimensionId === dimension.id)
    }));
    const xml = exportProjectXml({
      project: parsed.project,
      dimensions: parsed.dimensions,
      members: parsed.members,
      relationships: parsed.relationships
    });

    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xml).toContain('<OneStreamXF version="9.2.0.18004">');
    expect(xml).toContain("<member ");
    expect(xml).toContain("<relationship ");
    expect(xml.match(/<dimension /g)?.length).toBe(11);
    expect(xml).not.toContain("#NAME?");
  }, 120000);

  it("ignores generated XML/formula columns", async () => {
    const parsed = await parseWorkbook(workbookPath, {
      projectName: "XF Dimensions Template",
      createdBy: "local-admin"
    });

    const scenario = parsed.dimensions.find((dimension) => dimension.sheetName === "Scenarios");
    const scenarioMember = parsed.members.find((member) => member.dimensionId === scenario?.id);

    expect(scenarioMember).toBeDefined();
    expect(Object.keys(scenarioMember?.properties ?? {})).not.toContain("Begin Members");
    expect(Object.values(scenarioMember?.properties ?? {})).not.toContain("#NAME?");
  }, 120000);

  it("aligns workbook dimension metadata from a OneStream metadata reference", async () => {
    const parsed = await parseWorkbook(workbookPath, {
      projectName: "XF Dimensions Template",
      createdBy: "local-admin",
      metadataReference: {
        version: "9.2.0.18004",
        dimensions: [
          { type: "Scenario", name: "Scenarios", inheritedDim: "RootScenarioDim", memberCount: 12, relationshipCount: 12 },
          { type: "Account", name: "GLAccounts", inheritedDim: "PlanAccounts_L2", memberCount: 578, relationshipCount: 578 },
          { type: "UD5", name: "CustomerType", inheritedDim: "RootUD5Dim", memberCount: 8, relationshipCount: 8 },
          { type: "UD8", name: "Reporting", inheritedDim: "RootUD8Dim", memberCount: 75, relationshipCount: 75 }
        ]
      }
    });

    expect(parsed.dimensions.find((dimension) => dimension.sheetName === "Scenarios")?.dimensionName).toBe("Scenarios");
    expect(parsed.dimensions.find((dimension) => dimension.sheetName === "Scenarios")?.metadata.oneStreamVersion).toBe("9.2.0.18004");
    expect(parsed.dimensions.find((dimension) => dimension.sheetName === "Accounts")?.dimensionName).toBe("GLAccounts");
    expect(parsed.dimensions.find((dimension) => dimension.sheetName === "UD5")?.dimensionName).toBe("CustomerType");
    expect(parsed.dimensions.find((dimension) => dimension.sheetName === "UD8")?.dimensionName).toBe("Reporting");
    expect(parsed.importSummary.warnings).toContain("Aligned sheet 'Accounts' dimension 'Account / MainAccounts' to metadata reference 'Account / GLAccounts'.");
  }, 120000);

  it("adds metadata-only dimensions when the workbook is missing a dimension type", async () => {
    const parsed = await parseWorkbook(workbookPath, {
      projectName: "XF Dimensions Template",
      createdBy: "local-admin",
      metadataReference: {
        version: "9.2.0.18004",
        dimensions: [
          { type: "UD1", name: "FVA_UD1Dim", inheritedDim: "RootUD1Dim", memberCount: 0, relationshipCount: 0 },
          { type: "UD1", name: "Region", inheritedDim: "RootUD1Dim", memberCount: 6, relationshipCount: 7 },
          { type: "UD1", name: "T_OUC", inheritedDim: "T_UC", memberCount: 32858, relationshipCount: 32858 }
        ]
      }
    });

    const ud1Dimensions = parsed.dimensions.filter((dimension) => dimension.dimensionType === "UD1");

    expect(ud1Dimensions.map((dimension) => dimension.dimensionName)).toEqual(["Region", "T_OUC"]);
    expect(ud1Dimensions.every((dimension) => dimension.metadata.metadataOnly === true)).toBe(true);
    expect(ud1Dimensions.find((dimension) => dimension.dimensionName === "T_OUC")?.metadata.metadataMemberCount).toBe(32858);
    expect(parsed.importSummary.warnings).toContain("Added metadata-only dimension 'UD1 / Region' because no workbook sheet exists for dimension type 'UD1'.");
  }, 120000);
});
