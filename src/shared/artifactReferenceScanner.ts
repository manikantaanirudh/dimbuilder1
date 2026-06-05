export type ReferenceConfidence = "high" | "medium" | "low";

export type ArtifactType =
  | "businessRule"
  | "cubeView"
  | "memberList"
  | "dashboard"
  | "transformationRule"
  | "workflowProfile"
  | "text";

export interface ArtifactReference {
  /** Dimension type hint resolved from the reference prefix, or "" when unknown. */
  dimensionHint: string;
  memberKey: string;
  lineNumber: number;
  charOffset: number;
  confidence: ReferenceConfidence;
  snippet: string;
  /** Identifier of the detector that produced this reference. */
  pattern: string;
}

export interface ScanOptions {
  /** Known members used to confirm low-confidence quoted-name matches. */
  knownMembers?: Array<{ dimensionType: string; memberKey: string }>;
}

// OneStream single-letter / UDx dimension prefixes.
const DIMENSION_PREFIXES: Record<string, string> = {
  A: "Account",
  C: "Consolidation",
  E: "Entity",
  F: "Flow",
  I: "IC",
  O: "Origin",
  S: "Scenario",
  T: "Time",
  V: "View",
  W: "Workflow",
  U1: "UD1",
  U2: "UD2",
  U3: "UD3",
  U4: "UD4",
  U5: "UD5",
  U6: "UD6",
  U7: "UD7",
  U8: "UD8"
};

// Matches A#Member, U1#Member, A#[My Member Name], with optional bracket form.
const PREFIX_PATTERN = /\b(U[1-8]|[ACEFIOSTVW])#(\[[^\]]+\]|[A-Za-z0-9_.\-]+)/g;

// Matches api.Members.GetMember("Account","Sales") / BRApi...GetMember("Entity", "Houston").
const API_MEMBER_PATTERN = /GetMember\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g;

// Matches XFBR string references like XFBR(RuleName, Member=Sales) - dimension unknown.
const XFBR_PATTERN = /XFBR\s*\(\s*([A-Za-z0-9_]+)\s*,\s*([^)]+)\)/g;

/**
 * Scan artifact text for OneStream member references. Uses confidence levels so callers do not
 * treat every text match as a guaranteed dependency. This is a heuristic scanner, not a parser of
 * OneStream's internal model.
 */
export function scanArtifactReferences(content: string, options: ScanOptions = {}): ArtifactReference[] {
  if (!content) return [];
  const lineStarts = computeLineStarts(content);
  const references: ArtifactReference[] = [];

  // High confidence: dimension-prefixed references.
  for (const match of content.matchAll(PREFIX_PATTERN)) {
    const prefix = match[1];
    const rawMember = match[2];
    const memberKey = unbracket(rawMember);
    if (!memberKey) continue;
    const index = match.index ?? 0;
    references.push(buildReference({
      dimensionHint: DIMENSION_PREFIXES[prefix] ?? "",
      memberKey,
      index,
      content,
      lineStarts,
      confidence: "high",
      pattern: `prefix:${prefix}#`
    }));
  }

  // Medium confidence: api/BRApi GetMember("Dim","Member").
  for (const match of content.matchAll(API_MEMBER_PATTERN)) {
    const dimensionHint = match[1].trim();
    const memberKey = match[2].trim();
    if (!memberKey) continue;
    const index = match.index ?? 0;
    references.push(buildReference({
      dimensionHint,
      memberKey,
      index,
      content,
      lineStarts,
      confidence: "medium",
      pattern: "api:GetMember"
    }));
  }

  // Medium confidence: XFBR references (dimension unknown).
  for (const match of content.matchAll(XFBR_PATTERN)) {
    const memberKey = extractXfbrMember(match[2]);
    if (!memberKey) continue;
    const index = match.index ?? 0;
    references.push(buildReference({
      dimensionHint: "",
      memberKey,
      index,
      content,
      lineStarts,
      confidence: "medium",
      pattern: "xfbr"
    }));
  }

  // Low confidence: quoted strings matching a known member name (only when known members supplied).
  if (options.knownMembers && options.knownMembers.length > 0) {
    const knownByName = new Map<string, string>();
    for (const m of options.knownMembers) knownByName.set(m.memberKey.toLowerCase(), m.dimensionType);
    const alreadyFound = new Set(references.map((r) => `${r.memberKey.toLowerCase()}@${r.charOffset}`));
    const QUOTED = /"([^"]{2,})"/g;
    for (const match of content.matchAll(QUOTED)) {
      const candidate = match[1].trim();
      const dimensionType = knownByName.get(candidate.toLowerCase());
      if (!dimensionType) continue;
      const index = match.index ?? 0;
      if (alreadyFound.has(`${candidate.toLowerCase()}@${index + 1}`)) continue;
      references.push(buildReference({
        dimensionHint: dimensionType,
        memberKey: candidate,
        index,
        content,
        lineStarts,
        confidence: "low",
        pattern: "quoted-known-member"
      }));
    }
  }

  return references.sort((a, b) => a.charOffset - b.charOffset);
}

