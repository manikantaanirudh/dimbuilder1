import { useEffect, useState } from "react";
import { Grid3x3 } from "lucide-react";
import { fetchRiskHeatmap } from "../api/client";
import type { RiskCell, RiskHeatmapReport, RiskLevel } from "../../shared/riskHeatmap";
import { Panel, StatusBadge } from "./ui";

const LEVEL_COLOR: Record<RiskLevel, string> = {
  none: "rgba(120,200,120,0.18)",
  low: "rgba(120,200,120,0.45)",
  medium: "rgba(240,190,90,0.55)",
  high: "rgba(230,90,90,0.6)"
};

/**
 * Metadata Risk Heatmap (TASK-15). Rows are dimensions, columns are risk categories. Cells are
 * clickable and show the findings that produced the score. Severity filter and legend included.
 */
export function RiskHeatmapPanel({
  projectId,
  onNavigateDimension
}: {
  projectId: string;
  onNavigateDimension?: (dimensionId: string) => void;
}) {
  const [report, setReport] = useState<RiskHeatmapReport | null>(null);
  const [severity, setSeverity] = useState<string>("all");
  const [selected, setSelected] = useState<{ dimensionName: string; categoryLabel: string; cell: RiskCell } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    const filter = severity === "all" ? undefined : [severity];
    void fetchRiskHeatmap(projectId, filter)
      .then((r) => { if (!cancelled) setReport(r); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Heatmap unavailable"); });
    return () => { cancelled = true; };
  }, [projectId, severity]);

  if (error) return <Panel className="risk-heatmap-panel"><StatusBadge tone="danger">{error}</StatusBadge></Panel>;
  if (!report) return <Panel className="risk-heatmap-panel">Loading risk heatmap...</Panel>;

  return (
    <Panel className="risk-heatmap-panel">
      <div className="grid-toolbar">
        <div className="grid-toolbar-title">
          <strong><Grid3x3 size={16} /> Metadata Risk Heatmap</strong>
          <span>Risk by dimension and category. Click a cell for findings.</span>
        </div>
        <label style={{ fontSize: "0.82rem" }}>
          Severity{" "}
          <select value={severity} onChange={(e) => setSeverity(e.currentTarget.value)}>
            <option value="all">All</option>
            <option value="error">Errors only</option>
            <option value="warning">Warnings only</option>
          </select>
        </label>
      </div>

      <div className="risk-legend" style={{ display: "flex", gap: 12, fontSize: "0.78rem", margin: "6px 0" }}>
        {(["none", "low", "medium", "high"] as RiskLevel[]).map((lvl) => (
          <span key={lvl} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 12, background: LEVEL_COLOR[lvl], display: "inline-block", borderRadius: 2 }} />
            {lvl} — {report.legend[lvl]}
          </span>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="data-table risk-heatmap" style={{ fontSize: "0.74rem" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Dimension</th>
              {report.categories.map((c) => <th key={c.key} title={c.label}>{c.label}</th>)}
              <th>Overall</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.dimensionId}>
                <td style={{ textAlign: "left", fontWeight: 600 }}>{row.dimensionName}</td>
                {row.cells.map((cell) => {
                  const category = report.categories.find((c) => c.key === cell.categoryKey)!;
                  return (
                    <td
                      key={cell.categoryKey}
                      style={{ background: LEVEL_COLOR[cell.level], textAlign: "center", cursor: cell.issueCount || cell.score ? "pointer" : "default" }}
                      title={cell.topFindings.join("\n")}
                      onClick={() => setSelected({ dimensionName: row.dimensionName, categoryLabel: category.label, cell })}
                    >
                      {cell.score || ""}
                    </td>
                  );
                })}
                <td style={{ background: LEVEL_COLOR[row.overallLevel], textAlign: "center", fontWeight: 600 }}>{row.overallScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="risk-detail" style={{ borderTop: "1px solid var(--border, #ddd)", marginTop: 10, paddingTop: 8 }}>
          <strong>{selected.dimensionName} — {selected.categoryLabel}</strong>{" "}
          <StatusBadge tone={selected.cell.level === "high" ? "danger" : selected.cell.level === "medium" ? "warning" : "info"}>
            {selected.cell.level} ({selected.cell.score})
          </StatusBadge>
          {selected.cell.topFindings.length > 0 ? (
            <ul style={{ fontSize: "0.82rem", margin: "6px 0" }}>
              {selected.cell.topFindings.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          ) : <p style={{ fontSize: "0.82rem" }}>No findings for this cell.</p>}
          {onNavigateDimension && (
            <button onClick={() => onNavigateDimension(selected.cell.drillTarget)}>Open dimension</button>
          )}
        </div>
      )}
    </Panel>
  );
}
