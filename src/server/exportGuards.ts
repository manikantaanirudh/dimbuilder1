import type { Response } from "express";
import type { AppConfig } from "../shared/appConfigTypes";
import { ExportLimitError } from "../shared/exportLimits";
import type { Severity, ValidationIssue } from "../shared/types";
import type { Repositories } from "./db/repositories";

export interface ExportGuardOptions {
  exportType: string;
  bypassRequested?: boolean;
  bypassReason?: string;
}

export interface ExportBlockedResponse {
  error: string;
  blocked: true;
  blockedSeverities: Severity[];
  issueCounts: Record<Severity, number>;
  bypassAllowed: boolean;
  validationRequired?: boolean;
}

export class ExportGuardError extends Error {
  readonly status = 409;
  readonly payload: ExportBlockedResponse;

  constructor(payload: ExportBlockedResponse) {
    super(payload.error);
    this.payload = payload;
  }
}

export async function assertProjectCanExport(
  projectId: string,
  config: AppConfig,
  repos: Repositories,
  options: ExportGuardOptions
): Promise<void> {
  const blockedSeverities = uniqueSeverities(config.validation.exportBlockedBySeverities);
  const issues = await repos.issues.listValidationIssuesForProject(projectId);
  const issueCounts = countIssuesBySeverity(issues);
  const bypassAllowed = config.export.allowValidationBypass === true;

  const hasValidationRun = await repos.issues.hasValidationRun(projectId) || issues.length > 0;
  if (config.export.requireValidationBeforeExport === true && !hasValidationRun) {
    throw new ExportGuardError({
      error: "Validation must run before export",
      blocked: true,
      blockedSeverities,
      issueCounts,
      bypassAllowed,
      validationRequired: true
    });
  }

  const hasBlockingIssues = await repos.issues.hasBlockingValidationIssues(projectId, blockedSeverities);
  if (!hasBlockingIssues) return;

  if (bypassAllowed && options.bypassRequested) {
    const reason = String(options.bypassReason ?? "").trim();
    if (config.export.validationBypassRequiresReason !== false && !reason) {
      throw new ExportGuardError({
        error: "Validation bypass reason is required",
        blocked: true,
        blockedSeverities,
        issueCounts,
        bypassAllowed
      });
    }
    await repos.audit.record({
      projectId,
      action: "export.validationBypass",
      entityType: "project",
      entityId: projectId,
      after: {
        exportType: options.exportType,
        reason,
        blockedSeverities,
        issueCounts
      }
    });
    return;
  }

  throw new ExportGuardError({
    error: "Export blocked by validation issues",
    blocked: true,
    blockedSeverities,
    issueCounts,
    bypassAllowed
  });
}

export async function assertDimensionCanExport(
  projectId: string,
  dimensionId: string,
  config: AppConfig,
  repos: Repositories,
  options: ExportGuardOptions
): Promise<void> {
  const blockedSeverities = uniqueSeverities(config.validation.exportBlockedBySeverities);
  const allIssues = await repos.issues.listValidationIssuesForProject(projectId);
  const dimensionIssues = allIssues.filter((issue) => issue.dimensionId === dimensionId);
  const issueCounts = countIssuesBySeverity(dimensionIssues);
  const bypassAllowed = config.export.allowValidationBypass === true;

  const hasValidationRun = await repos.issues.hasValidationRun(projectId) || allIssues.length > 0;
  if (config.export.requireValidationBeforeExport === true && !hasValidationRun) {
    throw new ExportGuardError({
      error: "Validation must run before export",
      blocked: true,
      blockedSeverities,
      issueCounts,
      bypassAllowed,
      validationRequired: true
    });
  }

  const hasBlockingIssues = dimensionIssues.some((issue) => blockedSeverities.includes(issue.severity));
  if (!hasBlockingIssues) return;

  if (bypassAllowed && options.bypassRequested) {
    const reason = String(options.bypassReason ?? "").trim();
    if (config.export.validationBypassRequiresReason !== false && !reason) {
      throw new ExportGuardError({
        error: "Validation bypass reason is required",
        blocked: true,
        blockedSeverities,
        issueCounts,
        bypassAllowed
      });
    }
    await repos.audit.record({
      projectId,
      action: "export.validationBypass",
      entityType: "dimension",
      entityId: dimensionId,
      after: { exportType: options.exportType, reason, blockedSeverities, issueCounts }
    });
    return;
  }

  throw new ExportGuardError({
    error: "Export blocked by dimension validation issues",
    blocked: true,
    blockedSeverities,
    issueCounts,
    bypassAllowed
  });
}

export function sendExportGuardError(res: Response, error: unknown): boolean {
  if (!(error instanceof ExportGuardError)) return false;
  res.status(error.status).json(error.payload);
  return true;
}

export function sendExportLimitError(res: Response, error: unknown): boolean {
  if (!(error instanceof ExportLimitError)) return false;
  res.status(error.status).json(error.payload);
  return true;
}

export function parseExportGuardOptions(source: Record<string, unknown>, exportType: string): ExportGuardOptions {
  return {
    exportType,
    bypassRequested: isTruthyFlag(source.validationBypass) || isTruthyFlag(source.bypassValidation),
    bypassReason: optionalString(source.validationBypassReason) ?? optionalString(source.bypassReason)
  };
}

function countIssuesBySeverity(issues: ValidationIssue[]): Record<Severity, number> {
  return {
    error: issues.filter((issue) => issue.severity === "error").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
    off: 0
  };
}

function uniqueSeverities(values: Severity[]): Severity[] {
  const seen = new Set<Severity>();
  return values.filter((severity) => {
    if (seen.has(severity)) return false;
    seen.add(severity);
    return true;
  });
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