export interface MemberWhereUsed {
  dimensionType: string;
  memberKey: string;
  references: Array<ArtifactReference & { artifactId: string; artifactName: string }>;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
}

/**
 * Aggregate scanned references across artifacts into a "where used" view for a single member.
 * Matching is case-insensitive on member key; dimension hint is honored when present.
 */
export function buildMemberWhereUsed(
  dimensionType: string,
  memberKey: string,
  artifacts: Array<{ artifactId: string; artifactName: string; references: ArtifactReference[] }>
): MemberWhereUsed {
  const target = memberKey.trim().toLowerCase();
  const matched: MemberWhereUsed["references"] = [];
  for (const artifact of artifacts) {
    for (const ref of artifact.references) {
      if (ref.memberKey.trim().toLowerCase() !== target) continue;
      // If the reference carries a dimension hint, it must match (case-insensitive).
      if (ref.dimensionHint && ref.dimensionHint.toLowerCase() !== dimensionType.toLowerCase()) continue;
      matched.push({ ...ref, artifactId: artifact.artifactId, artifactName: artifact.artifactName });
    }
  }
  return {
    dimensionType,
    memberKey,
    references: matched,
    highConfidence: matched.filter((r) => r.confidence === "high").length,
    mediumConfidence: matched.filter((r) => r.confidence === "medium").length,
    lowConfidence: matched.filter((r) => r.confidence === "low").length
  };
}

export type ProposedChangeType = "rename" | "delete" | "move" | "update";

export interface ProposedChangeImpact {
  dimensionType: string;
  memberKey: string;
  changeType: ProposedChangeType;
  riskLevel: "high" | "medium" | "low" | "none";
  affectedArtifacts: number;
  totalReferences: number;
  whereUsed: MemberWhereUsed;
  recommendedAction: string;
}

/**
 * Compute impact risk for a proposed change to a member based on scanned artifact references.
 * Delete/rename of a referenced member is high risk; updates are lower risk.
 */
export function assessProposedChange(
  dimensionType: string,
  memberKey: string,
  changeType: ProposedChangeType,
  artifacts: Array<{ artifactId: string; artifactName: string; references: ArtifactReference[] }>
): ProposedChangeImpact {
  const whereUsed = buildMemberWhereUsed(dimensionType, memberKey, artifacts);
  const totalReferences = whereUsed.references.length;
  const affectedArtifacts = new Set(whereUsed.references.map((r) => r.artifactId)).size;

  let riskLevel: ProposedChangeImpact["riskLevel"] = "none";
  if (totalReferences === 0) {
    riskLevel = "none";
  } else if (changeType === "delete" || changeType === "rename" || changeType === "move") {
    riskLevel = whereUsed.highConfidence > 0 ? "high" : whereUsed.mediumConfidence > 0 ? "medium" : "low";
  } else {
    riskLevel = whereUsed.highConfidence > 0 ? "medium" : "low";
  }

  const recommendedAction =
    riskLevel === "none"
      ? "No artifact references detected. Change appears safe from a where-used perspective."
      : `Review ${affectedArtifacts} affected artifact(s) before applying this ${changeType}. ${totalReferences} reference(s) found.`;

  return { dimensionType, memberKey, changeType, riskLevel, affectedArtifacts, totalReferences, whereUsed, recommendedAction };
}

function buildReference(args: {
  dimensionHint: string;
  memberKey: string;
  index: number;
  content: string;
  lineStarts: number[];
  confidence: ReferenceConfidence;
  pattern: string;
}): ArtifactReference {
  const { dimensionHint, memberKey, index, content, lineStarts, confidence, pattern } = args;
  const lineNumber = lineNumberForIndex(index, lineStarts);
  const lineStart = lineStarts[lineNumber - 1] ?? 0;
  const lineEnd = content.indexOf("\n", index);
  const snippet = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd).trim().slice(0, 200);
  return {
    dimensionHint,
    memberKey,
    lineNumber,
    charOffset: index + 1,
    confidence,
    snippet,
    pattern
  };
}

function computeLineStarts(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function lineNumberForIndex(index: number, lineStarts: number[]): number {
  // Binary search for the last lineStart <= index.
  let low = 0;
  let high = lineStarts.length - 1;
  let result = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lineStarts[mid] <= index) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result + 1;
}

function unbracket(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed.slice(1, -1).trim();
  return trimmed;
}

function extractXfbrMember(args: string): string {
  const memberMatch = args.match(/member\s*=\s*([A-Za-z0-9_.\-]+)/i);
  if (memberMatch) return memberMatch[1].trim();
  return "";
}

export function detectArtifactType(fileName: string): ArtifactType {
  const lower = fileName.toLowerCase();
  if (lower.includes("businessrule") || lower.includes("brule") || lower.endsWith(".vb") || lower.endsWith(".cs")) return "businessRule";
  if (lower.includes("cubeview")) return "cubeView";
  if (lower.includes("memberlist")) return "memberList";
  if (lower.includes("dashboard")) return "dashboard";
  if (lower.includes("transformation")) return "transformationRule";
  if (lower.includes("workflow") || lower.includes("profile")) return "workflowProfile";
  return "text";
}
