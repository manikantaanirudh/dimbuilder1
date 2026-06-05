import type { ChangeSetDetail, ChangeSetItemRecord, ValidationIssue } from "./types";
import type { ReadinessReport } from "./readinessScore";
import { bandLabel } from "./readinessScore";
import type { XmlRoundTripCertificationReport } from "./xmlRoundTripCertification";

export interface EvidenceImpactSummary {
  id: string;
  analysisType: string;
  severity: string;
  summary: string;
  createdAt: string;
}

export interface EvidenceOptions {
  includeImpactReport: boolean;
  includeXmlCertification: boolean;
  includeSmokeTestChecklist: boolean;
  includeAcmHandoff: boolean;
  includeEpmwareHandoff: boolean;
}

export const defaultEvidenceOptions: EvidenceOptions = {
  includeImpactReport: true,
  includeXmlCertification: true,
  includeSmokeTestChecklist: true,
  includeAcmHandoff: false,
  includeEpmwareHandoff: false
};

export interface EvidenceFile {
  fileName: string;
  content: string;
  /** Whether the file carries real evidence (true) or is a "not available" note (false). */
  populated: boolean;
}

export interface EvidenceInput {
  detail: ChangeSetDetail;
  projectName: string;
  issues: ValidationIssue[];
  readiness: ReadinessReport;
  validationProfileId?: string;
  waivedIssues?: ValidationIssue[];
  certification?: XmlRoundTripCertificationReport | null;
  certificationMarkdown?: string | null;
  impact: EvidenceImpactSummary[];
  options: EvidenceOptions;
}

export interface EvidenceResult {
  files: EvidenceFile[];
  fileNames: string[];
  warnings: string[];
}

/**
 * Build a client-ready release evidence package (TASK-08).
 *
 * Required evidence is always produced. Optional evidence (impact, XML certification, handoffs)
 * is produced only when requested AND the underlying data exists; otherwise a small
 * "not available" note file is generated and a warning is recorded. The returned fileNames list
 * reflects exactly the files produced, so manifests never claim files that were not generated.
 */
export function buildReleaseEvidence(input: EvidenceInput): EvidenceResult {
  const files: EvidenceFile[] = [];
  const warnings: string[] = [];

  // Required artifacts.
  files.push({ fileName: "readiness-report.json", content: stringify(input.readiness), populated: true });
  files.push({
    fileName: "validation-report.json",
    content: stringify({
      validationProfileId: input.validationProfileId ?? "consultant-review",
      issues: input.issues
    }),
    populated: true
  });
  if ((input.waivedIssues?.length ?? 0) > 0) {
    files.push({ fileName: "waived-issues.json", content: stringify(input.waivedIssues), populated: true });
  }
  files.push({ fileName: "before-after-diff.json", content: stringify(buildBeforeAfter(input.detail.items)), populated: true });
  files.push({ fileName: "change-summary.csv", content: renderChangeSummaryCsv(input.detail.items), populated: true });
  files.push({ fileName: "approver-signoff.md", content: renderApproverSignoff(input), populated: true });

  // Optional: XML round-trip / import-readiness check.
  if (input.options.includeXmlCertification) {
    if (input.certification) {
      files.push({ fileName: "xml-round-trip-check.json", content: stringify(input.certification), populated: true });
      if (input.certificationMarkdown) {
        files.push({ fileName: "xml-round-trip-check.md", content: input.certificationMarkdown, populated: true });
      }
    } else {
      warnings.push("XML round-trip check requested but no check has been run.");
      files.push({
        fileName: "xml-round-trip-check.NOT-AVAILABLE.md",
        content: notAvailable(
          "XML round-trip / import-readiness check",
          "Run the XML round-trip check on the project, then regenerate the package."
        ),
        populated: false
      });
    }
  }

  // Optional: impact report.
  if (input.options.includeImpactReport) {
    if (input.impact.length > 0) {
      files.push({ fileName: "impact-report.json", content: stringify(input.impact), populated: true });
    } else {
      warnings.push("Impact report requested but no impact analyses are recorded.");
      files.push({
        fileName: "impact-report.NOT-AVAILABLE.md",
        content: notAvailable("Impact analysis", "Run an impact analysis on the project, then regenerate the package."),
        populated: false
      });
    }
  }

  // Optional: smoke test checklist.
  if (input.options.includeSmokeTestChecklist) {
    files.push({ fileName: "post-import-smoke-test-checklist.md", content: renderSmokeTestChecklist(input), populated: true });
  }

  // Optional: handoff stubs (full handoff packages are produced by the dedicated handoff features).
  if (input.options.includeAcmHandoff) {
    warnings.push("ACM handoff included as a summary note; use the ACM handoff feature for the full package.");
    files.push({ fileName: "acm-handoff-summary.md", content: renderHandoffSummary(input, "ACM"), populated: true });
  }
  if (input.options.includeEpmwareHandoff) {
    warnings.push("EPMware handoff included as a summary note; use the EPMware handoff feature for the full package.");
    files.push({ fileName: "epmware-handoff-summary.md", content: renderHandoffSummary(input, "EPMware"), populated: true });
  }

  // Top-level evidence summary.
  files.unshift({ fileName: "release-summary.md", content: renderReleaseSummary(input, files, warnings), populated: true });

  return { files, fileNames: files.map((f) => f.fileName), warnings };
}

