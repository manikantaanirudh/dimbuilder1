import { AlertTriangle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import type { DimensionRecord, Severity, ValidationIssue } from "../../shared/types";
import { buildIssueSummary } from "../ui/viewModel";
import { EmptyState, SeverityPill, StatusBadge } from "./ui";

export function IssuePanel({
  dimension,
  issues,
  appConfig,
  expanded = false
}: {
  dimension: DimensionRecord;
  issues: ValidationIssue[];
  appConfig: ClientAppConfig;
  expanded?: boolean;
}) {
  const summary = buildIssueSummary(issues, appConfig.validation.exportBlockedBySeverities);
  const visibleIssues = issues.slice(0, expanded ? 500 : 8);
  const Container = expanded ? "section" : "aside";

  return (
    <Container className={expanded ? "panel issue-panel expanded" : "panel issue-panel"}>
      <div className="panel-heading compact">
        <div>
          <span className="section-kicker">Validation</span>
          <h2>{expanded ? "Issues" : "Issue rail"}</h2>
        </div>
        <StatusBadge tone={summary.blocksExport ? "danger" : summary.total ? "warning" : "success"}>
          {summary.blocksExport ? "Blocked" : summary.total ? "Review" : "Clean"}
        </StatusBadge>
      </div>
      <div className="issue-summary">
        <span><b>{summary.errors}</b> errors</span>
        <span><b>{summary.warnings}</b> warnings</span>
        {summary.infos > 0 && <span><b>{summary.infos}</b> info</span>}
      </div>
      {visibleIssues.length === 0 ? (
        <EmptyState title="No issues recorded">
          {dimension.sheetName} has no recorded validation issues.
        </EmptyState>
      ) : (
        <div className="issue-list">
          {visibleIssues.map((issue) => <IssueCard issue={issue} key={issue.id} />)}
        </div>
      )}
    </Container>
  );
}

function IssueCard({ issue }: { issue: ValidationIssue }) {
  const location = [issue.fieldName, issue.rowNumber ? `Row ${issue.rowNumber}` : ""].filter(Boolean).join(" | ");

  return (
    <div className={`issue ${issue.severity}`}>
      <div className="issue-icon">{iconForSeverity(issue.severity)}</div>
      <div>
        <div className="issue-title">
          <b>{issue.code}</b>
          <SeverityPill severity={issue.severity} />
        </div>
        <span>{issue.message}</span>
        {location && <small>{location}</small>}
      </div>
    </div>
  );
}

function iconForSeverity(severity: Severity) {
  if (severity === "error") return <AlertTriangle size={16} />;
  if (severity === "warning") return <TriangleAlert size={16} />;
  if (severity === "info") return <Info size={16} />;
  return <CheckCircle2 size={16} />;
}
