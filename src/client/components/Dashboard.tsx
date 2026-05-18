import { ArrowRight, Download, FileUp, ShieldCheck } from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { getDimensionDisplayLabel, getDimensionDisplaySubtitle } from "../../shared/dimensionDisplay";
import type { DashboardSummary, DimensionRecord, ProjectRecord, ValidationIssue } from "../../shared/types";
import { buildIssueSummary, type ExportAvailability, formatCount } from "../ui/viewModel";
import { ActionButton, EmptyState, MetricTile, Panel, StatusBadge } from "./ui";

export function Dashboard({
  dimensions,
  summary,
  project,
  issues,
  onImport,
  onValidate,
  validateDisabled,
  onExport,
  exportAvailability,
  onOpenDimension,
  appConfig
}: {
  dimensions: DimensionRecord[];
  summary: DashboardSummary | null;
  project: ProjectRecord | null;
  issues: ValidationIssue[];
  onImport: () => void;
  onValidate: () => void;
  validateDisabled: boolean;
  onExport: () => void;
  exportAvailability: ExportAvailability;
  onOpenDimension: (dimensionId: string) => void;
  appConfig: ClientAppConfig;
}) {
  const cards = appConfig.dashboard.cards;
  const dimensionDisplayConfig = appConfig.dimensions.display;
  const issueSummary = buildIssueSummary(issues, appConfig.validation.exportBlockedBySeverities);
  const exportTone = exportAvailability.disabled ? "warning" : "success";
  const metrics = [
    { key: "totalDimensions", label: "Dimensions", value: summary?.totalDimensions ?? dimensions.length, enabled: cards.totalDimensions, tone: "neutral" as const },
    { key: "totalMembers", label: "Members", value: summary?.totalMembers ?? 0, enabled: cards.totalMembers, tone: "neutral" as const },
    { key: "totalRelationships", label: "Relationships", value: summary?.totalRelationships ?? 0, enabled: cards.totalRelationships, tone: "neutral" as const },
    { key: "validationErrors", label: "Blocking errors", value: summary?.validationErrors ?? issueSummary.errors, enabled: cards.validationErrors, tone: issueSummary.errors ? "danger" as const : "success" as const },
    { key: "validationWarnings", label: "Warnings", value: summary?.validationWarnings ?? issueSummary.warnings, enabled: cards.validationWarnings, tone: issueSummary.warnings ? "warning" as const : "success" as const },
    { key: "exportStatus", label: "Export readiness", value: exportAvailability.disabled ? "Blocked" : "Ready", enabled: cards.exportStatus, tone: exportTone as "warning" | "success", detail: exportAvailability.reason }
  ];

  return (
    <section className="dashboard">
      <Panel className="dashboard-command">
        <div className="dashboard-command-copy">
          <span className="section-kicker">Project command center</span>
          <h1>{project?.name ?? appConfig.application.title}</h1>
          <p>{project?.sourceFileName ?? appConfig.application.description}</p>
          <div className="dashboard-status-row">
            <StatusBadge tone={issueSummary.blocksExport ? "danger" : issueSummary.total ? "warning" : "success"}>
              {issueSummary.blocksExport ? "Export blocked" : issueSummary.total ? "Review issues" : "Ready"}
            </StatusBadge>
            <span>{exportAvailability.reason}</span>
          </div>
        </div>
        <div className="dashboard-command-actions">
          <ActionButton variant="primary" onClick={onImport}><FileUp size={16} /> Import</ActionButton>
          <ActionButton disabled={validateDisabled} onClick={onValidate}><ShieldCheck size={16} /> Validate</ActionButton>
          <ActionButton disabled={exportAvailability.disabled} title={exportAvailability.title} onClick={onExport}><Download size={16} /> Export</ActionButton>
        </div>
      </Panel>

      <div className="metric-grid">
        {metrics.filter((metric) => metric.enabled).map((metric) => (
          <MetricTile
            key={metric.key}
            label={metric.label}
            value={typeof metric.value === "number" ? formatCount(metric.value) : metric.value}
            tone={metric.tone}
            detail={metric.detail}
          />
        ))}
      </div>

      {cards.recentDimensions && (
        <Panel className="recent-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Workspace</span>
              <h2>Dimensions</h2>
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
            <EmptyState
              title={project ? "No dimensions available" : "No project imported"}
              action={!project ? <ActionButton variant="primary" onClick={onImport}><FileUp size={16} /> Import XLSX</ActionButton> : undefined}
            >
              {project
                ? "This project has no imported dimensions to inspect."
                : "Import the OneStream XF metadata workbook to inspect dimensions, validate hierarchy issues, and export controlled metadata files."}
            </EmptyState>
          )}
        </Panel>
      )}
    </section>
  );
}
