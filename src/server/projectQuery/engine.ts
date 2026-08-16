import type { AppConfig } from "../../shared/appConfigTypes";
import type { ProjectAIContext } from "../ai/projectContext";
import { runNaturalLanguageQuery } from "../ai/aiEngine";
import { classifyNaturalLanguageQuery } from "../ai/naturalLanguage/queryParser";
import { answerProjectQuestion, classifyIntent, type AssistantContext } from "../../shared/projectAssistant";
import { computeReadinessScore } from "../../shared/readinessScore";
import { summarizeValidationIssues } from "../../shared/releasePackage";
import { generateCoverageReport } from "../reporting/reportingEngine";
import { ArtifactStore } from "../routes/artifactStore";
import type { Repositories } from "../db/repositories";
import type { ProjectRecord } from "../../shared/types";
import type { NLQueryResult } from "../../shared/aiTypes";
import {
  PROJECT_QUERY_INTENT_LABELS,
  PROJECT_QUERY_SUGGESTIONS,
  type ProjectQueryFinding,
  type ProjectQueryInterpretation,
  type ProjectQueryResult,
  type ProjectQuerySuggestion,
  type ProjectQueryScopeToken,
  type ProjectQueryTable,
  type ProjectQueryTarget,
  toProjectQueryResult
} from "../../shared/projectQuery";

const MAX_QUESTION_LENGTH = 500;

export interface ProjectQueryExecution {
  project: ProjectRecord;
  result: ProjectQueryResult;
}

interface QueryRequirements {
  dimensions: boolean;
  members: boolean;
  relationships: boolean;
  issues: boolean;
  changeSets: boolean;
  diff: boolean;
  artifacts: boolean;
}

export function planProjectQuery(question: string): { intent: string; requirements: QueryRequirements } {
  const assistantIntent = classifyIntent(question);
  if (assistantIntent !== "unknown") {
    return {
      intent: assistantIntent,
      requirements: {
        dimensions: ["exportReady", "readinessLow", "blocksExport", "dimensionsMostIssues", "missingAccountType", "missingCurrency", "riskyMembers", "unresolvedErrors", "fixFirst"].includes(assistantIntent),
        members: ["missingAccountType", "missingCurrency", "riskyMembers", "impactRename"].includes(assistantIntent),
        relationships: false,
        issues: ["exportReady", "readinessLow", "blocksExport", "dimensionsMostIssues", "missingAccountType", "missingCurrency", "riskyMembers", "unresolvedErrors", "fixFirst"].includes(assistantIntent),
        changeSets: ["changedSinceBaseline", "releaseNotes"].includes(assistantIntent),
        diff: assistantIntent === "changedSinceBaseline",
        artifacts: assistantIntent === "impactRename"
      }
    };
  }

  const parsed = classifyNaturalLanguageQuery(question);
  const memberIntent = ["find", "count", "children", "missing_property", "property_filter", "orphans", "check_exists", "leaf_count", "list_leaves", "shared_members", "list_members", "member_details", "inactive_members", "root_members", "relationship_count"].includes(parsed.type);
  const relationshipIntent = ["children", "orphans", "leaf_count", "list_leaves", "shared_members", "hierarchy_depth", "hierarchy_summary", "relationship_count", "root_members"].includes(parsed.type);
  return {
    intent: parsed.type,
    requirements: {
      dimensions: true,
      members: memberIntent || ["summary", "coverage", "empty_dimensions"].includes(parsed.type),
      relationships: relationshipIntent || ["summary", "coverage"].includes(parsed.type),
      issues: ["issues", "dimension_issues", "export_ready"].includes(parsed.type),
      changeSets: false,
      diff: false,
      artifacts: false
    }
  };
}

