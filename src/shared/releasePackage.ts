import type {
  ChangeSetDetail,
  ChangeSetItemRecord,
  ChangeSetSummary,
  MetadataDiffChangeType,
  ReleasePackageMode,
  Severity,
  ValidationIssue
} from "./types";
import { normalizeCellValue } from "./text";
import { isExportBlockingValidationIssue } from "./validationRuleCatalog";

export interface ReleasePackageManifestInput {
  packageName: string;
  packagePath: string;
  mode: ReleasePackageMode;
  files: string[];
  validationSummary: ValidationSummary;
  generatedAt?: string;
}

export interface ValidationSummary {
  totalIssues: number;
  blockingIssues: number;
  errors?: number;
  warnings?: number;
  infos?: number;
}

export interface ReleasePackageManifest {
  packageVersion: 1;
  packageName: string;
  packagePath: string;
  mode: ReleasePackageMode;
  generatedAt: string;
  changeSet: {
    id: string;
    projectId: string;
    name: string;
    description: string;
    status: string;
    targetEnvironment: string;
    baselineId: string;
    diffRunId: string;
  };
  summary: ChangeSetSummary;
  validationSummary: ValidationSummary;
  files: string[];
}

const supportedModes: ReleasePackageMode[] = ["full", "additive", "propertyUpdate", "relationshipDelete", "moveCopy", "breakBuild"];

export function buildChangeSetFromDiff(
  diffRun: { baselineId?: string; id?: string; items?: Array<{ id: string }> },
  selectedItemIds?: string[]
): { baselineId: string; diffRunId: string; selectedItemIds: string[] } {
  const allowed = selectedItemIds && selectedItemIds.length > 0
    ? new Set(selectedItemIds)
    : new Set(diffRun.items?.map((item) => item.id) ?? []);
  return {
    baselineId: diffRun.baselineId ?? "",
    diffRunId: diffRun.id ?? "",
    selectedItemIds: [...allowed].sort()
  };
}

export function summarizeChangeSet(detail: ChangeSetDetail): ChangeSetSummary {
  const bySeverity = emptySeverityCounts();
  const byChangeType = emptyChangeTypeCounts();
  for (const item of detail.items) {
    bySeverity[item.severity] += 1;
    byChangeType[item.changeType] += 1;
  }
  return {
    totalItems: detail.items.length,
    bySeverity,
    byChangeType,
    warnings: bySeverity.warning,
    errors: bySeverity.error
  };
}

export function renderReleaseNotesMarkdown(detail: ChangeSetDetail): string {
  const summary = summarizeChangeSet(detail);
  const lines = [
    `# Release Notes - ${detail.changeSet.name}`,
    "",
    `Status: ${detail.changeSet.status}`,
    `Target environment: ${detail.changeSet.targetEnvironment || "Not specified"}`,
    `Description: ${detail.changeSet.description || "No description provided."}`,
    "",
    "## Summary",
    "",
    `- Total items: ${summary.totalItems}`,
    `- Warnings: ${summary.warnings}`,
    `- Errors: ${summary.errors}`,
    "",
    "## Change Items",
    "",
    "| Change | Type | Dimension | Object | Property | Old | New | Severity |",
    "|---|---|---|---|---|---|---|---|",
    ...detail.items.map((item) => [
      "|",
      item.changeType,
      "|",
      item.itemType,
      "|",
      item.dimensionType,
      "|",
      escapeMarkdownTable(item.objectKey),
      "|",
      escapeMarkdownTable(item.propertyName),
      "|",
      escapeMarkdownTable(item.oldValue),
      "|",
      escapeMarkdownTable(item.newValue),
      "|",
      item.severity,
      "|"
    ].join(" ")),
    "",
    "## Approvals",
    "",
    ...(detail.approvals.length
      ? detail.approvals.map((approval) => `- ${approval.action} by ${approval.createdBy}: ${approval.comment || "No comment."}`)
      : ["- No approvals recorded."]),
    "",
    "## Rollback",
    "",
    "Rollback XML is not generated yet. Use the baseline snapshot and diff report to manually plan rollback steps."
  ];
  return lines.join("\n");
}

