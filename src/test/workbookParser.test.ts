import ExcelJS from "exceljs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import { mergeAppConfig } from "../shared/appConfigValidation";
import { validateDimension } from "../shared/validationEngine";
import { parseWorkbook } from "../shared/workbookParser";
import { exportProjectXml } from "../shared/xmlExport";

const workbookPath = "XF Dimensions Template - 29.04.2026.xlsx";
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createMinimalWorkbook(
  sheets: Array<{
    sheetName: string;
    dimensionTypeText?: string;
    dimensionName: string;
    memberKeyField: string;
    memberKey: string;
    description?: string;
    extraMemberColumns?: Array<{ header: string; value: string }>;
  }>
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "dimbuilder-parser-"));
  tempDirs.push(dir);
  const filePath = join(dir, "workbook.xlsx");
  const workbook = new ExcelJS.Workbook();

  for (const sheetFixture of sheets) {
    const sheet = workbook.addWorksheet(sheetFixture.sheetName);
    sheet.getCell("B1").value = sheetFixture.dimensionTypeText ?? "";
    sheet.getCell("B2").value = sheetFixture.dimensionName;
    sheet.getCell("A8").value = sheetFixture.memberKeyField;
    sheet.getCell("B8").value = "Description";
    sheet.getCell("A9").value = sheetFixture.memberKey;
    sheet.getCell("B9").value = sheetFixture.description ?? `${sheetFixture.memberKey} description`;
    sheetFixture.extraMemberColumns?.forEach((column, index) => {
      const columnNumber = index + 3;
      sheet.getRow(8).getCell(columnNumber).value = column.header;
      sheet.getRow(9).getCell(columnNumber).value = column.value;
    });
  }

  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

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

  it("does not add metadata-only dimensions when config disables them", async () => {
    const filePath = await createMinimalWorkbook([
      {
        sheetName: "Accounts",
        dimensionTypeText: "Account",
        dimensionName: "MainAccounts",
        memberKeyField: "Account",
        memberKey: "Cash"
      }
    ]);
    const config = mergeAppConfig(defaultAppConfig, {
      features: { includeMetadataOnlyDimensions: false },
      import: { metadataReference: { includeMetadataOnlyDimensions: false } },
      dimensions: { metadataOnly: { includeWhenWorkbookSheetMissing: false } }
    });

    const parsed = await parseWorkbook(filePath, {
      projectName: "Config metadata-only disabled",
      createdBy: "local-admin",
      config,
      metadataReference: {
        version: "9.2.0.18004",
        dimensions: [
          { type: "UD1", name: "Region", inheritedDim: "RootUD1Dim", memberCount: 6, relationshipCount: 7 }
        ]
      }
    });

    expect(parsed.dimensions.some((dimension) => dimension.dimensionType === "UD1")).toBe(false);
  });

  it("uses configured preferred metadata names before largest populated fallback", async () => {
    const filePath = await createMinimalWorkbook([
      {
        sheetName: "Accounts",
        dimensionTypeText: "Account",
        dimensionName: "MainAccounts",
        memberKeyField: "Account",
        memberKey: "Cash"
      }
    ]);
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        preferredMetadataNames: {
          Account: "PlanAccounts_L2"
        }
      }
    });

    const parsed = await parseWorkbook(filePath, {
      projectName: "Config preferred metadata",
      createdBy: "local-admin",
      config,
      metadataReference: {
        version: "9.2.0.18004",
        dimensions: [
          { type: "Account", name: "GLAccounts", inheritedDim: "RootAccountDim", memberCount: 100, relationshipCount: 100 },
          { type: "Account", name: "PlanAccounts_L2", inheritedDim: "RootAccountDim", memberCount: 2, relationshipCount: 2 }
        ]
      }
    });

    expect(parsed.dimensions.find((dimension) => dimension.dimensionType === "Account")?.dimensionName).toBe("PlanAccounts_L2");
  });

  it("imports configured sheet aliases and ignores disabled dimension types", async () => {
    const filePath = await createMinimalWorkbook([
      {
        sheetName: "Plan Account Sheet",
        dimensionName: "AliasAccounts",
        memberKeyField: "Account",
        memberKey: "Cash"
      },
      {
        sheetName: "Entities",
        dimensionTypeText: "Entity",
        dimensionName: "LegalEntities",
        memberKeyField: "Entity",
        memberKey: "Corp"
      }
    ]);
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        enabledTypes: ["Account"],
        displayOrder: ["Account"],
        sheetAliases: {
          Account: ["Plan Account Sheet"]
        }
      }
    });

    const parsed = await parseWorkbook(filePath, {
      projectName: "Config alias",
      createdBy: "local-admin",
      config
    });

    expect(parsed.dimensions.map((dimension) => dimension.dimensionType)).toEqual(["Account"]);
    expect(parsed.dimensions[0]?.sheetName).toBe("Plan Account Sheet");
    expect(parsed.dimensions[0]?.dimensionName).toBe("AliasAccounts");
  });

  it("keeps duplicate logical dimensions separate when configured", async () => {
    const filePath = await createMinimalWorkbook([
      {
        sheetName: "Accounts",
        dimensionTypeText: "Account",
        dimensionName: "MainAccounts",
        memberKeyField: "Account",
        memberKey: "Cash"
      },
      {
        sheetName: "Accounts Copy",
        dimensionTypeText: "Account",
        dimensionName: "MainAccounts",
        memberKeyField: "Account",
        memberKey: "Revenue"
      }
    ]);
    const config = mergeAppConfig(defaultAppConfig, {
      import: { workbook: { mergeDuplicateDimensionSheets: false } }
    });

    const parsed = await parseWorkbook(filePath, {
      projectName: "Config duplicate dimensions",
      createdBy: "local-admin",
      config
    });

    expect(parsed.dimensions.filter((dimension) => dimension.dimensionType === "Account")).toHaveLength(2);
    expect(parsed.dimensions.map((dimension) => dimension.sheetName)).toEqual(["Accounts", "Accounts Copy"]);
    expect(new Set(parsed.members.map((member) => member.dimensionId))).toHaveLength(2);
  });

  it("preserves generated and unmatched member columns when configured", async () => {
    const filePath = await createMinimalWorkbook([
      {
        sheetName: "Accounts",
        dimensionTypeText: "Account",
        dimensionName: "MainAccounts",
        memberKeyField: "Account",
        memberKey: "Cash",
        extraMemberColumns: [
          { header: "Begin Members", value: "generated marker" },
          { header: "Custom Upload Column", value: "custom value" }
        ]
      }
    ]);
    const config = mergeAppConfig(defaultAppConfig, {
      import: { workbook: { ignoreGeneratedXmlColumns: false } }
    });

    const parsed = await parseWorkbook(filePath, {
      projectName: "Config generated columns",
      createdBy: "local-admin",
      config
    });

    expect(parsed.members[0]?.memberKey).toBe("Cash");
    expect(parsed.members[0]?.properties).toMatchObject({
      "Begin Members": "generated marker",
      "Custom Upload Column": "custom value"
    });
  });

  it("preserves formula error values when configured", async () => {
    const filePath = await createMinimalWorkbook([
      {
        sheetName: "Scenarios",
        dimensionTypeText: "Scenario",
        dimensionName: "Scenarios",
        memberKeyField: "Entity",
        memberKey: "Actual",
        extraMemberColumns: [{ header: "Text1", value: "#NAME?" }]
      }
    ]);
    const config = mergeAppConfig(defaultAppConfig, {
      import: { workbook: { ignoreFormulaErrors: false } }
    });

    const parsed = await parseWorkbook(filePath, {
      projectName: "Config formula errors",
      createdBy: "local-admin",
      config
    });

    expect(parsed.members[0]?.properties.Text1).toBe("#NAME?");
  });

  it("routes skipped default row messages as errors when configured", async () => {
    const filePath = await createMinimalWorkbook([
      {
        sheetName: "Accounts",
        dimensionTypeText: "Account",
        dimensionName: "MainAccounts",
        memberKeyField: "Account",
        memberKey: "",
        description: "Default row without key"
      }
    ]);
    const config = mergeAppConfig(defaultAppConfig, {
      import: { workbook: { skippedDefaultRowSeverity: "error" } }
    });

    const parsed = await parseWorkbook(filePath, {
      projectName: "Config skipped row severity",
      createdBy: "local-admin",
      config
    });

    expect(parsed.importSummary.errors).toContain("Sheet 'Accounts' row 9 has default values but no member key.");
    expect(parsed.importSummary.warnings).not.toContain("Sheet 'Accounts' row 9 has default values but no member key.");
  });
});
