import type { ClientAppConfig, ExportConfig } from "../../shared/appConfigTypes";
import { getDimensionDisplayLabel, getDimensionDisplaySubtitle } from "../../shared/dimensionDisplay";
import type { DimensionRecord, Severity, ValidationIssue } from "../../shared/types";

export interface IssueSummary {
  errors: number;
  warnings: number;
  infos: number;
  total: number;
  blocksExport: boolean;
}

export interface ExportAvailability {
  disabled: boolean;
  title: string;
  reason: string;
}

export interface ExportFormatLink {
  key: "xml" | "xlsx" | "csvMembers" | "csvRelationships" | "json";
  label: string;
  hrefSuffix: string;
}

type FactTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface WorkspaceTabItem {
  label: "Overview" | "Members" | "Relationships" | "Hierarchy" | "XML" | "Issues";
}

export interface DimensionNavItem {
  id: string;
  label: string;
  subtitle: string;
  dimension: DimensionRecord;
  issueSummary: IssueSummary;
}

export interface DimensionFact {
  label: string;
  value: string;
  tone?: FactTone;
}

export function buildIssueSummary(
  issues: ValidationIssue[],
  blockedSeverities: Severity[],
  dimensionId?: string
): IssueSummary {
  const scopedIssues = dimensionId ? issues.filter((issue) => issue.dimensionId === dimensionId) : issues;
  const errors = scopedIssues.filter((issue) => issue.severity === "error").length;
  const warnings = scopedIssues.filter((issue) => issue.severity === "warning").length;
  const infos = scopedIssues.filter((issue) => issue.severity === "info").length;

  return {
    errors,
    warnings,
    infos,
    total: scopedIssues.length,
    blocksExport: scopedIssues.some((issue) => blockedSeverities.includes(issue.severity))
  };
}

export function getEnabledExportFormats(exportConfig: ExportConfig): ExportFormatLink[] {
  const formats: ExportFormatLink[] = [];
  if (exportConfig.xml.enabled) formats.push({ key: "xml", label: "OneStream XML", hrefSuffix: "xml" });
  if (exportConfig.xlsx.enabled) formats.push({ key: "xlsx", label: "Workbook XLSX", hrefSuffix: "xlsx" });
  if (exportConfig.csv.enabled) {
    formats.push({ key: "csvMembers", label: "Members CSV", hrefSuffix: "members.csv" });
    formats.push({ key: "csvRelationships", label: "Relationships CSV", hrefSuffix: "relationships.csv" });
  }
  if (exportConfig.json.enabled) formats.push({ key: "json", label: "JSON Backup", hrefSuffix: "json" });
  return formats;
}

export function getExportAvailability({
  projectId,
  exportConfig,
  issues,
  blockedSeverities
}: {
  projectId: string | null;
  exportConfig: ExportConfig;
  issues: ValidationIssue[];
  blockedSeverities: Severity[];
}): ExportAvailability {
  if (!projectId) {
    return { disabled: true, title: "Import a project before exporting", reason: "No project imported" };
  }

  if (getEnabledExportFormats(exportConfig).length === 0) {
    return { disabled: true, title: "Exports are disabled by configuration", reason: "No export formats enabled" };
  }

  if (issues.some((issue) => blockedSeverities.includes(issue.severity))) {
    return { disabled: true, title: "Resolve blocking validation issues before exporting", reason: "Blocking validation issues" };
  }

  return { disabled: false, title: "Export metadata", reason: "Ready to export" };
}

export function getWorkspaceTabs(xmlPreviewEnabled: boolean): WorkspaceTabItem[] {
  const tabs: WorkspaceTabItem[] = [
    { label: "Overview" },
    { label: "Members" },
    { label: "Relationships" },
    { label: "Hierarchy" }
  ];
  if (xmlPreviewEnabled) tabs.push({ label: "XML" });
  tabs.push({ label: "Issues" });
  return tabs;
}

export function resolveActiveDimensionId(activeDimensionId: string | null, dimensions: DimensionRecord[]): string | null {
  if (activeDimensionId && dimensions.some((dimension) => dimension.id === activeDimensionId)) {
    return activeDimensionId;
  }
  return dimensions[0]?.id ?? null;
}

export function filterDimensionNavItems(items: DimensionNavItem[], query: string): DimensionNavItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => {
    const dimension = item.dimension;
    return [
      item.label,
      item.subtitle,
      dimension.dimensionType,
      dimension.dimensionName,
      dimension.sheetName
    ].some((value) => value.toLowerCase().includes(needle));
  });
}

export function getReadinessLabel(summary: IssueSummary): "Ready" | "Needs review" | "Export blocked" {
  if (summary.blocksExport) return "Export blocked";
  if (summary.total > 0) return "Needs review";
  return "Ready";
}

export function buildDimensionFacts(dimension: DimensionRecord, issueSummary: IssueSummary): DimensionFact[] {
  const facts: DimensionFact[] = [
    { label: "Type", value: dimension.dimensionType },
    { label: "Sheet", value: dimension.sheetName }
  ];

  if (dimension.accessGroup) facts.push({ label: "Access", value: dimension.accessGroup });
  if (dimension.maintenanceGroup) facts.push({ label: "Maintenance", value: dimension.maintenanceGroup });
  if (dimension.inheritedDimension) facts.push({ label: "Inherits", value: dimension.inheritedDimension });

  facts.push(
    { label: "Errors", value: String(issueSummary.errors), tone: issueSummary.errors > 0 ? "danger" : "neutral" },
    { label: "Warnings", value: String(issueSummary.warnings), tone: issueSummary.warnings > 0 ? "warning" : "neutral" }
  );

  return facts;
}

export function buildDimensionNavItems(
  dimensions: DimensionRecord[],
  issues: ValidationIssue[],
  displayConfig: ClientAppConfig["dimensions"]["display"],
  blockedSeverities: Severity[]
): DimensionNavItem[] {
  return dimensions.map((dimension) => ({
    id: dimension.id,
    label: getDimensionDisplayLabel(dimension, displayConfig),
    subtitle: getDimensionDisplaySubtitle(dimension, displayConfig),
    dimension,
    issueSummary: buildIssueSummary(issues, blockedSeverities, dimension.id)
  }));
}

export function formatCount(value: number): string {
  if (Math.abs(value) < 1000) return String(value);
  const rounded = Math.round((value / 1000) * 10) / 10;
  return `${rounded.toFixed(Number.isInteger(rounded) ? 0 : 1)}k`;
}
