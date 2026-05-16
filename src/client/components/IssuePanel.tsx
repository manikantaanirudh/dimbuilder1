import type { DimensionRecord, ValidationIssue } from "../../shared/types";

export function IssuePanel({
  dimension,
  issues,
  expanded = false
}: {
  dimension: DimensionRecord;
  issues: ValidationIssue[];
  expanded?: boolean;
}) {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;

  return (
    <aside className={expanded ? "panel issue-panel expanded" : "panel issue-panel"}>
      <h2>Validation</h2>
      <div className="issue-summary">
        <span><b>{errors}</b> errors</span>
        <span><b>{warnings}</b> warnings</span>
      </div>
      {issues.length === 0 ? (
        <div className="empty-state">No issues recorded for {dimension.sheetName}.</div>
      ) : (
        issues.slice(0, expanded ? 500 : 8).map((issue) => (
          <div className={`issue ${issue.severity}`} key={issue.id}>
            <b>{issue.code}</b>
            <span>{issue.message}</span>
            {issue.rowNumber ? <small>Row {issue.rowNumber}</small> : null}
          </div>
        ))
      )}
    </aside>
  );
}

