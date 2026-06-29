import { describe, expect, it } from "vitest";
import { normalizeQuery } from "../server/ai/naturalLanguage/queryNormalizer";

describe("queryNormalizer", () => {
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
});
