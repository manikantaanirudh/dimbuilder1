import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { schemaSql } from "./schema";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (filename: string) => AppDatabase;
};

export interface AppDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...values: unknown[]): unknown;
    all(...values: unknown[]): Record<string, unknown>[];
    get(...values: unknown[]): Record<string, unknown> | undefined;
  };
  close(): void;
}

export function createDatabase(filename = "data/app.db"): AppDatabase {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(schemaSql);
  seedSecurity(db);
  return db;
}

function seedSecurity(db: AppDatabase): void {
  const now = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO users (id, display_name, email, created_at) VALUES (?, ?, ?, ?)")
    .run("local-admin", "Local Admin", "local-admin@example.local", now);

  for (const role of ["Viewer", "Editor", "Admin"]) {
    db.prepare("INSERT OR IGNORE INTO roles (id, name) VALUES (?, ?)").run(role.toLowerCase(), role);
  }

  db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)").run("local-admin", "admin");
}
