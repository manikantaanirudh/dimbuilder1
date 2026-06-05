import type { MigrationParseResult, ParsedDimension } from "../server/migration/migrationParsers";

export type MigrationSourceType = "hfm" | "epma" | "sapbpc" | "csv";

export interface MigrationSourceSummary {
  sourceType: MigrationSourceType;
  fileName: string;
  dimensionCount: number;
  memberCount: number;
  relationshipCount: number;
  dimensions: Array<{ dimensionType: string; dimensionName: string; memberCount: number; relationshipCount: number }>;
  detectedFields: string[];
  warnings: string[];
}

export type MappingKind = "property" | "structural" | "ignored";

export interface MigrationMapping {
  sourceField: string;
  targetField: string;
  kind: MappingKind;
  confidence: number;
}

export interface MigrationDecision {
  id: string;
  description: string;
  sourceField: string;
  options: string[];
  resolved: boolean;
  resolution: string | null;
}

export interface MigrationPreviewItem {
  dimensionName: string;
  memberKey: string;
  parentKey: string | null;
  properties: Record<string, string>;
}

export interface MigrationPreview {
  memberCount: number;
  relationshipCount: number;
  dimensionCount: number;
  sampleMembers: MigrationPreviewItem[];
  unmappedFields: string[];
}

export interface MigrationSession {
  id: string;
  projectId: string;
  sourceType: MigrationSourceType;
  fileName: string;
  createdAt: string;
  status: "parsed" | "mapped" | "previewed" | "committed";
  summary: MigrationSourceSummary;
  mappings: MigrationMapping[];
  decisions: MigrationDecision[];
}

export interface MigrationIssuePack {
  generatedAt: string;
  summary: MigrationSourceSummary;
  unresolvedDecisions: MigrationDecision[];
  mappings: MigrationMapping[];
  validationIssueCount: number;
  notes: string[];
}

// Known target field heuristics: source-field token -> OneStream target + confidence.
const TARGET_HEURISTICS: Array<{ match: RegExp; target: string; confidence: number }> = [
  { match: /account.?type/i, target: "Account Type", confidence: 0.95 },
  { match: /currency/i, target: "Currency", confidence: 0.95 },
  { match: /alias/i, target: "Description", confidence: 0.6 },
  { match: /description|desc/i, target: "Description", confidence: 0.85 },
  { match: /isicp|intercompany|icp/i, target: "Is ICP", confidence: 0.7 },
  { match: /switch.?sign|sign/i, target: "Switch Sign", confidence: 0.6 }
];

export function summarizeSource(sourceType: MigrationSourceType, fileName: string, parsed: MigrationParseResult): MigrationSourceSummary {
  const detectedFields = new Set<string>();
  for (const dim of parsed.dimensions) {
    for (const member of dim.members) {
      for (const key of Object.keys(member.properties)) detectedFields.add(key);
    }
  }
  return {
    sourceType,
    fileName,
    dimensionCount: parsed.dimensions.length,
    memberCount: parsed.totalMembers,
    relationshipCount: parsed.totalRelationships,
    dimensions: parsed.dimensions.map((d) => ({
      dimensionType: d.dimensionType,
      dimensionName: d.dimensionName,
      memberCount: d.members.length,
      relationshipCount: d.relationships.length
    })),
    detectedFields: [...detectedFields].sort((a, b) => a.localeCompare(b)),
    warnings: parsed.warnings
  };
}

/**
 * Suggest field mappings from a parsed source to OneStream fields. Confidence reflects how
 * certain the heuristic match is; low-confidence fields become decisions for the user to resolve.
 */
export function suggestMappings(summary: MigrationSourceSummary): MigrationMapping[] {
  return summary.detectedFields.map((sourceField) => {
    const heuristic = TARGET_HEURISTICS.find((h) => h.match.test(sourceField));
    if (heuristic) {
      return { sourceField, targetField: heuristic.target, kind: "property" as const, confidence: heuristic.confidence };
    }
    return { sourceField, targetField: sourceField, kind: "property" as const, confidence: 0.3 };
  });
}

/**
 * Detect unresolved decisions. Fields with low-confidence mappings need an explicit user choice
 * (map to a target, keep as-is, or ignore). Missing dimension types also raise a decision.
 */
