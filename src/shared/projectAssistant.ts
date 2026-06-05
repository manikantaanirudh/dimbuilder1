import { bandLabel, type ReadinessReport } from "./readinessScore";
import { normalizePropertyLookupName } from "./oneStreamPropertyDictionary";
import { normalizeCellValue } from "./text";
import type { Severity, ValidationIssue } from "./types";

export interface AssistantDimension {
  id: string;
  dimensionType: string;
  dimensionName: string;
}

export interface AssistantMember {
  id: string;
  dimensionId: string;
  memberKey: string;
  properties: Record<string, unknown>;
}

export interface AssistantChangeSet {
  id: string;
  name: string;
  status: string;
  itemCount: number;
}

export interface AssistantArtifactReference {
  memberKey: string;
  dimensionHint: string;
  artifactName: string;
  confidence: string;
}

export interface AssistantContext {
  projectName: string;
  readiness: ReadinessReport;
  issues: ValidationIssue[];
  exportBlockedBySeverities: Severity[];
  dimensions: AssistantDimension[];
  members: AssistantMember[];
  changeSets: AssistantChangeSet[];
  latestDiffSummary: { id: string; added: number; updated: number; removed: number } | null;
  artifactReferences: AssistantArtifactReference[];
}

export type AssistantIntent =
  | "exportReady"
  | "readinessLow"
  | "blocksExport"
  | "dimensionsMostIssues"
  | "missingAccountType"
  | "missingCurrency"
  | "changedSinceBaseline"
  | "releaseNotes"
  | "impactRename"
  | "riskyMembers"
  | "unresolvedErrors"
  | "fixFirst"
  | "unknown";

export interface AssistantAnswer {
  intent: AssistantIntent;
  summary: string;
  evidence: string[];
  nextActions: string[];
}

export const SUGGESTED_QUESTIONS: string[] = [
  "Is this project export ready?",
  "Why is the readiness score low?",
  "What blocks XML export?",
  "Which dimensions have the most issues?",
  "Which members are missing Account Type?",
  "Which Entity members are missing Currency?",
  "What changed since baseline?",
  "Show risky members.",
  "Show unresolved validation errors.",
  "What should I fix first?"
];

/**
 * Evidence-based project assistant (TASK-14). Answers questions strictly from the supplied project
 * context (validation, readiness, dimensions/members, diffs, artifact references). It performs no
 * external LLM calls and does not invent OneStream behavior. Unknown questions return a helpful
 * fallback listing supported questions.
 */
export function answerProjectQuestion(question: string, context: AssistantContext): AssistantAnswer {
  const q = question.toLowerCase();
  const intent = classifyIntent(q);
  switch (intent) {
    case "exportReady": return answerExportReady(context);
    case "readinessLow": return answerReadinessLow(context);
    case "blocksExport": return answerBlocksExport(context);
    case "dimensionsMostIssues": return answerDimensionsMostIssues(context);
    case "missingAccountType": return answerMissingProperty(context, "Account", "Account Type");
    case "missingCurrency": return answerMissingProperty(context, "Entity", "Currency");
    case "changedSinceBaseline": return answerChangedSinceBaseline(context);
    case "releaseNotes": return answerReleaseNotes(question, context);
    case "impactRename": return answerImpactRename(question, context);
    case "riskyMembers": return answerRiskyMembers(context);
    case "unresolvedErrors": return answerUnresolvedErrors(context);
    case "fixFirst": return answerFixFirst(context);
    default: return answerUnknown();
  }
}

