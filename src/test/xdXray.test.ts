import { describe, expect, it } from "vitest";
import { buildXdXray, type XdXrayInput } from "../shared/xdXray";
import type { DimensionMemberRecord, DimensionRecord } from "../shared/types";

let seq = 0;
function dim(overrides: Partial<DimensionRecord>): DimensionRecord {
  seq += 1;
  return {
    id: `dim-${seq}`,
    projectId: "p-1",
    sheetName: "",
    dimensionType: "UD1",
    dimensionName: `Dim${seq}`,
    description: "",
    accessGroup: "",
    maintenanceGroup: "",
    inheritedDimension: "",
    sortOrder: seq,
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

let memberSeq = 0;
function member(dimensionId: string, memberKey: string, properties: Record<string, unknown> = {}): DimensionMemberRecord {
  memberSeq += 1;
  return {
    id: `m-${memberSeq}`,
    dimensionId,
    memberKey,
    description: "",
    properties,
    rowOrder: memberSeq,
    sourceRowNumber: memberSeq,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function input(overrides: Partial<XdXrayInput>): XdXrayInput {
  return { dimensions: [], members: [], relationships: [], ...overrides };
}

describe("XD X-Ray", () => {
  it("resolves an explicit base/extended link from inheritedDimension", () => {
    const base = dim({ dimensionName: "AccountBase" });
    const extended = dim({ dimensionName: "AccountGAAP", inheritedDimension: "AccountBase" });
    const report = buildXdXray(input({ dimensions: [base, extended] }));
    const node = report.dimensions.find((d) => d.dimensionId === extended.id)!;
    expect(node.role).toBe("extended");
    expect(node.confidence).toBe("explicit");
    expect(node.baseDimensionName).toBe("AccountBase");
  });

  it("treats a config-declared link as explicit", () => {
    const base = dim({ dimensionName: "Base1" });
    const extended = dim({ dimensionName: "Ext1" });
    const report = buildXdXray(input({
      dimensions: [base, extended],
      dimensionLinks: [{ extended: "Ext1", base: "Base1" }]
    }));
    const node = report.dimensions.find((d) => d.dimensionId === extended.id)!;
    expect(node.role).toBe("extended");
    expect(node.confidence).toBe("explicit");
  });

  it("labels a naming-pattern-derived link as inferred and raises a confirm risk", () => {
    const base = dim({ dimensionName: "Sales" });
    const extended = dim({ dimensionName: "Sales_EXT" });
    const report = buildXdXray(input({
      dimensions: [base, extended],
      namingPatterns: ["^(.*)_EXT$"]
    }));
    const node = report.dimensions.find((d) => d.dimensionId === extended.id)!;
    expect(node.role).toBe("extended");
    expect(node.confidence).toBe("inferred");
    expect(report.risks.some((r) => r.code === "INFERRED_EXTENSION_LINK")).toBe(true);
  });

  it("classifies inherited, overridden, and local members", () => {
    const base = dim({ dimensionName: "Base2" });
    const extended = dim({ dimensionName: "Ext2", inheritedDimension: "Base2" });
    const report = buildXdXray(input({
      dimensions: [base, extended],
      members: [
        member(base.id, "Alpha", { Text1: "A" }),
        member(base.id, "Beta", { Text1: "B" }),
        member(extended.id, "Alpha", { Text1: "A" }),      // inherited (same)
        member(extended.id, "Beta", { Text1: "CHANGED" }),  // overridden
        member(extended.id, "Gamma", { Text1: "G" })        // local
      ]
    }));
    const lineage = report.memberLineage.filter((l) => l.dimensionId === extended.id);
    expect(lineage.find((l) => l.memberKey === "Alpha")?.status).toBe("inherited");
    const beta = lineage.find((l) => l.memberKey === "Beta");
    expect(beta?.status).toBe("overridden");
    expect(beta?.overriddenProperties[0]).toMatchObject({ property: "Text1", baseValue: "B", extendedValue: "CHANGED" });
    expect(lineage.find((l) => l.memberKey === "Gamma")?.status).toBe("local");
  });

  it("flags members that diverge across multiple extended dimensions", () => {
    const base = dim({ dimensionName: "Base3" });
    const extA = dim({ dimensionName: "ExtA", inheritedDimension: "Base3" });
    const extB = dim({ dimensionName: "ExtB", inheritedDimension: "Base3" });
    const report = buildXdXray(input({
      dimensions: [base, extA, extB],
      members: [
        member(base.id, "Shared", { Text1: "base" }),
        member(extA.id, "Shared", { Text1: "a" }),
        member(extB.id, "Shared", { Text1: "b" })
      ]
    }));
    expect(report.risks.some((r) => r.code === "MEMBER_DIVERGENT_BEHAVIOR")).toBe(true);
  });

  it("marks dimensions with no link as base", () => {
    const base = dim({ dimensionName: "StandAlone" });
    const report = buildXdXray(input({ dimensions: [base] }));
    expect(report.dimensions[0].role).toBe("base");
    expect(report.summary.baseCount).toBe(1);
  });
});
