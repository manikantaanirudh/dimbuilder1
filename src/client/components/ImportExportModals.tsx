import { CheckCircle2, Download, FileUp, PlusCircle, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import type { ProjectRecord } from "../../shared/types";
import { getEnabledExportFormats, type ExportAvailability } from "../ui/viewModel";
import { createProject, uploadWorkbook } from "../api/client";
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
  onImported
}: {
  open: boolean;
  onClose: () => void;
  onImported: (projectId: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [importedProject, setImportedProject] = useState<ProjectRecord | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setStatus("");
      setImportedProject(null);
      setSummary(null);
      setIsImporting(false);
    }
  }, [open]);

  if (!open) return null;

  function handleFileChange(nextFile: File | null) {
    if (isImporting) return;
    setFile(nextFile);
    setStatus("");
  }

  function handleClose() {
    if (!isImporting) onClose();
  }

  async function importWorkbook() {
    if (!file || isImporting) return;
    setStatus("Seeding project from XLSX...");
    setIsImporting(true);
    try {
      const result = await uploadWorkbook(file, file.name.replace(/\.xlsx$/i, ""));
      setImportedProject(result.project);
      setSummary(result.importSummary);
      setStatus(`Seeded ${String(result.importSummary.dimensionsImported)} dimensions`);
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
          <h2 id="import-modal-title">Seed from XLSX</h2>
          {importedProject ? <StatusBadge tone="success"><CheckCircle2 size={14} /> Seeded</StatusBadge> : null}
        </div>
        <p>Select an optional .xlsx OneStream metadata workbook to seed a project. Generated XML and formula columns are ignored.</p>
        {!importedProject && <input type="file" accept=".xlsx" disabled={isImporting} onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)} />}
        {summary && (
          <div className="import-summary">
            <span><b>{String(summary.dimensionsImported ?? 0)}</b> dimensions</span>
            <span><b>{String(summary.membersImported ?? 0)}</b> members</span>
            <span><b>{String(summary.relationshipsImported ?? 0)}</b> relationships</span>
          </div>
        )}
        {status && <div className="modal-status">{status}</div>}
        <div className="modal-actions">
          <ActionButton disabled={isImporting} onClick={handleClose}>{importedProject ? "Done" : "Cancel"}</ActionButton>
          {!importedProject && <ActionButton variant="primary" disabled={!file || isImporting} onClick={() => void importWorkbook()}><FileUp size={15} /> {isImporting ? "Seeding..." : "Seed Project"}</ActionButton>}
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
  if (!open) return null;
  const prefix = projectId ? `/api/export/${projectId}` : "#";
  const formats = getEnabledExportFormats(appConfig.export);
  const disabled = exportAvailability.disabled;

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
        {formats.length ? (
          <div className="export-list">
            {formats.map((format) => (
              <ActionLink
                key={format.key}
                aria-disabled={disabled}
                href={disabled ? undefined : `${prefix}/${format.hrefSuffix}`}
                onClick={(event) => {
                  if (disabled) event.preventDefault();
                }}
                tabIndex={disabled ? -1 : undefined}
                target={disabled ? undefined : "_blank"}
                rel={disabled ? undefined : "noreferrer"}
              >
                <Download size={15} /> {format.label}
              </ActionLink>
            ))}
          </div>
        ) : (
          <div className="empty-state">Exports are disabled by configuration.</div>
        )}
        {disabled && <p className="modal-status">{exportAvailability.title}</p>}
        <div className="modal-actions">
          <ActionButton onClick={onClose}>Close</ActionButton>
        </div>
      </div>
    </div>
  );
}
