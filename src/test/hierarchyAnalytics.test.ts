import { describe, expect, it } from "vitest";
import {
  buildHierarchyPaths,
  buildLevelizedRows,
  buildParentChildRows,
  calculateHierarchyDepthStats,
  exportHierarchyLevelizedCsv,
  findOrphanMembers,
  findSharedMembers,
  summarizeHierarchyHealth
} from "../shared/hierarchyAnalytics";
import type { DimensionMemberRecord, DimensionRelationshipRecord } from "../shared/types";
import { memberFixture, relationshipFixture, sampleScenarioDimension } from "./fixtures";

function member(memberKey: string, overrides: Partial<DimensionMemberRecord> = {}): DimensionMemberRecord {
  return memberFixture({
    id: `member-${memberKey}`,
    memberKey,
    description: `${memberKey} description`,
    properties: { Scenario: memberKey, Description: `${memberKey} description`, ...overrides.properties },
    ...overrides
  });
}

function relationship(
  parentKey: string,
  childKey: string,
  rowOrder: number,
  overrides: Partial<DimensionRelationshipRecord> = {}
): DimensionRelationshipRecord {
  return relationshipFixture({
    id: `relationship-${parentKey}-${childKey}-${rowOrder}`,
    parentKey,
    childKey,
    rowOrder,
    aggregationWeight: overrides.aggregationWeight ?? 1,
    properties: { Parent: parentKey, Child: childKey, "Aggregation Weight": overrides.aggregationWeight ?? 1, ...overrides.properties },
    ...overrides
  });
}

describe("hierarchy analytics", () => {
  it("builds root-to-leaf paths and levelized rows with dynamic levels", () => {
    const members = [member("Root"), member("TotalRevenue"), member("ProductRevenue"), member("ServiceRevenue")];
    const relationships = [
      relationship("Root", "TotalRevenue", 1),
      relationship("TotalRevenue", "ProductRevenue", 2, { aggregationWeight: 1 }),
      relationship("TotalRevenue", "ServiceRevenue", 3, { aggregationWeight: -1 })
    ];

    const paths = buildHierarchyPaths(sampleScenarioDimension, members, relationships);
    expect(paths.map((row) => row.path)).toEqual([
      "Root / TotalRevenue / ProductRevenue",
      "Root / TotalRevenue / ServiceRevenue"
    ]);
    expect(paths[0]).toMatchObject({
      dimensionType: "Scenario",
      dimensionName: "SampleScenario",
      memberKey: "ProductRevenue",
      description: "ProductRevenue description",
      isLeaf: true,
      parentCount: 1,
      aggregationWeight: 1,
      warnings: []
    });

    const levelized = buildLevelizedRows(sampleScenarioDimension, members, relationships);
    expect(levelized.headers).toEqual([
      "dimensionType",
      "dimensionName",
      "path",
      "level0",
      "level1",
      "level2",
      "memberKey",
      "description",
      "isLeaf",
      "parentCount",
      "aggregationWeight",
      "warnings"
    ]);
    expect(levelized.rows).toMatchObject([
      { level0: "Root", level1: "TotalRevenue", level2: "ProductRevenue", memberKey: "ProductRevenue" },
      { level0: "Root", level1: "TotalRevenue", level2: "ServiceRevenue", memberKey: "ServiceRevenue", aggregationWeight: -1 }
    ]);
  });

  it("detects shared and orphan members and summarizes hierarchy health", () => {
    const members = [
      member("Root"),
      member("AltRoot"),
      member("SharedLeaf"),
      member("OnlyChild"),
      member("Unattached")
    ];
    const relationships = [
      relationship("Root", "SharedLeaf", 1),
      relationship("AltRoot", "SharedLeaf", 2),
      relationship("Root", "OnlyChild", 3)
    ];

    expect(findSharedMembers(members, relationships)).toEqual([
      { memberKey: "SharedLeaf", parentCount: 2, parents: ["AltRoot", "Root"] }
    ]);
    expect(findOrphanMembers(members, relationships).map((row) => row.memberKey)).toEqual(["Unattached"]);

    const health = summarizeHierarchyHealth(sampleScenarioDimension, members, relationships);
    expect(health).toMatchObject({
      memberCount: 5,
      relationshipCount: 3,
      orphanCount: 1,
      sharedMemberCount: 1,
      leafCount: 3,
      parentCount: 2,
      hasCycle: false,
      warnings: []
    });
  });

  it("handles cycles without infinite traversal and returns warning paths", () => {
    const members = [member("A"), member("B"), member("C")];
    const relationships = [
      relationship("A", "B", 1),
      relationship("B", "C", 2),
      relationship("C", "A", 3)
    ];

    const paths = buildHierarchyPaths(sampleScenarioDimension, members, relationships);
    expect(paths).toHaveLength(1);
    expect(paths[0].path).toBe("A / B / C / A");
    expect(paths[0].warnings).toContain("CYCLE_DETECTED");

    const stats = calculateHierarchyDepthStats(sampleScenarioDimension, members, relationships);
    expect(stats).toMatchObject({ maxDepth: 3, hasCycle: true, pathCount: 1 });
  });

  it("exports deterministic parent-child and levelized CSV rows", () => {
    const members = [member("Root"), member("TotalRevenue"), member("ProductRevenue")];
    const relationships = [
      relationship("Root", "TotalRevenue", 1, { aggregationWeight: 1 }),
      relationship("TotalRevenue", "ProductRevenue", 2, { aggregationWeight: 0.5 })
    ];

    const parentChild = buildParentChildRows(sampleScenarioDimension, members, relationships);
    expect(parentChild.headers).toEqual([
      "dimensionType",
      "dimensionName",
      "parentKey",
      "childKey",
      "sortOrder",
      "aggregationWeight",
      "percentConsol",
      "percentOwnership",
      "ownershipType",
      "operation"
    ]);
    expect(parentChild.rows[1]).toMatchObject({
      parentKey: "TotalRevenue",
      childKey: "ProductRevenue",
      sortOrder: 2,
      aggregationWeight: 0.5
    });

    expect(exportHierarchyLevelizedCsv(sampleScenarioDimension, members, relationships)).toBe([
      "dimensionType,dimensionName,path,level0,level1,level2,memberKey,description,isLeaf,parentCount,aggregationWeight,warnings",
      "Scenario,SampleScenario,Root / TotalRevenue / ProductRevenue,Root,TotalRevenue,ProductRevenue,ProductRevenue,ProductRevenue description,true,1,0.5,"
    ].join("\n"));
  });
});
