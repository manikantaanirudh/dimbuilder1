import type { AppConfig } from "../../shared/appConfigTypes";
import type { DbClient, DbConfig } from "./dbClient";
import { createPostgresClient } from "./postgresClient";
import { createSqliteClient } from "./sqliteClient";

export async function createDbClient(config: DbConfig): Promise<DbClient> {
  if (config.databaseUrl?.trim()) {
    return createPostgresClient(config.databaseUrl, config.poolMax);
  }
  return createSqliteClient(config.databaseFile ?? "data/app.db");
}

export function dbConfigFromAppConfig(appConfig: AppConfig): DbConfig {
  return {
    databaseUrl: appConfig.database?.url,
    poolMax: appConfig.database?.poolMax,
    databaseFile: appConfig.paths.databaseFile
  };
}
