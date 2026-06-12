import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bootstrapPostgresSchema } from "../server/db/bootstrapPostgresSchema";
import { createDatabase } from "../server/db/database";
import { createPostgresClient } from "../server/db/postgresClient";

const pgUrl = process.env.PG_TEST_URL;

describe.skipIf(!pgUrl)("sqlite-to-postgres migration", () => {
  it(
    "copies minimal project data with matching table counts",
    async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dimbuilder-sqlite-migrate-"));
    const sqlitePath = join(tempDir, "source.db");

    try {
      const sqlite = createDatabase(sqlitePath);
      const now = new Date().toISOString();
      const projectId = "proj-migrate-test";
      const dimensionId = "dim-migrate-test";
      const memberId = "member-migrate-test";

      sqlite
        .prepare(
          `INSERT INTO projects (id, name, description, source_file_name, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(projectId, "Migrate Test", "", "", "local-admin", now, now);

      sqlite
        .prepare(
          `INSERT INTO dimensions (
            id, project_id, sheet_name, dimension_type, dimension_name, description,
            access_group, maintenance_group, inherited_dimension, sort_order,
            metadata_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          dimensionId,
          projectId,
          "Accounts",
          "Account",
          "MainAccount",
          "",
          "",
          "",
          "",
          1,
          "{}",
          now,
          now
        );

      sqlite
        .prepare(
          `INSERT INTO dimension_members (
            id, dimension_id, member_key, description, properties_json, row_order,
            source_row_number, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(memberId, dimensionId, "1000", "Cash", "{}", 1, 2, 1, now, now);

      const sourceCounts = sqlite
        .prepare(
          `SELECT name
           FROM sqlite_master
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
           ORDER BY name`
        )
        .all()
        .map((row) => ({
          table: String(row.name),
          count: Number(
            sqlite.prepare(`SELECT COUNT(*) AS count FROM ${String(row.name)}`).get()?.count ?? 0
          )
        }));

      sqlite.close();

      const pgClient = await createPostgresClient(pgUrl!);
      await bootstrapPostgresSchema(pgClient);
      await pgClient.close();

      const { migrateSqliteToPostgres } = await import("../../scripts/sqlite-to-postgres.mjs");
      const { mismatches, results } = await migrateSqliteToPostgres({
        sqlitePath,
        postgresUrl: pgUrl!,
        truncate: true
      });

      expect(mismatches).toEqual([]);

      for (const { table, count } of sourceCounts) {
        const migrated = results.find((result) => result.table === table);
        if (!migrated || migrated.skipped) continue;
        expect(migrated.source, `${table} source count`).toBe(count);
        expect(migrated.dest, `${table} dest count`).toBe(count);
      }

      const verifyClient = await createPostgresClient(pgUrl!);
      const project = await verifyClient.queryOne<{ id: string }>("SELECT id FROM projects WHERE id = ?", [
        projectId
      ]);
      const dimension = await verifyClient.queryOne<{ id: string }>(
        "SELECT id FROM dimensions WHERE id = ?",
        [dimensionId]
      );
      const member = await verifyClient.queryOne<{ member_key: string; is_active: boolean }>(
        "SELECT member_key, is_active FROM dimension_members WHERE id = ?",
        [memberId]
      );

      expect(project?.id).toBe(projectId);
      expect(dimension?.id).toBe(dimensionId);
      expect(member?.member_key).toBe("1000");
      expect(member?.is_active).toBe(true);
      await verifyClient.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
    30_000
  );
});
