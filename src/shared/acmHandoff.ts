import type { AcmIntegrationConfig } from "./appConfigTypes";
import type { ChangeSetDetail, ValidationIssue } from "./types";
import { renderHandoffReadme, renderPostImportSmokeChecklist } from "./handoffChecklists";
import {
  csvRow,
  normalizeChange,
  stringify,
  type HandoffFile,
  type HandoffResult
} from "./handoffShared";

export interface AcmHandoffInput {
  detail: ChangeSetDetail;
  projectName: string;
  issues: ValidationIssue[];
  validationStatus: string;
  readinessScore: number;
  validationProfileId?: string;
  waivedIssues?: ValidationIssue[];
  dimensionNames?: Record<string, string>;
  impact?: unknown[];
  config?: AcmIntegrationConfig;
}

interface AcmColumn {
  key: string;
  label: string;
}

const ACM_COLUMNS: AcmColumn[] = [
  { key: "projectName", label: "Project Name" },
  { key: "changeSetName", label: "Change Set" },
  { key: "changeType", label: "Change Type" },
  { key: "dimensionType", label: "Dimension Type" },
  { key: "dimensionName", label: "Dimension Name" },
  { key: "memberKey", label: "Member Key" },
  { key: "parentKey", label: "Parent Key" },
  { key: "childKey", label: "Child Key" },
  { key: "propertyName", label: "Property Name" },
  { key: "oldValue", label: "Old Value" },
  { key: "newValue", label: "New Value" },
  { key: "reason", label: "Reason" },
  { key: "riskLevel", label: "Risk Level" },
  { key: "validationStatus", label: "Validation Status" },
  { key: "requestedBy", label: "Requested By" },
  { key: "requestedDate", label: "Requested Date" },
  { key: "approverNotes", label: "Approver Notes" },
  { key: "sourceBaseline", label: "Source Baseline" },
  { key: "targetEnvironment", label: "Target Environment" }
];

function buildValidationSummary(issues: ValidationIssue[], profileId: string, waived: ValidationIssue[]) {
  const counts: Record<string, number> = { error: 0, warning: 0, info: 0, off: 0 };
  for (const issue of issues) {
    counts[issue.severity] = (counts[issue.severity] ?? 0) + 1;
  }
  return {
    validationProfileId: profileId,
    generatedAt: new Date().toISOString(),
    counts,
    waivedCount: waived.length,
    waivedIssues: waived.map((i) => ({ id: i.id, code: i.code, severity: i.severity, message: i.message }))
  };
}

function renderRollbackNotes(input: AcmHandoffInput): string {
  const cs = input.detail.changeSet;
  return [
    `# Rollback Notes - ${input.projectName}`,
    "",
    `Change set: ${cs.name}`,
    cs.baselineId ? `Source baseline: ${cs.baselineId}` : "No baseline linked on this change set.",
    "",
    "Use the prior baseline or change-set package rollback artifacts to plan reversal.",
    "Property-only changes may support automatic rollback XML in the release package when all items are updates.",
    "",
    "> Manual review is required for hierarchy moves, deletes, and break/build operations."
  ].join("\n");
}

/**
 * Build a file-based ACM handoff package from an approved change set. This produces an evidence
 * package for ACM / governance workflows; it does NOT submit to ACM directly.
 */
