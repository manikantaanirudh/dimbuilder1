import { describe, expect, it } from "vitest";
import { getDimensionDisplayLabel, getDimensionDisplaySubtitle } from "../shared/dimensionDisplay";
import { sampleScenarioDimension } from "./fixtures";

describe("dimension display", () => {
  const displayConfig = {
    labelFormat: "{sheetName}: {type}/{name} inherits {inheritedDimension}",
    showInheritedDimensionSubtitle: true,
    showMetadataOnlyBadge: true
  };

  it("uses dimension type and dimension name for unique navigation labels", () => {
    const label = getDimensionDisplayLabel({
      ...sampleScenarioDimension,
      sheetName: "UD3 OUC",
      dimensionType: "UD3",
      dimensionName: "OUC"
    });

    expect(label).toBe("UD3 - OUC");
  });

  it("applies configured label format tokens", () => {
    const label = getDimensionDisplayLabel(
      {
        ...sampleScenarioDimension,
        sheetName: "UD3 OUC",
        dimensionType: "UD3",
        dimensionName: "OUC",
        inheritedDimension: "Corporate UD3"
      },
      displayConfig
    );

    expect(label).toBe("UD3 OUC: UD3/OUC inherits Corporate UD3");
  });

  it("falls back to default label when configured label format is blank", () => {
    const label = getDimensionDisplayLabel(
      {
        ...sampleScenarioDimension,
        dimensionType: "UD3",
        dimensionName: "OUC"
      },
      { ...displayConfig, labelFormat: "   " }
    );

    expect(label).toBe("UD3 - OUC");
  });

  it("shows metadata-only marker only when configured", () => {
    const dimension = {
      ...sampleScenarioDimension,
      dimensionType: "UD3" as const,
      dimensionName: "OUC",
      metadata: { metadataOnly: true }
    };

    expect(getDimensionDisplayLabel(dimension, {
      ...displayConfig,
      labelFormat: "{type} - {name}",
      showMetadataOnlyBadge: true
    })).toBe("UD3 - OUC (metadata only)");
    expect(getDimensionDisplayLabel(dimension, {
      ...displayConfig,
      labelFormat: "{type} - {name}",
      showMetadataOnlyBadge: false
    })).toBe("UD3 - OUC");
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

  it("can include inherited dimension in subtitle while preserving source sheets", () => {
    const subtitle = getDimensionDisplaySubtitle(
      {
        ...sampleScenarioDimension,
        sheetName: "UD3 OUC",
        dimensionType: "UD3",
        dimensionName: "OUC",
        inheritedDimension: "Corporate UD3",
        metadata: { sourceSheetNames: ["UD3 OUC (2)", "UD3 OUC"] }
      },
      { ...displayConfig, showInheritedDimensionSubtitle: true }
    );

    expect(subtitle).toBe("Sheets: UD3 OUC (2), UD3 OUC; Inherits: Corporate UD3");
  });

  it("can omit inherited dimension from subtitle while preserving sheet fallback", () => {
    const subtitle = getDimensionDisplaySubtitle(
      {
        ...sampleScenarioDimension,
        sheetName: "UD3 OUC",
        dimensionType: "UD3",
        dimensionName: "OUC",
        inheritedDimension: "Corporate UD3",
        metadata: {}
      },
      { ...displayConfig, showInheritedDimensionSubtitle: false }
    );

    expect(subtitle).toBe("UD3 OUC");
  });
});
