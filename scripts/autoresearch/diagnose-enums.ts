/**
 * Diagnostic script: identifies INVALID_ENUM_VALUE and INVALID_PROPERTY_TYPE issues.
 * Usage: npx tsx scripts/autoresearch/diagnose-enums.ts
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

console.log("Diagnosing INVALID_ENUM_VALUE and INVALID_PROPERTY_TYPE issues...\n");

const targetIssues: ValidationIssue[] = [];

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
  targetIssues.push(...issues.filter(i => 
    i.code === "INVALID_ENUM_VALUE" || 
    i.code === "INVALID_PROPERTY_TYPE" ||
    i.code === "INVALID_NUMBER"
  ));
}

// Group by code + fieldName + sample value
const groups = new Map<string, { code: string; fieldName: string; count: number; sampleMessage: string; dimTypes: Set<string> }>();
for (const issue of targetIssues) {
  const key = `${issue.code}:${issue.fieldName}`;
  const existing = groups.get(key);
  if (existing) {
    existing.count++;
    existing.dimTypes.add(dimensions.find((d: any) => d.id === issue.dimensionId)?.dimensionType ?? "?");
  } else {
    groups.set(key, {
      code: issue.code,
      fieldName: issue.fieldName ?? "(none)",
      count: 1,
      sampleMessage: issue.message,
      dimTypes: new Set([dimensions.find((d: any) => d.id === issue.dimensionId)?.dimensionType ?? "?"])
    });
  }
}

console.log(`Total target issues: ${targetIssues.length}\n`);
const sorted = [...groups.values()].sort((a, b) => b.count - a.count);
for (const g of sorted) {
  console.log(`${g.code} | ${g.fieldName} | count=${g.count} | dims=${[...g.dimTypes].join(",")}`);
  console.log(`  Sample: ${g.sampleMessage}`);
  console.log("");
}
