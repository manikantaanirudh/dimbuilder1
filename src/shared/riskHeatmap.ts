import type { ReadinessBand } from "./readinessScore";
import type { Severity, ValidationIssue } from "./types";

export type RiskLevel = "none" | "low" | "medium" | "high";

export interface RiskCategoryDef {
  key: string;
  label: string;
}

export const RISK_CATEGORIES: RiskCategoryDef[] = [
  { key: "xmlFidelity", label: "XML Fidelity" },
  { key: "validationErrors", label: "Validation Errors" },
  { key: "requiredProperties", label: "Required Properties" },
  { key: "hierarchyStructure", label: "Hierarchy Structure" },
  { key: "varyingPropertyConflicts", label: "Varying Property Conflicts" },
  { key: "crossDimensionReferences", label: "Cross-Dimension References" },
  { key: "artifactImpact", label: "Artifact Impact" },
  { key: "releaseReadiness", label: "Release / Rollback Readiness" },
  { key: "namingConvention", label: "Naming Convention" },
  { key: "dataQuality", label: "Data Quality / Completeness" }
];

export interface RiskCell {
  categoryKey: string;
  score: number;
  level: RiskLevel;
  issueCount: number;
  topFindings: string[];
  drillTarget: string;
}

export interface RiskRow {
  dimensionId: string;
  dimensionName: string;
  dimensionType: string;
  cells: RiskCell[];
  overallScore: number;
  overallLevel: RiskLevel;
}

export interface RiskHeatmapReport {
  generatedAt: string;
  categories: RiskCategoryDef[];
  rows: RiskRow[];
  legend: Record<RiskLevel, string>;
}

export interface RiskHeatmapInput {
  dimensions: Array<{ id: string; dimensionType: string; dimensionName: string }>;
  issues: ValidationIssue[];
  certificationStatus?: "passed" | "passed_with_warnings" | "failed" | null;
  readinessBand?: ReadinessBand | null;
  varyingConflictsByDimensionId?: Record<string, number>;
  crossDimReferencesByDimensionId?: Record<string, number>;
  artifactReferencesByDimensionType?: Record<string, number>;
  /** Optional severity filter; issues with other severities are ignored. */
  severityFilter?: Severity[];
}

const SEVERITY_WEIGHT: Record<Severity, number> = { error: 25, warning: 8, info: 2, off: 0 };

const LEGEND: Record<RiskLevel, string> = {
  none: "No detected risk",
  low: "Minor findings; review when convenient",
  medium: "Notable findings; should be reviewed before release",
  high: "Significant findings; address before release"
};

/**
 * Build a deterministic metadata risk heatmap (TASK-15). Rows are dimensions, columns are risk
 * categories. Every non-zero cell carries the findings that produced its score and a drill target so
 * the UI can navigate to the relevant details.
 */
export function buildRiskHeatmap(input: RiskHeatmapInput): RiskHeatmapReport {
  const issues = input.severityFilter && input.severityFilter.length > 0
    ? input.issues.filter((i) => input.severityFilter!.includes(i.severity))
    : input.issues;

  const issuesByDimension = new Map<string, ValidationIssue[]>();
  for (const issue of issues) {
    const key = issue.dimensionId || "";
    if (!issuesByDimension.has(key)) issuesByDimension.set(key, []);
    issuesByDimension.get(key)!.push(issue);
  }

  const rows: RiskRow[] = input.dimensions.map((dimension) => {
    const dimIssues = issuesByDimension.get(dimension.id) ?? [];
    const cells = RISK_CATEGORIES.map((category) => buildCell(category.key, dimension, dimIssues, input));
    const overallScore = Math.min(100, Math.round(cells.reduce((sum, c) => sum + c.score, 0) / cells.length * 1.5));
    return {
      dimensionId: dimension.id,
      dimensionName: dimension.dimensionName,
      dimensionType: dimension.dimensionType,
      cells,
      overallScore,
      overallLevel: levelForScore(overallScore)
    };
  });

  return { generatedAt: new Date().toISOString(), categories: RISK_CATEGORIES, rows, legend: LEGEND };
}

