import { ArrowRight } from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { getDimensionDisplayLabel, getDimensionDisplaySubtitle } from "../../shared/dimensionDisplay";
import type { DashboardSummary, DimensionRecord, ProjectRecord, ValidationIssue } from "../../shared/types";
import { buildIssueSummary, formatCount } from "../ui/viewModel";
import { EmptyState, FactItem, FactStrip, StatusBadge } from "./ui";

export function Dashboard({
  dimensions,
  summary,
  project,
  issues,
  onOpenDimension,
  appConfig
}: {
  dimensions: DimensionRecord[];
  summary: DashboardSummary | null;
  project: ProjectRecord | null;
  issues: ValidationIssue[];
  onOpenDimension: (dimensionId: string) => void;
  appConfig: ClientAppConfig;
}) {
  const dimensionDisplayConfig = appConfig.dimensions.display;
  const issueSummary = buildIssueSummary(issues, appConfig.validation.exportBlockedBySeverities);

  return (
    <section className="dashboard project-overview">
      <div className="overview-header">
        <div>
          <span className="section-kicker">Project overview</span>
          <h1>{project?.name ?? "No project imported"}</h1>
          <p>{project?.sourceFileName ?? "Import a OneStream XF metadata workbook from the top command bar."}</p>
        </div>
        <StatusBadge tone={issueSummary.blocksExport ? "danger" : issueSummary.total ? "warning" : "success"}>
          {issueSummary.blocksExport ? "Export blocked" : issueSummary.total ? "Needs review" : "Ready"}
        </StatusBadge>
      </div>

      <FactStrip className="overview-facts">
        <FactItem label="Dimensions" value={formatCount(summary?.totalDimensions ?? dimensions.length)} />
        <FactItem label="Members" value={formatCount(summary?.totalMembers ?? 0)} />
        <FactItem label="Relationships" value={formatCount(summary?.totalRelationships ?? 0)} />
        <FactItem label="Errors" value={formatCount(summary?.validationErrors ?? issueSummary.errors)} tone={issueSummary.errors ? "danger" : "neutral"} />
        <FactItem label="Warnings" value={formatCount(summary?.validationWarnings ?? issueSummary.warnings)} tone={issueSummary.warnings ? "warning" : "neutral"} />
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
          <EmptyState title={project ? "No dimensions available" : "No project imported"}>
            {project
              ? "This project has no imported dimensions to inspect."
              : "Use the Import button in the top command bar to load an XF metadata workbook."}
          </EmptyState>
        )}
      </section>
    </section>
  );
}
