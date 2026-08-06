import { describe, expect, it } from "vitest";
import { analyzeGraphTopology } from "../server/ai/suggestions/graphIntelligence";
import type { DimensionMemberRecord, DimensionRelationshipRecord } from "../shared/types";
import { sampleMember, sampleRelationship } from "./fixtures";

function makeMem(overrides: Partial<DimensionMemberRecord>): DimensionMemberRecord {
  return { ...sampleMember, ...overrides };
}

function makeRel(overrides: Partial<DimensionRelationshipRecord>): DimensionRelationshipRecord {
  return { ...sampleRelationship, ...overrides };
}

describe("Graph Intelligence Engine", () => {
  it("detects orphan members with no parent or child links", () => {
    const members = [
      makeMem({ id: "m1", memberKey: "Root1" }),
      makeMem({ id: "m2", memberKey: "Child1" }),
      makeMem({ id: "m3", memberKey: "Orphan1" }),
    ];
    const relationships = [
      makeRel({ parentKey: "Root1", childKey: "Child1" }),
    ];

    const result = analyzeGraphTopology({ members, relationships });
    expect(result.orphans).toHaveLength(1);
    expect(result.orphans[0].memberKey).toBe("Orphan1");
    expect(result.quickFixes.some((f) => f.targetMemberKey === "Orphan1")).toBe(true);
  });

  it("detects circular dependency cycles in relationship graph", () => {
    const members = [
      makeMem({ id: "m1", memberKey: "NodeA" }),
      makeMem({ id: "m2", memberKey: "NodeB" }),
    ];
    const relationships = [
      makeRel({ parentKey: "NodeA", childKey: "NodeB" }),
      makeRel({ parentKey: "NodeB", childKey: "NodeA" }),
    ];

    const result = analyzeGraphTopology({ members, relationships });
    expect(result.cycles.length).toBeGreaterThan(0);
    expect(result.metrics.cycleCount).toBeGreaterThan(0);
  });

  it("identifies multi-parent diamond nodes and calculates totals", () => {
    const members = [
      makeMem({ id: "m1", memberKey: "Parent1" }),
      makeMem({ id: "m2", memberKey: "Parent2" }),
      makeMem({ id: "m3", memberKey: "SharedChild" }),
    ];
    const relationships = [
      makeRel({ parentKey: "Parent1", childKey: "SharedChild", aggregationWeight: 1.0 }),
      makeRel({ parentKey: "Parent2", childKey: "SharedChild", aggregationWeight: 1.0 }),
    ];

    const result = analyzeGraphTopology({ members, relationships });
    expect(result.multiParents).toHaveLength(1);
    expect(result.multiParents[0].memberKey).toBe("SharedChild");
    expect(result.multiParents[0].parents).toEqual(["Parent1", "Parent2"]);
  });

  it("generates whitespace trim quick-fixes", () => {
    const members = [
      makeMem({ id: "m1", memberKey: " SpacedKey " }),
    ];

    const result = analyzeGraphTopology({ members, relationships: [] });
    const trimFix = result.quickFixes.find((f) => f.type === "trimWhitespace");
    expect(trimFix).toBeDefined();
    expect(trimFix?.payload.trimmedKey).toBe("SpacedKey");
  });
});
