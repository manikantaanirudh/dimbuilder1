import { AlertTriangle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import type { DimensionRecord, Severity, ValidationIssue } from "../../shared/types";
import { buildDimensionFacts, buildIssueSummary, getReadinessLabel } from "../ui/viewModel";
import { EmptyState, FactItem, FactStrip, SeverityPill, StatusBadge } from "./ui";

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
  const readinessLabel = getReadinessLabel(summary);
  const facts = buildDimensionFacts(dimension, summary);
  const visibleIssues = issues.slice(0, expanded ? 500 : 8);
  const Container = expanded ? "section" : "aside";

  return (
    <Container className={expanded ? "panel issue-panel expanded" : "panel issue-panel details-rail"}>
      <div className="panel-heading compact">
        <div>
          <span className="section-kicker">{expanded ? "Validation" : "Readiness"}</span>
          <h2>{expanded ? "Issues" : readinessLabel}</h2>
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
      {!expanded && (
        <div className="rail-section">
          <h3>Dimension details</h3>
          <FactStrip className="rail-facts">
            {facts.map((fact) => (
              <FactItem key={fact.label} label={fact.label} value={fact.value} tone={fact.tone ?? "neutral"} />
            ))}
          </FactStrip>
        </div>
      )}
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
