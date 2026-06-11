import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { DbClient } from "./dbClient";
import { bootstrapSqliteSchema, type AppDatabase } from "./database";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (filename: string) => AppDatabase;
};

function createClient(db: AppDatabase): DbClient {
  let depth = 0;

  const client: DbClient = {
    dialect: "sqlite",

    exec(sql: string, params: unknown[] = []): Promise<void> {
      return Promise.resolve().then(() => {
        if (params.length === 0) {
          db.exec(sql);
          return;
        }
        db.prepare(sql).run(...params);
      });
    },

    query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      return Promise.resolve(db.prepare(sql).all(...params) as T[]);
    },

    queryOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
      return Promise.resolve((db.prepare(sql).get(...params) ?? null) as T | null);
    },

    async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
      const isOuter = depth === 0;
      const savepointName = `sp_${depth}`;

      if (isOuter) {
        await client.exec("BEGIN");
      } else {
        await client.exec(`SAVEPOINT ${savepointName}`);
      }

      depth++;
      try {
        const result = await fn(client);
        depth--;
        if (isOuter) {
          await client.exec("COMMIT");
        } else {
          await client.exec(`RELEASE ${savepointName}`);
        }
        return result;
      } catch (error) {
        depth--;
        if (isOuter) {
          await client.exec("ROLLBACK");
        } else {
          try {
            await client.exec(`ROLLBACK TO ${savepointName}`);
            await client.exec(`RELEASE ${savepointName}`);
          } catch {
            // Preserve the original action error if savepoint cleanup fails.
          }
        }
        throw error;
      }
    },

    close(): Promise<void> {
      return Promise.resolve().then(() => db.close());
    }
  };

  return client;
}

export async function createSqliteClient(filename: string): Promise<DbClient> {
  if (filename !== ":memory:") {
    mkdirSync(dirname(filename), { recursive: true });
  }

  const db = new DatabaseSync(filename);
  if (filename !== ":memory:") {
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA busy_timeout=5000");
  }
  bootstrapSqliteSchema(db);
  return createClient(db);
}
