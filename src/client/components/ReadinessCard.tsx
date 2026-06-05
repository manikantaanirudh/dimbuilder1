import { useEffect, useState } from "react";
import { bandLabel } from "../../shared/readinessScore";
import { fetchReadiness, type ReadinessResponse } from "../api/client";
import { StatusBadge } from "./ui";

/**
 * Import readiness summary card (TASK-06). Advisory only - it never blocks export.
 * Refreshes when `refreshKey` changes (e.g. after validation or XML round-trip check runs).
 */
export function ReadinessCard({ projectId, refreshKey }: { projectId: string; refreshKey?: number }) {
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    void fetchReadiness(projectId, true)
      .then((result) => {
        if (!cancelled) setReadiness(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Readiness unavailable");
      });
    return () => { cancelled = true; };
  }, [projectId, refreshKey]);

  if (error) return <div className="readiness-card"><StatusBadge tone="info">{error}</StatusBadge></div>;
  if (!readiness) return <div className="readiness-card">Loading readiness...</div>;

  const tone = readiness.band === "ready" ? "success" : readiness.band === "ready_with_warnings" ? "info" : readiness.band === "needs_review" ? "warning" : "danger";

  return (
    <div className="readiness-card" style={{ padding: "10px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <strong style={{ fontSize: "1.4rem" }}>{readiness.score}</strong>
        <span>/ 100</span>
        <StatusBadge tone={tone}>{bandLabel(readiness.band)}</StatusBadge>
        {readiness.exportWarning && (
          <StatusBadge tone="warning">
            Below export threshold ({readiness.minimumScoreForExportWarning})
          </StatusBadge>
        )}
      </div>

      {readiness.blockers.length > 0 && (
        <ul style={{ margin: "6px 0", fontSize: "0.82rem", color: "var(--danger, #b00)" }}>
          {readiness.blockers.slice(0, 5).map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}

      <table className="data-table" style={{ fontSize: "0.78rem", marginTop: 6 }}>
        <thead>
          <tr><th>Category</th><th>Score</th><th>Status</th></tr>
        </thead>
        <tbody>
          {readiness.categories.map((c) => (
            <tr key={c.key}>
              <td>{c.label}</td>
              <td>{c.score}</td>
              <td>
                <StatusBadge tone={c.status === "ready" ? "success" : c.status === "warning" ? "info" : c.status === "blocker" ? "danger" : "warning"}>
                  {c.status}
                </StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {readiness.topRecommendations.length > 0 && (
        <div style={{ marginTop: 6, fontSize: "0.82rem" }}>
          <strong>Top recommendations</strong>
          <ul style={{ margin: "4px 0" }}>
            {readiness.topRecommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
