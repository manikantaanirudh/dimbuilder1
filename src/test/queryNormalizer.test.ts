import { describe, expect, it } from "vitest";
import { normalizeQuery } from "../server/ai/naturalLanguage/queryNormalizer";
import { extractDimensionToken, resolveDimensionToken } from "../server/ai/naturalLanguage/queryHelpers";
import { parseAndExecuteQuery } from "../server/ai/naturalLanguage/queryParser";
import type { DimensionRecord } from "../shared/types";

describe("queryNormalizer and dimension resolution", () => {
  const mockDimensions: DimensionRecord[] = [
    { id: "dim-acc-1", projectId: "p1", dimensionType: "Account", dimensionName: "Account", createdAt: "", updatedAt: "" },
    { id: "dim-acc-2", projectId: "p1", dimensionType: "Account", dimensionName: "Account - StratPlanAccounts", createdAt: "", updatedAt: "" },
    { id: "dim-ent-1", projectId: "p1", dimensionType: "Entity", dimensionName: "Entity - GlobalEntities", createdAt: "", updatedAt: "" }
  ];

  it("strips conversational filler from member-list questions", () => {
    const result = normalizeQuery("can you tell me all the scenario members available in scenario dimension");
    expect(result.normalized).toContain("scenario");
    expect(result.normalized).toContain("members");
    expect(result.normalized).not.toContain("can you");
  });

  it("builds compact tokens without noise words", () => {
    const result = normalizeQuery("please show me all the account members in account dimension");
    expect(result.compact).toContain("account");
    expect(result.compact).toContain("members");
  });

  it("extracts exact hyphenated dimension name over generic type", () => {
    const token = extractDimensionToken("How many members in Account - StratPlanAccounts?", mockDimensions);
    expect(token).toBe("Account - StratPlanAccounts");

    const resolved = resolveDimensionToken(token, mockDimensions);
    expect(resolved?.id).toBe("dim-acc-2");
    expect(resolved?.dimensionName).toBe("Account - StratPlanAccounts");
  });

  it("executes count query for exact hyphenated dimension", () => {
    const mockMembers = [
      { id: "m1", projectId: "p1", dimensionId: "dim-acc-1", memberKey: "AccRoot", description: "Root", isExpanded: false, properties: {}, sourceRowIndex: 1, createdAt: "", updatedAt: "" },
      ...Array.from({ length: 47 }).map((_, i) => ({
        id: `m-strat-${i}`, projectId: "p1", dimensionId: "dim-acc-2", memberKey: `StratAcc_${i}`, description: `Strat Account ${i}`, isExpanded: false, properties: {}, sourceRowIndex: i + 2, createdAt: "", updatedAt: ""
      }))
    ];

    const res = parseAndExecuteQuery({
      question: "How many members in Account - StratPlanAccounts?",
      dimensions: mockDimensions,
      members: mockMembers,
      relationships: []
    });

    expect(res.answer).toContain("47 member(s)");
    expect(res.answer).toContain("Account - StratPlanAccounts");
    expect(res.answer).toContain("## Key Metrics");
    expect(res.answer).toContain("## Findings");
    expect(res.answer).toContain("## Impact");
    expect(res.answer).toContain("## Recommendations");
    expect(res.answer).toContain("## Suggested Follow-up Questions");
    expect(res.matchedMembers.length).toBe(47);
  });
});

