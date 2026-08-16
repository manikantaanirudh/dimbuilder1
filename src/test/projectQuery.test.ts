import { describe, expect, it } from "vitest";
import { PROJECT_QUERY_SUGGESTIONS, toProjectQueryResult } from "../shared/projectQuery";
import { planProjectQuery, projectQuerySuggestions } from "../server/projectQuery/engine";

describe("Project Query contract", () => {
  it("exposes categorized deterministic suggestions", () => {
    expect(PROJECT_QUERY_SUGGESTIONS.length).toBeGreaterThan(0);
    expect(projectQuerySuggestions("validation").every((item) => item.text.toLowerCase().includes("validation"))).toBe(true);
  });

  it("maps legacy results without inventing provider metadata", () => {
    const result = toProjectQueryResult({
      answer: "Found 1 matching member.",
      query: "Find Revenue",
      matchedMembers: ["Revenue"],
      confidence: 1,
      intent: "find",
      intentLabel: "Find Members",
      evidence: ["Revenue"]
    }, "2026-08-10T00:00:00.000Z");

    expect(result.status).toBe("answered");
    expect(result.matchQuality).toBe("exact");
    expect(result.dataAsOf).toBe("2026-08-10T00:00:00.000Z");
    expect(result.targets).toEqual([{ kind: "member", memberKey: "Revenue" }]);
  });

  it.each([
    ["How many members in Account?", "count", true, false],
    ["Show orphan members", "orphans", true, true],
    ["What is wrong with my project?", "issues", true, false],
    ["What changed since baseline?", "changedSinceBaseline", false, false]
  ])("plans %s before loading unrelated data", (question, intent, needsDimensions, needsRelationships) => {
    const plan = planProjectQuery(question);
    expect(plan.intent).toBe(intent);
    expect(plan.requirements.dimensions).toBe(needsDimensions);
    expect(plan.requirements.relationships).toBe(needsRelationships);
  });
});
