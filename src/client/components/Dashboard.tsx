import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Clock, Database, GitBranch, Search } from "lucide-react";
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
import { apiPatchJson, fetchCoverageReport, fetchProjectVersions, restoreProjectVersion } from "../api/client";
import { getGroupedOneStreamPropertyDictionary } from "../../shared/oneStreamPropertyDictionary";
import { buildFieldCatalog, type FieldCatalogEntry } from "../ui/fieldCatalog";
import {
  buildBlockingIssueSummary,
  formatCount,
  sortDimensionsForOverview,
} from "../ui/viewModel";
import { BlueprintStudio } from "./BlueprintStudio";
import { GuidedFilterBar } from "./GuidedFilterBar";
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
  onOpenEntity,
  onProjectChanged,
  appConfig,
}: {
  dimensions: DimensionRecord[];
  summary: DashboardSummary | null;
  project: ProjectRecord | null;
  issues: ValidationIssue[];
  onOpenDimension: (dimensionId: string) => void;
  onOpenEntity: (dimensionId: string, entityId: string, kind: "member" | "relationship") => void;
  onProjectChanged?: (projectId: string) => void;
  appConfig: ClientAppConfig;
}) {
  const dimensionDisplayConfig = appConfig.dimensions.display;
  const issueSummary = buildBlockingIssueSummary(issues);
  const blocksExport = issueSummary.blocksExport;
  const statusTone = !project
    ? "neutral"
    : blocksExport
      ? "danger"
      : "success";
  const statusLabel = !project
    ? "No project"
    : blocksExport
      ? "Export blocked"
      : "No blocking errors";
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(project?.name ?? "");
  const [renameError, setRenameError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [coverageByType, setCoverageByType] = useState<Map<string, number>>(
    new Map(),
  );
  const [versions, setVersions] = useState<ProjectVersionRecord[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchStatus, setSwitchStatus] = useState("");
  const switcherRef = useRef<HTMLDivElement>(null);
  const [disclosureOpen, setDisclosureOpen] = useState(
    () => localStorage.getItem(DISCLOSURE_KEY) === "open",
  );

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
    if (!switcherOpen) return;
    function handlePointer(event: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(event.target as Node)) {
        setSwitcherOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSwitcherOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [switcherOpen]);

  async function handleSwitchVersion(versionNumber: number, versionLabel: string) {
    if (!project || switching) return;
    if (versionNumber === (project.versionNumber ?? 1)) {
      setSwitcherOpen(false);
      return;
    }
    const confirmed = window.confirm(
      `Switch to ${versionLabel}? This replaces the current working data with that version.`,
    );
    if (!confirmed) return;
    setSwitching(true);
    setSwitchStatus(`Switching to ${versionLabel}...`);
    try {
      const result = await restoreProjectVersion(project.id, versionNumber);
      setSwitchStatus(result.message);
      setSwitcherOpen(false);
      onProjectChanged?.(project.id);
    } catch (caught) {
      setSwitchStatus(caught instanceof Error ? caught.message : "Failed to switch version");
    } finally {
      setSwitching(false);
    }
  }

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

  const fieldCatalog = useMemo<FieldCatalogEntry[]>(() => {
    if (!project || dimensions.length === 0) return [];
    return buildFieldCatalog(
      getGroupedOneStreamPropertyDictionary(),
      dimensions.map((d) => d.dimensionType),
    );
  }, [project, dimensions]);

  const dimensionIssueMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildBlockingIssueSummary>>();
    for (const dim of dimensions) {
      map.set(
        dim.id,
        buildBlockingIssueSummary(issues, dim.id),
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
    return sortDimensionsForOverview(
      dimensions,
      dimensionIssueMap,
      false, // Always keep canonical dimension type order matching the sidebar
    );
  }, [dimensions, dimensionIssueMap]);

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
            {versions.length > 0 ? (
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                <div ref={switcherRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={switcherOpen}
                    disabled={switching}
                    onClick={() => setSwitcherOpen((prev) => !prev)}
                    title="Switch project version"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--surface-subtle)", border: "1px solid var(--border)", padding: "5px 12px", borderRadius: 8, fontSize: "12px", fontWeight: 600, color: "var(--text)", cursor: switching ? "default" : "pointer", transition: "all 0.15s ease" }}
                  >
                    <GitBranch size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />
                    <span style={{ color: "var(--muted)" }}>Version:</span>
                    <span>{project?.versionLabel ?? `v${project?.versionNumber ?? 1}`}</span>
                    <ChevronDown size={13} style={{ color: "var(--muted)", flexShrink: 0 }} />
                  </button>
                  {switcherOpen && (
                    <div
                      role="listbox"
                      style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30, minWidth: 320, maxWidth: 460, maxHeight: 320, overflowY: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: 4 }}
                    >
                      {versions.map((ver) => {
                        const isActive = ver.versionNumber === (project?.versionNumber ?? 1);
                        return (
                          <button
                            key={ver.id}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            disabled={switching}
                            title={ver.description || undefined}
                            onClick={() => void handleSwitchVersion(ver.versionNumber, ver.versionLabel)}
                            style={{ display: "block", width: "100%", textAlign: "left", background: isActive ? "var(--surface-subtle)" : "transparent", border: "none", borderRadius: 6, padding: "8px 10px", cursor: switching ? "default" : "pointer", color: "var(--text)" }}
                            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--surface-subtle)"; }}
                            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                          >
                            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "12px", fontWeight: 600 }}>
                              {ver.versionLabel}
                              {isActive && <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--primary)", border: "1px solid var(--primary)", borderRadius: 4, padding: "0 4px" }}>ACTIVE</span>}
                            </span>
                            <span style={{ display: "block", fontSize: "11px", color: "var(--muted)", marginTop: 2 }}>
                              {ver.sourceFileName || "Seeded Metadata"} ({formatSeededTime(ver.seededAt)})
                            </span>
                            {ver.description && (
                              <span style={{ display: "block", fontSize: "11px", color: "var(--muted)", marginTop: 2, fontStyle: "italic" }}>
                                {ver.description}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {switchStatus && (
                  <span style={{ fontSize: "11px", color: "var(--muted)" }}>{switchStatus}</span>
                )}
              </div>
            ) : (
              <p>
                {project
                  ? project.sourceFileName ||
                    project.description ||
                    "Created manually."
                  : "Create a project or seed from a file."}
              </p>
            )}
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
            {project?.versionLabel && versions.length === 0 ? (
              <StatusBadge tone="info">
                <GitBranch size={13} style={{ marginRight: 4, verticalAlign: "text-bottom" }} />
                {project.versionLabel}
              </StatusBadge>
            ) : null}
            <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
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



        <section className="overview-dimensions">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Dimensions</span>
              <h2>Open a workspace</h2>
            </div>
            <span>{dimensions.length} available</span>
          </div>

          {project && fieldCatalog.length > 0 && (
            <GuidedFilterBar
              projectId={project.id}
              fieldCatalog={fieldCatalog}
              onOpenEntity={onOpenEntity}
            />
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
                    aria-label={`${getDimensionDisplayLabel(dimension, dimensionDisplayConfig)}. ${statsLabel}. ${dimensionIssues.total ? `${dimensionIssues.total} blocking errors` : "No blockers"}.`}
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
                            : "success"
                        }
                      >
                        {dimensionIssues.total
                          ? `${dimensionIssues.total} blocking errors`
                          : "No blockers"}
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
