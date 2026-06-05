import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord } from "./types";
import { normalizeCellValue } from "./text";

export type XdConfidence = "explicit" | "inferred" | "unknown";
export type MemberLineageStatus = "base" | "inherited" | "overridden" | "local";

export interface XdDimensionNode {
  dimensionId: string;
  dimensionType: string;
  dimensionName: string;
  role: "base" | "extended";
  baseDimensionId: string | null;
  baseDimensionName: string | null;
  confidence: XdConfidence;
  inferredReason: string | null;
}

export interface XdMemberLineage {
  dimensionId: string;
  dimensionName: string;
  memberKey: string;
  status: MemberLineageStatus;
  baseDimensionName: string | null;
  overriddenProperties: Array<{ property: string; baseValue: string; extendedValue: string }>;
}

export interface XdRelationshipDifference {
  dimensionId: string;
  dimensionName: string;
  parentKey: string;
  childKey: string;
  status: "localRelationship" | "inheritedRelationship";
  baseDimensionName: string | null;
}

export interface XdRisk {
  code: string;
  severity: "warning" | "info";
  message: string;
  dimensionId: string | null;
  memberKey: string | null;
  confidence: XdConfidence;
}

export interface XdXrayReport {
  dimensions: XdDimensionNode[];
  memberLineage: XdMemberLineage[];
  relationshipDifferences: XdRelationshipDifference[];
  risks: XdRisk[];
  summary: {
    baseCount: number;
    extendedCount: number;
    inheritedMembers: number;
    overriddenMembers: number;
    localMembers: number;
    inferredLinks: number;
  };
}

export interface XdXrayInput {
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
  /** User-declared explicit links by dimension name: { extended, base }. */
  dimensionLinks?: Array<{ extended: string; base: string }>;
  /** Regex strings used to infer an extension relationship from the dimension name. */
  namingPatterns?: string[];
}

const PROPERTY_SKIP_PREFIX = "__";

/**
 * Build an Extensible Dimensionality X-Ray. Base/extended links come from explicit metadata
 * (`inheritedDimension`) or user-declared config first; only when neither exists are naming
 * patterns used to INFER a link, which is always labelled `inferred`. The report never claims an
 * inferred link as definite.
 */
export function buildXdXray(input: XdXrayInput): XdXrayReport {
  const byName = new Map<string, DimensionRecord>();
  for (const dimension of input.dimensions) byName.set(dimension.dimensionName.trim().toLowerCase(), dimension);

  const declaredLinks = new Map<string, string>();
  for (const link of input.dimensionLinks ?? []) {
    declaredLinks.set(link.extended.trim().toLowerCase(), link.base.trim().toLowerCase());
  }
  const patterns = (input.namingPatterns ?? []).map((p) => safeRegex(p)).filter((r): r is RegExp => r !== null);

  const nodes: XdDimensionNode[] = input.dimensions.map((dimension) =>
    resolveDimensionNode(dimension, byName, declaredLinks, patterns)
  );
  const nodeById = new Map(nodes.map((n) => [n.dimensionId, n]));

  const membersByDimension = groupBy(input.members, (m) => m.dimensionId);
  const relationshipsByDimension = groupBy(input.relationships, (r) => r.dimensionId);

  const memberLineage: XdMemberLineage[] = [];
  const relationshipDifferences: XdRelationshipDifference[] = [];

  for (const node of nodes) {
    const dimensionMembers = membersByDimension.get(node.dimensionId) ?? [];
    if (node.role === "base" || !node.baseDimensionId) {
      for (const member of dimensionMembers) {
        memberLineage.push({
          dimensionId: node.dimensionId,
          dimensionName: node.dimensionName,
          memberKey: member.memberKey,
          status: "base",
          baseDimensionName: null,
          overriddenProperties: []
        });
      }
      continue;
    }

    const baseMembers = new Map<string, DimensionMemberRecord>();
    for (const m of membersByDimension.get(node.baseDimensionId) ?? []) {
      baseMembers.set(m.memberKey.trim().toLowerCase(), m);
    }

    for (const member of dimensionMembers) {
      const baseMember = baseMembers.get(member.memberKey.trim().toLowerCase());
      if (!baseMember) {
        memberLineage.push({
          dimensionId: node.dimensionId,
          dimensionName: node.dimensionName,
          memberKey: member.memberKey,
          status: "local",
          baseDimensionName: node.baseDimensionName,
          overriddenProperties: []
        });
        continue;
      }
      const overridden = diffProperties(baseMember.properties, member.properties);
      memberLineage.push({
        dimensionId: node.dimensionId,
        dimensionName: node.dimensionName,
        memberKey: member.memberKey,
        status: overridden.length > 0 ? "overridden" : "inherited",
        baseDimensionName: node.baseDimensionName,
        overriddenProperties: overridden
      });
    }

    // Relationship differences: present in extended, classify against base.
    const baseRelationships = new Set(
      (relationshipsByDimension.get(node.baseDimensionId) ?? []).map(relKey)
    );
    for (const relationship of relationshipsByDimension.get(node.dimensionId) ?? []) {
      relationshipDifferences.push({
        dimensionId: node.dimensionId,
        dimensionName: node.dimensionName,
        parentKey: relationship.parentKey,
        childKey: relationship.childKey,
        status: baseRelationships.has(relKey(relationship)) ? "inheritedRelationship" : "localRelationship",
        baseDimensionName: node.baseDimensionName
      });
    }
  }

  const risks = buildRisks(nodes, memberLineage, nodeById);

  const summary = {
    baseCount: nodes.filter((n) => n.role === "base").length,
    extendedCount: nodes.filter((n) => n.role === "extended").length,
    inheritedMembers: memberLineage.filter((m) => m.status === "inherited").length,
    overriddenMembers: memberLineage.filter((m) => m.status === "overridden").length,
    localMembers: memberLineage.filter((m) => m.status === "local").length,
    inferredLinks: nodes.filter((n) => n.confidence === "inferred").length
  };

  return { dimensions: nodes, memberLineage, relationshipDifferences, risks, summary };
}

