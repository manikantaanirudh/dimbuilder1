import type { DimensionType, Severity, ValidationIssue } from "./types";

export type ReadinessBand = "ready" | "ready_with_warnings" | "needs_review" | "not_ready";
export type CategoryStatus = "ready" | "warning" | "attention" | "blocker";

export interface ReadinessCategory {
  key: string;
  label: string;
  score: number;
  weight: number;
  status: CategoryStatus;
  findings: string[];
  blockers: string[];
  recommendedActions: string[];
}

export interface ReadinessReport {
  score: number;
  band: ReadinessBand;
  generatedAt: string;
  categories: ReadinessCategory[];
  blockers: string[];
  topRecommendations: string[];
}

export interface ReadinessCertificationInput {
  status: "passed" | "passed_with_warnings" | "failed";
}

export interface ReadinessInput {
  issues: ValidationIssue[];
  dimensions: Array<{ dimensionType: DimensionType }>;
  expectedDimensionTypes: DimensionType[];
  certification?: ReadinessCertificationInput | null;
  exportBlockedBySeverities: Severity[];
  /** Optional category weight overrides keyed by category key. */
  weights?: Record<string, number>;
  /** True when a where-used / artifact impact scan flagged high-risk references. */
  highImpactReferences?: number;
}

interface CategoryDef {
  key: string;
  label: string;
  weight: number;
  /** Rule codes that contribute to this category. */
  codes: string[];
}

const CATEGORY_DEFS: CategoryDef[] = [
  {
    key: "structuralIntegrity",
    label: "Structural integrity",
    weight: 0.2,
    codes: [
      "DIMENSION_TYPE_REQUIRED", "DIMENSION_NAME_REQUIRED", "MEMBER_KEY_REQUIRED",
      "RELATIONSHIP_PARENT_REQUIRED", "RELATIONSHIP_CHILD_REQUIRED", "CIRCULAR_HIERARCHY",
      "SELF_REFERENCING_RELATIONSHIP", "DUPLICATE_MEMBER", "DUPLICATE_MEMBER_ACROSS_DIMENSION_TYPE",
      "DUPLICATE_RELATIONSHIP",
      "UNKNOWN_RELATIONSHIP_CHILD"
    ]
  },
  {
    key: "requiredProperties",
    label: "OneStream required properties",
    weight: 0.15,
    codes: [
      "ACCOUNT_TYPE_MISSING", "ENTITY_CURRENCY_MISSING", "SCENARIO_TYPE_MISSING",
      "INVALID_ENUM_VALUE", "INVALID_PROPERTY_TYPE", "UNKNOWN_PROPERTY"
    ]
  },
  {
    key: "xmlFidelity",
    label: "XML fidelity",
    weight: 0.15,
    codes: ["XML_INVALID_CHARACTER", "MEMBER_NAME_RESTRICTED_CHARACTER"]
  },
  {
    key: "hierarchyHealth",
    label: "Hierarchy health",
    weight: 0.15,
    codes: [
      "HIERARCHY_MAX_DEPTH_EXCEEDED", "ORPHAN_MEMBER", "ROOT_MEMBER_MISSING",
      "RELATIONSHIPS_WITH_NO_LOCAL_MEMBERS", "INVALID_SORT_ORDER", "SORT_ORDER_ZERO", "SORT_ORDER_DUPLICATE"
    ]
  },
  {
    key: "crossDimensionConsistency",
    label: "Cross-dimension consistency",
    weight: 0.1,
    codes: [
      "CROSS_DIMENSION_CURRENCY_INVALID", "CONSOLIDATION_METHOD_MISMATCH",
      "SECURITY_GROUP_REFERENCE_MISSING", "ENTITY_OWNERSHIP_VALUE_INVALID"
    ]
  },
  {
    key: "releaseReadiness",
    label: "Release readiness",
    weight: 0.1,
    codes: ["DIMENSION_MISSING_FROM_PROJECT"]
  }
];

const PENALTY = { error: 20, warning: 6, info: 1, off: 0 } as const;

export function computeReadinessScore(input: ReadinessInput): ReadinessReport {
  const issuesByCode = new Map<string, ValidationIssue[]>();
  for (const issue of input.issues) {
    if (!issuesByCode.has(issue.code)) issuesByCode.set(issue.code, []);
    issuesByCode.get(issue.code)!.push(issue);
  }

  const categories: ReadinessCategory[] = CATEGORY_DEFS.map((def) =>
    scoreRuleCategory(def, issuesByCode, input.weights?.[def.key])
  );

  categories.push(scoreXmlFidelityFromCertification(input.certification, input.weights?.xmlFidelityCertification));
  categories.push(scoreImpactRisk(input.highImpactReferences ?? 0, input.weights?.impactRisk));
  categories.push(scoreDocumentationEvidence(input.certification, input.weights?.documentationEvidence));

  // Apply release-readiness adjustment for missing dimensions explicitly.
  const release = categories.find((c) => c.key === "releaseReadiness");
  if (release) {
    const missing = (input.expectedDimensionTypes ?? []).filter(
      (type) => !input.dimensions.some((d) => d.dimensionType === type)
    );
    if (missing.length > 0) {
      release.score = Math.max(0, release.score - missing.length * 10);
      release.findings.push(`Missing expected dimensions: ${missing.join(", ")}.`);
      release.recommendedActions.push("Add the missing dimension types before packaging for release.");
      release.status = release.score < 50 ? "attention" : "warning";
    }
  }

  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0) || 1;
  const score = Math.round(categories.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight);

  const blockingErrors = input.issues.filter((i) => input.exportBlockedBySeverities.includes(i.severity));
  const blockers: string[] = [];
  if (blockingErrors.length > 0) {
    blockers.push(`${blockingErrors.length} blocking validation issue(s) prevent export.`);
  }
  for (const category of categories) blockers.push(...category.blockers);

  const band = resolveBand(score, blockers.length > 0);
  const topRecommendations = categories
    .filter((c) => c.score < 90)
    .sort((a, b) => a.score - b.score)
    .flatMap((c) => c.recommendedActions)
    .slice(0, 5);

  return {
    score,
    band,
    generatedAt: new Date().toISOString(),
    categories,
    blockers,
    topRecommendations
  };
}

