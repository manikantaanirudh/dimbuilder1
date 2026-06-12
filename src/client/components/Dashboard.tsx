import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Database, Search } from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { getDimensionDisplayLabel, getDimensionDisplaySubtitle } from "../../shared/dimensionDisplay";
import type { DashboardSummary, DimensionRecord, ProjectRecord, ValidationIssue } from "../../shared/types";
import { apiPatchJson } from "../api/client";
import { buildIssueSummary } from "../ui/viewModel";
import { BlueprintStudio } from "./BlueprintStudio";
import { KPICards } from "./KPICards";
import { SnapshotManager } from "./SnapshotManager";
import { EmptyState, StatusBadge } from "./ui";

const DISCLOSURE_KEY = "dimbuilder-overview-disclosure";

export function Dashboard({
  dimensions,
  summary,
  project,
  issues,
  onOpenDimension,
  onProjectChanged,
  appConfig
}: {
  dimensions: DimensionRecord[];
  summary: DashboardSummary | null;
  project: ProjectRecord | null;
  issues: ValidationIssue[];
  onOpenDimension: (dimensionId: string) => void;
  onProjectChanged?: (projectId: string) => void;
  appConfig: ClientAppConfig;
}) {
  const dimensionDisplayConfig = appConfig.dimensions.display;
  const issueSummary = buildIssueSummary(issues, appConfig.validation.exportBlockedBySeverities);
  const summaryErrors = summary?.validationErrors ?? issueSummary.errors;
  const summaryWarnings = summary?.validationWarnings ?? issueSummary.warnings;
  const blocksExport = issueSummary.blocksExport;
  const needsReview = blocksExport || summaryErrors > 0 || summaryWarnings > 0 || issueSummary.total > 0;
  const statusTone = !project ? "neutral" : blocksExport ? "danger" : needsReview ? "warning" : "success";
  const statusLabel = !project ? "No project" : blocksExport ? "Export blocked" : needsReview ? "Needs review" : "Ready";
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(project?.name ?? "");
  const [renameError, setRenameError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [dimSearch, setDimSearch] = useState("");
  const [disclosureOpen, setDisclosureOpen] = useState(() => localStorage.getItem(DISCLOSURE_KEY) === "open");
  const dimSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        dimSearchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const dimensionIssueMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildIssueSummary>>();
    for (const dim of dimensions) {
      map.set(dim.id, buildIssueSummary(issues, appConfig.validation.exportBlockedBySeverities, dim.id));
    }
    return map;
  }, [dimensions, issues, appConfig.validation.exportBlockedBySeverities]);

  const filteredDimensions = useMemo(() => {
    if (!dimSearch.trim()) return dimensions;
    const query = dimSearch.toLowerCase();
    return dimensions.filter((dim) => {
      const label = getDimensionDisplayLabel(dim, dimensionDisplayConfig).toLowerCase();
      const subtitle = getDimensionDisplaySubtitle(dim, dimensionDisplayConfig).toLowerCase();
      return label.includes(query) || subtitle.includes(query);
    });
  }, [dimensions, dimSearch, dimensionDisplayConfig]);

  async function handleRename() {
    if (!project || !editName.trim() || editName.trim() === project.name) {
      setEditing(false);
      return;
    }
    setRenameError("");
    setRenaming(true);
    try {
      await apiPatchJson<ProjectRecord>(`/projects/${project.id}`, { name: editName.trim() });
      onProjectChanged?.(project.id);
    } catch (caught) {
      setRenameError(caught instanceof Error ? caught.message : "Rename failed");
    }
    setRenaming(false);
    setEditing(false);
  }

  return (
    <section className="dashboard project-overview">
      <div className="overview-page">
        <span className="overview-page-icon" aria-hidden="true">
          <Database size={24} />
        </span>
        <div className="overview-header">
          <div>
            <span className="section-kicker">Project overview</span>
            {project && !editing ? (
              <h1
                className="editable-title"
                title="Click to rename project"
                tabIndex={0}
                role="button"
                aria-label={`Rename project: ${project.name}`}
                onClick={() => { setEditName(project.name); setEditing(true); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditName(project.name); setEditing(true); } }}
              >
                {project.name}
              </h1>
            ) : project && editing ? (
              <input
                className="rename-input"
                value={editName}
                autoFocus
                disabled={renaming}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => void handleRename()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditing(false);
                }}
              />
            ) : (
              <h1>No project open</h1>
            )}
            <p>
              {project
                ? project.sourceFileName || project.description || "Created manually."
                : "Create a project or seed from a file."}
            </p>
            {renameError && (
              <p className="rename-error" role="alert">
                {renameError}
                {" "}
                <button className="rename-retry" onClick={() => { setEditName(editName); setEditing(true); setRenameError(""); }}>
                  Try again
                </button>
              </p>
            )}
          </div>
          <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
        </div>
      </div>

      <div className="overview-document">
        {project && (
          <KPICards
            projectId={project.id}
            summary={summary}
            issues={issues}
            blockedSeverities={appConfig.validation.exportBlockedBySeverities}
            dimensionCount={dimensions.length}
          />
        )}

        <section className="overview-dimensions">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Dimensions</span>
              <h2>Open a workspace</h2>
            </div>
            <span>{dimensions.length} available</span>
          </div>

          {dimensions.length > 3 && (
            <div className="overview-dim-search">
              <Search size={14} />
              <input
                ref={dimSearchRef}
                value={dimSearch}
                onChange={(e) => setDimSearch(e.target.value)}
                placeholder="Filter dimensions (press /)"
                aria-label="Filter dimensions"
              />
            </div>
          )}

          {filteredDimensions.length ? (
            <div className="dimension-list">
              {filteredDimensions.map((dimension) => {
                const dimensionIssues = dimensionIssueMap.get(dimension.id) ?? { errors: 0, warnings: 0, infos: 0, total: 0, blocksExport: false };
                return (
                  <button className="dimension-row" key={dimension.id} onClick={() => onOpenDimension(dimension.id)}>
                    <span>
                      <b>{getDimensionDisplayLabel(dimension, dimensionDisplayConfig)}</b>
                      <small>{getDimensionDisplaySubtitle(dimension, dimensionDisplayConfig)}</small>
                    </span>
                    <StatusBadge tone={dimensionIssues.errors ? "danger" : dimensionIssues.warnings ? "warning" : "success"}>
                      {dimensionIssues.total ? `${dimensionIssues.total} issues` : "Clean"}
                    </StatusBadge>
                    <ArrowRight size={16} />
                  </button>
                );
              })}
            </div>
          ) : dimensions.length ? (
            <EmptyState title="No dimensions match">
              No dimensions match "{dimSearch}".
            </EmptyState>
          ) : (
            <EmptyState title={project ? "No dimensions available" : "No project open"}>
              {project
                ? "This project has no configured dimensions to inspect."
                : "Create a project or seed from a file."}
            </EmptyState>
          )}
        </section>

        {project && (
          <details
            className="overview-secondary"
            open={disclosureOpen}
            onToggle={(e) => {
              const open = (e.currentTarget as HTMLDetailsElement).open;
              setDisclosureOpen(open);
              localStorage.setItem(DISCLOSURE_KEY, open ? "open" : "closed");
            }}
          >
            <summary className="overview-secondary-toggle">
              Snapshots and Blueprints
            </summary>
            <div className="overview-secondary-content">
              <SnapshotManager project={project} onProjectChanged={onProjectChanged} />
              <BlueprintStudio appConfig={appConfig} dimensions={dimensions} project={project} />
            </div>
          </details>
        )}
        {!project && <BlueprintStudio appConfig={appConfig} dimensions={dimensions} project={project} />}
      </div>
    </section>
  );
}