export function toLegacyProjectQueryResult(result: ProjectQueryResult): NLQueryResult {
  if (result.legacy) return result.legacy;
  const matchedMembers = result.targets.filter((target): target is Extract<ProjectQueryTarget, { kind: "member" }> => target.kind === "member").map((target) => target.memberKey);
  return {
    query: result.query,
    answer: result.summary,
    matchedMembers,
    confidence: result.matchQuality === "exact" ? 1 : result.matchQuality === "unsupported" ? 0.2 : 0.6,
    intent: result.intent,
    intentLabel: result.intentLabel,
    evidence: result.evidence.map((item) => `${item.label}: ${item.value}`),
    followUps: result.followUps
  };
}

export function projectQuerySuggestions(question = ""): ProjectQuerySuggestion[] {
  const needle = question.trim().toLowerCase();
  return PROJECT_QUERY_SUGGESTIONS
    .filter((suggestion) => !needle || suggestion.text.toLowerCase().includes(needle))
    .slice(0, 12);
}

export async function interpretProjectQuery(
  repos: Repositories,
  projectId: string,
  question: string
): Promise<ProjectQueryInterpretation | null> {
  const project = await repos.projects.get(projectId);
  if (!project) return null;
  const trimmed = question.trim();
  if (!trimmed) throw new Error("question is required");
  if (trimmed.length > MAX_QUESTION_LENGTH) throw new Error(`question must be ${MAX_QUESTION_LENGTH} characters or fewer`);
  const plan = planProjectQuery(trimmed);
  const dimensions = await repos.dimensions.listByProject(projectId);
  const candidates = dimensions.filter((dimension) => new RegExp(`\\b${escapeRegex(dimension.dimensionType)}\\b`, "i").test(trimmed));
  const scope: ProjectQueryScopeToken[] = [{ kind: "project", projectId, label: project.name }];
  const choices = candidates.length > 1 && !dimensions.some((dimension) => trimmed.toLowerCase().includes(dimension.dimensionName.toLowerCase()))
    ? candidates.map((dimension) => ({ label: `${dimension.dimensionName} (${dimension.dimensionType})`, value: dimension.dimensionName, scope: { kind: "dimension" as const, dimensionId: dimension.id, label: dimension.dimensionName } }))
    : undefined;
  return {
    intent: plan.intent,
    intentLabel: PROJECT_QUERY_INTENT_LABELS[plan.intent] ?? plan.intent,
    matchQuality: choices ? "ambiguous" : plan.intent === "unknown" ? "unsupported" : "exact",
    filters: [],
    scope,
    choices
  };
}