function buildBeforeAfter(items: ChangeSetItemRecord[]) {
  return items.map((item) => ({
    dimensionType: item.dimensionType,
    objectKey: item.objectKey,
    itemType: item.itemType,
    changeType: item.changeType,
    propertyName: item.propertyName,
    before: item.oldValue,
    after: item.newValue,
    severity: item.severity
  }));
}

function renderChangeSummaryCsv(items: ChangeSetItemRecord[]): string {
  const header = "changeType,itemType,dimensionType,objectKey,propertyName,before,after,severity";
  const rows = items.map((i) =>
    [i.changeType, i.itemType, i.dimensionType, i.objectKey, i.propertyName, i.oldValue, i.newValue, i.severity]
      .map(csvCell)
      .join(",")
  );
  return [header, ...rows].join("\n");
}

function renderApproverSignoff(input: EvidenceInput): string {
  const cs = input.detail.changeSet;
  return [
    `# Approver Sign-off - ${input.projectName}`,
    "",
    `Change set: ${cs.name}`,
    `Target environment: ${cs.targetEnvironment || "(unspecified)"}`,
    `Readiness score: ${input.readiness.score}/100 (${bandLabel(input.readiness.band)})`,
    "",
    "## Review checklist",
    "",
    "- [ ] Change summary reviewed (`change-summary.csv`).",
    "- [ ] Validation report reviewed (`validation-report.json`).",
    "- [ ] Readiness report reviewed (`readiness-report.json`).",
    "- [ ] XML round-trip check reviewed (if included).",
    "- [ ] Impact report reviewed (if included).",
    "- [ ] Rollback plan reviewed (`rollback-instructions.md`).",
    "",
    "## Sign-off",
    "",
    "| Role | Name | Decision | Date |",
    "|---|---|---|---|",
    "| Preparer |  | Approve / Reject |  |",
    "| Reviewer |  | Approve / Reject |  |",
    "| Approver |  | Approve / Reject |  |",
    "",
    "> This package supports internal review and handoff. It does not deploy to OneStream directly."
  ].join("\n");
}

function renderSmokeTestChecklist(input: EvidenceInput): string {
  return [
    `# Post-Import Smoke Test Checklist - ${input.projectName}`,
    "",
    "Run these checks in the target OneStream environment after importing the metadata.",
    "",
    "- [ ] All expected dimensions imported.",
    "- [ ] Member counts match the change summary.",
    "- [ ] Hierarchy parent-child counts match expectations.",
    "- [ ] A sample Cube View opens without error.",
    "- [ ] A sample consolidation/calculation runs (if applicable).",
    "- [ ] Security and maintenance groups resolve (if included in scope).",
    "- [ ] No unexpected validation errors after import.",
    "",
    "> This checklist is guidance for the OneStream administrator. The tool does not execute these checks."
  ].join("\n");
}

function renderHandoffSummary(input: EvidenceInput, target: "ACM" | "EPMware"): string {
  return [
    `# ${target} Handoff Summary - ${input.projectName}`,
    "",
    `Change set: ${input.detail.changeSet.name}`,
    `Items: ${input.detail.items.length}`,
    "",
    `This is a summary note. Generate the full ${target} handoff package from the dedicated ${target} handoff feature for mapping-ready output.`,
    "",
    "> This tool prepares a handoff package; it does not write to " + target + " directly."
  ].join("\n");
}

function renderReleaseSummary(input: EvidenceInput, files: EvidenceFile[], warnings: string[]): string {
  const cs = input.detail.changeSet;
  const lines = [
    `# Release Evidence Package - ${input.projectName}`,
    "",
    `Change set: ${cs.name}`,
    `Status: ${cs.status}`,
    `Generated: ${new Date().toISOString()}`,
    `Readiness: ${input.readiness.score}/100 (${bandLabel(input.readiness.band)})`,
    "",
    "## Contents",
    "",
    ...files.map((f) => `- \`${f.fileName}\`${f.populated ? "" : " (not available)"}`),
    ""
  ];
  if (warnings.length > 0) {
    lines.push("## Warnings", "", ...warnings.map((w) => `- ${w}`), "");
  }
  lines.push("> Internal evidence package for review and handoff. It does not deploy to OneStream directly.");
  return lines.join("\n");
}

function notAvailable(label: string, action: string): string {
  return [`# ${label} - Not Available`, "", `${label} was requested but the underlying data is not present.`, "", `Action: ${action}`].join("\n");
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function csvCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function parseEvidenceOptions(source: unknown): EvidenceOptions {
  const record = (source && typeof source === "object" ? source : {}) as Record<string, unknown>;
  const flag = (key: keyof EvidenceOptions, fallback: boolean) =>
    typeof record[key] === "boolean" ? (record[key] as boolean) : fallback;
  return {
    includeImpactReport: flag("includeImpactReport", defaultEvidenceOptions.includeImpactReport),
    includeXmlCertification: flag("includeXmlCertification", defaultEvidenceOptions.includeXmlCertification),
    includeSmokeTestChecklist: flag("includeSmokeTestChecklist", defaultEvidenceOptions.includeSmokeTestChecklist),
    includeAcmHandoff: flag("includeAcmHandoff", defaultEvidenceOptions.includeAcmHandoff),
    includeEpmwareHandoff: flag("includeEpmwareHandoff", defaultEvidenceOptions.includeEpmwareHandoff)
  };
}
