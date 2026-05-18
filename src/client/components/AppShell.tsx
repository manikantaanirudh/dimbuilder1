import {
  Database,
  Download,
  FileUp,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Undo2
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import {
  buildDimensionNavItems,
  buildIssueSummary,
  filterDimensionNavItems,
  resolveActiveDimensionId,
  type DimensionNavItem,
  getExportAvailability
} from "../ui/viewModel";
import { validateProject } from "../api/client";
import { useProjectStore } from "../state/useProjectStore";
import { Dashboard } from "./Dashboard";
import { DimensionWorkspace } from "./DimensionWorkspace";
import { ExportModal, ImportModal } from "./ImportExportModals";
import { ActionButton, StatusBadge, ToolbarGroup } from "./ui";

const PROJECT_OVERVIEW_VALUE = "__project_overview__";

function mobileNavLabel(item: DimensionNavItem) {
  if (item.issueSummary.errors > 0) return `${item.label} - ${item.issueSummary.errors} errors`;
  if (item.issueSummary.warnings > 0) return `${item.label} - ${item.issueSummary.warnings} warnings`;
  return `${item.label} - Clean`;
}

export function AppShell({
  appConfig,
  configError = null
}: {
  appConfig: ClientAppConfig;
  configError?: string | null;
}) {
  const store = useProjectStore();
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const [navSearch, setNavSearch] = useState("");
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

  const resolvedActiveDimensionId = activeWorkspace === PROJECT_OVERVIEW_VALUE
    ? null
    : resolveActiveDimensionId(activeWorkspace, store.dimensions);

  const filteredDimensionNavItems = useMemo(
    () => filterDimensionNavItems(dimensionNavItems, navSearch),
    [dimensionNavItems, navSearch]
  );

  const activeDimension = useMemo(
    () => store.dimensions.find((dimension) => dimension.id === resolvedActiveDimensionId) ?? null,
    [resolvedActiveDimensionId, store.dimensions]
  );

  const showProjectOverview = activeWorkspace === PROJECT_OVERVIEW_VALUE || !activeDimension || !store.selectedProjectId;

  async function runValidation() {
    if (!store.selectedProjectId) return;
    setStatus("Validating metadata...");
    const result = await validateProject(store.selectedProjectId, appConfig.validation.duplicateMemberSeverity);
    setStatus(`${result.issues.length} validation issue${result.issues.length === 1 ? "" : "s"} found`);
    await store.refresh(store.selectedProjectId);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar workbench-nav">
        <div className="brand">
          <span className="brand-mark"><Database size={17} /></span>
          <span>{appConfig.application.productName}</span>
        </div>

        <div className="nav-project">
          <span className="sidebar-label">Project</span>
          <strong>{store.projects[0]?.name ?? "No project imported"}</strong>
          <small>{store.projects[0]?.sourceFileName ?? appConfig.application.supportText}</small>
        </div>

        <button
          className={`nav-overview ${activeWorkspace === PROJECT_OVERVIEW_VALUE ? "selected" : ""}`}
          onClick={() => setActiveWorkspace(PROJECT_OVERVIEW_VALUE)}
        >
          <span>Project overview</span>
          <small>{issueSummary.total ? `${issueSummary.total} issues` : "Ready"}</small>
        </button>

        <div className="nav-search search-box">
          <Search size={14} />
          <input
            value={navSearch}
            onChange={(event) => setNavSearch(event.target.value)}
            placeholder="Search dimensions"
            aria-label="Search dimensions"
          />
        </div>

        <div className="sidebar-section-header">
          <span className="sidebar-label">Dimensions</span>
          <StatusBadge tone={issueSummary.blocksExport ? "danger" : issueSummary.total ? "warning" : "success"}>
            {issueSummary.total ? `${issueSummary.total} issues` : "Ready"}
          </StatusBadge>
        </div>

        {dimensionNavItems.length === 0 && <div className="empty-sidebar">Import a workbook to begin.</div>}
        {dimensionNavItems.length > 0 && filteredDimensionNavItems.length === 0 && (
          <div className="empty-sidebar">No dimensions match this search.</div>
        )}
        {filteredDimensionNavItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeDimension?.id === item.id ? "selected" : ""}`}
            onClick={() => {
              setActiveWorkspace(item.id);
              setNavSearch("");
            }}
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
          <label className="mobile-nav">
            <span>Workspace</span>
            <select
              aria-label="Mobile workspace navigation"
              value={showProjectOverview ? PROJECT_OVERVIEW_VALUE : activeDimension?.id ?? PROJECT_OVERVIEW_VALUE}
              onChange={(event) => setActiveWorkspace(event.currentTarget.value === PROJECT_OVERVIEW_VALUE ? PROJECT_OVERVIEW_VALUE : event.currentTarget.value)}
            >
              <option value={PROJECT_OVERVIEW_VALUE}>Project overview</option>
              {dimensionNavItems.map((item) => (
                <option key={item.id} value={item.id}>{mobileNavLabel(item)}</option>
              ))}
            </select>
          </label>
          <ToolbarGroup className="toolbar-actions">
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
          </ToolbarGroup>
        </header>

        {configError && <div className="banner error">Configuration failed to load. Using defaults: {configError}</div>}
        {store.error && <div className="banner error">{store.error}</div>}
        {status && <div className="banner">{status}</div>}

        {!showProjectOverview && activeDimension && store.selectedProjectId ? (
          <DimensionWorkspace
            projectId={store.selectedProjectId}
            dimension={activeDimension}
            issues={store.issues}
            onRefresh={() => store.refresh(store.selectedProjectId ?? undefined)}
            appConfig={appConfig}
            exportAvailability={exportAvailability}
          />
        ) : (
          <Dashboard
            dimensions={store.dimensions}
            summary={store.summary}
            project={store.projects[0] ?? null}
            issues={store.issues}
            onImport={() => setImportOpen(true)}
            exportAvailability={exportAvailability}
            onOpenDimension={setActiveWorkspace}
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