export async function executeProjectQuery(
  repos: Repositories,
  config: AppConfig,
  projectId: string,
  question: string
): Promise<ProjectQueryExecution | null> {
  const project = await repos.projects.get(projectId);
  if (!project) return null;

  const trimmed = question.trim();
  if (!trimmed) throw new Error("question is required");
  if (trimmed.length > MAX_QUESTION_LENGTH) throw new Error(`question must be ${MAX_QUESTION_LENGTH} characters or fewer`);

  const plan = planProjectQuery(trimmed);
  const dimensions = plan.requirements.dimensions ? await repos.dimensions.listByProject(projectId) : [];
  const members = plan.requirements.members ? await repos.members.listByProject(projectId) : [];
  const relationships = plan.requirements.relationships ? await repos.relationships.listByProject(projectId) : [];
  const issues = plan.requirements.issues ? await repos.issues.listByProject(projectId) : [];
  const dataAsOf = latestTimestamp([project.updatedAt], issues.map((issue) => issue.createdAt));
  const validationSnapshot = plan.requirements.issues ? await repos.validationSnapshots.latest(projectId) : null;
  const freshness = plan.requirements.issues
    ? validationSnapshot
      ? validationSnapshot.projectUpdatedAt === project.updatedAt
        ? { state: "current" as const, label: "Validation is current", dataAsOf: validationSnapshot.capturedAt, projectUpdatedAt: project.updatedAt, validationSnapshotId: validationSnapshot.id }
        : { state: "stale" as const, label: "Validation is stale", dataAsOf: validationSnapshot.capturedAt, projectUpdatedAt: project.updatedAt, validationSnapshotId: validationSnapshot.id, reason: "Project metadata changed after the last validation run." }
      : { state: "missing" as const, label: "Validation has not been run", dataAsOf: null, projectUpdatedAt: project.updatedAt, reason: "Run Validation to verify this conclusion." }
    : { state: "current" as const, label: "Stored project data", dataAsOf, projectUpdatedAt: project.updatedAt };

  const clarification = findDimensionClarification(trimmed, dimensions);
  if (clarification) {
    return { project, result: clarification };
  }

  const assistantIntent = classifyIntent(trimmed);
  if (assistantIntent !== "unknown") {
    const result = await executeAssistantIntent(repos, config, project, dimensions, members, issues, trimmed, dataAsOf, plan.requirements.changeSets, plan.requirements.diff, plan.requirements.artifacts);
    result.freshness = freshness;
    if (result.intent === "exportReady" && freshness.state !== "current") {
      result.summary = `Unverified: ${result.summary} ${freshness.label}; run Validation before treating readiness as confirmed.`;
      result.followUps = ["Run Validation", ...result.followUps];
    }
    result.table = buildTypedTable(plan.intent, dimensions, members, issues);
    result.scope = [{ kind: "project", projectId, label: project.name }];
    if (result.interpretation) result.interpretation.scope = result.scope;
    return { project, result };
  }

  const context = buildStoredQueryContext(project, config, dimensions, members, relationships, issues);
  const legacy = runNaturalLanguageQuery(trimmed, { dimensions, members, relationships }, context);
  const result = toProjectQueryResult(legacy, dataAsOf);
  result.targets = result.targets.map((target) => {
    if (target.kind !== "member") return target;
    const matches = members.filter((candidate) => candidate.memberKey.toLowerCase() === target.memberKey.toLowerCase());
    const member = matches[0];
    return member && matches.length === 1 ? { ...target, memberId: member.id, dimensionId: member.dimensionId } : target;
  });
  const ambiguousMemberKeys = [...new Set(result.targets.filter((target): target is Extract<ProjectQueryTarget, { kind: "member" }> => target.kind === "member").filter((target) => members.filter((member) => member.memberKey.toLowerCase() === target.memberKey.toLowerCase()).length > 1).map((target) => target.memberKey))];
  if (ambiguousMemberKeys.length > 0) {
    const choices = members.filter((member) => ambiguousMemberKeys.some((key) => key.toLowerCase() === member.memberKey.toLowerCase()));
    result.status = "needs_clarification";
    result.matchQuality = "ambiguous";
    result.summary = `The member key ${ambiguousMemberKeys.join(", ")} exists in multiple dimensions. Choose a dimension to continue.`;
    result.targets = choices.map((member) => ({ kind: "member", memberKey: member.memberKey, memberId: member.id, dimensionId: member.dimensionId }));
    result.followUps = choices.map((member) => `${trimmed} in ${dimensions.find((dimension) => dimension.id === member.dimensionId)?.dimensionName ?? member.dimensionId}`);
  }
  result.status = legacy.intent === "unknown" ? "unsupported" : "answered";
  result.matchQuality = legacy.intent === "unknown" ? "unsupported" : legacy.confidence >= 0.8 ? "exact" : "partial";
  result.metrics = extractMetrics(legacy.answer);
  result.findings = extractFindings(legacy.answer);
  result.freshness = freshness;
  result.table = buildTypedTable(plan.intent, dimensions, members, issues);
  result.interpretation = {
    intent: result.intent,
    intentLabel: result.intentLabel,
    matchQuality: result.matchQuality,
    filters: [],
    scope: [{ kind: "project", projectId, label: project.name }]
  };
  result.scope = result.interpretation.scope;
  return { project, result };
}

