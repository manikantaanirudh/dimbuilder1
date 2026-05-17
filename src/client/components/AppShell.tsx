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
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { getDimensionDisplayLabel, getDimensionDisplaySubtitle } from "../../shared/dimensionDisplay";
import { validateProject } from "../api/client";
import { useProjectStore } from "../state/useProjectStore";
import { Dashboard } from "./Dashboard";
import { DimensionWorkspace } from "./DimensionWorkspace";
import { ExportModal, hasEnabledExportFormat, ImportModal } from "./ImportExportModals";

export function AppShell({
  appConfig,
  configError = null
}: {
  appConfig: ClientAppConfig;
  configError?: string | null;
}) {
  const store = useProjectStore();
  const [activeDimensionId, setActiveDimensionId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [status, setStatus] = useState("");
  const toolbar = appConfig.ui.toolbar;
  const dimensionDisplayConfig = appConfig.dimensions.display;
  const hasEnabledExportFormats = hasEnabledExportFormat(appConfig.export);
  const hasExportBlockingIssues = store.issues.some((issue) => (
    appConfig.validation.exportBlockedBySeverities.includes(issue.severity)
  ));
  const exportDisabled = !store.selectedProjectId || !hasEnabledExportFormats || hasExportBlockingIssues;
  const exportTitle = !hasEnabledExportFormats
    ? "Exports are disabled by configuration"
    : !store.selectedProjectId
      ? "Import a project before exporting"
      : hasExportBlockingIssues
        ? "Resolve blocking validation issues before exporting"
        : "Export metadata";

  const activeDimension = useMemo(
    () => store.dimensions.find((dimension) => dimension.id === activeDimensionId) ?? store.dimensions[0],
    [activeDimensionId, store.dimensions]
  );

  async function runValidation() {
    if (!store.selectedProjectId) return;
    setStatus("Validating metadata...");
    const result = await validateProject(store.selectedProjectId, appConfig.validation.duplicateMemberSeverity);
    setStatus(`${result.issues.length} validation issue${result.issues.length === 1 ? "" : "s"} found`);
    await store.refresh(store.selectedProjectId);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Database size={18} />
          <span>{appConfig.application.productName}</span>
        </div>
        <div className="sidebar-label">Dimensions</div>
        {store.dimensions.length === 0 && <div className="empty-sidebar">Import a workbook to begin.</div>}
        {store.dimensions.map((dimension) => (
          <button
            key={dimension.id}
            className={`nav-item ${activeDimension?.id === dimension.id ? "selected" : ""}`}
            onClick={() => setActiveDimensionId(dimension.id)}
            title={getDimensionDisplaySubtitle(dimension, dimensionDisplayConfig)}
          >
            <span>{getDimensionDisplayLabel(dimension, dimensionDisplayConfig)}</span>
            <small>{getDimensionDisplaySubtitle(dimension, dimensionDisplayConfig)}</small>
          </button>
        ))}
      </aside>

      <main className="main">
        <header className="toolbar">
          <div className="toolbar-title">
            <strong>{appConfig.application.title}</strong>
            <span>{store.loading ? "Loading..." : store.projects[0]?.name ?? "No project imported"}</span>
          </div>
          <div className="toolbar-actions">
            {toolbar.showImport && <button onClick={() => setImportOpen(true)}><FileUp size={16} /> Import</button>}
            {toolbar.showValidate && <button disabled={!store.selectedProjectId} onClick={runValidation}><ShieldCheck size={16} /> Validate</button>}
            {toolbar.showExport && (
              <button disabled={exportDisabled} title={exportTitle} onClick={() => setExportOpen(true)}>
                <Download size={16} /> Export
              </button>
            )}
            {toolbar.showSave && <button disabled><Save size={16} /> Save</button>}
            {toolbar.showUndoRedo && <button disabled title="Undo"><Undo2 size={16} /></button>}
            {toolbar.showUndoRedo && <button disabled title="Redo"><RotateCcw size={16} /></button>}
          </div>
        </header>

        {configError && <div className="banner error">Configuration failed to load. Using defaults: {configError}</div>}
        {store.error && <div className="banner error">{store.error}</div>}
        {status && <div className="banner">{status}</div>}

        {activeDimension && store.selectedProjectId ? (
          <DimensionWorkspace
            projectId={store.selectedProjectId}
            dimension={activeDimension}
            issues={store.issues}
            onRefresh={() => store.refresh(store.selectedProjectId ?? undefined)}
            appConfig={appConfig}
          />
        ) : (
          <Dashboard
            dimensions={store.dimensions}
            summary={store.summary}
            onImport={() => setImportOpen(true)}
            appConfig={appConfig}
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
        appConfig={appConfig}
      />
    </div>
  );
}
