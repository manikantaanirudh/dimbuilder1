import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { cleanupStaleArtifacts } from "../server/artifactRetention";
import type { AppDatabase } from "../server/db/database";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (filename: string) => AppDatabase;
};

describe("artifact retention", () => {
  it("removes old diff runs and orphaned baselines", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', source_file_name TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO projects VALUES ('p1', 'Demo', '', '', 'tester', '2020-01-01', '2020-01-01');
      CREATE TABLE project_baselines (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, source_type TEXT NOT NULL, source_file_name TEXT NOT NULL DEFAULT '', baseline_json TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT INTO project_baselines VALUES ('b-old', 'p1', 'Old', 'manual', '', '{}', 'tester', '2020-01-01');
      INSERT INTO project_baselines VALUES ('b-new', 'p1', 'New', 'manual', '', '{}', 'tester', datetime('now'));
      CREATE TABLE metadata_diff_runs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, baseline_id TEXT NOT NULL, status TEXT NOT NULL, summary_json TEXT NOT NULL DEFAULT '{}', created_by TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT INTO metadata_diff_runs VALUES ('d-old', 'p1', 'b-new', 'complete', '{}', 'tester', '2020-01-01');
    `);

    const result = cleanupStaleArtifacts(db, 30, new Date("2026-06-02"));
    expect(result.diffRunsRemoved).toBe(1);
    expect(result.baselinesRemoved).toBe(1);
    expect(result.bulkJobsRemoved).toBe(0);
    const baselineIds = db.prepare("SELECT id FROM project_baselines").all().map((row) => String(row.id));
    expect(baselineIds).toEqual(["b-new"]);
    db.close();
  });

  it("is a no-op when retention is disabled", () => {
    const db = new DatabaseSync(":memory:");
    const result = cleanupStaleArtifacts(db, 0);
    expect(result.diffRunsRemoved).toBe(0);
    expect(result.baselinesRemoved).toBe(0);
    db.close();
  });
});
