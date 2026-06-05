import { useEffect, useState } from "react";
import { fetchWorkflowStatus } from "../api/client";
import type { WorkflowStatusReport } from "../../shared/workflowReadiness";
import { ActionButton, StatusBadge } from "./ui";

const STATUS_TONE: Record<string, "success" | "info" | "warning" | "danger" | "neutral"> = {
  complete: "success",
  ready: "info",
  needs_attention: "warning",
  not_started: "neutral"
};

const STATUS_LABEL: Record<string, string> = {
  complete: "Complete",
  ready: "Ready",
  needs_attention: "Needs attention",
  not_started: "Not started"
};

/**
 * Guided workflow progress (TASK-07). Shows end-to-end stage status and a next-best-action.
 * Advisory only - it does not restrict access to existing tabs.
 */
export function WorkflowProgress({
  projectId,
  refreshKey,
  onNavigate
}: {
  projectId: string;
  refreshKey?: number;
  onNavigate?: (linkTarget: string) => void;
}) {
  const [report, setReport] = useState<WorkflowStatusReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    void fetchWorkflowStatus(projectId)
      .then((result) => { if (!cancelled) setReport(result); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Workflow status unavailable"); });
    return () => { cancelled = true; };
  }, [projectId, refreshKey]);

  if (error) return <div className="workflow-progress"><StatusBadge tone="info">{error}</StatusBadge></div>;
  if (!report) return <div className="workflow-progress">Loading workflow...</div>;

  return (
    <div className="workflow-progress" style={{ padding: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <strong>Guided workflow</strong>
        <span>{report.completedStages} / {report.totalStages} stages complete</span>
        {report.nextBestAction && (
          <ActionButton
            variant="primary"
            onClick={() => onNavigate?.(report.nextBestAction!.linkTarget)}
            title={report.nextBestAction.action}
          >
            Next: {report.nextBestAction.label}
          </ActionButton>
        )}
      </div>
      {report.nextBestAction && (
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: "4px 0" }}>{report.nextBestAction.action}</p>
      )}

      <ol className="workflow-stage-list" style={{ margin: "8px 0", paddingLeft: 18, fontSize: "0.85rem" }}>
        {report.stages.map((s) => (
          <li key={s.key} style={{ margin: "3px 0" }}>
            <button
              type="button"
              className="workflow-stage-link"
              onClick={() => onNavigate?.(s.linkTarget)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", textAlign: "left" }}
            >
              {s.label}
            </button>{" "}
            <StatusBadge tone={STATUS_TONE[s.status] ?? "neutral"}>{STATUS_LABEL[s.status] ?? s.status}</StatusBadge>
            {s.optional && <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}> (optional)</span>}
            {s.blockers.length > 0 && (
              <span style={{ color: "var(--danger, #b00)", fontSize: "0.78rem" }}> — {s.blockers[0]}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