export function renderChangeSetManifest(detail: ChangeSetDetail, input: ReleasePackageManifestInput): ReleasePackageManifest {
  return {
    packageVersion: 1,
    packageName: input.packageName,
    packagePath: input.packagePath,
    mode: selectXmlExportModeForChangeSet(detail, input.mode),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    changeSet: {
      id: detail.changeSet.id,
      projectId: detail.changeSet.projectId,
      name: detail.changeSet.name,
      description: detail.changeSet.description,
      status: detail.changeSet.status,
      targetEnvironment: detail.changeSet.targetEnvironment,
      baselineId: detail.changeSet.baselineId,
      diffRunId: detail.changeSet.diffRunId
    },
    summary: summarizeChangeSet(detail),
    validationSummary: input.validationSummary,
    files: [...input.files]
  };
}

export function selectXmlExportModeForChangeSet(_detail: ChangeSetDetail, mode: ReleasePackageMode): ReleasePackageMode {
  return supportedModes.includes(mode) ? mode : "full";
}

export function renderDiffReportCsv(items: ChangeSetItemRecord[]): string {
  return toCsv(
    ["itemType", "changeType", "severity", "dimensionType", "objectKey", "propertyName", "oldValue", "newValue"],
    items.map((item) => ({
      itemType: item.itemType,
      changeType: item.changeType,
      severity: item.severity,
      dimensionType: item.dimensionType,
      objectKey: item.objectKey,
      propertyName: item.propertyName,
      oldValue: item.oldValue,
      newValue: item.newValue
    }))
  );
}

export function renderValidationReportCsv(issues: ValidationIssue[]): string {
  return toCsv(
    ["severity", "code", "entityType", "entityId", "fieldName", "rowNumber", "message"],
    issues.map((issue) => ({
      severity: issue.severity,
      code: issue.code,
      entityType: issue.entityType,
      entityId: issue.entityId,
      fieldName: issue.fieldName,
      rowNumber: issue.rowNumber ?? "",
      message: issue.message
    }))
  );
}

export function renderRollbackNotesMarkdown(detail: ChangeSetDetail): string {
  return [
    `# Rollback Notes - ${detail.changeSet.name}`,
    "",
    "Automated rollback XML is not generated in this release.",
    "",
    "Use the baseline snapshot, diff report, and exported package manifest to plan manual rollback steps before importing the release XML.",
    "",
    "High-risk items:",
    ...detail.items
      .filter((item) => item.severity !== "info")
      .map((item) => `- ${item.changeType} ${item.itemType} ${item.objectKey}${item.propertyName ? ` (${item.propertyName})` : ""}`)
  ].join("\n");
}

export function summarizeValidationIssues(issues: ValidationIssue[], blockingSeverities: Severity[]): ValidationSummary {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const infos = issues.filter((issue) => issue.severity === "info").length;
  return {
    totalIssues: issues.length,
    blockingIssues: issues.filter(isExportBlockingValidationIssue).length,
    errors,
    warnings,
    infos
  };
}

function emptySeverityCounts(): Record<Severity, number> {
  return { error: 0, warning: 0, info: 0, off: 0 };
}

function emptyChangeTypeCounts(): Record<MetadataDiffChangeType, number> {
  return { add: 0, update: 0, delete: 0, move: 0, copy: 0, unchanged: 0, warning: 0 };
}

function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  return [
    headers.map(quoteCsv).join(","),
    ...rows.map((row) => headers.map((header) => quoteCsv(normalizeCellValue(row[header]))).join(","))
  ].join("\n");
}

function quoteCsv(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function escapeMarkdownTable(value: string): string {
  return normalizeCellValue(value).replace(/\|/g, "\\|");
}
