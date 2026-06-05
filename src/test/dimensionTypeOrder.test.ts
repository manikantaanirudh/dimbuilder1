import { describe, expect, it } from "vitest";
import { DIMENSION_TYPE_DISPLAY_ORDER, sortDimensionsByType } from "../shared/dimensionTypeOrder";
import type { DimensionRecord } from "../shared/types";

function dim(type: DimensionRecord["dimensionType"], name: string, sortOrder: number): DimensionRecord {
  return {
    id: `${type}-${name}`,
    projectId: "p1",
    sheetName: name,
    dimensionType: type,
    dimensionName: name,
    description: "",
    accessGroup: "",
    maintenanceGroup: "",
    inheritedDimension: "",
    sortOrder,
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

describe("dimensionTypeOrder", () => {
  it("uses Entity, Scenario, Account, Flow, then UD1-UD8", () => {
    expect(DIMENSION_TYPE_DISPLAY_ORDER.slice(0, 4)).toEqual(["Entity", "Scenario", "Account", "Flow"]);
    expect(DIMENSION_TYPE_DISPLAY_ORDER.slice(4)).toEqual(["UD1", "UD2", "UD3", "UD4", "UD5", "UD6", "UD7", "UD8"]);
  });

  it("sorts dimensions by type regardless of creation order", () => {
    const sorted = sortDimensionsByType([
      dim("UD2", "Products", 99),
      dim("Account", "Accounts", 50),
      dim("Entity", "Entities", 1),
      dim("Scenario", "Scenarios", 2),
      dim("Flow", "Flows", 51),
      dim("UD1", "Dept", 98)
    ]);

    expect(sorted.map((dimension) => dimension.dimensionType)).toEqual([
      "Entity",
      "Scenario",
      "Account",
      "Flow",
      "UD1",
      "UD2"
    ]);
  });
});
