import type { DimensionRecord } from "../../../shared/types";
import { containsAny, type NormalizedQuery } from "./queryNormalizer";
import { extractDimensionToken } from "./queryHelpers";

export type ScorableIntent =
  | "list_members"
  | "list_dimensions"
  | "member_details"
  | "leaf_count"
  | "list_leaves"
  | "hierarchy_depth"
  | "hierarchy_summary"
  | "shared_members"
  | "orphans"
  | "count"
  | "children"
  | "find"
  | "issues"
  | "export_ready"
  | "summary"
  | "coverage"
  | "empty_dimensions"
  | "dimension_issues"
  | "missing_property"
  | "property_filter"
  | "check_exists"
  | "relationship_count"
  | "inactive_members"
  | "root_members";

interface IntentScoreRule {
  intent: ScorableIntent;
  phrases?: string[];
  patterns?: RegExp[];
  weight: number;
  requiresDimension?: boolean;
  requiresMemberHint?: boolean;
}

const SCORE_RULES: IntentScoreRule[] = [
  { intent: "list_members", phrases: ["all members", "every member", "member list", "members in", "members for", "members of"], patterns: [/\bmembers?\b.*\b(in|for|from|of)\b/], weight: 4, requiresDimension: true },
  { intent: "list_members", phrases: ["scenario members", "account members", "entity members"], weight: 5, requiresDimension: true },
  { intent: "list_dimensions", phrases: ["list dimensions", "show dimensions", "what dimensions", "which dimensions", "all dimensions", "dimension list"], weight: 5 },
  { intent: "member_details", phrases: ["tell me about member", "details for member", "describe member", "info on member", "information about member"], weight: 5, requiresMemberHint: true },
  { intent: "leaf_count", phrases: ["how many leaf", "leaf count", "leaves in"], weight: 4 },
  { intent: "list_leaves", phrases: ["leaf members", "list leaves", "show leaves"], weight: 4 },
  { intent: "hierarchy_depth", phrases: ["max depth", "maximum depth", "how deep", "deepest"], weight: 4 },
  { intent: "hierarchy_summary", phrases: ["hierarchy health", "hierarchy summary", "hierarchy stats"], weight: 4 },
  { intent: "shared_members", phrases: ["shared members", "multiple parents"], weight: 4 },
  { intent: "orphans", phrases: ["orphan"], weight: 4 },
  { intent: "relationship_count", phrases: ["how many relationships", "relationship count", "relationships in"], weight: 4, requiresDimension: true },
  { intent: "inactive_members", phrases: ["inactive members", "disabled members", "deactivated members"], weight: 4 },
  { intent: "root_members", phrases: ["root members", "top level members", "parents only"], weight: 3 },
  { intent: "count", phrases: ["how many members", "member count", "total members"], weight: 3 },
  { intent: "children", phrases: ["under", "below", "children of", "descendants of"], weight: 3 },
  { intent: "issues", phrases: ["what is wrong", "validation issues", "any errors", "any warnings", "project health"], weight: 3 },
  { intent: "export_ready", phrases: ["ready to export", "blocking export", "export blocked"], weight: 3 },
  { intent: "summary", phrases: ["summarize", "overview", "project status", "tell me about the project"], weight: 3 },
  { intent: "coverage", phrases: ["metadata coverage", "property coverage", "description coverage"], weight: 3 },
  { intent: "empty_dimensions", phrases: ["empty dimensions", "dimensions with no members", "blank dimensions"], weight: 3 },
  { intent: "dimension_issues", phrases: ["issues in", "errors in", "problems in"], weight: 3, requiresDimension: true },
  { intent: "missing_property", phrases: ["missing property", "without property", "no property"], weight: 3 },
  { intent: "property_filter", phrases: ["property =", "with property"], weight: 2 },
  { intent: "check_exists", phrases: ["does member exist", "member called", "member named"], weight: 3 },
  { intent: "find", phrases: ["find member", "search for", "look for"], weight: 2 }
];

const MIN_SCORE = 4;

export interface ScoredIntent {
  intent: ScorableIntent;
  score: number;
  params: Record<string, string>;
}

export function scoreIntentFromKeywords(
  query: NormalizedQuery,
  dimensions: DimensionRecord[],
  originalQuestion: string
): ScoredIntent | null {
  const dimensionToken = extractDimensionToken(originalQuestion, dimensions) ?? extractDimensionToken(query.normalized, dimensions) ?? "";
  const haystacks = [query.raw, query.normalized, query.compact];
  const scores = new Map<ScorableIntent, number>();

  for (const rule of SCORE_RULES) {
    if (rule.requiresDimension && !dimensionToken) continue;
    if (rule.requiresMemberHint && !looksLikeMemberReference(query, dimensionToken)) continue;

    let matched = false;
    if (rule.phrases) {
      matched = haystacks.some((text) => containsAny(text, rule.phrases!));
    }
    if (!matched && rule.patterns) {
      matched = haystacks.some((text) => rule.patterns!.some((pattern) => pattern.test(text)));
    }
    if (!matched) continue;

    scores.set(rule.intent, (scores.get(rule.intent) ?? 0) + rule.weight);
  }

  if (scores.size === 0) return null;

  const [intent, score] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
  if (score < MIN_SCORE) return null;

  return {
    intent,
    score,
    params: buildParamsForIntent(intent, query, dimensionToken, originalQuestion)
  };
}

function looksLikeMemberReference(query: NormalizedQuery, dimensionToken: string): boolean {
  const tokens = query.compact.split(/\s+/).filter((token) =>
    token !== dimensionToken.toLowerCase() &&
    !["member", "members", "dimension", "details", "about"].includes(token)
  );
  return tokens.length > 0;
}

function buildParamsForIntent(
  intent: ScorableIntent,
  query: NormalizedQuery,
  dimensionToken: string,
  originalQuestion: string
): Record<string, string> {
  switch (intent) {
    case "list_members":
    case "leaf_count":
    case "list_leaves":
    case "hierarchy_depth":
    case "hierarchy_summary":
    case "shared_members":
    case "orphans":
    case "relationship_count":
    case "inactive_members":
    case "root_members":
    case "dimension_issues":
      return { dimension: dimensionToken };
    case "count":
      return { dimension: dimensionToken || "" };
    case "member_details":
    case "check_exists":
      return { memberKey: extractMemberKeyHint(query, dimensionToken, originalQuestion) };
    case "find":
      return { pattern: query.compact || query.normalized };
    case "children": {
      const match = originalQuestion.match(/(?:under|of|below)\s+['"]?([^'"?]+?)['"]?\s*\??$/i);
      return { parent: match?.[1]?.trim() ?? query.compact };
    }
    default:
      return {};
  }
}

function extractMemberKeyHint(query: NormalizedQuery, dimensionToken: string, originalQuestion: string): string {
  const aboutMatch = originalQuestion.match(/(?:about|for|on)\s+(?:the\s+)?(?:member\s+)?['"]?([^'"?]+?)['"]?\s*\??$/i);
  if (aboutMatch) return aboutMatch[1].trim();

  const tokens = query.compact.split(/\s+/).filter((token) => {
    const lower = token.toLowerCase();
    return lower !== dimensionToken.toLowerCase() &&
      !["member", "members", "dimension", "details", "info", "information"].includes(lower);
  });
  return tokens.join(" ").trim();
}
