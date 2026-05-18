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
import {
  buildDimensionNavItems,
  buildIssueSummary,
  getExportAvailability
} from "../ui/viewModel";
import { validateProject } from "../api/client";
import { useProjectStore } from "../state/useProjectStore";
import { Dashboard } from "./Dashboard";
import { DimensionWorkspace } from "./DimensionWorkspace";
import { ExportModal, ImportModal } from "./ImportExportModals";
import { ActionButton, StatusBadge } from "./ui";

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
  const issueSummary = buildIssueSummary(store.issues, appConfig.validation.exportBlockedBySeverities);
  const exportAvailability = getExportAvailability({
    projectId: store.selectedProjectId,
    exportConfig: appConfig.export,
    issues: store.issues,
    blockedSeverities: appConfig.validation.exportBlockedBySeverities
  });
  const dimensionNavItems = useMemo(
    () => buildDimensionNavItems(
      store.dimensions,
      store.issues,
      dimensionDisplayConfig,
      appConfig.validation.exportBlockedBySeverities
    ),
    [appConfig.validation.exportBlockedBySeverities, dimensionDisplayConfig, store.dimensions, store.issues]
  );

  const activeDimension = useMemo(
    () => store.dimensions.find((dimension) => dimension.id === activeDimensionId) ?? null,
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
          <span className="brand-mark"><Database size={18} /></span>
          <span>{appConfig.application.productName}</span>
        </div>

        <div className="sidebar-project">
          <span className="sidebar-label">Project</span>
          <strong>{store.projects[0]?.name ?? "No project imported"}</strong>
          <small>{store.projects[0]?.sourceFileName ?? appConfig.application.supportText}</small>
          <button
            className={`nav-item ${activeDimensionId === null ? "selected" : ""}`}
            onClick={() => setActiveDimensionId(null)}
          >
            <span>Command Dashboard</span>
            <small>Project overview and readiness</small>
          </button>
        </div>

        <div className="sidebar-section-header">
          <span className="sidebar-label">Dimensions</span>
          <StatusBadge tone={issueSummary.blocksExport ? "danger" : issueSummary.total ? "warning" : "success"}>
            {issueSummary.total ? `${issueSummary.total} issues` : "Ready"}
          </StatusBadge>
        </div>

        {dimensionNavItems.length === 0 && <div className="empty-sidebar">Import a workbook to begin.</div>}
        {dimensionNavItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeDimension?.id === item.id ? "selected" : ""}`}
            onClick={() => setActiveDimensionId(item.id)}
            title={item.subtitle}
          >
            <span>{item.label}</span>
            <small>{item.subtitle}</small>
            {item.issueSummary.errors > 0 && (
              <b
                className="nav-issue error"
                title={`${item.issueSummary.errors} errors`}
                aria-label={`${item.issueSummary.errors} errors`}
              >
                {item.issueSummary.errors}
              </b>
            )}
            {item.issueSummary.errors === 0 && item.issueSummary.warnings > 0 && (
              <b
                className="nav-issue warning"
                title={`${item.issueSummary.warnings} warnings`}
                aria-label={`${item.issueSummary.warnings} warnings`}
              >
                {item.issueSummary.warnings}
              </b>
            )}
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
            {toolbar.showImport && (
              <ActionButton variant="primary" onClick={() => setImportOpen(true)}>
                <FileUp size={16} /> Import
              </ActionButton>
            )}
            {toolbar.showValidate && (
              <ActionButton disabled={!store.selectedProjectId} onClick={runValidation}>
                <ShieldCheck size={16} /> Validate
              </ActionButton>
            )}
            {toolbar.showExport && (
              <ActionButton
                disabled={exportAvailability.disabled}
                title={exportAvailability.title}
                onClick={() => setExportOpen(true)}
              >
                <Download size={16} /> Export
              </ActionButton>
            )}
            {toolbar.showSave && <ActionButton disabled><Save size={16} /> Save</ActionButton>}
            {toolbar.showUndoRedo && <ActionButton disabled title="Undo" aria-label="Undo"><Undo2 size={16} /></ActionButton>}
            {toolbar.showUndoRedo && <ActionButton disabled title="Redo" aria-label="Redo"><RotateCcw size={16} /></ActionButton>}
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
            project={store.projects[0] ?? null}
            issues={store.issues}
            onImport={() => setImportOpen(true)}
            onValidate={() => void runValidation()}
            validateDisabled={!store.selectedProjectId}
            onExport={() => setExportOpen(true)}
            exportAvailability={exportAvailability}
            onOpenDimension={setActiveDimensionId}
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
        exportAvailability={exportAvailability}
      />
    </div>
  );
}
