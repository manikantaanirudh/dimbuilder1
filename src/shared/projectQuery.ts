import type { NLQueryResult } from "./aiTypes";

export type ProjectQueryStatus = "answered" | "needs_clarification" | "unsupported";
export type ProjectQueryMatchQuality = "exact" | "partial" | "ambiguous" | "unsupported";
export type ProjectQueryFindingSeverity = "error" | "warning" | "info";
export type ProjectQueryFreshnessState = "current" | "stale" | "missing";

export type ProjectQueryScopeToken =
  | { kind: "project"; projectId: string; label: string }
  | { kind: "dimension"; dimensionId: string; label: string }
  | { kind: "member"; memberId?: string; memberKey: string; dimensionId?: string; label: string }
  | { kind: "issue"; code: string; label: string }
  | { kind: "baseline"; baselineId: string; label: string }
  | { kind: "result"; entryId: string; label: string };

export interface ProjectQueryInterpretation {
  intent: string;
  intentLabel: string;
  matchQuality: ProjectQueryMatchQuality;
  filters: Array<{ field: string; operator: string; value: string }>;
  sort?: { field: string; direction: "asc" | "desc" };
  limit?: number;
  scope: ProjectQueryScopeToken[];
  choices?: Array<{ label: string; value: string; scope?: ProjectQueryScopeToken }>;
}

export interface ProjectQueryFreshness {
  state: ProjectQueryFreshnessState;
  label: string;
  dataAsOf: string | null;
  projectUpdatedAt: string | null;
  validationSnapshotId?: string;
  reason?: string;
}

export type ProjectQueryTarget =
  | { kind: "member"; memberId?: string; memberKey: string; dimensionId?: string }
  | { kind: "dimension"; dimensionId: string }
  | { kind: "surface"; surface: "validation" | "compare" | "artifact-scanner" | "change-sets" };

export interface ProjectQueryMetric {
  label: string;
  value: string | number;
}

export interface ProjectQueryFinding {
  severity: ProjectQueryFindingSeverity;
  message: string;
  code?: string;
  target?: ProjectQueryTarget;
}

export interface ProjectQueryEvidence {
  label: string;
  value: string;
  source?: ProjectQueryEvidenceSource;
}

export interface ProjectQueryEvidenceSource {
  kind: "project" | "dimension" | "member" | "relationship" | "validation" | "diff" | "change-set" | "artifact" | "rule";
  id?: string;
  label: string;
  asOf?: string | null;
  target?: ProjectQueryTarget;
}

export type ProjectQueryTableRow = Record<string, string | number | boolean | null>;

export interface ProjectQueryTable {
  kind: "members" | "issues" | "dimensions" | "hierarchy" | "changes" | "artifacts";
  columns: Array<{ key: string; label: string; type: "text" | "number" | "boolean" | "date" | "status" }>;
  rows: ProjectQueryTableRow[];
  totalRows: number;
  offset: number;
  limit: number;
  truncated: boolean;
  nextOffset: number | null;
}

export interface ProjectQueryRemediationStep {
  id: string;
  order: number;
  title: string;
  explanation: string;
  target?: ProjectQueryTarget;
  ruleCode?: string;
  status: "open" | "verified" | "not_applicable";
}

export interface ProjectQueryResult {
  status: ProjectQueryStatus;
  matchQuality: ProjectQueryMatchQuality;
  query: string;
  intent: string;
  intentLabel: string;
  summary: string;
  dataAsOf: string | null;
  metrics: ProjectQueryMetric[];
  findings: ProjectQueryFinding[];
  evidence: ProjectQueryEvidence[];
  targets: ProjectQueryTarget[];
  followUps: string[];
  interpretation?: ProjectQueryInterpretation;
  scope?: ProjectQueryScopeToken[];
  freshness?: ProjectQueryFreshness;
  table?: ProjectQueryTable;
  provenance?: ProjectQueryEvidenceSource[];
  remediation?: ProjectQueryRemediationStep[];
  /** Kept for compatibility with the original query result contract. */
  legacy?: NLQueryResult;
}