function buildCell(
  categoryKey: string,
  dimension: { id: string; dimensionType: string },
  dimIssues: ValidationIssue[],
  input: RiskHeatmapInput
): RiskCell {
  let matched: ValidationIssue[] = [];
  let score = 0;
  const findings: string[] = [];

  switch (categoryKey) {
    case "xmlFidelity":
      if (input.certificationStatus === "failed") { score = 80; findings.push("XML round-trip certification failed."); }
      else if (input.certificationStatus === "passed_with_warnings") { score = 35; findings.push("XML certification passed with warnings."); }
      break;
    case "validationErrors":
      matched = dimIssues.filter((i) => i.severity === "error" || i.severity === "warning");
      score = scoreFromIssues(matched);
      break;
    case "requiredProperties":
      matched = dimIssues.filter((i) => /REQUIRED|MISSING_PROPERTY|MISSING_REQUIRED/i.test(i.code));
      score = scoreFromIssues(matched);
      break;
    case "hierarchyStructure":
      matched = dimIssues.filter((i) => /HIERARCHY|ORPHAN|CIRCULAR|PARENT|RELATIONSHIP/i.test(i.code));
      score = scoreFromIssues(matched);
      break;
    case "varyingPropertyConflicts": {
      const count = input.varyingConflictsByDimensionId?.[dimension.id] ?? 0;
      score = Math.min(100, count * 30);
      if (count > 0) findings.push(`${count} varying property conflict(s).`);
      return finalize(categoryKey, score, count, findings, dimension.id);
    }
    case "crossDimensionReferences": {
      const count = input.crossDimReferencesByDimensionId?.[dimension.id] ?? 0;
      score = Math.min(100, count * 10);
      if (count > 0) findings.push(`${count} cross-dimension reference(s).`);
      return finalize(categoryKey, score, count, findings, dimension.id);
    }
    case "artifactImpact": {
      const count = input.artifactReferencesByDimensionType?.[dimension.dimensionType] ?? 0;
      score = Math.min(100, count * 8);
      if (count > 0) findings.push(`${count} artifact reference(s) to this dimension.`);
      return finalize(categoryKey, score, count, findings, dimension.id);
    }
    case "releaseReadiness":
      score = readinessRisk(input.readinessBand);
      if (score >= 60) findings.push(`Project readiness is '${input.readinessBand}'.`);
      else if (score > 0) findings.push(`Project readiness is '${input.readinessBand}'.`);
      break;
    case "namingConvention":
      matched = dimIssues.filter((i) => /NAMING|NAME|RESERVED|INVALID_CHAR/i.test(i.code));
      score = scoreFromIssues(matched);
      break;
    case "dataQuality":
      matched = dimIssues.filter((i) => /DUPLICATE|BLANK|EMPTY|QUALITY|COMPLETENESS|DESCRIPTION/i.test(i.code));
      score = scoreFromIssues(matched);
      break;
  }

  for (const issue of matched.slice(0, 3)) findings.push(`${issue.code}: ${issue.message}`);
  return finalize(categoryKey, score, matched.length, findings, dimension.id);
}

function finalize(categoryKey: string, score: number, issueCount: number, findings: string[], drillTarget: string): RiskCell {
  const bounded = Math.min(100, Math.round(score));
  return { categoryKey, score: bounded, level: levelForScore(bounded), issueCount, topFindings: findings, drillTarget };
}

function scoreFromIssues(issues: ValidationIssue[]): number {
  return issues.reduce((sum, i) => sum + (SEVERITY_WEIGHT[i.severity] ?? 0), 0);
}

function readinessRisk(band?: ReadinessBand | null): number {
  switch (band) {
    case "not_ready": return 85;
    case "needs_review": return 55;
    case "ready_with_warnings": return 25;
    case "ready": return 0;
    default: return 0;
  }
}

function levelForScore(score: number): RiskLevel {
  if (score >= 60) return "high";
  if (score >= 25) return "medium";
  if (score > 0) return "low";
  return "none";
}