function buildTypedTable(
  intent: string,
  dimensions: Awaited<ReturnType<Repositories["dimensions"]["listByProject"]>>,
  members: Awaited<ReturnType<Repositories["members"]["listByProject"]>>,
  issues: Awaited<ReturnType<Repositories["issues"]["listByProject"]>>
): ProjectQueryTable | undefined {
  const limit = 50;
  if (["find", "count", "children", "list_members", "list_leaves", "member_details", "orphans", "riskyMembers", "missingAccountType", "missingCurrency", "inactive_members", "root_members"].includes(intent)) {
    const rows = members.map((member) => ({ id: member.id, memberKey: member.memberKey, dimensionId: member.dimensionId, active: member.isActive }));
    return {
      kind: "members",
      columns: [
        { key: "memberKey", label: "Member", type: "text" },
        { key: "dimensionId", label: "Dimension", type: "text" },
        { key: "active", label: "Active", type: "boolean" }
      ],
      rows,
      totalRows: members.length,
      offset: 0,
      limit,
      truncated: members.length > limit,
      nextOffset: members.length > limit ? limit : null
    };
  }
  if (["issues", "export_ready", "blocksExport", "unresolvedErrors", "fixFirst", "dimensionsMostIssues", "dimension_issues"].includes(intent)) {
    const rows = issues.map((issue) => ({ id: issue.id, code: issue.code, severity: issue.severity, message: issue.message, dimensionId: issue.dimensionId, entityType: issue.entityType }));
    return {
      kind: "issues",
      columns: [
        { key: "code", label: "Rule", type: "text" },
        { key: "severity", label: "Severity", type: "status" },
        { key: "message", label: "Finding", type: "text" },
        { key: "dimensionId", label: "Dimension", type: "text" }
      ],
      rows,
      totalRows: issues.length,
      offset: 0,
      limit,
      truncated: issues.length > limit,
      nextOffset: issues.length > limit ? limit : null
    };
  }
  if (["list_dimensions", "empty_dimensions", "summary", "coverage"].includes(intent)) {
    const rows = dimensions.map((dimension) => ({ id: dimension.id, dimensionType: dimension.dimensionType, dimensionName: dimension.dimensionName }));
    return {
      kind: "dimensions",
      columns: [
        { key: "dimensionName", label: "Dimension", type: "text" },
        { key: "dimensionType", label: "Type", type: "text" }
      ],
      rows,
      totalRows: dimensions.length,
      offset: 0,
      limit,
      truncated: dimensions.length > limit,
      nextOffset: dimensions.length > limit ? limit : null
    };
  }
  return undefined;
}

