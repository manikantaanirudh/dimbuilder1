import pg from "pg";
import type { DbClient } from "./dbClient";
import { toPostgresParams } from "./sql";

const { Pool } = pg;
type PoolClient = pg.PoolClient;
type QueryResult<T extends pg.QueryResultRow = pg.QueryResultRow> = pg.QueryResult<T>;

function createSessionClient(poolClient: PoolClient): DbClient {
  let depth = 0;

  const runQuery = (text: string, values: unknown[]): Promise<QueryResult> => poolClient.query(text, values);

  const client: DbClient = {
    dialect: "postgres",

    async exec(sql: string, params: unknown[] = []): Promise<void> {
      const { text, values } = toPostgresParams(sql, params);
      await runQuery(text, values);
    },

    async query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const { text, values } = toPostgresParams(sql, params);
      const result = await runQuery(text, values);
      return result.rows as T[];
    },

    async queryOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
      const { text, values } = toPostgresParams(sql, params);
      const result = await runQuery(text, values);
      return (result.rows[0] ?? null) as T | null;
    },

    async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
      const savepointName = `sp_${depth}`;

      await client.exec(`SAVEPOINT ${savepointName}`);
      depth++;
      try {
        const result = await fn(client);
        depth--;
        await client.exec(`RELEASE SAVEPOINT ${savepointName}`);
        return result;
      } catch (error) {
        depth--;
        try {
          await client.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
          await client.exec(`RELEASE SAVEPOINT ${savepointName}`);
        } catch {
          // Preserve the original action error if savepoint cleanup fails.
        }
        throw error;
      }
    },

    close(): Promise<void> {
      return Promise.resolve();
    }
  };

  return client;
}

export async function createPostgresClient(connectionString: string, poolMax = 10): Promise<DbClient> {
  const pool = new Pool({ connectionString, max: poolMax });

  const client: DbClient = {
    dialect: "postgres",

    async exec(sql: string, params: unknown[] = []): Promise<void> {
      const { text, values } = toPostgresParams(sql, params);
      await pool.query(text, values);
    },

    async query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const { text, values } = toPostgresParams(sql, params);
      const result = await pool.query(text, values);
      return result.rows as T[];
    },

    async queryOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
      const { text, values } = toPostgresParams(sql, params);
      const result = await pool.query(text, values);
      return (result.rows[0] ?? null) as T | null;
    },

    async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
      const poolClient = await pool.connect();
      const sessionClient = createSessionClient(poolClient);
      try {
        await poolClient.query("BEGIN");
        const result = await fn(sessionClient);
        await poolClient.query("COMMIT");
        return result;
      } catch (error) {
        await poolClient.query("ROLLBACK");
        throw error;
      } finally {
        poolClient.release();
      }
    },

    async close(): Promise<void> {
      await pool.end();
    }
  };

  return client;
}
