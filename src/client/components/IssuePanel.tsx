import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Shield,
  TriangleAlert,
} from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import type {
  DimensionRecord,
  Severity,
  ValidationIssue,
} from "../../shared/types";
import {
  buildDimensionFacts,
  buildIssueSummary,
  getReadinessLabel,
  getValidationErrors,
  type IssueSummary,
} from "../ui/viewModel";
import {
  EmptyState,
  FactItem,
  FactStrip,
  SeverityPill,
  StatusBadge,
} from "./ui";

function IssueSummarySection({
  expanded,
  summary,
  profileLabel,
}: {
  expanded: boolean;
  summary: IssueSummary;
  profileLabel: string;
}) {
  if (expanded) {
    return (
      <div className="issue-summary">
        <span>
          <b>{summary.errors}</b> errors
        </span>
        <span>
          <b>{summary.warnings}</b> warnings
        </span>
        <span>
          <b>{summary.infos}</b> info
        </span>
        <span>
          <b>{profileLabel}</b> Validation profile
        </span>
      </div>
    );
  }

  return (
    <div className="rail-issue-summary">
      <span>
        <span>Errors</span>
        <b>{summary.errors}</b>
      </span>
      <span>
        <span>Warnings</span>
        <b>{summary.warnings}</b>
      </span>
      <span>
        <span>Info</span>
        <b>{summary.infos}</b>
      </span>
      <span>
        <span>Validation profile</span>
        <b>{profileLabel}</b>
      </span>
    </div>
  );
}

