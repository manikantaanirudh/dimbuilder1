import { useState } from "react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { uploadWorkbook } from "../api/client";

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

  if (!open) return null;

  async function importWorkbook() {
    if (!file) return;
    setStatus("Importing workbook. Large UD3 sheets can take a few seconds...");
    const result = await uploadWorkbook(file, file.name.replace(/\.xlsx$/i, ""));
    setStatus(`Imported ${String(result.importSummary.dimensionsImported)} dimensions`);
    onImported(result.project.id);
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Import XLSX Template</h2>
        <p>Select the OneStream XF metadata workbook. Generated XML/formula columns are ignored.</p>
        <input type="file" accept=".xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        {status && <div className="modal-status">{status}</div>}
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button disabled={!file} onClick={() => void importWorkbook()}>Import</button>
        </div>
      </div>
    </div>
  );
}

export function ExportModal({
  open,
  onClose,
  projectId,
  appConfig
}: {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  appConfig: ClientAppConfig;
}) {
  if (!open) return null;
  const disabled = !projectId;
  const prefix = projectId ? `/api/export/${projectId}` : "#";
  const exportConfig = appConfig.export;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Export Metadata</h2>
        <div className="export-list">
          {exportConfig.xml.enabled && <a aria-disabled={disabled} href={`${prefix}/xml`} target="_blank" rel="noreferrer">OneStream XML</a>}
          {exportConfig.xlsx.enabled && <a aria-disabled={disabled} href={`${prefix}/xlsx`} target="_blank" rel="noreferrer">Workbook XLSX</a>}
          {exportConfig.csv.enabled && <a aria-disabled={disabled} href={`${prefix}/members.csv`} target="_blank" rel="noreferrer">Members CSV</a>}
          {exportConfig.csv.enabled && <a aria-disabled={disabled} href={`${prefix}/relationships.csv`} target="_blank" rel="noreferrer">Relationships CSV</a>}
          {exportConfig.json.enabled && <a aria-disabled={disabled} href={`${prefix}/json`} target="_blank" rel="noreferrer">JSON Backup</a>}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
