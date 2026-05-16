import { describe, expect, it } from "vitest";
import { parseWorkbook } from "../shared/workbookParser";

const workbookPath = "XF Dimensions Template - 29.04.2026.xlsx";

describe("workbook parser", () => {
  it("imports all supported sheets from the supplied template", async () => {
    const parsed = await parseWorkbook(workbookPath, {
      projectName: "XF Dimensions Template",
      createdBy: "local-admin"
    });

    expect(parsed.importSummary.sheetsDetected).toBe(12);
    expect(parsed.importSummary.dimensionsImported).toBe(12);
    expect(parsed.importSummary.errors).toEqual([]);
    expect(parsed.dimensions.map((dimension) => dimension.sheetName)).toContain("UD3 OUC");
    expect(parsed.members.length).toBeGreaterThan(32000);
    expect(parsed.relationships.some((relationship) => relationship.parentKey === "Root")).toBe(true);
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
});