function resolveDimensionNode(
  dimension: DimensionRecord,
  byName: Map<string, DimensionRecord>,
  declaredLinks: Map<string, string>,
  patterns: RegExp[]
): XdDimensionNode {
  const nameKey = dimension.dimensionName.trim().toLowerCase();

  // 1. Explicit: inheritedDimension points at a real dimension.
  const inherited = normalizeCellValue(dimension.inheritedDimension).trim().toLowerCase();
  if (inherited && byName.has(inherited)) {
    const base = byName.get(inherited)!;
    return node(dimension, "extended", base, "explicit", null);
  }

  // 2. Explicit: user-declared config link to a real dimension.
  const declaredBase = declaredLinks.get(nameKey);
  if (declaredBase && byName.has(declaredBase)) {
    const base = byName.get(declaredBase)!;
    return node(dimension, "extended", base, "explicit", null);
  }

  // 3. Inferred: naming pattern suggests an extension. Never claimed as definite.
  for (const pattern of patterns) {
    const match = dimension.dimensionName.match(pattern);
    if (match) {
      const candidateBaseName = (match[1] ?? "").trim().toLowerCase();
      if (candidateBaseName && byName.has(candidateBaseName) && candidateBaseName !== nameKey) {
        const base = byName.get(candidateBaseName)!;
        return node(dimension, "extended", base, "inferred", `Inferred from naming pattern ${pattern.source}`);
      }
    }
  }

  // 4. Base dimension (no extension link).
  return node(dimension, "base", null, "explicit", null);
}

function node(
  dimension: DimensionRecord,
  role: "base" | "extended",
  base: DimensionRecord | null,
  confidence: XdConfidence,
  inferredReason: string | null
): XdDimensionNode {
  return {
    dimensionId: dimension.id,
    dimensionType: dimension.dimensionType,
    dimensionName: dimension.dimensionName,
    role,
    baseDimensionId: base?.id ?? null,
    baseDimensionName: base?.dimensionName ?? null,
    confidence,
    inferredReason
  };
}

function buildRisks(
  nodes: XdDimensionNode[],
  memberLineage: XdMemberLineage[],
  nodeById: Map<string, XdDimensionNode>
): XdRisk[] {
  const risks: XdRisk[] = [];

  // Inferred links should be confirmed.
  for (const node of nodes) {
    if (node.confidence === "inferred") {
      risks.push({
        code: "INFERRED_EXTENSION_LINK",
        severity: "info",
        message: `Extension link for '${node.dimensionName}' to base '${node.baseDimensionName}' is inferred, not declared. Confirm before relying on it.`,
        dimensionId: node.dimensionId,
        memberKey: null,
        confidence: "inferred"
      });
    }
  }

  // Override-heavy extended dimensions.
  const byDimension = groupBy(memberLineage, (m) => m.dimensionId);
  for (const [dimensionId, lineage] of byDimension) {
    const node = nodeById.get(dimensionId);
    if (!node || node.role !== "extended") continue;
    const overridden = lineage.filter((l) => l.status === "overridden").length;
    const comparable = lineage.filter((l) => l.status === "overridden" || l.status === "inherited").length;
    if (comparable >= 5 && overridden / comparable > 0.5) {
      risks.push({
        code: "OVERRIDE_HEAVY_EXTENSION",
        severity: "warning",
        message: `Extended dimension '${node.dimensionName}' overrides ${overridden} of ${comparable} inherited members (>50%). Consider whether it should be a separate base dimension.`,
        dimensionId,
        memberKey: null,
        confidence: node.confidence
      });
    }
  }

  // Same member key behaving differently across multiple extended dimensions.
  const overridesByMember = new Map<string, Set<string>>();
  for (const lineage of memberLineage) {
    if (lineage.status !== "overridden") continue;
    const key = lineage.memberKey.trim().toLowerCase();
    if (!overridesByMember.has(key)) overridesByMember.set(key, new Set());
    overridesByMember.get(key)!.add(lineage.dimensionName);
  }
  for (const [memberKey, dimensionNames] of overridesByMember) {
    if (dimensionNames.size > 1) {
      risks.push({
        code: "MEMBER_DIVERGENT_BEHAVIOR",
        severity: "warning",
        message: `Member '${memberKey}' is overridden differently across ${dimensionNames.size} dimensions (${[...dimensionNames].join(", ")}).`,
        dimensionId: null,
        memberKey,
        confidence: "explicit"
      });
    }
  }

  return risks;
}

function diffProperties(
  baseProps: Record<string, unknown>,
  extendedProps: Record<string, unknown>
): Array<{ property: string; baseValue: string; extendedValue: string }> {
  const result: Array<{ property: string; baseValue: string; extendedValue: string }> = [];
  const keys = new Set<string>([...Object.keys(baseProps), ...Object.keys(extendedProps)]);
  for (const key of keys) {
    if (key.startsWith(PROPERTY_SKIP_PREFIX)) continue;
    const baseValue = normalizeCellValue(baseProps[key]);
    const extendedValue = normalizeCellValue(extendedProps[key]);
    if (baseValue !== extendedValue) {
      result.push({ property: key, baseValue, extendedValue });
    }
  }
  return result;
}

function relKey(relationship: DimensionRelationshipRecord): string {
  return `${relationship.parentKey.trim().toLowerCase()}->${relationship.childKey.trim().toLowerCase()}`;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}
