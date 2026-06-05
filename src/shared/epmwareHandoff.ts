import type { EpmwareIntegrationConfig } from "./appConfigTypes";
import type { ChangeSetDetail, ValidationIssue } from "./types";
import type { ReadinessReport } from "./readinessScore";
import {
  csvRow,
  normalizeChange,
  stringify,
  type HandoffFile,
  type HandoffResult
} from "./handoffShared";

export interface EpmwareHandoffInput {
  detail: ChangeSetDetail;
  projectName: string;
  issues: ValidationIssue[];
  validationStatus: string;
  readiness: ReadinessReport;
  config?: EpmwareIntegrationConfig;
}

const REQUEST_COLUMNS = [
  "Application",
  "Dimension",
  "Hierarchy",
  "Node",
  "Parent",
  "Operation",
  "Property",
  "Old Value",
  "New Value",
  "Effective Date",
  "Requestor",
  "Comment",
  "Validation Status",
  "Readiness Status"
] as const;

/**
 * Build a file-based EPMware handoff package from a change set. Configurable dimension/property
 * mappings are applied; unmapped properties produce a warning instead of failing. This does NOT
 * integrate with the EPMware API.
 */
export function buildEpmwareHandoff(input: EpmwareHandoffInput): HandoffResult {
  const warnings: string[] = [];
  const cs = input.detail.changeSet;
  const config = input.config ?? {};
  const readinessStatus = `${input.readiness.score}/100 (${input.readiness.band})`;

  const mappedPropertyUsage = new Set<string>();
  const rows = input.detail.items.map((item) => {
    const change = normalizeChange(item);
    const dimension = config.dimensionMappings?.[change.dimensionType] ?? change.dimensionType;
    const node = change.itemType === "relationship" ? change.childKey : change.memberKey;
    const parent = change.parentKey;
    let property = change.propertyName;
    if (property) {
      const mapped = config.propertyMappings?.[property];
      if (mapped) {
        mappedPropertyUsage.add(property);
        property = mapped;
      } else if (config.propertyMappings && Object.keys(config.propertyMappings).length > 0) {
        warnings.push(`No EPMware property mapping for '${change.propertyName}'; source name used.`);
      }
    }
    return [
      input.projectName,
      dimension,
      dimension,
      node,
      parent,
      change.operation,
      property,
      change.oldValue,
      change.newValue,
      "",
      cs.createdBy,
      cs.description,
      input.validationStatus,
      readinessStatus
    ];
  });

  const labelFor = (col: string) => config.fieldMappings?.[col] ?? col;
  const requestCsv = [csvRow(REQUEST_COLUMNS.map(labelFor)), ...rows.map(csvRow)].join("\n");

  // Property map file: source property -> mapped property.
  const propertyMapEntries = Object.entries(config.propertyMappings ?? {});
  const propertyMapCsv = [
    csvRow(["Source Property", "EPMware Property"]),
    ...propertyMapEntries.map(([source, mapped]) => csvRow([source, mapped]))
  ].join("\n");
  if (propertyMapEntries.length === 0) {
    warnings.push("No EPMware property mappings configured; epmware-property-map.csv is empty.");
  }

  const files: HandoffFile[] = [
    { fileName: "epmware-request.csv", content: requestCsv, populated: true },
    { fileName: "epmware-property-map.csv", content: propertyMapCsv, populated: propertyMapEntries.length > 0 },
    { fileName: "epmware-summary.md", content: renderSummary(input, readinessStatus), populated: true },
    { fileName: "validation-evidence.json", content: stringify(input.issues), populated: true },
    { fileName: "readiness-report.json", content: stringify(input.readiness), populated: true },
    { fileName: "source-change-set.json", content: stringify(input.detail), populated: true },
    { fileName: "manifest.json", content: "", populated: true }
  ];

  const manifest = {
    type: "epmware-handoff",
    projectName: input.projectName,
    changeSet: cs.name,
    generatedAt: new Date().toISOString(),
    rows: rows.length,
    validationStatus: input.validationStatus,
    readinessStatus,
    files: files.map((f) => f.fileName),
    warnings,
    disclaimer: "File-based handoff for EPMware governance workflows. Not a direct EPMware API integration."
  };
  files.find((f) => f.fileName === "manifest.json")!.content = stringify(manifest);

  return { files, fileNames: files.map((f) => f.fileName), warnings };
}

function renderSummary(input: EpmwareHandoffInput, readinessStatus: string): string {
  const cs = input.detail.changeSet;
  return [
    `# EPMware Handoff - ${input.projectName}`,
    "",
    `Change set: ${cs.name}`,
    `Items: ${input.detail.items.length}`,
    `Validation status: ${input.validationStatus}`,
    `Readiness: ${readinessStatus}`,
    "",
    "This package is intended for review, mapping, or import through the EPMware governance process.",
    "It is a file-based handoff and is NOT a direct EPMware API integration."
  ].join("\n");
}
