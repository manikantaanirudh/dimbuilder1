/**
 * Diagnostic script: identifies which exact attributes are causing XML_UNKNOWN_MEMBER_ATTRIBUTE issues.
 * Usage: npx tsx scripts/autoresearch/diagnose.ts
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDimension } from "../../src/shared/validationEngine";
import type { ValidationIssue } from "../../src/shared/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_FILE = resolve(__dirname, "benchmark-cache.json");

const data = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
const { project, dimensions, members, relationships } = data;

const VALIDATION_CONFIG = {
  duplicateMemberSeverity: "warning" as const,
  duplicateRelationshipSeverity: "warning" as const,
  unknownRelationshipMemberSeverity: "warning" as const,
  missingRequiredFieldSeverity: "error" as const,
  circularHierarchySeverity: "error" as const,
  relationshipsWithNoLocalMembersSeverity: "warning" as const,
  oneStreamProfile: {
    enabled: true,
    memberNameMaxLength: 250,
    warnOnMemberNameSpaces: true,
    warnOnMemberNamePeriods: true,
    reservedWords: ["Root", "None"],
    restrictedCharacters: ["<", ">", "\"", "'", "&", "|", "[", "]"],
    duplicateAliasSeverity: "warning" as const,
    invalidSortOrderSeverity: "warning" as const,
    sharedMemberSeverity: "info" as const,
    parentInputWarningSeverity: "warning" as const,
    unknownPropertySeverity: "warning" as const,
    invalidEnumSeverity: "error" as const,
    invalidPropertyTypeSeverity: "error" as const,
  }
};

console.log("Diagnosing XML_UNKNOWN issues...\n");

const unknownIssues: ValidationIssue[] = [];

for (const dimension of dimensions) {
  const dimMembers = members.filter((m: any) => m.dimensionId === dimension.id);
  const dimRelationships = relationships.filter((r: any) => r.dimensionId === dimension.id);
  const issues = validateDimension({
    project,
    dimension,
    members: dimMembers,
    relationships: dimRelationships,
    severities: VALIDATION_CONFIG
  });
  unknownIssues.push(...issues.filter(i => 
    i.code === "XML_UNKNOWN_MEMBER_ATTRIBUTE" || 
    i.code === "XML_UNKNOWN_DIMENSION_ATTRIBUTE" || 
    i.code === "XML_UNKNOWN_RELATIONSHIP_ATTRIBUTE" ||
    i.code === "XML_UNSUPPORTED_ELEMENT_PRESERVED" ||
    i.code === "UNKNOWN_PROPERTY"
  ));
}

// Group by code + fieldName
const groups = new Map<string, { code: string; fieldName: string; count: number; dimensions: Set<string>; sampleMessage: string }>();
for (const issue of unknownIssues) {
  const key = `${issue.code}:${issue.fieldName}`;
  const existing = groups.get(key);
  if (existing) {
    existing.count++;
    existing.dimensions.add(dimensions.find((d: any) => d.id === issue.dimensionId)?.dimensionType ?? "unknown");
  } else {
    groups.set(key, {
      code: issue.code,
      fieldName: issue.fieldName ?? "(none)",
      count: 1,
      dimensions: new Set([dimensions.find((d: any) => d.id === issue.dimensionId)?.dimensionType ?? "unknown"]),
      sampleMessage: issue.message
    });
  }
}

console.log(`Total unknown issues: ${unknownIssues.length}`);
console.log(`Unique attribute/element names: ${groups.size}\n`);

const sorted = [...groups.values()].sort((a, b) => b.count - a.count);
console.log("Code | Field Name | Count | Dimension Types | Sample Message");
console.log("-----|-----------|-------|-----------------|---------------");
for (const g of sorted) {
  console.log(`${g.code} | ${g.fieldName} | ${g.count} | ${[...g.dimensions].join(",")} | ${g.sampleMessage.substring(0, 80)}`);
}
