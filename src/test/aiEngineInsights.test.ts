import { describe, expect, it } from "vitest";
import { detectDuplicates } from "../server/ai/suggestions/duplicateDetection";
import { detectNamingAnomalies } from "../server/ai/suggestions/namingAnomaly";
import { suggestHierarchyOptimizations } from "../server/ai/suggestions/hierarchyOptimization";
import { suggestProperties } from "../server/ai/suggestions/propertySuggestion";
import { analyzeGraphTopology } from "../server/ai/suggestions/graphIntelligence";
import type { DimensionMemberRecord, DimensionRelationshipRecord } from "../shared/types";
import { sampleMember, sampleRelationship } from "./fixtures";

function makeMem(overrides: Partial<DimensionMemberRecord>): DimensionMemberRecord {
  return {
    ...sampleMember,
    properties: {},
    ...overrides,
  };
}

function makeRel(overrides: Partial<DimensionRelationshipRecord>): DimensionRelationshipRecord {
  return { ...sampleRelationship, ...overrides };
}

describe("Metadata Rule & Intelligence Engine Validation Suite", () => {
  it("validates 1. Duplicate Detection Engine (Levenshtein, Soundex, Prefix)", () => {
    const members = [
      makeMem({ id: "m1", memberKey: "FinMFG" }),
      makeMem({ id: "m2", memberKey: "Fin_MFG" }),
      makeMem({ id: "m3", memberKey: "Fin-MFG" }),
      makeMem({ id: "m4", memberKey: "UnrelatedAccount" }),
    ];

    const config = {
      similarityThreshold: 0.8,
      methods: ["levenshtein", "soundex", "prefix"],
    };

    const duplicateGroups = detectDuplicates({ members, config });

    expect(duplicateGroups.length).toBeGreaterThan(0);
    const mainGroup = duplicateGroups.find((g) => g.members.includes("FinMFG"));
    expect(mainGroup).toBeDefined();
    expect(mainGroup?.members).toContain("Fin_MFG");
    expect(mainGroup?.similarity).toBeGreaterThanOrEqual(0.8);
  });

  it("validates 2. Naming Anomaly Engine (Casing, Separators, Length Outliers)", () => {
    const members = [
      makeMem({ id: "m1", memberKey: "ENTITY_FIN_1" }),
      makeMem({ id: "m2", memberKey: "ENTITY_FIN_2" }),
      makeMem({ id: "m3", memberKey: "ENTITY_FIN_3" }),
      makeMem({ id: "m4", memberKey: "ENTITY_FIN_4" }),
      makeMem({ id: "m5", memberKey: "ENTITY_FIN_5" }),
      makeMem({ id: "m6", memberKey: "entity-anomalous-name-99" }),
    ];

    const anomalies = detectNamingAnomalies({
      members,
      dimensionType: "Entity",
    });

    expect(anomalies.length).toBeGreaterThan(0);
    const outlier = anomalies.find((a) => a.memberKey === "entity-anomalous-name-99");
    expect(outlier).toBeDefined();
  });

  it("validates 3. Hierarchy Structure Optimization Engine", () => {
    const relationships = [
      makeRel({ parentKey: "ChainA", childKey: "ChainB" }),
      makeRel({ parentKey: "ChainB", childKey: "ChainC" }),
      makeRel({ parentKey: "ChainC", childKey: "ChainD" }),
    ];

    const optimizations = suggestHierarchyOptimizations({
      members: [],
      relationships,
    });

    expect(optimizations.length).toBeGreaterThan(0);
    const flattenOpt = optimizations.find((o) => o.action === "flatten");
    expect(flattenOpt).toBeDefined();
    expect(flattenOpt?.parentKey).toBe("ChainA");
  });

  it("validates 4. Property Defaults Engine", () => {
    const members = [
      makeMem({ id: "m1", memberKey: "Rev_Sales_100", description: "", properties: {} }),
    ];

    const propertySuggestions = suggestProperties({
      members,
      dimensionType: "Account",
    });

    expect(propertySuggestions.length).toBeGreaterThan(0);
    const descSuggestion = propertySuggestions.find(
      (s) => s.memberKey === "Rev_Sales_100",
    );
    expect(descSuggestion).toBeDefined();
    expect(descSuggestion?.propertyName).toBe("AccountType");
    expect(descSuggestion?.suggestedValue).toBe("Revenue");
  });

  it("validates 5. Graph Topology Intelligence & Quick-Fix Generation", () => {
    const members = [
      makeMem({ id: "m1", memberKey: "TotMFG" }),
      makeMem({ id: "m2", memberKey: "LE_100" }),
      makeMem({ id: "m3", memberKey: "LE_120" }),
      makeMem({ id: "m4", memberKey: "LE_121" }),
      makeMem({ id: "m5", memberKey: "OrphanMember" }),
    ];

    const relationships = [
      makeRel({ parentKey: "TotMFG", childKey: "LE_100" }),
      makeRel({ parentKey: "LE_100", childKey: "LE_120" }),
      makeRel({ parentKey: "LE_120", childKey: "LE_121" }),
    ];

    const result = analyzeGraphTopology({ members, relationships });

    expect(result.metrics.maxDepth).toBe(4);
    expect(result.metrics.orphanCount).toBe(1);
    expect(result.orphans[0].memberKey).toBe("OrphanMember");
    expect(result.quickFixes.some((f) => f.targetMemberKey === "OrphanMember")).toBe(true);
    expect(result.topologyTree.length).toBeGreaterThan(0);
  });
});
