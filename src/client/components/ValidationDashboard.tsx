import { useMemo, useState } from "react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import type { DimensionRecord, ValidationIssue } from "../../shared/types";
import { getDimensionDisplayLabel } from "../../shared/dimensionDisplay";
import { onActivate } from "../hooks/keyboardActivate";
import { getValidationErrors } from "../ui/viewModel";
import { StatusBadge } from "./ui";

export function ValidationDashboard({
  issues,
  dimensions,
  appConfig,
  onNavigateDimension,
}: {
  issues: ValidationIssue[];
  dimensions: DimensionRecord[];
  appConfig: ClientAppConfig;
  onNavigateDimension?: (dimensionId: string) => void;
}) {
  const blockedSeverities = appConfig.validation.exportBlockedBySeverities;
  const reportableIssues = issues;
  const totalErrors = issues.filter((i) => i.severity === "error").length;
  const totalWarnings = issues.filter((i) => i.severity === "warning").length;
  const totalInfos = issues.filter((i) => i.severity === "info").length;
  const hasBlocking = issues.some((i) =>
    blockedSeverities.includes(i.severity),
  );
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);

  const filteredIssues = severityFilter
    ? reportableIssues.filter((i) => i.severity === severityFilter)
    : reportableIssues;

  const byDimension = useMemo(() => {
    const map = new Map<
      string,
      {
        dimension: DimensionRecord;
        errors: number;
        warnings: number;
        infos: number;
      }
    >();
    for (const dim of dimensions) {
      map.set(dim.id, { dimension: dim, errors: 0, warnings: 0, infos: 0 });
    }
    for (const issue of filteredIssues) {
      const entry = map.get(issue.dimensionId);
      if (!entry) continue;
      if (issue.severity === "error") entry.errors++;
      else if (issue.severity === "warning") entry.warnings++;
      else entry.infos++;
    }
    return [...map.values()]
      .filter((e) => e.errors + e.warnings + e.infos > 0)
      .sort((a, b) => b.errors - a.errors || b.warnings - a.warnings);
  }, [filteredIssues, dimensions]);

  const byRuleCode = useMemo(() => {
    const map = new Map<
      string,
      { code: string; severity: string; count: number; firstDimId: string }
    >();
    for (const issue of filteredIssues) {
      const existing = map.get(issue.code);
      if (existing) {
        existing.count++;
      } else {
        map.set(issue.code, {
          code: issue.code,
          severity: issue.severity,
          count: 1,
          firstDimId: issue.dimensionId,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [filteredIssues]);

  const displayConfig = appConfig.dimensions.display;

  function handleCardClick(severity: string | null) {
    setSeverityFilter((prev) => (prev === severity ? null : severity));
  }

  return (
    <section className="panel validation-dashboard">
      <div className="admin-page">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Project-Wide</span>
            <h1>Validation Dashboard</h1>
          </div>
          <StatusBadge
            tone={hasBlocking ? "danger" : totalErrors ? "warning" : "success"}
          >
            {hasBlocking
              ? "Export Blocked"
              : totalErrors
                ? "Needs Review"
                : "Ready"}
          </StatusBadge>
        </div>

        <div className="validation-summary-cards">
          <div
            className={`summary-card danger clickable-card ${severityFilter === "error" ? "active-filter" : ""}`}
            role="button"
            tabIndex={0}
            aria-pressed={severityFilter === "error"}
            onClick={() => handleCardClick("error")}
            onKeyDown={onActivate(() => handleCardClick("error"))}
          >
            <span className="summary-value">{totalErrors}</span>
            <span className="summary-label">Errors</span>
          </div>
          <div
            className={`summary-card warning clickable-card ${severityFilter === "warning" ? "active-filter" : ""}`}
            role="button"
            tabIndex={0}
            aria-pressed={severityFilter === "warning"}
            onClick={() => handleCardClick("warning")}
            onKeyDown={onActivate(() => handleCardClick("warning"))}
          >
            <span className="summary-value">{totalWarnings}</span>
            <span className="summary-label">Warnings</span>
          </div>
          <div
            className={`summary-card info clickable-card ${severityFilter === "info" ? "active-filter" : ""}`}
            role="button"
            tabIndex={0}
            aria-pressed={severityFilter === "info"}
            onClick={() => handleCardClick("info")}
            onKeyDown={onActivate(() => handleCardClick("info"))}
          >
            <span className="summary-value">{totalInfos}</span>
            <span className="summary-label">Info</span>
          </div>
          <div
            className={`summary-card neutral clickable-card ${severityFilter === null ? "active-filter" : ""}`}
            role="button"
            tabIndex={0}
            aria-pressed={severityFilter === null}
            onClick={() => handleCardClick(null)}
            onKeyDown={onActivate(() => handleCardClick(null))}
          >
            <span className="summary-value">{issues.length}</span>
            <span className="summary-label">Total Issues</span>
          </div>
        </div>

        {severityFilter && (
          <p
            style={{
              fontSize: "0.82rem",
              color: "var(--muted)",
              marginBottom: "0.5rem",
            }}
          >
            Showing <b>{filteredIssues.length}</b> {severityFilter} issue(s).{" "}
            <button className="chip" onClick={() => setSeverityFilter(null)}>
              Clear filter
            </button>
          </p>
        )}

        {byDimension.length > 0 && (
          <div className="validation-section">
            <h2>Issues by Dimension</h2>
            <table className="rules-table">
              <thead>
                <tr>
                  <th>Dimension</th>
                  <th>Errors</th>
                  <th>Warnings</th>
                  <th>Info</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {byDimension.map(({ dimension, errors, warnings, infos }) => (
                  <tr
                    key={dimension.id}
                    className="clickable-row"
                    onClick={() => onNavigateDimension?.(dimension.id)}
                  >
                    <td>
                      <b>
                        {getDimensionDisplayLabel(dimension, displayConfig)}
                      </b>
                    </td>
                    <td className={errors ? "text-danger" : ""}>{errors}</td>
                    <td className={warnings ? "text-warning" : ""}>
                      {warnings}
                    </td>
                    <td>{infos}</td>
                    <td>{errors + warnings + infos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {byRuleCode.length > 0 && (
          <div className="validation-section">
            <h2>Most Frequent Issues</h2>
            <table className="rules-table">
              <thead>
                <tr>
                  <th>Rule Code</th>
                  <th>Severity</th>
                  <th>Count</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {byRuleCode
                  .slice(0, 20)
                  .map(({ code, severity, count, firstDimId }) => (
                    <tr
                      key={code}
                      className="clickable-row"
                      onClick={() => onNavigateDimension?.(firstDimId)}
                    >
                      <td>
                        <code>{code}</code>
                      </td>
                      <td>
                        <StatusBadge
                          tone={
                            severity === "error"
                              ? "danger"
                              : severity === "warning"
                                ? "warning"
                                : "info"
                          }
                        >
                          {severity}
                        </StatusBadge>
                      </td>
                      <td>
                        <b>{count}</b>
                      </td>
                      <td>
                        <span className="validation-goto-link">Go to dimension →</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {reportableIssues.length === 0 && (
          <p className="admin-note">
            No validation errors recorded. Run validation to see results.
          </p>
        )}
      </div>
    </section>
  );
}
