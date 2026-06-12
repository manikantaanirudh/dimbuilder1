import {
  Download,
  FileUp,
  FolderOpen,
  LogOut,
  Moon,
  PlusCircle,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sun,
  Undo2,
  User
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
import { createProjectSnapshot, validateProject } from "../api/client";
import { useProjectStore } from "../state/useProjectStore";
import { useAuth } from "../auth/useAuth";
import { useTheme } from "../hooks/useTheme";
import { Dashboard } from "./Dashboard";
import { DimensionWorkspace } from "./DimensionWorkspace";
import { CreateProjectModal, ExportModal, ImportModal, OpenProjectModal, SaveAsModal } from "./ImportExportModals";
import { AdminPanel } from "./AdminPanel";
import { ConfigEditor } from "./ConfigEditor";
import { ValidationDashboard } from "./ValidationDashboard";
import { ReportingDashboard } from "./ReportingDashboard";
import { AIInsightsPanel } from "./AIInsightsPanel";
import { QualityScoresPanel } from "./QualityScoresPanel";
import { AuditLogViewer } from "./AuditLogViewer";
import { ChatPanel } from "./ChatPanel";
import { ToastProvider } from "./Toast";
import { ActionButton, IconButton, StatusBadge, ToolbarGroup } from "./ui";

const PROJECT_OVERVIEW_VALUE = "__project_overview__";
const ADMIN_VALUE = "__admin__";
const CONFIG_EDITOR_VALUE = "__config_editor__";
const VALIDATION_DASHBOARD_VALUE = "__validation_dashboard__";
const REPORTING_VALUE = "__reporting__";
const AI_INSIGHTS_VALUE = "__ai_insights__";
const QUALITY_VALUE = "__quality__";
const AUDIT_LOG_VALUE = "__audit_log__";
const CHAT_VALUE = "__chat__";

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
  const { user, authEnabled, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const [navSearch, setNavSearch] = useState("");
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [openProjectOpen, setOpenProjectOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const toolbar = appConfig.ui.toolbar;
  const dimensionDisplayConfig = appConfig.dimensions.display;
  const selectedProject = store.projects.find((project) => project.id === store.selectedProjectId) ?? null;
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

  async function saveProject() {
    if (!store.selectedProjectId || isSaving) return;
    setIsSaving(true);
    setStatus("Saving project...");
    try {
      const result = await createProjectSnapshot(store.selectedProjectId);
      setStatus(`Project saved: ${result.name}`);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  function clearSession() {
    store.clearProject();
    setActiveWorkspace(PROJECT_OVERVIEW_VALUE);
    setStatus("");
  }

  return (
    <ToastProvider>
    <div className="app-shell notion-workbench">
      <header className="toolbar global-toolbar">
        <button
          type="button"
          className="brand global-brand"
          onClick={() => setActiveWorkspace(PROJECT_OVERVIEW_VALUE)}
          title="Back to Project Overview"
          aria-label="Back to Project Overview"
        >
          <img src="/sr-logo.svg" alt="SR" className="app-logo" width="24" height="24" />
          <span className="brand-wordmark">{appConfig.application.productName}</span>
        </button>

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
          <ActionButton variant="primary" onClick={() => setCreateProjectOpen(true)}>
            <PlusCircle size={16} /> New Project
          </ActionButton>
          <ActionButton onClick={() => setOpenProjectOpen(true)}>
            <FolderOpen size={16} /> Open Project
          </ActionButton>
          {toolbar.showImport && (
            <ActionButton onClick={() => setImportOpen(true)}>
              <FileUp size={16} /> Seed from file
            </ActionButton>
          )}
          {toolbar.showValidate && (
            <ActionButton
              title={store.selectedProjectId ? "Validate metadata" : "Create or open a project before validating"}
              disabled={!store.selectedProjectId}
              onClick={runValidation}
            >
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
          {toolbar.showSave && (
            <ActionButton
              disabled={!store.selectedProjectId || isSaving}
              title={store.selectedProjectId ? "Save project snapshot" : "No project open"}
              onClick={() => void saveProject()}
            >
              <Save size={16} /> Save
            </ActionButton>
          )}
          {toolbar.showSave && (
            <ActionButton
              disabled={!store.selectedProjectId}
              title={store.selectedProjectId ? "Save project with a custom name" : "No project open"}
              onClick={() => setSaveAsOpen(true)}
            >
              <Save size={16} /> Save As
            </ActionButton>
          )}
          <ActionButton
            disabled={!store.selectedProjectId}
            title="Clear session and close current project"
            onClick={clearSession}
          >
            <LogOut size={16} /> Clear Session
          </ActionButton>
          {toolbar.showUndoRedo && <ActionButton disabled title="Undo" aria-label="Undo"><Undo2 size={16} /></ActionButton>}
          {toolbar.showUndoRedo && <ActionButton disabled title="Redo" aria-label="Redo"><RotateCcw size={16} /></ActionButton>}
          <IconButton
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </IconButton>
        </ToolbarGroup>

        {authEnabled && user && (
          <div className="user-menu">
            <User size={16} />
            <span className="user-menu-name">{user.displayName || user.email}</span>
            <StatusBadge tone="info">{user.role}</StatusBadge>
            <ActionButton title="Sign out" onClick={() => void logout()}>
              <LogOut size={16} /> Sign Out
            </ActionButton>
          </div>
        )}
      </header>

      <nav className="secondary-nav" aria-label="Feature navigation">
        <button
          className={`secondary-nav-item ${showProjectOverview ? "active" : ""}`}
          onClick={() => setActiveWorkspace(PROJECT_OVERVIEW_VALUE)}
        >
          Project Overview
        </button>
        <button
          className={`secondary-nav-item ${activeWorkspace === VALIDATION_DASHBOARD_VALUE ? "active" : ""}`}
          onClick={() => setActiveWorkspace(VALIDATION_DASHBOARD_VALUE)}
        >
          Validation
        </button>
        <button
          className={`secondary-nav-item ${activeWorkspace === REPORTING_VALUE ? "active" : ""}`}
          onClick={() => setActiveWorkspace(REPORTING_VALUE)}
        >
          Reports
        </button>
        <button
          className={`secondary-nav-item ${activeWorkspace === AI_INSIGHTS_VALUE ? "active" : ""}`}
          onClick={() => setActiveWorkspace(AI_INSIGHTS_VALUE)}
        >
          AI Insights
        </button>
        <button
          className={`secondary-nav-item ${activeWorkspace === QUALITY_VALUE ? "active" : ""}`}
          onClick={() => setActiveWorkspace(QUALITY_VALUE)}
        >
          Quality
        </button>
        <button
          className={`secondary-nav-item ${activeWorkspace === AUDIT_LOG_VALUE ? "active" : ""}`}
          onClick={() => setActiveWorkspace(AUDIT_LOG_VALUE)}
        >
          Audit Log
        </button>
        <button
          className={`secondary-nav-item ${activeWorkspace === CHAT_VALUE ? "active" : ""}`}
          onClick={() => setActiveWorkspace(CHAT_VALUE)}
        >
          Chat
        </button>
        <button
          className={`secondary-nav-item ${activeWorkspace === ADMIN_VALUE ? "active" : ""}`}
          onClick={() => setActiveWorkspace(ADMIN_VALUE)}
        >
          Admin
        </button>
        <button
          className={`secondary-nav-item ${activeWorkspace === CONFIG_EDITOR_VALUE ? "active" : ""}`}
          onClick={() => setActiveWorkspace(CONFIG_EDITOR_VALUE)}
        >
          Config
        </button>
      </nav>

      <aside className="sidebar workbench-nav">
        <div className="sidebar-heading">
          <strong>Dimensions</strong>
          <span>{dimensionNavItems.length} total</span>
        </div>

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

        {dimensionNavItems.length === 0 && <div className="empty-sidebar">Create or seed a project to begin.</div>}
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

      <main className="main" id="main-content">
        {configError && <div className="banner error">Configuration failed to load. Using defaults: {configError}</div>}
        {store.error && <div className="banner error">{store.error}</div>}
        {status && <div className="banner">{status}</div>}

        {activeWorkspace === CONFIG_EDITOR_VALUE ? (
          <ConfigEditor appConfig={appConfig} onConfigSaved={() => window.location.reload()} />
        ) : activeWorkspace === VALIDATION_DASHBOARD_VALUE ? (
          <ValidationDashboard
            issues={store.issues}
            dimensions={store.dimensions}
            appConfig={appConfig}
            onNavigateDimension={setActiveWorkspace}
          />
        ) : activeWorkspace === REPORTING_VALUE && store.selectedProjectId ? (
          <ReportingDashboard projectId={store.selectedProjectId} />
        ) : activeWorkspace === AI_INSIGHTS_VALUE && store.selectedProjectId ? (
          <AIInsightsPanel projectId={store.selectedProjectId} />
        ) : activeWorkspace === QUALITY_VALUE && store.selectedProjectId ? (
          <QualityScoresPanel projectId={store.selectedProjectId} />
        ) : activeWorkspace === AUDIT_LOG_VALUE && store.selectedProjectId ? (
          <AuditLogViewer projectId={store.selectedProjectId} />
        ) : activeWorkspace === CHAT_VALUE && store.selectedProjectId ? (
          <ChatPanel projectId={store.selectedProjectId} onNavigateMember={(_key) => {
            // Navigate to first dimension - member lookup needs dimension context
            if (store.dimensions.length > 0) {
              setActiveWorkspace(store.dimensions[0].id);
            }
          }} />
        ) : activeWorkspace === ADMIN_VALUE ? (
          <AdminPanel appConfig={appConfig} projectId={store.selectedProjectId} />
        ) : !showProjectOverview && activeDimension && store.selectedProjectId ? (
          <DimensionWorkspace
            projectId={store.selectedProjectId}
            dimension={activeDimension}
            issues={store.issues}
            onRefresh={() => store.refresh(store.selectedProjectId ?? undefined)}
            onDimensionDeleted={() => {
              setStatus("Dimension deleted");
              setActiveWorkspace(PROJECT_OVERVIEW_VALUE);
              void store.refresh(store.selectedProjectId ?? undefined);
            }}
            onDimensionRecreated={(created) => {
              setStatus(`Created ${created.dimensionName}`);
              setActiveWorkspace(created.id);
              void store.refresh(store.selectedProjectId ?? undefined);
            }}
            appConfig={appConfig}
            exportAvailability={exportAvailability}
          />
        ) : (
          <Dashboard
            dimensions={store.dimensions}
            summary={store.summary}
            project={selectedProject}
            issues={store.issues}
            onOpenDimension={setActiveWorkspace}
            onProjectChanged={(projectId) => {
              setStatus("Project snapshot action completed");
              void store.refresh(projectId);
            }}
            appConfig={appConfig}
          />
        )}
      </main>

      <CreateProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onCreated={(projectId) => {
          setStatus("Project created");
          void store.refresh(projectId);
        }}
      />
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(projectId) => {
          setStatus("Import complete");
          void store.refresh(projectId);
        }}
        projects={store.projects}
        selectedProjectId={store.selectedProjectId}
        enabledDimensionTypes={appConfig.dimensions.enabledTypes}
      />
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        projectId={store.selectedProjectId}
        appConfig={appConfig}
        exportAvailability={exportAvailability}
      />
      <OpenProjectModal
        open={openProjectOpen}
        onClose={() => setOpenProjectOpen(false)}
        projects={store.projects}
        selectedProjectId={store.selectedProjectId}
        onOpenProject={(projectId) => {
          setStatus("Project loaded");
          void store.refresh(projectId);
        }}
        onDeleteProject={() => {
          void store.refresh();
        }}
      />
      <SaveAsModal
        open={saveAsOpen}
        onClose={() => setSaveAsOpen(false)}
        projectId={store.selectedProjectId}
        onSaved={(name) => { setStatus(`Saved: ${name}`); void store.refresh(); }}
      />
    </div>
    </ToastProvider>
  );
}
