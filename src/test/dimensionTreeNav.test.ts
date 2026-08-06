import { describe, expect, it } from "vitest";
import {
  buildDimensionTreeGroups,
  filterTreeNodes,
} from "../client/components/DimensionTreeNav";
import type { DimensionRecord } from "../shared/types";
import { sampleScenarioDimension } from "./fixtures";

function makeDim(overrides: Partial<DimensionRecord>): DimensionRecord {
  return {
    ...sampleScenarioDimension,
    ...overrides,
  };
}

describe("DimensionTreeNav grouping and hierarchy", () => {
  it("groups dimensions into canonical OneStream categories", () => {
    const dimensions = [
      makeDim({ id: "1", dimensionType: "Entity", dimensionName: "FinMFG" }),
      makeDim({ id: "2", dimensionType: "Account", dimensionName: "GLAccounts" }),
      makeDim({ id: "3", dimensionType: "UD1", dimensionName: "CostCenter" }),
    ];

    const groups = buildDimensionTreeGroups(dimensions, [], ["error"]);
    expect(groups.map((g) => g.label)).toEqual([
      "Entity Dimensions",
      "Account Dimensions",
      "UD1 Dimensions",
    ]);
  });

  it("builds parent-child tree hierarchy when inheritedDimension is specified", () => {
    const rootEntity = makeDim({
      id: "root-1",
      dimensionType: "Entity",
      dimensionName: "RootEntityDim",
      inheritedDimension: "",
    });
    const childEntity = makeDim({
      id: "child-1",
      dimensionType: "Entity",
      dimensionName: "FinMFG",
      inheritedDimension: "RootEntityDim",
    });

    const groups = buildDimensionTreeGroups([rootEntity, childEntity], [], ["error"]);
    const entityGroup = groups.find((g) => g.type === "Entity");
    expect(entityGroup).toBeDefined();
    expect(entityGroup?.nodes).toHaveLength(1);
    expect(entityGroup?.nodes[0].name).toBe("RootEntityDim");
    expect(entityGroup?.nodes[0].children).toHaveLength(1);
    expect(entityGroup?.nodes[0].children[0].name).toBe("FinMFG");
  });

  it("filters nodes recursively by search query", () => {
    const parent = {
      id: "p1",
      name: "RootAccountDim",
      dimension: makeDim({ id: "p1", dimensionType: "Account", dimensionName: "RootAccountDim" }),
      children: [
        {
          id: "c1",
          name: "FinancialAccounts",
          dimension: makeDim({ id: "c1", dimensionType: "Account", dimensionName: "FinancialAccounts" }),
          children: [],
          issueSummary: { errors: 0, warnings: 0, infos: 0, total: 0, blocksExport: false },
        },
      ],
      issueSummary: { errors: 0, warnings: 0, infos: 0, total: 0, blocksExport: false },
    };

    const { filtered, matchingIds } = filterTreeNodes([parent], "Financial");
    expect(filtered).toHaveLength(1);
    expect(matchingIds.has("p1")).toBe(true);
    expect(matchingIds.has("c1")).toBe(true);
  });
});
