import { CheckCircle2, Download, FileText, FileUp, PlusCircle, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import type { ExportLoadMode, ProjectRecord } from "../../shared/types";
import type { RelationshipOperationPlan } from "../../shared/relationshipOperations";
import { getEnabledExportFormats, type ExportAvailability, type ExportFormatLink } from "../ui/viewModel";
import type { DimensionType } from "../../shared/types";
import {
  commitCsvImport,
  createProject,
  createProjectSnapshot,
  deleteProject,
  inspectCsvImport,
  planRelationshipExport,
  previewCsvImport,
  uploadWorkbook,
  uploadXml,
  type MetadataCsvPreviewResponse
} from "../api/client";
import { onActivate } from "../hooks/keyboardActivate";
import type { MetadataCsvColumnMapping } from "../../shared/metadataCsvMapping";
import { CsvColumnMappingPanel } from "./CsvColumnMappingPanel";
import { ActionButton, ActionLink, StatusBadge } from "./ui";

export function hasEnabledExportFormat(exportConfig: ClientAppConfig["export"]): boolean {
  return exportConfig.xml.enabled
    || exportConfig.xlsx.enabled
    || exportConfig.csv.enabled
    || exportConfig.json.enabled;
}

export function CreateProjectModal({
  open,
  onClose,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (projectId: string) => void;
}) {
  const [name, setName] = useState("New Metadata Project");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("New Metadata Project");
      setDescription("");
      setStatus("");
      setIsCreating(false);
    }
  }, [open]);

  if (!open) return null;

  async function createBlankProject() {
    if (isCreating) return;
    setIsCreating(true);
    setStatus("Creating project from configured dimension blueprints...");
    try {
      const project = await createProject({ name, description });
      setStatus("Project created");
      onCreated(project.id);
      onClose();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Project creation failed");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-project-modal-title">
        <div className="modal-heading">
          <h2 id="create-project-modal-title">New metadata project</h2>
        </div>
        <p>Create a blank project from the dimension blueprints in the central configuration.</p>
        <label className="modal-field">
          <span>Project name</span>
          <input value={name} disabled={isCreating} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="modal-field">
          <span>Description</span>
          <textarea value={description} disabled={isCreating} onChange={(event) => setDescription(event.target.value)} />
        </label>
        {status && <div className="modal-status">{status}</div>}
        <div className="modal-actions">
          <ActionButton disabled={isCreating} onClick={onClose}>Cancel</ActionButton>
          <ActionButton variant="primary" disabled={isCreating} onClick={() => void createBlankProject()}>
            <PlusCircle size={15} /> {isCreating ? "Creating..." : "Create Project"}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

export function ImportModal({
  open,
  onClose,
  onImported,
  projects,
  selectedProjectId,
  enabledDimensionTypes
}: {
  open: boolean;
  onClose: () => void;
  onImported: (projectId: string) => void;
  projects: ProjectRecord[];
  selectedProjectId: string | null;
  enabledDimensionTypes: DimensionType[];
}) {
  const [importMode, setImportMode] = useState<"xlsx" | "xml" | "csv">("xlsx");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [importedProject, setImportedProject] = useState<ProjectRecord | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [csvTarget, setCsvTarget] = useState<"new" | "existing">("new");
  const [csvProjectId, setCsvProjectId] = useState<string>("");
  const [csvProjectName, setCsvProjectName] = useState("");
  const [csvDimensionType, setCsvDimensionType] = useState<DimensionType>(enabledDimensionTypes[0] ?? "Account");
  const [csvDimensionName, setCsvDimensionName] = useState("Accounts");
  const [csvDefaultAccountType, setCsvDefaultAccountType] = useState("Expense");
  const [csvPreview, setCsvPreview] = useState<MetadataCsvPreviewResponse["preview"] | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvMapping, setCsvMapping] = useState<MetadataCsvColumnMapping | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setImportMode("xlsx");
      setStatus("");
      setImportedProject(null);
      setSummary(null);
      setIsImporting(false);
      setCsvTarget("new");
      setCsvProjectId(selectedProjectId ?? "");
      setCsvProjectName("");
      setCsvDimensionType(enabledDimensionTypes[0] ?? "Account");
      setCsvDimensionName("Accounts");
      setCsvDefaultAccountType("Expense");
      setCsvPreview(null);
      setCsvHeaders([]);
      setCsvMapping(null);
      setIsPreviewing(false);
      setIsInspecting(false);
    }
  }, [open, selectedProjectId, enabledDimensionTypes]);

  if (!open) return null;

  async function inspectCsvFile(nextFile: File, dimensionType: DimensionType = csvDimensionType) {
    setIsInspecting(true);
    setStatus("Reading CSV columns...");
    try {
      const inspection = await inspectCsvImport(nextFile, { dimensionType });
      setCsvHeaders(inspection.headers);
      setCsvMapping(inspection.suggestedMapping);
      setStatus(`Found ${inspection.headers.length} columns in ${inspection.rowCount} rows. Review mapping, then preview.`);
    } catch (caught) {
      setCsvHeaders([]);
      setCsvMapping(null);
      setStatus(caught instanceof Error ? caught.message : "Could not read CSV columns");
    } finally {
      setIsInspecting(false);
    }
  }

  function handleFileChange(nextFile: File | null) {
    if (isImporting || isPreviewing || isInspecting) return;
    setFile(nextFile);
    setStatus("");
    setCsvPreview(null);
    setCsvHeaders([]);
    setCsvMapping(null);
    if (nextFile && importMode === "csv") {
      void inspectCsvFile(nextFile);
    }
  }

  function selectImportMode(nextMode: "xlsx" | "xml" | "csv") {
    if (isImporting || importedProject || isPreviewing) return;
    setImportMode(nextMode);
    setFile(null);
    setStatus("");
    setSummary(null);
    setCsvPreview(null);
    setCsvHeaders([]);
    setCsvMapping(null);
  }

  async function refreshCsvMappingForDimensionType(nextType: DimensionType) {
    if (!file) return;
    setCsvPreview(null);
    await inspectCsvFile(file, nextType);
  }

  function csvFormFields() {
    return {
      projectId: csvTarget === "existing" ? csvProjectId : undefined,
      projectName: csvTarget === "new" ? csvProjectName : undefined,
      dimensionType: csvDimensionType,
      dimensionName: csvDimensionName,
      defaultAccountType: csvDimensionType === "Account" ? csvDefaultAccountType : undefined,
      columnMapping: csvMapping ?? undefined
    };
  }

  async function previewSelectedCsv() {
    if (!file || isImporting || isPreviewing) return;
    if (!csvMapping?.member) {
      setStatus("Map a Member key column before preview.");
      return;
    }
    setIsPreviewing(true);
    setStatus("Previewing CSV...");
    try {
      const result = await previewCsvImport(file, csvFormFields());
      setCsvPreview(result.preview);
      setStatus(result.preview.ok ? "Preview ready — review counts before commit." : "Preview found blocking errors.");
    } catch (caught) {
      setCsvPreview(null);
      setStatus(caught instanceof Error ? caught.message : "Preview failed");
    } finally {
      setIsPreviewing(false);
    }
  }

  function handleClose() {
    if (!isImporting) onClose();
  }

  async function importSelectedFile() {
    if (!file || isImporting) return;
    if (importMode === "csv") {
      if (!csvPreview?.ok) {
        setStatus("Run a successful preview before commit.");
        return;
      }
      setStatus("Committing CSV metadata...");
      setIsImporting(true);
      try {
        const result = await commitCsvImport(file, csvFormFields());
        setImportedProject(result.project);
        setSummary(result.importSummary);
        setStatus(`Imported ${String(result.importSummary.membersImported ?? 0)} members`);
        onImported(result.project.id);
      } catch (caught) {
        setStatus(caught instanceof Error ? caught.message : "CSV import failed");
      } finally {
        setIsImporting(false);
      }
      return;
    }

    setStatus(importMode === "xlsx" ? "Seeding project from file..." : "Importing editable OneStream metadata XML...");
    setIsImporting(true);
    try {
      const defaultProjectName = file.name.replace(importMode === "xlsx" ? /\.xlsx$/i : /\.xml$/i, "");
      const result = importMode === "xlsx"
        ? await uploadWorkbook(file, defaultProjectName)
        : await uploadXml(file, defaultProjectName);
      setImportedProject(result.project);
      setSummary(result.importSummary);
      setStatus(`${importMode === "xlsx" ? "Seeded" : "Imported"} ${String(result.importSummary.dimensionsImported)} dimensions`);
      onImported(result.project.id);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="import-modal-title">
        <div className="modal-heading">
          <h2 id="import-modal-title">Import metadata</h2>
          {importedProject ? <StatusBadge tone="success"><CheckCircle2 size={14} /> {importMode === "xlsx" ? "Seeded" : "Imported"}</StatusBadge> : null}
        </div>
        <p>Seed from file, import OneStream XML, or import a simple parent-child CSV with preview-before-commit.</p>
        {!importedProject && (
          <>
            <div className="import-mode-selector" role="tablist" aria-label="Import source">
              <ActionButton
                className="import-mode-button"
                variant={importMode === "xlsx" ? "primary" : "secondary"}
                aria-selected={importMode === "xlsx"}
                onClick={() => selectImportMode("xlsx")}
              >
                <FileUp size={15} /> Seed from file
              </ActionButton>
              <ActionButton
                className="import-mode-button"
                variant={importMode === "xml" ? "primary" : "secondary"}
                aria-selected={importMode === "xml"}
                onClick={() => selectImportMode("xml")}
              >
                <FileText size={15} /> Import XML
              </ActionButton>
              <ActionButton
                className="import-mode-button"
                variant={importMode === "csv" ? "primary" : "secondary"}
                aria-selected={importMode === "csv"}
                onClick={() => selectImportMode("csv")}
              >
                <FileText size={15} /> Import CSV
              </ActionButton>
            </div>
            <p className="import-mode-description">
              {importMode === "xlsx"
                ? "Select an optional .xlsx OneStream metadata workbook to seed a project. Generated XML and formula columns are ignored."
                : importMode === "xml"
                  ? "Upload OneStream metadata XML to create an editable project while preserving unknown XML fields for export."
                  : "Upload CSV metadata, map file columns to dimension fields, preview counts, then commit. Existing projects are append/update only."}
            </p>
            {importMode === "csv" && (
              <div className="import-csv-panel">
                <label className="modal-field">
                  <span>Target</span>
                  <select
                    value={csvTarget}
                    disabled={isImporting || isPreviewing}
                    onChange={(event) => {
                      setCsvTarget(event.target.value as "new" | "existing");
                      setCsvPreview(null);
                    }}
                  >
                    <option value="new">New project</option>
                    <option value="existing">Existing project</option>
                  </select>
                </label>
                {csvTarget === "new" ? (
                  <label className="modal-field">
                    <span>Project name</span>
                    <input
                      value={csvProjectName}
                      disabled={isImporting || isPreviewing}
                      placeholder="Defaults to CSV file name"
                      onChange={(event) => { setCsvProjectName(event.target.value); setCsvPreview(null); }}
                    />
                  </label>
                ) : (
                  <label className="modal-field">
                    <span>Project</span>
                    <select
                      value={csvProjectId}
                      disabled={isImporting || isPreviewing}
                      onChange={(event) => { setCsvProjectId(event.target.value); setCsvPreview(null); }}
                    >
                      <option value="">Select a project</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>{project.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="modal-field">
                  <span>Default dimension type</span>
                  <select
                    value={csvDimensionType}
                    disabled={isImporting || isPreviewing}
                    onChange={(event) => {
                      const nextType = event.target.value as DimensionType;
                      setCsvDimensionType(nextType);
                      setCsvPreview(null);
                      void refreshCsvMappingForDimensionType(nextType);
                    }}
                  >
                    {enabledDimensionTypes.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label className="modal-field">
                  <span>Default dimension name</span>
                  <input
                    value={csvDimensionName}
                    disabled={isImporting || isPreviewing}
                    onChange={(event) => { setCsvDimensionName(event.target.value); setCsvPreview(null); }}
                  />
                </label>
                {csvDimensionType === "Account" ? (
                  <label className="modal-field">
                    <span>Default account type</span>
                    <select
                      value={csvDefaultAccountType}
                      disabled={isImporting || isPreviewing || isInspecting}
                      onChange={(event) => { setCsvDefaultAccountType(event.target.value); setCsvPreview(null); }}
                    >
                      {["Expense", "Revenue", "Asset", "Liability", "Balance", "Flow", "Statistical", "NonFinancial"].map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {file && csvMapping && csvHeaders.length > 0 ? (
                  <CsvColumnMappingPanel
                    headers={csvHeaders}
                    mapping={csvMapping}
                    dimensionType={csvDimensionType}
                    disabled={isImporting || isPreviewing || isInspecting}
                    onChange={(next) => {
                      setCsvMapping(next);
                      setCsvPreview(null);
                    }}
                  />
                ) : null}
              </div>
            )}
            <input
              type="file"
              accept={importMode === "xlsx" ? ".xlsx" : importMode === "xml" ? ".xml,application/xml,text/xml" : ".csv,.txt,.tsv,text/csv,text/plain"}
              disabled={isImporting || isPreviewing || isInspecting}
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            />
            {importMode === "csv" && csvPreview && (
              <div className="import-summary import-csv-preview">
                <span><b>{csvPreview.counts.rowCount}</b> rows</span>
                <span><b>{csvPreview.counts.dimensionsToCreate}</b> new dimensions</span>
                <span><b>{csvPreview.counts.membersToCreate}</b> new members</span>
                <span><b>{csvPreview.counts.membersToUpdate}</b> member updates</span>
                <span><b>{csvPreview.counts.relationshipsToCreate}</b> new relationships</span>
                {csvPreview.counts.relationshipsSkipped > 0 ? (
                  <span><b>{csvPreview.counts.relationshipsSkipped}</b> relationships skipped</span>
                ) : null}
              </div>
            )}
            {importMode === "csv" && csvPreview && csvPreview.warnings.length > 0 && (
              <div className="modal-status">
                {csvPreview.warnings.map((warning) => <div key={warning}>{warning}</div>)}
              </div>
            )}
            {importMode === "csv" && csvPreview && csvPreview.errors.length > 0 && (
              <div className="banner error">
                <p style={{ margin: "0 0 6px", fontWeight: 600 }}>
                  Commit is blocked until these rows are fixed in the CSV (or removed). Warnings above do not block commit.
                </p>
                {csvPreview.errors.map((error) => <div key={error}>{error}</div>)}
              </div>
            )}
            {importMode === "csv" && csvPreview?.ok && csvPreview.counts.membersToCreate === 0 && csvPreview.counts.membersToUpdate === 0 && csvPreview.counts.relationshipsToCreate === 0 && (
              <div className="banner">
                Preview succeeded but nothing new would be written. The target dimension may already contain these members and relationships, or the dimension name/type does not match an existing dimension.
              </div>
            )}
          </>
        )}
        {summary && (
          <div className="import-summary">
            <span><b>{String(summary.dimensionsImported ?? 0)}</b> dimensions</span>
            <span><b>{String(summary.membersImported ?? 0)}</b> members</span>
            <span><b>{String(summary.relationshipsImported ?? 0)}</b> relationships</span>
            {summary.unknownAttributesPreserved !== undefined ? <span><b>{String(summary.unknownAttributesPreserved)}</b> unknown attrs</span> : null}
            {summary.unknownPropertiesPreserved !== undefined ? <span><b>{String(summary.unknownPropertiesPreserved)}</b> unknown props</span> : null}
            {summary.unknownElementsPreserved !== undefined ? <span><b>{String(summary.unknownElementsPreserved)}</b> elements kept</span> : null}
          </div>
        )}
        {status && <div className="modal-status">{status}</div>}
        <div className="modal-actions">
          <ActionButton disabled={isImporting} onClick={handleClose}>{importedProject ? "Done" : "Cancel"}</ActionButton>
          {!importedProject && importMode === "csv" && (
            <ActionButton
              variant="secondary"
              disabled={!file || !csvMapping?.member || isImporting || isPreviewing || isInspecting || (csvTarget === "existing" && !csvProjectId)}
              onClick={() => void previewSelectedCsv()}
            >
              {isPreviewing ? "Previewing..." : isInspecting ? "Reading file..." : "Preview CSV"}
            </ActionButton>
          )}
          {!importedProject && (
            <ActionButton
              variant="primary"
              disabled={
                !file
                || isImporting
                || isPreviewing
                || (importMode === "csv" && (!csvPreview?.ok || (csvTarget === "existing" && !csvProjectId)))
              }
              onClick={() => void importSelectedFile()}
            >
              {importMode === "xlsx" ? <FileUp size={15} /> : <FileText size={15} />}
              {isImporting
                ? (importMode === "csv" ? "Committing..." : importMode === "xlsx" ? "Seeding..." : "Importing...")
                : (importMode === "csv" ? "Commit CSV" : importMode === "xlsx" ? "Seed Project" : "Import Project")}
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );
}

export function ExportModal({
  open,
  onClose,
  projectId,
  appConfig,
  exportAvailability
}: {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  appConfig: ClientAppConfig;
  exportAvailability: ExportAvailability;
}) {
  const [loadMode, setLoadMode] = useState<ExportLoadMode>("full");
  const [relationshipPlan, setRelationshipPlan] = useState<RelationshipOperationPlan | null>(null);
  const [planStatus, setPlanStatus] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [bypassValidation, setBypassValidation] = useState(false);
  const [bypassReason, setBypassReason] = useState("");

  useEffect(() => {
    if (!open) {
      setExportStatus("");
      setIsExporting(false);
      setBypassValidation(false);
      setBypassReason("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !projectId || loadMode === "full") {
      setRelationshipPlan(null);
      setPlanStatus("");
      return;
    }

    let cancelled = false;
    setPlanStatus("Planning relationship impact...");
    void planRelationshipExport(projectId, { mode: loadMode })
      .then((plan) => {
        if (cancelled) return;
        setRelationshipPlan(plan);
        setPlanStatus("");
      })
      .catch((caught) => {
        if (cancelled) return;
        setRelationshipPlan(null);
        setPlanStatus(caught instanceof Error ? caught.message : "Relationship planning failed");
      });

    return () => {
      cancelled = true;
    };
  }, [open, projectId, loadMode]);

  if (!open) return null;
  const prefix = projectId ? `/api/export/${projectId}` : "#";
  const formats = getEnabledExportFormats(appConfig.export);
  const disabled = exportAvailability.disabled;
  const bypassAllowed = appConfig.export.allowValidationBypass === true;
  const bypassCanAttempt = bypassAllowed && bypassValidation && exportAvailability.reason === "Blocking validation issues";
  const loadModeOptions: Array<{ value: ExportLoadMode; label: string }> = [
    { value: "full", label: "Full XML" },
    { value: "additive", label: "Additive" },
    { value: "propertyUpdate", label: "Property update" },
    { value: "relationshipDelete", label: "Relationship delete" },
    { value: "moveCopy", label: "Move/copy" },
    { value: "breakBuild", label: "Break/build" }
  ];

  function hrefFor(format: ExportFormatLink) {
    const params = new URLSearchParams();
    if (format.key === "xml") params.set("mode", loadMode);
    if (bypassAllowed && bypassValidation) {
      params.set("validationBypass", "true");
      if (bypassReason.trim()) params.set("validationBypassReason", bypassReason.trim());
    }
    const query = params.toString();
    if (format.key !== "xml") return `${prefix}/${format.hrefSuffix}${query ? `?${query}` : ""}`;
    return `${prefix}/${format.hrefSuffix}?${query}`;
  }

  async function handleExportClick(event: MouseEvent<HTMLAnchorElement>, format: ExportFormatLink, linkDisabled: boolean) {
    if (linkDisabled) {
      event.preventDefault();
      return;
    }
    if (bypassAllowed && bypassValidation && appConfig.export.validationBypassRequiresReason !== false && !bypassReason.trim()) {
      event.preventDefault();
      setExportStatus("Enter a validation bypass reason before exporting.");
      return;
    }

    event.preventDefault();
    setIsExporting(true);
    setExportStatus(`Preparing ${format.label}...`);
    try {
      const response = await fetch(hrefFor(format));
      if (response.status === 409) {
        setExportStatus(formatExportBlockMessage(await readJsonSafely(response)));
        return;
      }
      if (!response.ok) {
        setExportStatus(await response.text());
        return;
      }
      const blob = await response.blob();
      triggerBrowserDownload(blob, downloadFileName(format));
      setExportStatus(`${format.label} ready.`);
    } catch (caught) {
      setExportStatus(caught instanceof Error ? caught.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }

  function downloadFileName(format: ExportFormatLink): string {
    const base = "onestream-metadata";
    if (format.key === "xml") return `${base}.xml`;
    if (format.key === "xlsx") return `${base}.xlsx`;
    if (format.key === "json") return `${base}.json`;
    return format.key === "csvMembers" ? `${base}-members.csv` : `${base}-relationships.csv`;
  }

  function triggerBrowserDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function readJsonSafely(response: Response): Promise<Record<string, unknown>> {
    try {
      return await response.json() as Record<string, unknown>;
    } catch {
      return { error: "Export blocked by validation issues" };
    }
  }

  function formatExportBlockMessage(payload: Record<string, unknown>): string {
    const counts = payload.issueCounts && typeof payload.issueCounts === "object"
      ? payload.issueCounts as Record<string, unknown>
      : {};
    const parts = [
      ["errors", counts.error],
      ["warnings", counts.warning],
      ["infos", counts.info]
    ]
      .filter(([, value]) => typeof value === "number" && value > 0)
      .map(([label, value]) => `${String(value)} ${label}`);
    const detail = parts.length ? ` (${parts.join(", ")})` : "";
    return `${String(payload.error ?? "Export blocked by validation issues")}${detail}.`;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="export-modal-title">
        <div className="modal-heading">
          <h2 id="export-modal-title">Export metadata</h2>
          <StatusBadge tone={disabled ? "warning" : "success"}>
            {disabled ? <TriangleAlert size={14} /> : <CheckCircle2 size={14} />}
            {exportAvailability.reason}
          </StatusBadge>
        </div>
        {appConfig.export.xml.enabled && (
          <div className="export-mode-panel">
            <label className="modal-field">
              <span>Relationship load mode</span>
              <select value={loadMode} onChange={(event) => setLoadMode(event.target.value as ExportLoadMode)}>
                {loadModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="export-impact-summary">
              <strong>Pre-export impact</strong>
              {loadMode === "full" ? (
                <span>Full XML uses the current project state without relationship operation filtering.</span>
              ) : planStatus ? (
                <span>{planStatus}</span>
              ) : relationshipPlan ? (
                <span>
                  {relationshipPlan.summary.adds} added, {relationshipPlan.summary.deletes} deleted, {relationshipPlan.summary.moves} moves, {relationshipPlan.summary.copies} copies, {relationshipPlan.summary.potentialOrphans.length} potential orphans, {relationshipPlan.summary.warnings} warnings
                </span>
              ) : (
                <span>Select a non-full mode to calculate relationship impact.</span>
              )}
            </div>
          </div>
        )}
        {bypassAllowed && (
          <div className="export-bypass-panel">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={bypassValidation}
                onChange={(event) => setBypassValidation(event.target.checked)}
              />
              <span>Bypass validation block</span>
            </label>
            {bypassValidation && appConfig.export.validationBypassRequiresReason !== false && (
              <label className="modal-field">
                <span>Bypass reason</span>
                <input value={bypassReason} onChange={(event) => setBypassReason(event.target.value)} />
              </label>
            )}
          </div>
        )}
        {formats.length ? (
          <div className="export-list">
            {formats.map((format) => {
              const linkDisabled = (disabled && !bypassCanAttempt) || isExporting;
              return (
                <ActionLink
                  key={format.key}
                  aria-disabled={linkDisabled}
                  href={linkDisabled ? undefined : hrefFor(format)}
                  onClick={(event) => void handleExportClick(event, format, linkDisabled)}
                  tabIndex={linkDisabled ? -1 : undefined}
                  rel="noreferrer"
                >
                  <Download size={15} /> {format.label}
                </ActionLink>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">Exports are disabled by configuration.</div>
        )}
        {disabled && <p className="modal-status">{exportAvailability.title}</p>}
        {exportStatus && <p className="modal-status">{exportStatus}</p>}
        <div className="modal-actions">
          <ActionButton onClick={onClose}>Close</ActionButton>
        </div>
      </div>
    </div>
  );
}

export function OpenProjectModal({
  open,
  onClose,
  projects,
  selectedProjectId,
  onOpenProject,
  onDeleteProject
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectRecord[];
  selectedProjectId: string | null;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open) {
      setConfirmDeleteId(null);
      setStatus("");
    }
  }, [open]);

  if (!open) return null;

  async function handleDelete(projectId: string) {
    try {
      await deleteProject(projectId);
      setStatus("Project deleted");
      setConfirmDeleteId(null);
      onDeleteProject(projectId);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Delete failed");
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="open-project-modal-title">
        <div className="modal-heading">
          <h2 id="open-project-modal-title">Open project</h2>
        </div>
        <p>Select a project to open, or delete projects you no longer need.</p>
        {projects.length === 0 ? (
          <div className="empty-state">No projects found. Create a new project to get started.</div>
        ) : (
          <div className="project-list">
            {projects.map((project) => (
              <div key={project.id} className={`project-list-item ${project.id === selectedProjectId ? "active" : ""}`}>
                <div className="project-list-info" role="button" tabIndex={0} onClick={() => { onOpenProject(project.id); onClose(); }} onKeyDown={onActivate(() => { onOpenProject(project.id); onClose(); })}>
                  <strong>{project.name}</strong>
                  <small>{project.description || project.sourceFileName || "No description"}</small>
                  <small className="project-date">{new Date(project.createdAt).toLocaleDateString()}</small>
                </div>
                <div className="project-list-actions">
                  {confirmDeleteId === project.id ? (
                    <>
                      <ActionButton variant="primary" className="danger-btn" onClick={() => void handleDelete(project.id)}>
                        Confirm
                      </ActionButton>
                      <ActionButton onClick={() => setConfirmDeleteId(null)}>Cancel</ActionButton>
                    </>
                  ) : (
                    <button
                      className="grid-icon-button danger"
                      title="Delete project"
                      aria-label={`Delete ${project.name}`}
                      onClick={() => setConfirmDeleteId(project.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
         {status && <div className="modal-status">{status}</div>}
        <div className="modal-actions">
          <ActionButton onClick={onClose}>Close</ActionButton>
        </div>
      </div>
    </div>
  );
}

export function SaveAsModal({
  open,
  onClose,
  projectId,
  onSaved
}: {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  onSaved?: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setStatus("");
      setSaving(false);
    }
  }, [open]);

  if (!open || !projectId) return null;

  async function handleSave() {
    if (!projectId || !name.trim()) {
      setStatus("Enter a snapshot name.");
      return;
    }
    setSaving(true);
    setStatus("Saving...");
    try {
      const result = await createProjectSnapshot(projectId, { name: name.trim(), description: description.trim() });
      setStatus(`Saved: ${result.name}`);
      onSaved?.(result.name);
      onClose();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="save-as-title">
        <div className="modal-heading"><h2 id="save-as-title">Save As</h2></div>
        <div className="modal-field">
          <label>Snapshot name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pre-release v2" autoFocus />
        </div>
        <div className="modal-field">
          <label>Description (optional)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
        </div>
        {status && <div className="modal-status">{status}</div>}
        <div className="modal-actions">
          <ActionButton onClick={onClose}>Cancel</ActionButton>
          <ActionButton variant="primary" disabled={saving || !name.trim()} onClick={() => void handleSave()}>Save Snapshot</ActionButton>
        </div>
      </div>
    </div>
  );
}