export function buildAcmHandoff(input: AcmHandoffInput): HandoffResult {
  const warnings: string[] = [];
  const cs = input.detail.changeSet;
  const approverNotes = input.detail.approvals.find((a) => a.action === "approve")?.comment ?? "";
  const profileId = input.validationProfileId ?? "consultant-review";
  const waived = input.waivedIssues ?? [];

  const columns = resolveColumns(input.config);
  if (input.config?.exportFields?.some((f) => !ACM_COLUMNS.find((c) => c.key === f))) {
    warnings.push("Some configured ACM exportFields are not recognized and were ignored.");
  }

  const rowValues = input.detail.items.map((item) => {
    const change = normalizeChange(item);
    const record: Record<string, string> = {
      projectName: input.projectName,
      changeSetName: cs.name,
      changeType: change.operation,
      dimensionType: change.dimensionType,
      dimensionName: input.dimensionNames?.[change.dimensionType] ?? change.dimensionType,
      memberKey: change.memberKey,
      parentKey: change.parentKey,
      childKey: change.childKey,
      propertyName: change.propertyName,
      oldValue: change.oldValue,
      newValue: change.newValue,
      reason: cs.description,
      riskLevel: change.riskLevel,
      validationStatus: input.validationStatus,
      requestedBy: cs.createdBy,
      requestedDate: cs.createdAt,
      approverNotes,
      sourceBaseline: cs.baselineId,
      targetEnvironment: cs.targetEnvironment
    };
    return columns.map((c) => record[c.key] ?? "");
  });

  const csv = [csvRow(columns.map((c) => c.label)), ...rowValues.map(csvRow)].join("\n");
  const validationSummary = buildValidationSummary(input.issues, profileId, waived);

  const files: HandoffFile[] = [
    { fileName: "acm-change-request.csv", content: csv, populated: true },
    { fileName: "acm-summary.md", content: renderSummary(input, approverNotes), populated: true },
    { fileName: "handoff-readme.md", content: renderHandoffReadme(input.projectName, cs.name), populated: true },
    { fileName: "post-import-smoke-checklist.md", content: renderPostImportSmokeChecklist(input.projectName), populated: true },
    { fileName: "rollback-notes.md", content: renderRollbackNotes(input), populated: true },
    { fileName: "validation-summary.json", content: stringify(validationSummary), populated: true },
    { fileName: "validation-evidence.json", content: stringify(input.issues), populated: true },
    { fileName: "source-change-set.json", content: stringify(input.detail), populated: true },
    { fileName: "manifest.json", content: "", populated: true }
  ];

  if (waived.length > 0) {
    files.push({ fileName: "waived-issues.json", content: stringify(waived), populated: true });
  }

  if (input.impact && input.impact.length > 0) {
    files.push({
      fileName: "impact-summary.json",
      content: stringify({ count: input.impact.length, items: input.impact }),
      populated: true
    });
  } else {
    warnings.push("No impact data available; impact-summary.json was not generated.");
  }

  const manifest = {
    type: "acm-handoff",
    projectName: input.projectName,
    changeSet: cs.name,
    generatedAt: new Date().toISOString(),
    validationProfileId: profileId,
    rows: rowValues.length,
    validationStatus: input.validationStatus,
    readinessScore: input.readinessScore,
    files: files.map((f) => f.fileName),
    warnings,
    disclaimer: "ACM-ready supporting evidence. Not ACM-certified. Does not submit to ACM directly."
  };
  files.find((f) => f.fileName === "manifest.json")!.content = stringify(manifest);

  return { files, fileNames: files.map((f) => f.fileName), warnings };
}

function resolveColumns(config?: AcmIntegrationConfig): AcmColumn[] {
  const base = config?.exportFields && config.exportFields.length > 0
    ? config.exportFields.map((key) => ACM_COLUMNS.find((c) => c.key === key)).filter((c): c is AcmColumn => Boolean(c))
    : ACM_COLUMNS;
  if (!config?.fieldLabels) return base;
  return base.map((c) => ({ key: c.key, label: config.fieldLabels?.[c.key] ?? c.label }));
}

function renderSummary(input: AcmHandoffInput, approverNotes: string): string {
  const cs = input.detail.changeSet;
  return [
    `# ACM Handoff Package - ${input.projectName}`,
    "",
    `Change set: ${cs.name}`,
    `Items: ${input.detail.items.length}`,
    `Validation profile: ${input.validationProfileId ?? "consultant-review"}`,
    `Validation status: ${input.validationStatus}`,
    `Readiness score: ${input.readinessScore}/100`,
    `Requested by: ${cs.createdBy} on ${cs.createdAt}`,
    approverNotes ? `Approver notes: ${approverNotes}` : "",
    "",
    "This package supports ACM or manual OneStream metadata import workflows.",
    "It is a file-based handoff and does NOT submit changes to ACM or OneStream directly."
  ].filter(Boolean).join("\n");
}
