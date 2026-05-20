import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import type { DimensionRecord, Severity, ValidationIssue } from "../../shared/types";
import { buildDimensionFacts, buildIssueSummary, getReadinessLabel } from "../ui/viewModel";
import { EmptyState, FactItem, FactStrip, SeverityPill, StatusBadge } from "./ui";

export function IssuePanel({
  dimension,
  issues,
  appConfig,
  expanded = false,
  onIssueClick
}: {
  dimension: DimensionRecord;
  issues: ValidationIssue[];
  appConfig: ClientAppConfig;
  expanded?: boolean;
  onIssueClick?: (issue: ValidationIssue) => void;
}) {
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [codeFilter, setCodeFilter] = useState("");
  const summary = buildIssueSummary(issues, appConfig.validation.exportBlockedBySeverities);
  const readinessLabel = getReadinessLabel(summary);
  const facts = buildDimensionFacts(dimension, summary);
  const profileLabel = appConfig.validation.oneStreamProfile.enabled ? "OneStream" : "Default";
  const filteredIssues = useMemo(() => {
    const codeNeedle = codeFilter.trim().toLowerCase();
    return issues.filter((issue) => {
      if (severityFilter !== "all" && issue.severity !== severityFilter) return false;
      if (codeNeedle && !issue.code.toLowerCase().includes(codeNeedle)) return false;
      return true;
    });
  }, [codeFilter, issues, severityFilter]);
  const visibleIssues = filteredIssues.slice(0, expanded ? 500 : 8);
  const Container = expanded ? "section" : "aside";
  const pageClassName = expanded ? "issue-panel-page" : "details-rail-page";
  const issueSummaryClassName = expanded ? "issue-summary" : "issue-summary rail-issue-summary";
  const issuesSectionClassName = expanded ? "issues-section" : "rail-issues-section";

  return (
    <Container className={expanded ? "panel issue-panel expanded" : "panel issue-panel details-rail"}>
      <div className={pageClassName}>
        <div className="panel-heading compact">
          <div>
            <span className="section-kicker">{expanded ? "Validation" : "Readiness"}</span>
            <h2>{expanded ? "Issues" : readinessLabel}</h2>
          </div>
          <StatusBadge tone={summary.blocksExport ? "danger" : summary.total ? "warning" : "success"}>
            {summary.blocksExport ? "Blocked" : summary.total ? "Review" : "Clean"}
          </StatusBadge>
        </div>

        <div className={issueSummaryClassName}>
          <span><b>{summary.errors}</b> errors</span>
          <span><b>{summary.warnings}</b> warnings</span>
          {summary.infos > 0 && <span><b>{summary.infos}</b> info</span>}
          <span><b>{profileLabel}</b> Validation profile</span>
        </div>

        {expanded && (
          <div className="issue-filters" aria-label="Validation issue filters">
            <label>
              <span>Filter by severity</span>
              <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as Severity | "all")}>
                <option value="all">All severities</option>
                <option value="error">Errors</option>
                <option value="warning">Warnings</option>
                <option value="info">Info</option>
              </select>
            </label>
            <label>
              <span>Filter issue code</span>
              <input value={codeFilter} onChange={(event) => setCodeFilter(event.target.value)} placeholder="UNKNOWN_PROPERTY" />
            </label>
          </div>
        )}

        {!expanded && (
          <div className="rail-section rail-property-section">
            <h3>Dimension details</h3>
            <FactStrip className="rail-facts">
              {facts.map((fact) => (
                <FactItem key={fact.label} label={fact.label} value={fact.value} tone={fact.tone ?? "neutral"} />
              ))}
            </FactStrip>
          </div>
        )}

        <div className={issuesSectionClassName}>
          {visibleIssues.length === 0 ? (
            <EmptyState title="No issues recorded">
              {issues.length === 0 ? `${dimension.sheetName} has no recorded validation issues.` : "No issues match the current filters."}
            </EmptyState>
          ) : (
            <div className="issue-list">
              {visibleIssues.map((issue) => <IssueCard issue={issue} key={issue.id} onClick={onIssueClick} />)}
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}

function IssueCard({ issue, onClick }: { issue: ValidationIssue; onClick?: (issue: ValidationIssue) => void }) {
  const location = [issue.fieldName, issue.rowNumber ? `Row ${issue.rowNumber}` : ""].filter(Boolean).join(" | ");
  const clickable = onClick && (issue.entityType === "member" || issue.entityType === "relationship");

  return (
    <div
      className={`issue ${issue.severity}${clickable ? " clickable" : ""}`}
      onClick={clickable ? () => onClick(issue) : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(issue); } : undefined}
    >
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
