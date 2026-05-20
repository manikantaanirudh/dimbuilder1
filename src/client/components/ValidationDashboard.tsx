import { useMemo } from "react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import type { DimensionRecord, ValidationIssue } from "../../shared/types";
import { getDimensionDisplayLabel } from "../../shared/dimensionDisplay";
import { StatusBadge } from "./ui";

export function ValidationDashboard({
  issues,
  dimensions,
  appConfig,
  onNavigateDimension
}: {
  issues: ValidationIssue[];
  dimensions: DimensionRecord[];
  appConfig: ClientAppConfig;
  onNavigateDimension?: (dimensionId: string) => void;
}) {
  const blockedSeverities = appConfig.validation.exportBlockedBySeverities;
  const totalErrors = issues.filter(i => i.severity === "error").length;
  const totalWarnings = issues.filter(i => i.severity === "warning").length;
  const totalInfos = issues.filter(i => i.severity === "info").length;
  const hasBlocking = issues.some(i => blockedSeverities.includes(i.severity));

  const byDimension = useMemo(() => {
    const map = new Map<string, { dimension: DimensionRecord; errors: number; warnings: number; infos: number }>();
    for (const dim of dimensions) {
      map.set(dim.id, { dimension: dim, errors: 0, warnings: 0, infos: 0 });
    }
    for (const issue of issues) {
      const entry = map.get(issue.dimensionId);
      if (!entry) continue;
      if (issue.severity === "error") entry.errors++;
      else if (issue.severity === "warning") entry.warnings++;
      else entry.infos++;
    }
    return [...map.values()].filter(e => e.errors + e.warnings + e.infos > 0)
      .sort((a, b) => (b.errors - a.errors) || (b.warnings - a.warnings));
  }, [issues, dimensions]);

  const byRuleCode = useMemo(() => {
    const map = new Map<string, { code: string; severity: string; count: number }>();
    for (const issue of issues) {
      const existing = map.get(issue.code);
      if (existing) {
        existing.count++;
      } else {
        map.set(issue.code, { code: issue.code, severity: issue.severity, count: 1 });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [issues]);

  const displayConfig = appConfig.dimensions.display;

  return (
    <section className="panel validation-dashboard">
      <div className="admin-page">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Project-Wide</span>
            <h1>Validation Dashboard</h1>
          </div>
          <StatusBadge tone={hasBlocking ? "danger" : issues.length ? "warning" : "success"}>
            {hasBlocking ? "Export Blocked" : issues.length ? "Needs Review" : "Ready"}
          </StatusBadge>
        </div>

        <div className="validation-summary-cards">
          <div className="summary-card danger">
            <span className="summary-value">{totalErrors}</span>
            <span className="summary-label">Errors</span>
          </div>
          <div className="summary-card warning">
            <span className="summary-value">{totalWarnings}</span>
            <span className="summary-label">Warnings</span>
          </div>
          <div className="summary-card info">
            <span className="summary-value">{totalInfos}</span>
            <span className="summary-label">Info</span>
          </div>
          <div className="summary-card neutral">
            <span className="summary-value">{issues.length}</span>
            <span className="summary-label">Total Issues</span>
          </div>
        </div>

        {byDimension.length > 0 && (
          <div className="validation-section">
            <h2>Issues by Dimension</h2>
            <table className="rules-table">
              <thead>
                <tr><th>Dimension</th><th>Errors</th><th>Warnings</th><th>Info</th><th>Total</th></tr>
              </thead>
              <tbody>
                {byDimension.map(({ dimension, errors, warnings, infos }) => (
                  <tr key={dimension.id} className="clickable-row" onClick={() => onNavigateDimension?.(dimension.id)}>
                    <td><b>{getDimensionDisplayLabel(dimension, displayConfig)}</b></td>
                    <td className={errors ? "text-danger" : ""}>{errors}</td>
                    <td className={warnings ? "text-warning" : ""}>{warnings}</td>
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
                <tr><th>Rule Code</th><th>Severity</th><th>Count</th></tr>
              </thead>
              <tbody>
                {byRuleCode.slice(0, 20).map(({ code, severity, count }) => (
                  <tr key={code}>
                    <td><code>{code}</code></td>
                    <td>
                      <StatusBadge tone={severity === "error" ? "danger" : severity === "warning" ? "warning" : "info"}>
                        {severity}
                      </StatusBadge>
                    </td>
                    <td><b>{count}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {issues.length === 0 && (
          <p className="admin-note">No validation issues recorded. Run validation to see results.</p>
        )}
      </div>
    </section>
  );
}
