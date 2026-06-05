import type { ChangeSetItemRecord, Severity } from "./types";

export interface HandoffFile {
  fileName: string;
  content: string;
  populated: boolean;
}

export interface HandoffResult {
  files: HandoffFile[];
  fileNames: string[];
  warnings: string[];
}

/** Normalized representation of a change item used by both handoff exporters. */
export interface NormalizedChange {
  itemType: ChangeSetItemRecord["itemType"];
  operation: string;
  dimensionType: string;
  memberKey: string;
  parentKey: string;
  childKey: string;
  propertyName: string;
  oldValue: string;
  newValue: string;
  riskLevel: "High" | "Medium" | "Low";
  severity: Severity;
}

export function normalizeChange(item: ChangeSetItemRecord): NormalizedChange {
  const isRelationship = item.itemType === "relationship";
  const [parentKey, childKey] = isRelationship ? parseRelationshipObjectKey(item.objectKey) : ["", ""];
  return {
    itemType: item.itemType,
    operation: mapOperation(item),
    dimensionType: item.dimensionType,
    memberKey: isRelationship ? "" : item.objectKey,
    parentKey,
    childKey,
    propertyName: item.propertyName,
    oldValue: item.oldValue,
    newValue: item.newValue,
    riskLevel: riskFromSeverity(item.severity),
    severity: item.severity
  };
}

function mapOperation(item: ChangeSetItemRecord): string {
  if (item.itemType === "relationship") return "Relationship Update";
  switch (item.changeType) {
    case "add": return "Add";
    case "delete": return "Delete";
    case "move": return "Move";
    case "copy": return "Copy";
    case "update": return "Update";
    default: return item.changeType;
  }
}

function riskFromSeverity(severity: Severity): "High" | "Medium" | "Low" {
  if (severity === "error") return "High";
  if (severity === "warning") return "Medium";
  return "Low";
}

export function parseRelationshipObjectKey(objectKey: string): [string, string] {
  const idx = objectKey.indexOf(" -> ");
  if (idx === -1) return ["", objectKey.trim()];
  return [objectKey.slice(0, idx).trim(), objectKey.slice(idx + 4).trim()];
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

export function csvCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
