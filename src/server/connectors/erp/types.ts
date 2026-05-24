export interface ErpConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
}

export interface ErpConnector {
  testConnection(): ErpConnectionTestResult;
  extractRecords(entity: string): Record<string, unknown>[];
}
