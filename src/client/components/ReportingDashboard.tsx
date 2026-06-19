import { Activity, Download, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useEffect, useState } from "react";
import { getAccessToken } from "../api/client";
import { fetchHealthReport, fetchCoverageReport } from "../api/reports";
import { ActionButton, FactItem, FactStrip, Panel, StatusBadge } from "./ui";
import { SkeletonReportDashboard } from "./Skeleton";
import { ScoreRing } from "./ScoreRing";

interface HealthSnapshot {
  dimensionType: string;
  qualityScore: number;
  completenessScore: number;
  namingScore: number;
  memberCount: number;
  orphanCount: number;
  validationErrorCount: number;
  validationWarningCount: number;
}

interface HealthReport {
  overallScore: number;
  trend: string;
  snapshots: HealthSnapshot[];
}

interface CoverageReport {
  overallCoverage: number;
  dimensions: Array<{
    dimensionType: string;
    memberCount: number;
    propertyCoverage: number;
    descriptionCoverage: number;
    lastModified: string;
    isStale: boolean;
  }>;
}

function scoreTone(score: number): "success" | "warning" | "danger" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "improving") return <TrendingUp size={16} className="trend-up" />;
  if (trend === "declining") return <TrendingDown size={16} className="trend-down" />;
  return <Minus size={16} className="trend-stable" />;
}

export function ReportingDashboard({ projectId }: { projectId: string }) {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [h, c] = await Promise.all([
          fetchHealthReport(projectId),
          fetchCoverageReport(projectId)
        ]);
        if (!cancelled) { setHealth(h); setCoverage(c); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load reports");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId]);

  async function handleExport(format: 'html' | 'csv' | 'json') {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const response = await fetch(`/api/reports/export/health`, {
        method: "POST",
        headers,
        body: JSON.stringify({ projectId, format })
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `health-report.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  }

  if (loading) return <SkeletonReportDashboard />;
  if (error) return <div className="banner error">{error}</div>;
  if (!health) return <div className="empty-state">No report data available</div>;

  return (
    <section className="reporting-dashboard">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Reporting & Analytics</span>
          <h2><Activity size={20} /> Health Dashboard</h2>
        </div>
        <div className="export-buttons">
          <ActionButton onClick={() => void handleExport('html')}><Download size={14} /> HTML</ActionButton>
          <ActionButton onClick={() => void handleExport('csv')}><Download size={14} /> CSV</ActionButton>
          <ActionButton onClick={() => void handleExport('json')}><Download size={14} /> JSON</ActionButton>
        </div>
      </div>

      <div className="report-overview">
        <div className="score-hero">
          <ScoreRing score={health.overallScore} size={120} />
          <div className="score-trend">
            <TrendIcon trend={health.trend} />
            <span>{health.trend}</span>
          </div>
        </div>

        <FactStrip>
          <FactItem label="Dimensions" value={health.snapshots.length} />
          <FactItem label="Total Members" value={health.snapshots.reduce((s, d) => s + d.memberCount, 0)} />
          <FactItem label="Orphans" value={health.snapshots.reduce((s, d) => s + d.orphanCount, 0)} tone={health.snapshots.some(d => d.orphanCount > 0) ? "warning" : "neutral"} />
          <FactItem label="Errors" value={health.snapshots.reduce((s, d) => s + d.validationErrorCount, 0)} tone={health.snapshots.some(d => d.validationErrorCount > 0) ? "danger" : "neutral"} />
        </FactStrip>
      </div>

      <Panel className="dimension-scores-panel">
        <div className="panel-heading compact">
          <div><h3>Dimension Scores</h3></div>
        </div>
        <table className="scores-table">
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Quality</th>
              <th>Completeness</th>
              <th>Naming</th>
              <th>Members</th>
              <th>Issues</th>
            </tr>
          </thead>
          <tbody>
            {health.snapshots.map(snap => (
              <tr key={snap.dimensionType}>
                <td className="dim-name">{snap.dimensionType}</td>
                <td><ScoreBar score={snap.qualityScore} /></td>
                <td><ScoreBar score={snap.completenessScore} /></td>
                <td><ScoreBar score={snap.namingScore} /></td>
                <td>{snap.memberCount}</td>
                <td>
                  {snap.validationErrorCount > 0 && <StatusBadge tone="danger">{snap.validationErrorCount} errors</StatusBadge>}
                  {snap.validationWarningCount > 0 && <StatusBadge tone="warning">{snap.validationWarningCount} warn</StatusBadge>}
                  {snap.validationErrorCount === 0 && snap.validationWarningCount === 0 && <StatusBadge tone="success">Clean</StatusBadge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {coverage && (
        <Panel className="coverage-panel">
          <div className="panel-heading compact">
            <div><h3>Coverage Analysis</h3></div>
            <StatusBadge tone={scoreTone(coverage.overallCoverage)}>{coverage.overallCoverage}% overall</StatusBadge>
          </div>
          <div className="coverage-grid">
            {coverage.dimensions.map(dim => (
              <div key={dim.dimensionType} className="coverage-card">
                <strong>{dim.dimensionType}</strong>
                <div className="coverage-metrics">
                  <div className="coverage-metric">
                    <span>Properties</span>
                    <ScoreBar score={dim.propertyCoverage} />
                  </div>
                  <div className="coverage-metric">
                    <span>Descriptions</span>
                    <ScoreBar score={dim.descriptionCoverage} />
                  </div>
                </div>
                <small>{dim.memberCount} members {dim.isStale && <StatusBadge tone="warning">Stale</StatusBadge>}</small>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </section>
  );
}

function ScoreBar({ score }: { score: number }) {
  const tone = scoreTone(score);
  return (
    <div className="score-bar-container">
      <div className={`score-bar ${tone}`} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      <span className="score-bar-label">{score}</span>
    </div>
  );
}
