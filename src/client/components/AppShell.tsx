import {
  Database,
  Download,
  FileUp,
  RotateCcw,
  Save,
  ShieldCheck,
  Undo2
} from "lucide-react";
import { useMemo, useState } from "react";
import { validateProject } from "../api/client";
import { useProjectStore } from "../state/useProjectStore";
import { Dashboard } from "./Dashboard";
import { DimensionWorkspace } from "./DimensionWorkspace";
import { ExportModal, ImportModal } from "./ImportExportModals";

export function AppShell() {
  const store = useProjectStore();
  const [activeDimensionId, setActiveDimensionId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [status, setStatus] = useState("");

  const activeDimension = useMemo(
    () => store.dimensions.find((dimension) => dimension.id === activeDimensionId) ?? store.dimensions[0],
    [activeDimensionId, store.dimensions]
  );

  async function runValidation() {
    if (!store.selectedProjectId) return;
    setStatus("Validating metadata...");
    const result = await validateProject(store.selectedProjectId);
    setStatus(`${result.issues.length} validation issue${result.issues.length === 1 ? "" : "s"} found`);
    await store.refresh(store.selectedProjectId);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Database size={18} />
          <span>OneStream XF</span>
        </div>
        <div className="sidebar-label">Dimensions</div>
        {store.dimensions.length === 0 && <div className="empty-sidebar">Import a workbook to begin.</div>}
        {store.dimensions.map((dimension) => (
          <button
            key={dimension.id}
            className={`nav-item ${activeDimension?.id === dimension.id ? "selected" : ""}`}
            onClick={() => setActiveDimensionId(dimension.id)}
            title={dimension.sheetName}
          >
            <span>{dimension.sheetName}</span>
            <small>{dimension.dimensionType}</small>
          </button>
        ))}
      </aside>

      <main className="main">
        <header className="toolbar">
          <div className="toolbar-title">
            <strong>OneStream XF Dimension Builder</strong>
            <span>{store.loading ? "Loading..." : store.projects[0]?.name ?? "No project imported"}</span>
          </div>
          <div className="toolbar-actions">
            <button onClick={() => setImportOpen(true)}><FileUp size={16} /> Import</button>
            <button disabled={!store.selectedProjectId} onClick={runValidation}><ShieldCheck size={16} /> Validate</button>
            <button disabled={!store.selectedProjectId} onClick={() => setExportOpen(true)}><Download size={16} /> Export</button>
            <button disabled><Save size={16} /> Save</button>
            <button disabled title="Undo"><Undo2 size={16} /></button>
            <button disabled title="Redo"><RotateCcw size={16} /></button>
          </div>
        </header>

        {store.error && <div className="banner error">{store.error}</div>}
        {status && <div className="banner">{status}</div>}

        {activeDimension && store.selectedProjectId ? (
          <DimensionWorkspace
            projectId={store.selectedProjectId}
            dimension={activeDimension}
            issues={store.issues}
            onRefresh={() => store.refresh(store.selectedProjectId ?? undefined)}
          />
        ) : (
          <Dashboard
            projects={store.projects}
            dimensions={store.dimensions}
            summary={store.summary}
            onImport={() => setImportOpen(true)}
          />
        )}
      </main>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(projectId) => {
          setStatus("Import complete");
          void store.refresh(projectId);
        }}
      />
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        projectId={store.selectedProjectId}
      />
    </div>
  );
}