export function IssuePanel({
  dimension,
  issues,
  appConfig,
  expanded = false,
  onIssueClick,
}: {
  dimension: DimensionRecord;
  issues: ValidationIssue[];
  appConfig: ClientAppConfig;
  expanded?: boolean;
  onIssueClick?: (issue: ValidationIssue) => void;
}) {
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [codeFilter, setCodeFilter] = useState("");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);
  const summary = buildIssueSummary(
    issues,
    appConfig.validation.exportBlockedBySeverities,
  );
  const readinessLabel = getReadinessLabel(summary);
  const facts = buildDimensionFacts(dimension, summary);
  const profileLabel = appConfig.validation.oneStreamProfile.enabled
    ? "OneStream"
    : "Default";
  const reportableIssues = getValidationErrors(issues);
  const filteredIssues = useMemo(() => {
    const codeNeedle = codeFilter.trim().toLowerCase();
    return reportableIssues.filter((issue) => {
      if (!showDismissed && dismissedIds.has(issue.id)) return false;
      if (severityFilter !== "all" && issue.severity !== severityFilter)
        return false;
      if (codeNeedle && !issue.code.toLowerCase().includes(codeNeedle))
        return false;
      return true;
    });
  }, [
    codeFilter,
    reportableIssues,
    severityFilter,
    dismissedIds,
    showDismissed,
  ]);
  const [showAll, setShowAll] = useState(false);
  const maxVisible = expanded ? (showAll ? filteredIssues.length : 50) : 8;
  const visibleIssues = filteredIssues.slice(0, maxVisible);
  const Container = expanded ? "section" : "aside";
  const pageClassName = expanded ? "issue-panel-page" : "details-rail-page";
  const issuesSectionClassName = expanded
    ? "issues-section"
    : "rail-issues-section";
  const railFacts = facts.filter(
    (fact) => fact.label !== "Errors" && fact.label !== "Warnings",
  );

  return (
    <Container
      className={
        expanded
          ? "panel issue-panel expanded"
          : "panel issue-panel details-rail"
      }
    >
      <div className={pageClassName}>
        <div className="panel-heading compact">
          <div>
            <span className="section-kicker">
              {expanded ? "Validation" : "Readiness"}
            </span>
            <h2>{expanded ? "Issues" : readinessLabel}</h2>
          </div>
          <StatusBadge
            tone={
              summary.blocksExport
                ? "danger"
                : summary.total
                  ? "warning"
                  : "success"
            }
          >
            {summary.blocksExport
              ? "Blocked"
              : summary.total
                ? "Review"
                : "Clean"}
          </StatusBadge>
        </div>

        <IssueSummarySection
          expanded={expanded}
          summary={summary}
          profileLabel={profileLabel}
        />

        {expanded && (
          <div className="issue-filters" aria-label="Validation issue filters">
            <label>
              <span>Filter by severity</span>
              <select
                value={severityFilter}
                onChange={(event) =>
                  setSeverityFilter(event.target.value as Severity | "all")
                }
              >
                <option value="all">All errors</option>
                <option value="error">Errors</option>
              </select>
            </label>
            <label>
              <span>Filter issue code</span>
              <input
                value={codeFilter}
                onChange={(event) => setCodeFilter(event.target.value)}
                placeholder="UNKNOWN_PROPERTY"
              />
            </label>
          </div>
        )}

        {!expanded && (
          <div className="rail-section rail-property-section">
            <h3>Dimension details</h3>
            <FactStrip className="rail-facts">
              {railFacts.map((fact) => (
                <FactItem
                  key={fact.label}
                  label={fact.label}
                  value={fact.value}
                  tone={fact.tone ?? "neutral"}
                />
              ))}
            </FactStrip>
          </div>
        )}

        <div className={issuesSectionClassName}>
          {visibleIssues.length === 0 ? (
            <EmptyState title="No errors recorded">
              {reportableIssues.length === 0
                ? `${dimension.sheetName} has no recorded validation errors.`
                : "No errors match the current filters."}
            </EmptyState>
          ) : (
            <div className="issue-list">
              {visibleIssues.map((issue) => (
                <IssueCard
                  issue={issue}
                  key={issue.id}
                  onClick={onIssueClick}
                  isDismissed={dismissedIds.has(issue.id)}
                  onDismiss={(id) =>
                    setDismissedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                />
              ))}
              {expanded && filteredIssues.length > 50 && !showAll && (
                <button
                  className="action-button secondary"
                  style={{ width: "100%", marginTop: "0.5rem" }}
                  onClick={() => setShowAll(true)}
                >
                  Show all {filteredIssues.length} errors (
                  {filteredIssues.length - 50} more)
                </button>
              )}
            </div>
          )}
          {dismissedIds.size > 0 && (
            <div
              style={{
                marginTop: "0.5rem",
                fontSize: "0.78rem",
                color: "var(--muted)",
              }}
            >
              <label style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={showDismissed}
                  onChange={() => setShowDismissed(!showDismissed)}
                  style={{ marginRight: "0.3rem" }}
                />
                Show {dismissedIds.size} dismissed error(s)
              </label>
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}

function IssueCard({
  issue,
  onClick,
  isDismissed,
  onDismiss,
}: {
  issue: ValidationIssue;
  onClick?: (issue: ValidationIssue) => void;
  isDismissed?: boolean;
  onDismiss?: (id: string) => void;
}) {
  const location = [
    issue.fieldName,
    issue.rowNumber ? `Row ${issue.rowNumber}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
  const clickable =
    onClick &&
    (issue.entityType === "member" || issue.entityType === "relationship");

  return (
    <div
      className={`issue ${issue.severity}${clickable ? " clickable" : ""}${isDismissed ? " dismissed" : ""}`}
      onClick={clickable ? () => onClick(issue) : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick(issue);
            }
          : undefined
      }
    >
      <div className="issue-icon">{iconForSeverity(issue.severity)}</div>
      <div style={{ flex: 1 }}>
        <div className="issue-title">
          <b>{issue.code}</b>
          <SeverityPill severity={issue.severity} />
        </div>
        <span>{issue.message}</span>
        {location && <small>{location}</small>}
      </div>
      {onDismiss && (
        <button
          className="issue-dismiss-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(issue.id);
          }}
          title={isDismissed ? "Restore this issue" : "Mark as safe / dismiss"}
          aria-label={isDismissed ? "Restore issue" : "Mark as safe"}
        >
          <Shield size={14} />
          <span>{isDismissed ? "Restore" : "Safe"}</span>
        </button>
      )}
    </div>
  );
}

function iconForSeverity(severity: Severity) {
  if (severity === "error") return <AlertTriangle size={16} />;
  if (severity === "warning") return <TriangleAlert size={16} />;
  if (severity === "info") return <Info size={16} />;
  return <CheckCircle2 size={16} />;
}
