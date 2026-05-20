import { useState } from "react";
import { ArrowRight, Database } from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { getDimensionDisplayLabel, getDimensionDisplaySubtitle } from "../../shared/dimensionDisplay";
import type { DashboardSummary, DimensionRecord, ProjectRecord, ValidationIssue } from "../../shared/types";
import { apiPatchJson } from "../api/client";
import { buildIssueSummary, formatCount } from "../ui/viewModel";
import { BlueprintStudio } from "./BlueprintStudio";
import { SnapshotManager } from "./SnapshotManager";
import { EmptyState, FactItem, FactStrip, StatusBadge } from "./ui";

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

  async function handleRename() {
    if (!project || !editName.trim() || editName.trim() === project.name) {
      setEditing(false);
      return;
    }
    try {
      await apiPatchJson<ProjectRecord>(`/projects/${project.id}`, { name: editName.trim() });
      onProjectChanged?.(project.id);
    } catch { /* ignore */ }
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
                onClick={() => { setEditName(project.name); setEditing(true); }}
              >
                {project.name}
              </h1>
            ) : project && editing ? (
              <input
                className="rename-input"
                value={editName}
                autoFocus
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
                : "Create a project or seed one from XLSX."}
            </p>
          </div>
          <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
        </div>
      </div>

      <div className="overview-document">
        <FactStrip className="overview-facts">
          <FactItem label="Dimensions" value={formatCount(summary?.totalDimensions ?? dimensions.length)} />
          <FactItem label="Members" value={formatCount(summary?.totalMembers ?? 0)} />
          <FactItem label="Relationships" value={formatCount(summary?.totalRelationships ?? 0)} />
          <FactItem label="Errors" value={formatCount(summaryErrors)} tone={summaryErrors ? "danger" : "neutral"} />
          <FactItem label="Warnings" value={formatCount(summaryWarnings)} tone={summaryWarnings ? "warning" : "neutral"} />
        </FactStrip>

        <section className="overview-dimensions">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Dimensions</span>
              <h2>Open a workspace</h2>
            </div>
            <span>{dimensions.length} available</span>
          </div>

          {dimensions.length ? (
            <div className="dimension-list">
              {dimensions.map((dimension) => {
                const dimensionIssues = buildIssueSummary(issues, appConfig.validation.exportBlockedBySeverities, dimension.id);
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
          ) : (
            <EmptyState title={project ? "No dimensions available" : "No project open"}>
              {project
                ? "This project has no configured dimensions to inspect."
                : "Create a project or seed one from XLSX."}
            </EmptyState>
          )}
        </section>

        {project ? <SnapshotManager project={project} onProjectChanged={onProjectChanged} /> : null}
        <BlueprintStudio appConfig={appConfig} dimensions={dimensions} project={project} />
      </div>
    </section>
  );
}
