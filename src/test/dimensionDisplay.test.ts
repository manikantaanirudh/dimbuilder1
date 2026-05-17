import { describe, expect, it } from "vitest";
import { getDimensionDisplayLabel, getDimensionDisplaySubtitle } from "../shared/dimensionDisplay";
import { sampleScenarioDimension } from "./fixtures";

describe("dimension display", () => {
  it("uses dimension type and dimension name for unique navigation labels", () => {
    const label = getDimensionDisplayLabel({
      ...sampleScenarioDimension,
      sheetName: "UD3 OUC",
      dimensionType: "UD3",
      dimensionName: "OUC"
    });

    expect(label).toBe("UD3 - OUC");
  });

  it("shows merged source sheet names for split workbook dimensions", () => {
    const subtitle = getDimensionDisplaySubtitle({
      ...sampleScenarioDimension,
      sheetName: "UD3 OUC",
      dimensionType: "UD3",
      dimensionName: "OUC",
      metadata: { sourceSheetNames: ["UD3 OUC (2)", "UD3 OUC"] }
    });

    expect(subtitle).toBe("Sheets: UD3 OUC (2), UD3 OUC");
  });
});