export function classifyIntent(q: string): AssistantIntent {
  if (/export\s*ready|ready\s*to\s*export|is.*ready/.test(q)) return "exportReady";
  if (/readiness.*(low|score)|why.*readiness|why.*score/.test(q)) return "readinessLow";
  if (/block.*export|what.*block|blocking/.test(q)) return "blocksExport";
  if (/most\s*issues|dimensions.*issues|which dimension/.test(q)) return "dimensionsMostIssues";
  if (/account\s*type/.test(q) && /missing|without|lack/.test(q)) return "missingAccountType";
  if (/currency/.test(q) && /missing|without|lack/.test(q)) return "missingCurrency";
  if (/changed.*baseline|since baseline|what changed/.test(q)) return "changedSinceBaseline";
  if (/release notes|generate notes/.test(q)) return "releaseNotes";
  if (/impact|rename|if i (rename|delete|change)/.test(q)) return "impactRename";
  if (/risky members|show risk|risk.*member/.test(q)) return "riskyMembers";
  if (/unresolved|validation errors|show errors/.test(q)) return "unresolvedErrors";
  if (/fix first|what should i fix|prioriti/.test(q)) return "fixFirst";
  return "unknown";
}

function blockingIssues(context: AssistantContext): ValidationIssue[] {
  return context.issues.filter((i) => context.exportBlockedBySeverities.includes(i.severity));
}

function answerExportReady(context: AssistantContext): AssistantAnswer {
  const blockers = blockingIssues(context);
  const ready = blockers.length === 0;
  return {
    intent: "exportReady",
    summary: ready
      ? `Yes. No blocking validation issues. Readiness is ${context.readiness.score}/100 (${bandLabel(context.readiness.band)}).`
      : `Not yet. ${blockers.length} blocking issue(s) must be resolved. Readiness is ${context.readiness.score}/100 (${bandLabel(context.readiness.band)}).`,
    evidence: [
      `Readiness band: ${context.readiness.band}`,
      `Blocking severities: ${context.exportBlockedBySeverities.join(", ") || "(none)"}`,
      ...blockers.slice(0, 5).map((i) => `${i.code} (${i.severity}): ${i.message}`)
    ],
    nextActions: ready
      ? ["Build a release package from the Change Sets panel."]
      : ["Resolve blocking issues in the Validation dashboard, then re-validate."]
  };
}

function answerReadinessLow(context: AssistantContext): AssistantAnswer {
  const sorted = [...context.readiness.categories].sort((a, b) => a.score - b.score);
  const lowest = sorted.slice(0, 3);
  return {
    intent: "readinessLow",
    summary: `Readiness is ${context.readiness.score}/100 (${bandLabel(context.readiness.band)}). The lowest-scoring categories are: ${lowest.map((c) => `${c.label} (${c.score})`).join(", ")}.`,
    evidence: lowest.flatMap((c) => [
      `${c.label}: score ${c.score}, weight ${c.weight}`,
      ...c.blockers.map((b) => `  blocker: ${b}`)
    ]),
    nextActions: context.readiness.topRecommendations.length > 0
      ? context.readiness.topRecommendations
      : lowest.flatMap((c) => c.recommendedActions).slice(0, 5)
  };
}

function answerBlocksExport(context: AssistantContext): AssistantAnswer {
  const blockers = blockingIssues(context);
  return {
    intent: "blocksExport",
    summary: blockers.length === 0
      ? "Nothing currently blocks XML export. Export gating is satisfied."
      : `${blockers.length} issue(s) block export (severities: ${context.exportBlockedBySeverities.join(", ")}).`,
    evidence: blockers.slice(0, 15).map((i) => `${i.code} (${i.severity}) [${i.entityType}]: ${i.message}`),
    nextActions: blockers.length === 0
      ? ["Proceed to packaging."]
      : ["Fix the listed issues, then re-run validation to clear the export gate."]
  };
}

function answerDimensionsMostIssues(context: AssistantContext): AssistantAnswer {
  const nameById = new Map(context.dimensions.map((d) => [d.id, `${d.dimensionName} (${d.dimensionType})`]));
  const counts = new Map<string, number>();
  for (const issue of context.issues) {
    const key = issue.dimensionId || "(project-level)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {
    intent: "dimensionsMostIssues",
    summary: ranked.length === 0
      ? "No validation issues are recorded for any dimension."
      : `Dimensions with the most issues: ${ranked.slice(0, 3).map(([id, n]) => `${nameById.get(id) ?? id}: ${n}`).join(", ")}.`,
    evidence: ranked.map(([id, n]) => `${nameById.get(id) ?? id}: ${n} issue(s)`),
    nextActions: ["Open the highest-count dimension in the Validation dashboard and resolve issues top-down."]
  };
}

