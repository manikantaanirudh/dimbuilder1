import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Clock, Database, GitBranch, Search } from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import {
  getDimensionDisplayLabel,
  getDimensionDisplaySubtitle,
} from "../../shared/dimensionDisplay";
import type {
  DashboardSummary,
  DimensionRecord,
  ProjectRecord,
  ProjectVersionRecord,
  ValidationIssue,
} from "../../shared/types";
import { apiPatchJson, fetchCoverageReport, fetchProjectVersions } from "../api/client";
import {
  buildIssueSummary,
  formatCount,
  sortDimensionsForOverview,
} from "../ui/viewModel";
import { BlueprintStudio } from "./BlueprintStudio";
import { KPICards } from "./KPICards";
import { SnapshotManager } from "./SnapshotManager";
import { ActionButton, EmptyState, StatusBadge } from "./ui";

const DISCLOSURE_KEY = "dimbuilder-overview-disclosure";

function formatSeededTime(isoString?: string): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  } catch {
    return isoString;
  }
}

export function Dashboard({
  dimensions,
  summary,
  project,
  issues,
  onOpenDimension,
  onProjectChanged,
  appConfig,
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
  const issueSummary = buildIssueSummary(
    issues,
    appConfig.validation.exportBlockedBySeverities,
  );
  const summaryErrors = summary?.validationErrors ?? issueSummary.errors;
  const summaryWarnings = summary?.validationWarnings ?? issueSummary.warnings;
  const blocksExport = issueSummary.blocksExport;
  const needsReview =
    blocksExport ||
    summaryErrors > 0 ||
    summaryWarnings > 0 ||
    issueSummary.total > 0;
  const statusTone = !project
    ? "neutral"
    : blocksExport
      ? "danger"
      : needsReview
        ? "warning"
        : "success";
  const statusLabel = !project
    ? "No project"
    : blocksExport
      ? "Export blocked"
      : needsReview
        ? "Needs review"
        : "Ready";
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(project?.name ?? "");
  const [renameError, setRenameError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [dimSearch, setDimSearch] = useState("");
  const [coverageByType, setCoverageByType] = useState<Map<string, number>>(
    new Map(),
  );
  const [versions, setVersions] = useState<ProjectVersionRecord[]>([]);
  const [disclosureOpen, setDisclosureOpen] = useState(
    () => localStorage.getItem(DISCLOSURE_KEY) === "open",
  );
  const dimSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!project) {
      setVersions([]);
      return;
    }
    let cancelled = false;
    void fetchProjectVersions(project.id)
      .then((data) => {
        if (!cancelled) setVersions(data);
      })
      .catch(() => {
        if (!cancelled) setVersions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [project?.id, project?.versionNumber]);

  useEffect(() => {
    if (!project) {
      setCoverageByType(new Map());
      return;
    }
    let cancelled = false;
    void fetchCoverageReport(project.id)
      .then((report) => {
        if (cancelled) return;
        setCoverageByType(
          new Map(
            report.dimensions.map((entry) => [
              entry.dimensionType,
              entry.propertyCoverage,
            ]),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setCoverageByType(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [project?.id, issueSummary.total]);

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
      map.set(
        dim.id,
        buildIssueSummary(
          issues,
          appConfig.validation.exportBlockedBySeverities,
          dim.id,
        ),
      );
    }
    return map;
  }, [dimensions, issues, appConfig.validation.exportBlockedBySeverities]);

  const dimensionStatsMap = useMemo(() => {
    const map = new Map<
      string,
      { memberCount: number; relationshipCount: number }
    >();
    for (const stat of summary?.dimensionStats ?? []) {
      map.set(stat.dimensionId, {
        memberCount: stat.memberCount,
        relationshipCount: stat.relationshipCount,
      });
    }
    return map;
  }, [summary?.dimensionStats]);

  const filteredDimensions = useMemo(() => {
    const query = dimSearch.trim().toLowerCase();
    const scoped = !query
      ? dimensions
      : dimensions.filter((dim) => {
          const label = getDimensionDisplayLabel(
            dim,
            dimensionDisplayConfig,
          ).toLowerCase();
          const subtitle = getDimensionDisplaySubtitle(
            dim,
            dimensionDisplayConfig,
          ).toLowerCase();
          return label.includes(query) || subtitle.includes(query);
        });
    return sortDimensionsForOverview(
      scoped,
      dimensionIssueMap,
      false, // Always keep canonical dimension type order matching the sidebar
    );
  }, [
    dimensions,
    dimSearch,
    dimensionDisplayConfig,
    dimensionIssueMap,
  ]);

  async function handleRename() {
    if (!project || !editName.trim() || editName.trim() === project.name) {
      setEditing(false);
      return;
    }
    setRenameError("");
    setRenaming(true);
    try {
      await apiPatchJson<ProjectRecord>(`/projects/${project.id}`, {
        name: editName.trim(),
      });
      onProjectChanged?.(project.id);
    } catch (caught) {
      setRenameError(
        caught instanceof Error ? caught.message : "Rename failed",
      );
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
                onClick={() => {
                  setEditName(project.name);
                  setEditing(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditName(project.name);
                    setEditing(true);
                  }
                }}
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
                ? project.sourceFileName ||
                  project.description ||
                  "Created manually."
                : "Create a project or seed from a file."}
            </p>
            {renameError && (
              <p className="rename-error" role="alert">
                {renameError}{" "}
                <button
                  className="rename-retry"
                  onClick={() => {
                    setEditName(editName);
                    setEditing(true);
                    setRenameError("");
                  }}
                >
                  Try again
                </button>
              </p>
            )}
          </div>
          <div className="overview-badges" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
            {project?.versionLabel && (
              <StatusBadge tone="info">
                <GitBranch size={13} style={{ marginRight: 4, verticalAlign: "text-bottom" }} />
                {project.versionLabel}
              </StatusBadge>
            )}
            {project?.seededAt && (
              <StatusBadge tone="neutral" title={`Seeded: ${new Date(project.seededAt).toLocaleString()}`}>
                <Clock size={13} style={{ marginRight: 4, verticalAlign: "text-bottom" }} />
                Seeded: {formatSeededTime(project.seededAt)}
              </StatusBadge>
            )}
          </div>
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

        {project && versions.length > 0 && (
          <div className="version-history-panel" style={{ marginTop: 20, padding: 16, background: "var(--color-bg-subtle, #f8fafc)", borderRadius: 8, border: "1px solid var(--color-border, #e2e8f0)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <GitBranch size={16} /> Seeded Version History
              </h3>
              <span style={{ fontSize: "12px", opacity: 0.75 }}>{versions.length} version(s) recorded</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {versions.map((ver) => (
                <div key={ver.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--color-bg, #fff)", borderRadius: 6, border: "1px solid var(--color-border-subtle, #cbd5e1)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <StatusBadge tone={ver.versionNumber === (project.versionNumber ?? 1) ? "info" : "neutral"}>
                      {ver.versionLabel}
                    </StatusBadge>
                    <span style={{ fontWeight: 500, fontSize: "13px" }}>{ver.sourceFileName || "Seeded Metadata"}</span>
                    {ver.versionNumber === (project.versionNumber ?? 1) && (
                      <span style={{ fontSize: "11px", background: "var(--color-primary-light, #e0f2fe)", color: "var(--color-primary, #0284c7)", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>Active</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "12px", opacity: 0.8 }}>
                    <span><Clock size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />{formatSeededTime(ver.seededAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
            <div
              className="dimension-list"
              role="table"
              aria-label="Project dimensions"
            >
              <div
                className="dimension-list-header"
                role="row"
                aria-hidden="true"
              >
                <span role="columnheader">Dimension</span>
                <span className="dimension-metric-head" role="columnheader">
                  Mem
                </span>
                <span className="dimension-metric-head" role="columnheader">
                  Rel
                </span>
                <span className="dimension-metric-head" role="columnheader">
                  Cov
                </span>
                <span role="columnheader">Status</span>
                <span role="columnheader" aria-hidden="true" />
              </div>
              {filteredDimensions.map((dimension) => {
                const dimensionIssues = dimensionIssueMap.get(dimension.id) ?? {
                  errors: 0,
                  warnings: 0,
                  infos: 0,
                  total: 0,
                  blocksExport: false,
                };
                const stats = dimensionStatsMap.get(dimension.id) ?? {
                  memberCount: 0,
                  relationshipCount: 0,
                };
                const coverage = coverageByType.get(dimension.dimensionType);
                const statsLabel = [
                  `${formatCount(stats.memberCount)} members`,
                  `${formatCount(stats.relationshipCount)} relationships`,
                  coverage !== undefined ? `${coverage}% coverage` : null,
                ]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <button
                    className="dimension-row"
                    key={dimension.id}
                    role="row"
                    aria-label={`${getDimensionDisplayLabel(dimension, dimensionDisplayConfig)}. ${statsLabel}. ${dimensionIssues.total ? `${dimensionIssues.total} errors` : "Clean"}.`}
                    onClick={() => onOpenDimension(dimension.id)}
                  >
                    <span className="dimension-label" role="cell">
                      <b>
                        {getDimensionDisplayLabel(
                          dimension,
                          dimensionDisplayConfig,
                        )}
                      </b>
                      <small>
                        {getDimensionDisplaySubtitle(
                          dimension,
                          dimensionDisplayConfig,
                        )}
                      </small>
                    </span>
                    <span
                      className="dimension-metric"
                      role="cell"
                      title="Members"
                    >
                      {formatCount(stats.memberCount)}
                    </span>
                    <span
                      className="dimension-metric"
                      role="cell"
                      title="Relationships"
                    >
                      {formatCount(stats.relationshipCount)}
                    </span>
                    <span
                      className="dimension-metric"
                      role="cell"
                      title="Property coverage"
                    >
                      {coverage !== undefined ? `${coverage}%` : "—"}
                    </span>
                    <span className="dimension-status" role="cell">
                      <StatusBadge
                        tone={
                          dimensionIssues.errors
                            ? "danger"
                            : dimensionIssues.warnings
                              ? "warning"
                              : "success"
                        }
                      >
                        {dimensionIssues.total
                          ? `${dimensionIssues.total} errors`
                          : "Clean"}
                      </StatusBadge>
                    </span>
                    <span
                      className="dimension-row-action"
                      role="cell"
                      aria-hidden="true"
                    >
                      <ArrowRight size={16} />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : dimensions.length ? (
            <EmptyState title="No dimensions match">
              No dimensions match "{dimSearch}".
            </EmptyState>
          ) : (
            <EmptyState
              title={project ? "No dimensions available" : "No project open"}
            >
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
              <SnapshotManager
                project={project}
                onProjectChanged={onProjectChanged}
              />
              <BlueprintStudio
                appConfig={appConfig}
                dimensions={dimensions}
                project={project}
              />
            </div>
          </details>
        )}
        {!project && (
          <BlueprintStudio
            appConfig={appConfig}
            dimensions={dimensions}
            project={project}
          />
        )}
      </div>
    </section>
  );
}