function buildStoredQueryContext(
  project: ProjectRecord,
  config: AppConfig,
  dimensions: Awaited<ReturnType<Repositories["dimensions"]["listByProject"]>>,
  members: Awaited<ReturnType<Repositories["members"]["listByProject"]>>,
  relationships: Awaited<ReturnType<Repositories["relationships"]["listByProject"]>>,
  issues: Awaited<ReturnType<Repositories["issues"]["listByProject"]>>
): ProjectAIContext {
  const counts = new Map<string, number>();
  for (const member of members) counts.set(member.dimensionId, (counts.get(member.dimensionId) ?? 0) + 1);
  const validation = summarizeValidationIssues(issues, config.validation.exportBlockedBySeverities);
  const issueByCode = new Map<string, { code: string; count: number; message: string }>();
  for (const issue of issues) {
    const current = issueByCode.get(issue.code);
    if (current) current.count += 1;
    else issueByCode.set(issue.code, { code: issue.code, count: 1, message: issue.message });
  }
  const dimensionById = new Map(dimensions.map((dimension) => [dimension.id, dimension]));
  const issueRollup = new Map<string, { dimensionType: string; dimensionName: string; totalCount: number; errors: number; warnings: number }>();
  for (const issue of issues) {
    const dimension = dimensionById.get(issue.dimensionId);
    if (!dimension) continue;
    const current = issueRollup.get(dimension.id) ?? { dimensionType: dimension.dimensionType, dimensionName: dimension.dimensionName, totalCount: 0, errors: 0, warnings: 0 };
    current.totalCount += 1;
    if (issue.severity === "error") current.errors += 1;
    if (issue.severity === "warning") current.warnings += 1;
    issueRollup.set(dimension.id, current);
  }
  const coverage = generateCoverageReport(project.id, { dimensions, members, relationships });
  return {
    projectName: project.name,
    dimensionCount: dimensions.length,
    memberCount: members.length,
    relationshipCount: relationships.length,
    dimensions: dimensions.map((dimension) => ({ dimensionType: dimension.dimensionType, dimensionName: dimension.dimensionName, memberCount: counts.get(dimension.id) ?? 0 })),
    validation,
    topIssues: [...issueByCode.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    exportReady: validation.blockingIssues === 0,
    issuesByDimension: [...issueRollup.values()].sort((a, b) => b.totalCount - a.totalCount),
    coverage: {
      overallPercent: coverage.overallCoverage,
      dimensions: coverage.dimensions.map((row) => ({ dimensionType: row.dimensionType, dimensionName: row.dimensionName, propertyCoverage: row.propertyCoverage, descriptionCoverage: row.descriptionCoverage, isStale: row.isStale }))
    }
  };
}

async function executeAssistantIntent(
  repos: Repositories,
  config: AppConfig,
  project: ProjectRecord,
  dimensions: Awaited<ReturnType<Repositories["dimensions"]["listByProject"]>>,
  members: Awaited<ReturnType<Repositories["members"]["listByProject"]>>,
  issues: Awaited<ReturnType<Repositories["issues"]["listByProject"]>>,
  question: string,
  dataAsOf: string,
  loadChangeSets: boolean,
  loadDiff: boolean,
  loadArtifacts: boolean
): Promise<ProjectQueryResult> {
  const readiness = computeReadinessScore({
    issues,
    dimensions: dimensions.map((dimension) => ({ dimensionType: dimension.dimensionType })),
    expectedDimensionTypes: config.validation.oneStreamProfile?.expectedDimensionTypes ?? [],
    certification: null,
    exportBlockedBySeverities: config.validation.exportBlockedBySeverities,
    weights: config.readiness?.categoryWeights
  });
  const changeSets = loadChangeSets ? await Promise.all((await repos.changeSets.listByProject(project.id)).map(async (changeSet) => {
    const detail = await repos.changeSets.getDetail(project.id, changeSet.id);
    return { id: changeSet.id, name: changeSet.name, status: changeSet.status, itemCount: detail?.items.length ?? 0 };
  })) : [];
  const latest = loadDiff ? await repos.diffRuns.getLatest(project.id) : null;
  const artifactStore = loadArtifacts ? new ArtifactStore(config.paths.exportsDirectory) : null;
  const artifactReferences = artifactStore ? artifactStore.scannedArtifacts(project.id).flatMap((artifact) => artifact.references.map((reference) => ({ memberKey: reference.memberKey, dimensionHint: reference.dimensionHint, artifactName: artifact.artifactName, confidence: reference.confidence }))) : [];
  const context: AssistantContext = {
    projectName: project.name,
    readiness,
    issues,
    exportBlockedBySeverities: config.validation.exportBlockedBySeverities,
    dimensions: dimensions.map((dimension) => ({ id: dimension.id, dimensionType: dimension.dimensionType, dimensionName: dimension.dimensionName })),
    members: members.map((member) => ({ id: member.id, dimensionId: member.dimensionId, memberKey: member.memberKey, properties: member.properties ?? {} })),
    changeSets,
    latestDiffSummary: latest ? { id: latest.id, added: latest.summary.byChangeType.add ?? 0, updated: latest.summary.byChangeType.update ?? 0, removed: latest.summary.byChangeType.delete ?? 0 } : null,
    artifactReferences
  };
  const answer = answerProjectQuestion(question, context);
  const targets: ProjectQueryTarget[] = [];
  if (["exportReady", "readinessLow", "blocksExport", "unresolvedErrors", "fixFirst", "dimensionsMostIssues"].includes(answer.intent)) targets.push({ kind: "surface", surface: "validation" });
  if (answer.intent === "changedSinceBaseline") targets.push({ kind: "surface", surface: "compare" });
  if (answer.intent === "releaseNotes") targets.push({ kind: "surface", surface: "change-sets" });
  if (answer.intent === "impactRename") targets.push({ kind: "surface", surface: "artifact-scanner" });
  return {
    status: "answered",
    matchQuality: "exact",
    query: question,
    intent: answer.intent,
    intentLabel: PROJECT_QUERY_INTENT_LABELS[answer.intent] ?? answer.intent,
    summary: answer.summary,
    dataAsOf,
    metrics: [],
    findings: answer.evidence.map((message) => ({ severity: "info", message })),
    evidence: answer.evidence.map((value) => ({ label: "Evidence", value })),
    targets,
    followUps: answer.nextActions,
    interpretation: {
      intent: answer.intent,
      intentLabel: PROJECT_QUERY_INTENT_LABELS[answer.intent] ?? answer.intent,
      matchQuality: "exact",
      filters: [],
      scope: []
    },
    scope: [],
    freshness: {
      state: "current",
      label: "Stored project data",
      dataAsOf,
      projectUpdatedAt: project.updatedAt
    },
    provenance: [{ kind: "project", id: project.id, label: project.name, asOf: dataAsOf }]
  };
}

function findDimensionClarification(question: string, dimensions: Array<{ id: string; dimensionType: string; dimensionName: string }>): ProjectQueryResult | null {
  const typeMatches = dimensions.filter((dimension) => new RegExp(`\\b${escapeRegex(dimension.dimensionType)}\\b`, "i").test(question));
  const candidates = typeMatches.length > 0 ? typeMatches : dimensions;
  const exactNameMentioned = dimensions.some((dimension) => question.toLowerCase().includes(dimension.dimensionName.toLowerCase()));
  if (candidates.length < 2 || exactNameMentioned || !/(member|hierarchy|relationship|leaf|orphan|property)/i.test(question)) return null;
  return {
    status: "needs_clarification",
    matchQuality: "ambiguous",
    query: question,
    intent: "dimension_selection",
    intentLabel: "Choose a dimension",
    summary: `The question matches ${candidates.length} dimensions. Choose one to run the query.`,
    dataAsOf: null,
    metrics: [],
    findings: candidates.map((dimension) => ({ severity: "info", message: `${dimension.dimensionName} (${dimension.dimensionType})`, target: { kind: "dimension", dimensionId: dimension.id } })),
    evidence: [],
    targets: candidates.map((dimension) => ({ kind: "dimension", dimensionId: dimension.id })),
    followUps: candidates.map((dimension) => question.replace(new RegExp(`\\b${escapeRegex(dimension.dimensionType)}\\b`, "i"), dimension.dimensionName)),
    scope: [],
    interpretation: {
      intent: "dimension_selection",
      intentLabel: "Choose a dimension",
      matchQuality: "ambiguous",
      filters: [],
      scope: [],
      choices: candidates.map((dimension) => ({ label: `${dimension.dimensionName} (${dimension.dimensionType})`, value: dimension.dimensionName, scope: { kind: "dimension" as const, dimensionId: dimension.id, label: dimension.dimensionName } }))
    }
  };
}

function extractMetrics(answer: string) {
  return answer.split("\\n").flatMap((line) => {
    const match = line.match(/^\\s*[•-]?\\s*\\*\\*(.+?)\\*\\*:\\s*(.+)$/);
    return match ? [{ label: match[1], value: match[2] }] : [];
  });
}

function extractFindings(answer: string): ProjectQueryFinding[] {
  return answer.split("\\n").flatMap((line) => {
    const match = line.match(/\\[(Critical|Warning|Information)\\]\\s*(.+)$/i);
    if (!match) return [];
    return [{ severity: match[1].toLowerCase() === "critical" ? "error" : match[1].toLowerCase() === "warning" ? "warning" : "info", message: match[2] }];
  });
}

function latestTimestamp(...values: string[][]): string {
  return values.flat().filter(Boolean).sort().at(-1) ?? new Date().toISOString();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
}