export function detectDecisions(summary: MigrationSourceSummary, mappings: MigrationMapping[]): MigrationDecision[] {
  const decisions: MigrationDecision[] = [];
  for (const mapping of mappings) {
    if (mapping.confidence < 0.5 && mapping.kind !== "ignored") {
      decisions.push({
        id: `field:${mapping.sourceField}`,
        description: `Source field '${mapping.sourceField}' has no confident OneStream mapping.`,
        sourceField: mapping.sourceField,
        options: [`Map to '${mapping.sourceField}'`, "Map to Description", "Ignore field"],
        resolved: false,
        resolution: null
      });
    }
  }
  for (const dim of summary.dimensions) {
    if (!dim.dimensionType || dim.dimensionType.toLowerCase() === "unknown") {
      decisions.push({
        id: `dimensionType:${dim.dimensionName}`,
        description: `Dimension '${dim.dimensionName}' has no resolved OneStream dimension type.`,
        sourceField: dim.dimensionName,
        options: ["Account", "Entity", "UD1", "Scenario", "Time"],
        resolved: false,
        resolution: null
      });
    }
  }
  return decisions;
}

/**
 * Build a preview of what will be created, applying the property mappings. Fields mapped as
 * "ignored" are dropped; others are renamed to their target field.
 */
export function buildPreview(parsed: MigrationParseResult, mappings: MigrationMapping[]): MigrationPreview {
  const mapBySource = new Map(mappings.map((m) => [m.sourceField, m]));
  const sampleMembers: MigrationPreviewItem[] = [];
  const unmapped = new Set<string>();

  for (const dim of parsed.dimensions) {
    for (const member of dim.members) {
      if (sampleMembers.length < 25) {
        sampleMembers.push({
          dimensionName: dim.dimensionName,
          memberKey: member.memberKey,
          parentKey: member.parent ?? null,
          properties: applyMappings(member.properties, mapBySource, unmapped)
        });
      }
    }
  }

  return {
    memberCount: parsed.totalMembers,
    relationshipCount: parsed.totalRelationships,
    dimensionCount: parsed.dimensions.length,
    sampleMembers,
    unmappedFields: [...unmapped].sort((a, b) => a.localeCompare(b))
  };
}

function applyMappings(
  properties: Record<string, string>,
  mapBySource: Map<string, MigrationMapping>,
  unmapped: Set<string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    const mapping = mapBySource.get(key);
    if (!mapping) { unmapped.add(key); result[key] = value; continue; }
    if (mapping.kind === "ignored") continue;
    result[mapping.targetField] = value;
  }
  return result;
}

export function applyMappingsToDimension(dimension: ParsedDimension, mappings: MigrationMapping[]): ParsedDimension {
  const mapBySource = new Map(mappings.map((m) => [m.sourceField, m]));
  const sink = new Set<string>();
  return {
    ...dimension,
    members: dimension.members.map((m) => ({ ...m, properties: applyMappings(m.properties, mapBySource, sink) }))
  };
}

export function hasUnresolvedDecisions(decisions: MigrationDecision[]): boolean {
  return decisions.some((d) => !d.resolved);
}

export function buildIssuePack(session: MigrationSession, validationIssueCount: number): MigrationIssuePack {
  const unresolved = session.decisions.filter((d) => !d.resolved);
  const notes: string[] = [];
  if (unresolved.length > 0) notes.push(`${unresolved.length} unresolved decision(s) remain.`);
  if (session.summary.warnings.length > 0) notes.push(`${session.summary.warnings.length} parser warning(s).`);
  notes.push("Migration is preview-first; review the preview before committing.");
  return {
    generatedAt: new Date().toISOString(),
    summary: session.summary,
    unresolvedDecisions: unresolved,
    mappings: session.mappings,
    validationIssueCount,
    notes
  };
}

export function renderIssuePackMarkdown(pack: MigrationIssuePack): string {
  const s = pack.summary;
  return [
    `# Migration Issue Pack - ${s.fileName}`,
    "",
    `Source type: ${s.sourceType}`,
    `Dimensions: ${s.dimensionCount}, Members: ${s.memberCount}, Relationships: ${s.relationshipCount}`,
    `Validation issues: ${pack.validationIssueCount}`,
    "",
    "## Mappings",
    "",
    ...pack.mappings.map((m) => `- ${m.sourceField} -> ${m.targetField} (${Math.round(m.confidence * 100)}%${m.kind === "ignored" ? ", ignored" : ""})`),
    "",
    "## Unresolved decisions",
    "",
    pack.unresolvedDecisions.length === 0 ? "- None" : "",
    ...pack.unresolvedDecisions.map((d) => `- ${d.description}`),
    "",
    "## Notes",
    "",
    ...pack.notes.map((n) => `- ${n}`)
  ].filter((line) => line !== "").join("\n");
}
