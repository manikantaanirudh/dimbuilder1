import type { ConnectorType } from "../../../shared/connectorTypes";
import type { ErpConnector } from "./types";
import { createMockErpConnector } from "./mockConnector";
import { createCsvConnector } from "./csvConnector";
import { createSqlConnector } from "./sqlConnector";

export type { ErpConnector, ErpConnectionTestResult } from "./types";

export function createErpConnector(connectorType: ConnectorType, config: Record<string, unknown>): ErpConnector {
  switch (connectorType) {
    case "csv":
      return createCsvConnector(config);
    case "sql":
    case "oracle":
    case "sap":
      return createSqlConnector(config);
    case "rest":
      return createMockErpConnector(config);
    default:
      return createMockErpConnector(config);
  }
}