export interface ProjectQueryEntry {
  id: string;
  sessionId: string;
  question: string;
  result: ProjectQueryResult;
  createdAt: string;
}

export interface ProjectQueryPlaybookDefinition {
  id: "export-readiness" | "validation-triage" | "hierarchy-health" | "change-impact";
  version: number;
  label: string;
  description: string;
  steps: Array<{ id: string; label: string; question: string }>;
}

export type ProjectQueryPlaybookRunStatus = "running" | "needs_clarification" | "completed" | "failed";

export interface ProjectQueryPlaybookStep {
  id: string;
  runId: string;
  stepOrder: number;
  label: string;
  status: "pending" | "running" | "needs_clarification" | "completed" | "failed";
  result?: ProjectQueryResult;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectQueryPlaybookRun {
  id: string;
  projectId: string;
  userId: string;
  sessionId?: string;
  playbookId: ProjectQueryPlaybookDefinition["id"];
  definitionVersion: number;
  status: ProjectQueryPlaybookRunStatus;
  scope: ProjectQueryScopeToken[];
  createdAt: string;
  updatedAt: string;
  steps: ProjectQueryPlaybookStep[];
}

export interface ProjectQueryTemplate {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  category: string;
  question: string;
  parameters: string[];
  defaultScope: ProjectQueryScopeToken[];
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectQuerySessionSummary {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  entryCount: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface ProjectQuerySession extends ProjectQuerySessionSummary {
  entries: ProjectQueryEntry[];
}

export interface ProjectQuerySuggestion {
  text: string;
  intent: string;
  label: string;
}

export const PROJECT_QUERY_INTENT_LABELS: Record<string, string> = {
  summary: "Project summary",
  issues: "Validation issues",
  export_ready: "Export readiness",
  readinessLow: "Readiness analysis",
  blocksExport: "Export blockers",
  changedSinceBaseline: "Baseline changes",
  releaseNotes: "Release notes",
  impactRename: "Artifact impact",
  riskyMembers: "Risky members",
  unresolvedErrors: "Unresolved errors",
  fixFirst: "Fix priority",
  leaf_count: "Leaf members",
  list_leaves: "Leaf members",
  list_members: "Dimension members",
  list_dimensions: "Dimensions",
  member_details: "Member details",
  hierarchy_depth: "Hierarchy depth",
  hierarchy_summary: "Hierarchy health",
  shared_members: "Shared members",
  orphans: "Orphan members",
  empty_dimensions: "Empty dimensions",
  dimension_issues: "Issues by dimension",
  coverage: "Metadata coverage",
  relationship_count: "Relationships",
  inactive_members: "Inactive members",
  root_members: "Root members",
  find: "Member search",
  count: "Member count",
  children: "Hierarchy children",
  missing_property: "Missing properties",
  property_filter: "Property filter",
  check_exists: "Member lookup",
  unknown: "Unsupported query"
};

export const PROJECT_QUERY_PLAYBOOKS: ProjectQueryPlaybookDefinition[] = [
  {
    id: "export-readiness",
    version: 1,
    label: "Export Readiness",
    description: "Check validation freshness, blockers, coverage, and release readiness.",
    steps: [
      { id: "readiness", label: "Readiness score", question: "Is my project ready to export?" },
      { id: "blockers", label: "Export blockers", question: "What blocks export?" },
      { id: "coverage", label: "Metadata coverage", question: "What is the metadata coverage?" }
    ]
  },
  {
    id: "validation-triage",
    version: 1,
    label: "Validation Triage",
    description: "Group validation findings and identify the highest-priority remediation.",
    steps: [
      { id: "issues", label: "Issue summary", question: "What is wrong with my project?" },
      { id: "dimensions", label: "Issues by dimension", question: "Which dimensions have the most issues?" },
      { id: "fix-first", label: "Fix priority", question: "What should I fix first?" }
    ]
  },
  {
    id: "hierarchy-health",
    version: 1,
    label: "Hierarchy Health",
    description: "Inspect hierarchy depth, leaves, roots, shared members, and orphan risk.",
    steps: [
      { id: "dimensions", label: "Dimensions", question: "What dimensions exist in this project?" },
      { id: "orphans", label: "Orphan members", question: "Show orphan members" },
      { id: "depth", label: "Hierarchy depth", question: "What is the max hierarchy depth?" }
    ]
  },
  {
    id: "change-impact",
    version: 1,
    label: "Change Impact",
    description: "Review baseline changes, change sets, and downstream artifact references.",
    steps: [
      { id: "changes", label: "Baseline changes", question: "What changed since baseline?" },
      { id: "release", label: "Change sets", question: "Show release notes" },
      { id: "impact", label: "Artifact impact", question: "What is the artifact impact?" }
    ]
  }
];

export const PROJECT_QUERY_SUGGESTIONS: ProjectQuerySuggestion[] = [
  { text: "Summarize my project", intent: "summary", label: "Overview" },
  { text: "What is wrong with my project?", intent: "issues", label: "Validation" },
  { text: "Is my project ready to export?", intent: "export_ready", label: "Readiness" },
  { text: "What is the metadata coverage?", intent: "coverage", label: "Coverage" },
  { text: "Which dimensions are empty?", intent: "empty_dimensions", label: "Dimensions" },
  { text: "What dimensions exist in this project?", intent: "list_dimensions", label: "Dimensions" },
  { text: "How many members in Account?", intent: "count", label: "Hierarchy" },
  { text: "How many leaf members in Account?", intent: "leaf_count", label: "Hierarchy" },
  { text: "What is the max hierarchy depth in Account?", intent: "hierarchy_depth", label: "Hierarchy" },
  { text: "Show orphan members", intent: "orphans", label: "Hierarchy" },
  { text: "How many relationships in Account?", intent: "relationship_count", label: "Hierarchy" },
  { text: "Find Revenue", intent: "find", label: "Search" },
  { text: "Tell me about member Revenue", intent: "member_details", label: "Search" },
  { text: "Show members under Revenue", intent: "children", label: "Hierarchy" },
  { text: "What changed since baseline?", intent: "changedSinceBaseline", label: "Changes" },
  { text: "What should I fix first?", intent: "fixFirst", label: "Validation" }
];

export function toProjectQueryResult(legacy: NLQueryResult, dataAsOf: string | null = null): ProjectQueryResult {
  const intent = legacy.intent ?? "unknown";
  return {
    status: "answered",
    matchQuality: legacy.confidence >= 0.8 ? "exact" : "partial",
    query: legacy.query,
    intent,
    intentLabel: legacy.intentLabel ?? PROJECT_QUERY_INTENT_LABELS[intent] ?? intent,
    summary: legacy.answer.split("\n").find((line) => line.trim() && !line.startsWith("##"))?.trim() ?? legacy.answer,
    dataAsOf,
    metrics: [],
    findings: [],
    evidence: (legacy.evidence ?? []).map((value) => ({ label: "Evidence", value })),
    targets: (legacy.matchedMembers ?? []).map((memberKey) => ({ kind: "member", memberKey })),
    followUps: legacy.followUps ?? [],
    interpretation: {
      intent,
      intentLabel: legacy.intentLabel ?? PROJECT_QUERY_INTENT_LABELS[intent] ?? intent,
      matchQuality: legacy.confidence >= 0.8 ? "exact" : "partial",
      filters: [],
      scope: []
    },
    scope: [],
    freshness: {
      state: dataAsOf ? "current" : "missing",
      label: dataAsOf ? "Stored project data" : "Data freshness unavailable",
      dataAsOf,
      projectUpdatedAt: dataAsOf
    },
    provenance: [],
    legacy
  };
}