function answerMissingProperty(context: AssistantContext, dimensionType: string, propertyName: string): AssistantAnswer {
  const dimIds = new Set(context.dimensions.filter((d) => d.dimensionType === dimensionType).map((d) => d.id));
  const normalized = normalizePropertyLookupName(propertyName);
  const missing = context.members.filter((m) => {
    if (!dimIds.has(m.dimensionId)) return false;
    const found = Object.entries(m.properties).find(([k]) => normalizePropertyLookupName(k) === normalized);
    return !found || !normalizeCellValue(found[1]);
  });
  return {
    intent: dimensionType === "Account" ? "missingAccountType" : "missingCurrency",
    summary: missing.length === 0
      ? `All ${dimensionType} members have a non-empty ${propertyName}.`
      : `${missing.length} ${dimensionType} member(s) are missing ${propertyName}.`,
    evidence: missing.slice(0, 25).map((m) => m.memberKey),
    nextActions: missing.length === 0
      ? []
      : [`Set ${propertyName} on the listed ${dimensionType} members, then re-validate.`]
  };
}

function answerChangedSinceBaseline(context: AssistantContext): AssistantAnswer {
  const diff = context.latestDiffSummary;
  return {
    intent: "changedSinceBaseline",
    summary: diff
      ? `Latest diff (${diff.id}) shows ${diff.added} added, ${diff.updated} updated, ${diff.removed} removed.`
      : "No baseline comparison has been run yet.",
    evidence: diff
      ? [`Added: ${diff.added}`, `Updated: ${diff.updated}`, `Removed: ${diff.removed}`]
      : [],
    nextActions: diff
      ? ["Open the Baseline/Diff view to review item-level changes."]
      : ["Create a baseline and run a comparison to see changes."]
  };
}

function answerReleaseNotes(question: string, context: AssistantContext): AssistantAnswer {
  const match = findChangeSet(question, context);
  if (!match) {
    return {
      intent: "releaseNotes",
      summary: context.changeSets.length === 0
        ? "No change sets exist yet."
        : `Specify a change set. Available: ${context.changeSets.map((c) => c.name).join(", ")}.`,
      evidence: context.changeSets.map((c) => `${c.name} [${c.status}] - ${c.itemCount} item(s)`),
      nextActions: ["Build a release package from the Change Sets panel to generate full release notes."]
    };
  }
  return {
    intent: "releaseNotes",
    summary: `Change set '${match.name}' is ${match.status} with ${match.itemCount} item(s).`,
    evidence: [`Change set ID: ${match.id}`, `Status: ${match.status}`, `Items: ${match.itemCount}`],
    nextActions: ["Use the Change Sets panel 'Package' action to generate the full release notes file."]
  };
}

function answerImpactRename(question: string, context: AssistantContext): AssistantAnswer {
  const member = findReferencedMember(question, context);
  const refs = member
    ? context.artifactReferences.filter((r) => r.memberKey.toLowerCase() === member.toLowerCase())
    : [];
  return {
    intent: "impactRename",
    summary: !member
      ? "Name the member to assess. Example: 'What will be impacted if I rename member Sales?'"
      : context.artifactReferences.length === 0
        ? `No scanned artifacts available. Upload artifacts in the Artifact Scanner to assess impact for '${member}'.`
        : refs.length === 0
          ? `No scanned artifact references found for '${member}'.`
          : `'${member}' is referenced in ${new Set(refs.map((r) => r.artifactName)).size} artifact(s) (${refs.length} reference(s)).`,
    evidence: refs.slice(0, 20).map((r) => `${r.artifactName}: ${r.memberKey} [${r.confidence}]`),
    nextActions: refs.length > 0
      ? ["Review the listed artifacts before renaming/deleting; use the Artifact Scanner proposed-change preview."]
      : ["Upload OneStream artifact exports in the Artifact Scanner to enable where-used impact."]
  };
}

