import { CheckCircle2, Download, FileUp, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import type { ProjectRecord } from "../../shared/types";
import { getEnabledExportFormats, type ExportAvailability } from "../ui/viewModel";
import { uploadWorkbook } from "../api/client";
import { ActionButton, ActionLink, StatusBadge } from "./ui";

export function hasEnabledExportFormat(exportConfig: ClientAppConfig["export"]): boolean {
  return exportConfig.xml.enabled
    || exportConfig.xlsx.enabled
    || exportConfig.csv.enabled
    || exportConfig.json.enabled;
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

  useEffect(() => {
    if (!open) {
      setFile(null);
      setStatus("");
      setImportedProject(null);
      setSummary(null);
    }
  }, [open]);

  if (!open) return null;

  function handleFileChange(nextFile: File | null) {
    setFile(nextFile);
    setStatus("");
  }

  async function importWorkbook() {
    if (!file) return;
    setStatus("Importing workbook. Large UD3 sheets can take a few seconds...");
    try {
      const result = await uploadWorkbook(file, file.name.replace(/\.xlsx$/i, ""));
      setImportedProject(result.project);
      setSummary(result.importSummary);
      setStatus(`Imported ${String(result.importSummary.dimensionsImported)} dimensions`);
      onImported(result.project.id);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Import failed");
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-heading">
          <h2>Import XLSX Template</h2>
          {importedProject ? <StatusBadge tone="success"><CheckCircle2 size={14} /> Imported</StatusBadge> : null}
        </div>
        <p>Select the OneStream XF metadata workbook. Generated XML/formula columns are ignored.</p>
        {!importedProject && <input type="file" accept=".xlsx" onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)} />}
        {summary && (
          <div className="import-summary">
            <span><b>{String(summary.dimensionsImported ?? 0)}</b> dimensions</span>
            <span><b>{String(summary.membersImported ?? 0)}</b> members</span>
            <span><b>{String(summary.relationshipsImported ?? 0)}</b> relationships</span>
          </div>
        )}
        {status && <div className="modal-status">{status}</div>}
        <div className="modal-actions">
          <ActionButton onClick={onClose}>{importedProject ? "Done" : "Cancel"}</ActionButton>
          {!importedProject && <ActionButton variant="primary" disabled={!file} onClick={() => void importWorkbook()}><FileUp size={15} /> Import</ActionButton>}
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
      <div className="modal">
        <div className="modal-heading">
          <h2>Export Metadata</h2>
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
