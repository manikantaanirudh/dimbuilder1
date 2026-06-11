import type { AppDatabase } from "./database";
import type { DbClient } from "./dbClient";
import type { SqlDialect } from "./sql";

export function ensureColumnSync(
  db: AppDatabase,
  tableName: string,
  columnName: string,
  definition: string
): void {
  const existingColumns = db.prepare(`PRAGMA table_info(${tableName})`).all()
    .map((row) => String(row.name));
  if (existingColumns.includes(columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export async function ensureColumn(
  client: DbClient,
  tableName: string,
  columnName: string,
  definition: string
): Promise<void> {
  if (client.dialect === "sqlite") {
    const rows = await client.query<{ name: string }>(`PRAGMA table_info(${tableName})`);
    if (rows.some((row) => row.name === columnName)) return;
    await client.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    return;
  }

  const existing = await client.queryOne<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`,
    [tableName, columnName]
  );
  if (existing) return;
  await client.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export function normalizeBoolean(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  return Boolean(value);
}

export function normalizeWriteResult(
  dialect: SqlDialect,
  result: unknown
): { changes: number } {
  if (dialect === "sqlite") {
    const sqliteResult = result as { changes?: number } | undefined;
    return { changes: Number(sqliteResult?.changes ?? 0) };
  }

  const pgResult = result as { rowCount?: number | null } | undefined;
  return { changes: Number(pgResult?.rowCount ?? 0) };
}