function answerRiskyMembers(context: AssistantContext): AssistantAnswer {
  const memberIssues = context.issues.filter((i) => i.entityType === "member" && i.severity !== "info");
  const byMember = new Map<string, number>();
  for (const issue of memberIssues) byMember.set(issue.entityId, (byMember.get(issue.entityId) ?? 0) + 1);
  const memberById = new Map(context.members.map((m) => [m.id, m.memberKey]));
  const ranked = [...byMember.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  return {
    intent: "riskyMembers",
    summary: ranked.length === 0
      ? "No members currently have error/warning-level issues."
      : `${ranked.length} member(s) have error/warning-level issues.`,
    evidence: ranked.map(([id, n]) => `${memberById.get(id) ?? id}: ${n} issue(s)`),
    nextActions: ranked.length === 0 ? [] : ["Address members with the most error/warning issues first."]
  };
}

function answerUnresolvedErrors(context: AssistantContext): AssistantAnswer {
  const errors = context.issues.filter((i) => i.severity === "error");
  return {
    intent: "unresolvedErrors",
    summary: errors.length === 0 ? "No unresolved validation errors." : `${errors.length} unresolved validation error(s).`,
    evidence: errors.slice(0, 20).map((i) => `${i.code} [${i.entityType}]: ${i.message}`),
    nextActions: errors.length === 0 ? [] : ["Resolve errors in the Validation dashboard."]
  };
}

function answerFixFirst(context: AssistantContext): AssistantAnswer {
  const blockers = blockingIssues(context);
  if (blockers.length > 0) {
    return {
      intent: "fixFirst",
      summary: `Fix blocking issues first (${blockers.length}). These prevent export.`,
      evidence: blockers.slice(0, 10).map((i) => `${i.code} (${i.severity}): ${i.message}`),
      nextActions: ["Resolve blocking issues, then re-validate to clear the export gate."]
    };
  }
  const lowest = [...context.readiness.categories].sort((a, b) => a.score - b.score)[0];
  return {
    intent: "fixFirst",
    summary: lowest
      ? `No blocking issues. Improve the lowest readiness category next: ${lowest.label} (${lowest.score}).`
      : "No blocking issues and no readiness categories to improve.",
    evidence: lowest ? lowest.recommendedActions : [],
    nextActions: lowest ? lowest.recommendedActions.slice(0, 3) : ["Proceed to packaging."]
  };
}

function answerUnknown(): AssistantAnswer {
  return {
    intent: "unknown",
    summary: "I can answer questions about this project's readiness, validation, changes, risks, and impact. Try one of the suggested questions.",
    evidence: [],
    nextActions: SUGGESTED_QUESTIONS
  };
}

function findChangeSet(question: string, context: AssistantContext): AssistantChangeSet | null {
  const q = question.toLowerCase();
  return context.changeSets.find((c) => q.includes(c.name.toLowerCase()) || q.includes(c.id.toLowerCase())) ?? null;
}

function findReferencedMember(question: string, context: AssistantContext): string | null {
  // Quoted member name first.
  const quoted = question.match(/"([^"]+)"|'([^']+)'/);
  if (quoted) return (quoted[1] ?? quoted[2]).trim();
  // "member X" pattern takes priority over the verb.
  const memberNamed = question.match(/member\s+([A-Za-z0-9_.\-]+)/i);
  if (memberNamed) return memberNamed[1].trim();
  // "rename X" / "delete X" / "change X" pattern.
  const named = question.match(/(?:rename|delete|change)\s+([A-Za-z0-9_.\-]+)/i);
  if (named && named[1].toLowerCase() !== "member") return named[1].trim();
  // Otherwise match any known member key present in the question.
  const q = question.toLowerCase();
  const hit = context.members.find((m) => m.memberKey.length > 1 && q.includes(m.memberKey.toLowerCase()));
  return hit?.memberKey ?? null;
}
