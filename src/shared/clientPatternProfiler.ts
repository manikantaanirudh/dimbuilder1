import { normalizeCellValue } from "./text";

export type PatternKind =
  | "namingPrefix"
  | "caseConvention"
  | "descriptionCompleteness"
  | "propertyCompleteness";

export interface PatternRule {
  id: string;
  name: string;
  kind: PatternKind;
  dimensionType: string | null;
  observedPattern: string;
  confidence: number;
  sampleSize: number;
  details: Record<string, unknown>;
}

export interface PatternProfile {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  minimumConfidence: number;
  rules: PatternRule[];
}

export interface PatternDeviation {
  ruleId: string;
  ruleName: string;
  kind: PatternKind;
  dimensionType: string | null;
  confidence: number;
  observedPattern: string;
  deviationCount: number;
  affectedMembers: string[];
  suggestedRemediation: string;
}

export interface PatternEvaluation {
  profileId: string;
  evaluatedAt: string;
  rulesEvaluated: number;
  deviations: PatternDeviation[];
}

export interface ProfilerMember {
  memberKey: string;
  description: string;
  properties: Record<string, unknown>;
}

export interface ProfilerDimension {
  dimensionType: string;
  members: ProfilerMember[];
}

export interface BuildProfileOptions {
  minimumConfidence?: number;
  maxGeneratedRules?: number;
}

const DEFAULT_MIN_CONFIDENCE = 0.7;
const DEFAULT_MAX_RULES = 50;
const MIN_SAMPLE = 4;

// Dimension/property pairs whose completeness is worth learning as a client convention.
const COMPLETENESS_PROPERTIES: Array<{ dimensionType: string; property: string }> = [
  { dimensionType: "Entity", property: "Currency" },
  { dimensionType: "Account", property: "Account Type" }
];

/**
 * Derive client-specific metadata conventions from a "good" project (TASK-16). These are LEARNED
 * conventions, not hard OneStream rules; each rule carries a confidence so callers can treat
 * low-confidence findings as suggestions rather than enforce them.
 */
export function buildPatternProfile(
  projectId: string,
  projectName: string,
  dimensions: ProfilerDimension[],
  options: BuildProfileOptions = {}
): PatternProfile {
  const minimumConfidence = options.minimumConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const maxRules = options.maxGeneratedRules ?? DEFAULT_MAX_RULES;
  const rules: PatternRule[] = [];

  for (const dimension of dimensions) {
    if (dimension.members.length < MIN_SAMPLE) continue;
    const prefix = detectNamingPrefix(dimension);
    if (prefix) rules.push(prefix);
    const caseRule = detectCaseConvention(dimension);
    if (caseRule) rules.push(caseRule);
    const descRule = detectDescriptionCompleteness(dimension);
    if (descRule) rules.push(descRule);
  }

  for (const { dimensionType, property } of COMPLETENESS_PROPERTIES) {
    for (const dimension of dimensions.filter((d) => d.dimensionType === dimensionType && d.members.length >= MIN_SAMPLE)) {
      const rule = detectPropertyCompleteness(dimension, property);
      if (rule) rules.push(rule);
    }
  }

  const retained = rules
    .filter((r) => r.confidence >= minimumConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxRules);

  return {
    id: `profile-${projectId}-${Date.now()}`,
    projectId,
    name: `${projectName} pattern profile`,
    createdAt: new Date().toISOString(),
    minimumConfidence,
    rules: retained
  };
}

/**
 * Evaluate a profile against a project, returning deviations from the learned conventions.
 * Only rules at or above the profile's minimum confidence are evaluated.
 */
export function evaluatePatternProfile(profile: PatternProfile, dimensions: ProfilerDimension[]): PatternEvaluation {
  const byType = new Map<string, ProfilerMember[]>();
  for (const dimension of dimensions) {
    byType.set(dimension.dimensionType, [...(byType.get(dimension.dimensionType) ?? []), ...dimension.members]);
  }

  const deviations: PatternDeviation[] = [];
  const evaluable = profile.rules.filter((r) => r.confidence >= profile.minimumConfidence);

  for (const rule of evaluable) {
    const members = rule.dimensionType ? byType.get(rule.dimensionType) ?? [] : allMembers(dimensions);
    const offenders = findOffenders(rule, members);
    if (offenders.length === 0) continue;
    deviations.push({
      ruleId: rule.id,
      ruleName: rule.name,
      kind: rule.kind,
      dimensionType: rule.dimensionType,
      confidence: rule.confidence,
      observedPattern: rule.observedPattern,
      deviationCount: offenders.length,
      affectedMembers: offenders.slice(0, 50),
      suggestedRemediation: remediationFor(rule)
    });
  }

  return {
    profileId: profile.id,
    evaluatedAt: new Date().toISOString(),
    rulesEvaluated: evaluable.length,
    deviations
  };
}

