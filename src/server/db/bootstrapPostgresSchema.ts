import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DbClient } from "./dbClient";
import { runMigrations } from "./migrations";
import { seedPropertyDefaultCatalogAsync } from "./seedPropertyDefaultCatalog";
import { booleanValue, insertIgnoreSql } from "./sql";

const schemaPath = join(fileURLToPath(new URL(".", import.meta.url)), "schema", "postgres.sql");

async function seedSecurityAsync(client: DbClient): Promise<void> {
  const now = new Date().toISOString();
  const sql = insertIgnoreSql(
    "users",
    ["id", "email", "display_name", "role", "is_active", "created_at", "updated_at"],
    ["id"]
  );
  await client.exec(sql, [
    "local-admin",
    "local-admin@example.local",
    "Local Admin",
    "admin",
    booleanValue(client.dialect, true),
    now,
    now
  ]);
}

async function seedDefaultWorkflowAsync(client: DbClient): Promise<void> {
  const existing = await client.queryOne<{ id: string }>(
    "SELECT id FROM workflow_definitions WHERE id = ?",
    ["standard-review"]
  );
  if (existing) return;

  const now = new Date().toISOString();
  const steps = JSON.stringify([
    { name: "Peer Review", requiredRole: "reviewer", minApprovals: 1, slaHours: 48 }
  ]);
  await client.exec(
    `INSERT INTO workflow_definitions (
      id, name, description, dimension_types, steps_json, auto_advance_rules_json,
      is_active, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "standard-review",
      "Standard Review",
      "Default single-step peer review workflow",
      "*",
      steps,
      "{}",
      booleanValue(client.dialect, true),
      "system",
      now,
      now
    ]
  );
}

export async function bootstrapPostgresSchema(client: DbClient): Promise<void> {
  const sql = readFileSync(schemaPath, "utf8");
  await client.exec(sql);

  await runMigrations(client);

  await seedSecurityAsync(client);
  await seedDefaultWorkflowAsync(client);
  await seedPropertyDefaultCatalogAsync(client);
}