function scoreRuleCategory(
  def: CategoryDef,
  issuesByCode: Map<string, ValidationIssue[]>,
  weightOverride?: number
): ReadinessCategory {
  let penalty = 0;
  const findings: string[] = [];
  const blockers: string[] = [];
  const recommendedActions: string[] = [];

  for (const code of def.codes) {
    const issues = issuesByCode.get(code) ?? [];
    if (issues.length === 0) continue;
    const errors = issues.filter((i) => i.severity === "error").length;
    const warnings = issues.filter((i) => i.severity === "warning").length;
    const infos = issues.filter((i) => i.severity === "info").length;
    penalty += errors * PENALTY.error + warnings * PENALTY.warning + infos * PENALTY.info;
    findings.push(`${code}: ${issues.length} (${errors} error, ${warnings} warning).`);
    if (errors > 0) {
      blockers.push(`${code} has ${errors} error(s).`);
      recommendedActions.push(`Resolve ${errors} ${code} error(s).`);
    } else if (warnings > 0) {
      recommendedActions.push(`Review ${warnings} ${code} warning(s).`);
    }
  }

  const score = clamp(100 - penalty);
  return {
    key: def.key,
    label: def.label,
    score,
    weight: weightOverride ?? def.weight,
    status: statusFor(score, blockers.length > 0),
    findings,
    blockers,
    recommendedActions
  };
}

function scoreXmlFidelityFromCertification(
  certification: ReadinessCertificationInput | null | undefined,
  weightOverride?: number
): ReadinessCategory {
  let score = 60;
  const findings: string[] = [];
  const recommendedActions: string[] = [];
  const blockers: string[] = [];
  if (!certification) {
    findings.push("No XML round-trip certification has been run.");
    recommendedActions.push("Run XML round-trip certification to confirm export fidelity.");
  } else if (certification.status === "passed") {
    score = 100;
    findings.push("XML round-trip certification passed.");
  } else if (certification.status === "passed_with_warnings") {
    score = 78;
    findings.push("XML round-trip certification passed with warnings.");
    recommendedActions.push("Review XML certification warnings before export.");
  } else {
    score = 30;
    findings.push("XML round-trip certification failed.");
    blockers.push("XML round-trip certification failed (metadata loss).");
    recommendedActions.push("Fix metadata loss reported by XML certification.");
  }
  return {
    key: "xmlFidelityCertification",
    label: "XML round-trip fidelity",
    score,
    weight: weightOverride ?? 0.1,
    status: statusFor(score, blockers.length > 0),
    findings,
    blockers,
    recommendedActions
  };
}

function scoreImpactRisk(highImpactReferences: number, weightOverride?: number): ReadinessCategory {
  const score = clamp(100 - highImpactReferences * 10);
  const findings: string[] = [];
  const recommendedActions: string[] = [];
  if (highImpactReferences > 0) {
    findings.push(`${highImpactReferences} high-risk artifact reference(s) detected.`);
    recommendedActions.push("Review impacted OneStream artifacts before changing referenced members.");
  } else {
    findings.push("No high-risk artifact references detected (or impact scan not run).");
  }
  return {
    key: "impactRisk",
    label: "Impact risk",
    score,
    weight: weightOverride ?? 0.05,
    status: statusFor(score, false),
    findings,
    blockers: [],
    recommendedActions
  };
}

function scoreDocumentationEvidence(
  certification: ReadinessCertificationInput | null | undefined,
  weightOverride?: number
): ReadinessCategory {
  const score = certification ? 100 : 70;
  return {
    key: "documentationEvidence",
    label: "Documentation / evidence readiness",
    score,
    weight: weightOverride ?? 0.05,
    status: statusFor(score, false),
    findings: certification
      ? ["Certification evidence is available."]
      : ["No certification evidence captured yet."],
    blockers: [],
    recommendedActions: certification ? [] : ["Run certification to capture release evidence."]
  };
}

function resolveBand(score: number, hasBlockers: boolean): ReadinessBand {
  if (hasBlockers && score >= 50) return "needs_review";
  if (score >= 90 && !hasBlockers) return "ready";
  if (score >= 75) return "ready_with_warnings";
  if (score >= 50) return "needs_review";
  return "not_ready";
}

function statusFor(score: number, hasBlockers: boolean): CategoryStatus {
  if (hasBlockers) return "blocker";
  if (score >= 90) return "ready";
  if (score >= 75) return "warning";
  return "attention";
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function bandLabel(band: ReadinessBand): string {
  switch (band) {
    case "ready": return "Ready";
    case "ready_with_warnings": return "Ready with warnings";
    case "needs_review": return "Needs review";
    case "not_ready": return "Not ready";
  }
}
