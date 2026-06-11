import { describe, expect, it } from "vitest";
import { toPostgresParams, upsertSql } from "../server/db/sql";

describe("db sql helpers", () => {
  it("converts question marks to postgres placeholders", () => {
    expect(toPostgresParams("SELECT * FROM projects WHERE id = ?", ["abc"]))
      .toEqual({ text: "SELECT * FROM projects WHERE id = $1", values: ["abc"] });
  });

  it("rejects mismatched placeholder counts", () => {
    expect(() => toPostgresParams("SELECT * FROM projects WHERE id = ? AND name = ?", ["abc"]))
      .toThrow(/placeholder/i);
  });

  it("builds upsert sql for postgres", () => {
    const sql = upsertSql("project_members", ["id", "project_id", "user_id", "role"], ["project_id", "user_id"], ["role"]);
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain("DO UPDATE");
  });
});
