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

  // 1. Exact match on dimensionName
  const exactName = dimensions.find((d) => d.dimensionName.toLowerCase() === normalized);
  if (exactName) return exactName;

  // 2. Exact match on ID
  const exactId = dimensions.find((d) => d.id.toLowerCase() === normalized);
  if (exactId) return exactId;

  // 3. Exact match on sheet name
  const exactSheet = dimensions.find((d) => (d as unknown as { sheet?: string }).sheet?.toLowerCase() === normalized);
  if (exactSheet) return exactSheet;

  // 4. Exact match on dimensionType
  const exactType = dimensions.find((d) => d.dimensionType.toLowerCase() === normalized);
  if (exactType) return exactType;

  // 5. Substring match on dimensionName
  const subName = dimensions.find((d) => d.dimensionName.toLowerCase().includes(normalized));
  if (subName) return subName;

  // 6. Substring match on dimensionType
  return dimensions.find((d) => d.dimensionType.toLowerCase().includes(normalized));
}

export function extractDimensionToken(question: string, dimensions: DimensionRecord[]): string | undefined {
  const haystack = question.toLowerCase();
  const matches: Array<{ token: string; score: number }> = [];

  for (const dimension of dimensions) {
    const type = dimension.dimensionType;
    const name = dimension.dimensionName;
    const sheet = (dimension as unknown as { sheet?: string }).sheet ?? "";
    const typeLower = type.toLowerCase();
    const nameLower = name.toLowerCase();
    const sheetLower = sheet.toLowerCase();

    // Check full dimension name first (highest priority)
    if (nameLower && (haystack.includes(nameLower) || new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(question))) {
      matches.push({ token: name, score: 1000 + name.length });
    }

    // Check sheet name
    if (sheetLower && (haystack.includes(sheetLower) || new RegExp(`\\b${escapeRegex(sheet)}\\b`, "i").test(question))) {
      matches.push({ token: name, score: 800 + sheet.length });
    }

    // Check type as standalone word
    if (new RegExp(`\\b${escapeRegex(type)}\\b`, "i").test(question)) {
      matches.push({ token: type, score: 500 + type.length });
    } else if (haystack.includes(typeLower)) {
      matches.push({ token: type, score: 300 + typeLower.length });
    }
  }

  if (matches.length === 0) return undefined;
  matches.sort((a, b) => b.score - a.score);
  return matches[0].token;
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
