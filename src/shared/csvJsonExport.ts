import type {
  DimensionMemberRecord,
  DimensionRelationshipRecord,
  ParsedProject
} from "./types";
import { normalizeCellValue } from "./text";

export function exportJsonBackup(parsed: ParsedProject): string {
  return JSON.stringify(parsed, null, 2);
}

export function exportMembersCsv(members: DimensionMemberRecord[]): string {
  return toCsv(members.map((member) => ({ memberKey: member.memberKey, description: member.description, ...member.properties })));
}

export function exportRelationshipsCsv(relationships: DimensionRelationshipRecord[]): string {
  return toCsv(relationships.map((relationship) => ({ parentKey: relationship.parentKey, childKey: relationship.childKey, ...relationship.properties })));
}

function toCsv(rows: Record<string, unknown>[]): string {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (headers.length === 0) return "";
  const lines = [headers.map(quoteCsv).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => quoteCsv(normalizeCellValue(row[header]))).join(","));
  }
  return lines.join("\n");
}

function quoteCsv(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

