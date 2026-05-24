import type { ErpConnector, ErpConnectionTestResult } from "./types";

export function createSqlConnector(_config: Record<string, unknown>): ErpConnector {
  return {
    testConnection(): ErpConnectionTestResult {
      return { success: false, message: "SQL connector not yet implemented. Install a database driver and configure connection." };
    },
    extractRecords(_entity: string): Record<string, unknown>[] {
      throw new Error("SQL connector not yet implemented.");
    }
  };
}
