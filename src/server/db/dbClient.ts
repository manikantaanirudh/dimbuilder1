export interface DbClient {
  dialect: "sqlite" | "postgres";
  exec(sql: string, params?: unknown[]): Promise<void>;
  query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface DbConfig {
  databaseUrl?: string;
  databaseFile?: string;
  poolMax?: number;
}