function detectNamingPrefix(dimension: ProfilerDimension): PatternRule | null {
  const keys = dimension.members.map((m) => m.memberKey).filter(Boolean);
  if (keys.length < MIN_SAMPLE) return null;
  const counts = new Map<string, number>();
  for (const key of keys) {
    const token = leadingToken(key);
    if (token.length >= 2) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const confidence = top[1] / keys.length;
  if (confidence < 0.5) return null;
  return {
    id: `${dimension.dimensionType}-prefix`,
    name: `${dimension.dimensionType} members use prefix '${top[0]}'`,
    kind: "namingPrefix",
    dimensionType: dimension.dimensionType,
    observedPattern: `Prefix '${top[0]}'`,
    confidence: round(confidence),
    sampleSize: keys.length,
    details: { prefix: top[0] }
  };
}

function detectCaseConvention(dimension: ProfilerDimension): PatternRule | null {
  const keys = dimension.members.map((m) => m.memberKey).filter((k) => /[a-zA-Z]/.test(k));
  if (keys.length < MIN_SAMPLE) return null;
  const styleCounts = { upper: 0, lower: 0, other: 0 };
  for (const key of keys) {
    if (key === key.toUpperCase()) styleCounts.upper += 1;
    else if (key === key.toLowerCase()) styleCounts.lower += 1;
    else styleCounts.other += 1;
  }
  const dominant = (Object.entries(styleCounts) as Array<["upper" | "lower" | "other", number]>).sort((a, b) => b[1] - a[1])[0];
  if (dominant[0] === "other") return null;
  const confidence = dominant[1] / keys.length;
  if (confidence < 0.6) return null;
  return {
    id: `${dimension.dimensionType}-case`,
    name: `${dimension.dimensionType} member keys are ${dominant[0]}case`,
    kind: "caseConvention",
    dimensionType: dimension.dimensionType,
    observedPattern: `${dominant[0]}case keys`,
    confidence: round(confidence),
    sampleSize: keys.length,
    details: { style: dominant[0] }
  };
}

function detectDescriptionCompleteness(dimension: ProfilerDimension): PatternRule | null {
  const total = dimension.members.length;
  const withDescription = dimension.members.filter((m) => normalizeCellValue(m.description)).length;
  const confidence = withDescription / total;
  if (confidence < 0.8) return null;
  return {
    id: `${dimension.dimensionType}-description`,
    name: `${dimension.dimensionType} members include descriptions`,
    kind: "descriptionCompleteness",
    dimensionType: dimension.dimensionType,
    observedPattern: `${Math.round(confidence * 100)}% of members have descriptions`,
    confidence: round(confidence),
    sampleSize: total,
    details: {}
  };
}

function detectPropertyCompleteness(dimension: ProfilerDimension, property: string): PatternRule | null {
  const total = dimension.members.length;
  const withProp = dimension.members.filter((m) => hasProperty(m, property)).length;
  const confidence = withProp / total;
  if (confidence < 0.8) return null;
  return {
    id: `${dimension.dimensionType}-prop-${property}`,
    name: `${dimension.dimensionType} members set '${property}'`,
    kind: "propertyCompleteness",
    dimensionType: dimension.dimensionType,
    observedPattern: `${Math.round(confidence * 100)}% of members set '${property}'`,
    confidence: round(confidence),
    sampleSize: total,
    details: { property }
  };
}

function findOffenders(rule: PatternRule, members: ProfilerMember[]): string[] {
  switch (rule.kind) {
    case "namingPrefix": {
      const prefix = String(rule.details.prefix ?? "");
      return members.filter((m) => leadingToken(m.memberKey) !== prefix).map((m) => m.memberKey);
    }
    case "caseConvention": {
      const style = rule.details.style as "upper" | "lower";
      return members
        .filter((m) => /[a-zA-Z]/.test(m.memberKey))
        .filter((m) => (style === "upper" ? m.memberKey !== m.memberKey.toUpperCase() : m.memberKey !== m.memberKey.toLowerCase()))
        .map((m) => m.memberKey);
    }
    case "descriptionCompleteness":
      return members.filter((m) => !normalizeCellValue(m.description)).map((m) => m.memberKey);
    case "propertyCompleteness": {
      const property = String(rule.details.property ?? "");
      return members.filter((m) => !hasProperty(m, property)).map((m) => m.memberKey);
    }
  }
}

function remediationFor(rule: PatternRule): string {
  switch (rule.kind) {
    case "namingPrefix": return `Consider applying the '${rule.details.prefix}' prefix or confirm these members are intentional exceptions.`;
    case "caseConvention": return `Align member key casing with the learned ${rule.details.style}case convention, or confirm exceptions.`;
    case "descriptionCompleteness": return "Add descriptions to the listed members to match the client convention.";
    case "propertyCompleteness": return `Set '${rule.details.property}' on the listed members to match the client convention.`;
  }
}

function leadingToken(key: string): string {
  const match = key.match(/^[A-Za-z0-9]+/);
  return match ? match[0] : "";
}

function hasProperty(member: ProfilerMember, property: string): boolean {
  const normalized = property.toLowerCase().replace(/[^a-z0-9]/g, "");
  const entry = Object.entries(member.properties).find(([k]) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized);
  return Boolean(entry && normalizeCellValue(entry[1]));
}

function allMembers(dimensions: ProfilerDimension[]): ProfilerMember[] {
  return dimensions.flatMap((d) => d.members);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
