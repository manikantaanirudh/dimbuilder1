import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord } from "../../../shared/types";
import type { NLQueryResult } from "../../../shared/aiTypes";
import { PROJECT_QUERY_INTENT_LABELS, PROJECT_QUERY_SAMPLES } from "../../../shared/projectQueries";

export interface QueryExecutionResult {
  answer: string;
  matchedMembers: string[];
  confidence: number;
  intent: string;
  evidence?: string[];
  followUps?: string[];
}

export function resolveDimensionToken(
  token: string | undefined,
  dimensions: DimensionRecord[]
): DimensionRecord | undefined {
  if (!token?.trim()) return undefined;
  const normalized = token.trim().toLowerCase();
  return dimensions.find((dimension) =>
    dimension.dimensionType.toLowerCase() === normalized ||
    dimension.dimensionName.toLowerCase() === normalized ||
    dimension.dimensionType.toLowerCase().includes(normalized) ||
    dimension.dimensionName.toLowerCase().includes(normalized)
  );
}

export function extractDimensionToken(question: string, dimensions: DimensionRecord[]): string | undefined {
  const haystack = question.toLowerCase();
  const matches: Array<{ type: string; score: number }> = [];

  for (const dimension of dimensions) {
    const type = dimension.dimensionType;
    const name = dimension.dimensionName;
    const typeLower = type.toLowerCase();
    const nameLower = name.toLowerCase();
    const strippedName = nameLower.replace(/^ref[_-]?/i, "");

    if (new RegExp(`\\b${escapeRegex(type)}\\b`, "i").test(question)) {
      matches.push({ type, score: 100 + type.length });
    } else if (new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(question)) {
      matches.push({ type, score: 90 + name.length });
    } else if (strippedName && haystack.includes(strippedName)) {
      matches.push({ type, score: 70 + strippedName.length });
    } else if (haystack.includes(typeLower)) {
      matches.push({ type, score: 50 + typeLower.length });
    }
  }

  if (matches.length === 0) return undefined;
  matches.sort((a, b) => b.score - a.score);
  return matches[0].type;
}

export function membersForDimension(
  dimension: DimensionRecord | undefined,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): { members: DimensionMemberRecord[]; relationships: DimensionRelationshipRecord[] } {
  if (!dimension) {
    return { members, relationships };
  }
  return {
    members: members.filter((member) => member.dimensionId === dimension.id),
    relationships: relationships.filter((relationship) => relationship.dimensionId === dimension.id)
  };
}

export function toNLQueryResult(query: string, result: QueryExecutionResult): NLQueryResult {
  return {
    query,
    answer: result.answer,
    matchedMembers: result.matchedMembers,
    confidence: result.confidence,
    intent: result.intent,
    intentLabel: PROJECT_QUERY_INTENT_LABELS[result.intent] ?? result.intent,
    evidence: result.evidence,
    followUps: result.followUps
  };
}

export function buildUnknownQueryResult(raw: string): QueryExecutionResult {
  const samples = PROJECT_QUERY_SAMPLES.slice(0, 8).map((sample) => `• ${sample}`).join("\n");
  return {
    intent: "unknown",
    answer: `I couldn't match "${raw}" to a supported project query.\n\nTry one of these:\n${samples}\n\nQueries run on live project data — no AI or API keys required.`,
    matchedMembers: [],
    confidence: 0.2,
    followUps: [...PROJECT_QUERY_SAMPLES.slice(0, 5)]
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
