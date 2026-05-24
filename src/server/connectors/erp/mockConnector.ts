import type { ErpConnector, ErpConnectionTestResult } from "./types";

const SAMPLE_DATA: Record<string, Record<string, unknown>[]> = {
  cost_centers: [
    { id: "CC001", name: "Engineering", parent: "CC000", description: "Engineering Department" },
    { id: "CC002", name: "Marketing", parent: "CC000", description: "Marketing Department" },
    { id: "CC003", name: "Sales", parent: "CC000", description: "Sales Department" },
    { id: "CC004", name: "R&D", parent: "CC001", description: "Research and Development" },
    { id: "CC005", name: "DevOps", parent: "CC001", description: "DevOps Team" },
  ],
  accounts: [
    { id: "4000", name: "Revenue", parent: "PnL", description: "Total Revenue" },
    { id: "4100", name: "ProductRevenue", parent: "4000", description: "Product Revenue" },
    { id: "4200", name: "ServiceRevenue", parent: "4000", description: "Service Revenue" },
    { id: "5000", name: "COGS", parent: "PnL", description: "Cost of Goods Sold" },
    { id: "5100", name: "Materials", parent: "5000", description: "Raw Materials" },
  ],
  employees: [
    { id: "E001", name: "JohnDoe", department: "CC001", title: "Engineer" },
    { id: "E002", name: "JaneSmith", department: "CC002", title: "Manager" },
    { id: "E003", name: "BobJones", department: "CC003", title: "Director" },
  ]
};

export function createMockErpConnector(_config: Record<string, unknown>): ErpConnector {
  return {
    testConnection(): ErpConnectionTestResult {
      return { success: true, message: "Mock ERP connection successful", latencyMs: 15 };
    },
    extractRecords(entity: string): Record<string, unknown>[] {
      const data = SAMPLE_DATA[entity];
      if (!data) {
        throw new Error(`Unknown entity: ${entity}. Available: ${Object.keys(SAMPLE_DATA).join(", ")}`);
      }
      return data;
    }
  };
}
