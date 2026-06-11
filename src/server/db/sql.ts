export type SqlDialect = "sqlite" | "postgres";

export interface PostgresParams {
  text: string;
  values: unknown[];
}

function countParameterPlaceholders(sql: string): number {
  let count = 0;
  let inSingleQuote = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && !inSingleQuote) {
      inSingleQuote = true;
    } else if (ch === "'" && inSingleQuote) {
      if (sql[i + 1] === "'") {
        i++;
        continue;
      }
      inSingleQuote = false;
    } else if (ch === "?" && !inSingleQuote) {
      count++;
    }
  }

  return count;
}

function replaceParameterPlaceholders(sql: string): string {
  let index = 0;
  let inSingleQuote = false;
  let result = "";

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && !inSingleQuote) {
      inSingleQuote = true;
      result += ch;
    } else if (ch === "'" && inSingleQuote) {
      result += ch;
      if (sql[i + 1] === "'") {
        result += "'";
        i++;
        continue;
      }
      inSingleQuote = false;
    } else if (ch === "?" && !inSingleQuote) {
      index++;
      result += `$${index}`;
    } else {
      result += ch;
    }
  }

  return result;
}

export function toPostgresParams(sql: string, params: unknown[] = []): PostgresParams {
  const placeholderCount = countParameterPlaceholders(sql);
  if (placeholderCount !== params.length) {
    throw new Error(
      `SQL placeholder count (${placeholderCount}) does not match parameter count (${params.length})`
    );
  }

  return {
    text: placeholderCount === 0 ? sql : replaceParameterPlaceholders(sql),
    values: params
  };
}

export function upsertSql(
  table: string,
  columns: string[],
  conflictTarget: string[],
  updateColumns: string[]
): string {
  const columnList = columns.join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  const conflictColumns = conflictTarget.join(", ");
  const updates = updateColumns.map((col) => `${col} = EXCLUDED.${col}`).join(", ");

  return `INSERT INTO ${table} (${columnList}) VALUES (${placeholders}) ON CONFLICT (${conflictColumns}) DO UPDATE SET ${updates}`;
}

export function insertIgnoreSql(table: string, columns: string[], conflictTarget: string[]): string {
  const columnList = columns.join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  const conflictColumns = conflictTarget.join(", ");

  return `INSERT INTO ${table} (${columnList}) VALUES (${placeholders}) ON CONFLICT (${conflictColumns}) DO NOTHING`;
}

export function booleanValue(dialect: SqlDialect, value: boolean): number | boolean {
  return dialect === "sqlite" ? (value ? 1 : 0) : value;
}
