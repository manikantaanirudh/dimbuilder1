import { readFileSync, existsSync } from "node:fs";
import type { ErpConnector, ErpConnectionTestResult } from "./types";

export function createCsvConnector(config: Record<string, unknown>): ErpConnector {
  const basePath = String(config.basePath ?? ".");

  return {
    testConnection(): ErpConnectionTestResult {
      if (!existsSync(basePath)) {
        return { success: false, message: `Base path does not exist: ${basePath}` };
      }
      return { success: true, message: `CSV directory accessible: ${basePath}` };
    },
    extractRecords(entity: string): Record<string, unknown>[] {
      const filePath = `${basePath}/${entity}.csv`;
      if (!existsSync(filePath)) {
        throw new Error(`CSV file not found: ${filePath}`);
      }
      const content = readFileSync(filePath, "utf-8");
      return parseCsv(content);
    }
  };
}

function parseCsv(content: string): Record<string, unknown>[] {
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  const records: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const record: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = values[j] ?? "";
    }
    records.push(record);
  }

  return records;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
