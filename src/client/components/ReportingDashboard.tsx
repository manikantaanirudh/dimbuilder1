import { Activity, CheckCircle2, Download, Minus, Shield, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { getAccessToken } from "../api/client";
import { fetchQualityScores, fetchQualityGates } from "../api/intelligence";
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

interface DimensionScore {
  dimensionType: string;
  dimensionName?: string;
  overallScore: number;
  memberCount?: number;
  avgMemberScore?: number;
  completeness?: number;
  naming?: number;
  structure?: number;
  lowestScoreMembers?: Array<{ memberKey: string; score: number }>;
}

interface QualityGate {
  id: string;
  name: string;
  threshold: number;
  scope: string;
  action: string;
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
  const [qualityOverallScore, setQualityOverallScore] = useState(0);
  const [qualityDimensions, setQualityDimensions] = useState<DimensionScore[]>([]);
  const [gates, setGates] = useState<QualityGate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [h, c, qScores, qGates] = await Promise.all([
          fetchHealthReport(projectId),
          fetchCoverageReport(projectId),
          fetchQualityScores(projectId).catch(() => null),
          fetchQualityGates(projectId).catch(() => [] as QualityGate[])
        ]);
        if (!cancelled) {
          setHealth(h);
          setCoverage(c);
          if (qScores) {
            setQualityOverallScore(qScores.overallScore);
            setQualityDimensions(qScores.dimensions ?? []);
          }
          setGates(qGates ?? []);
        }
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

  const totalErrors = health.snapshots.reduce((s, d) => s + d.validationErrorCount, 0);
  const totalWarnings = health.snapshots.reduce((s, d) => s + d.validationWarningCount, 0);
  const totalOrphans = health.snapshots.reduce((s, d) => s + d.orphanCount, 0);
  const totalMembers = health.snapshots.reduce((s, d) => s + d.memberCount, 0);

  return (
    <section className="reporting-dashboard">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Reporting &amp; Analytics</span>
          <h2><Activity size={20} /> Health Dashboard</h2>
        </div>
        <div className="export-buttons">
          <ActionButton onClick={() => void handleExport('html')}><Download size={14} /> HTML</ActionButton>
          <ActionButton onClick={() => void handleExport('csv')}><Download size={14} /> CSV</ActionButton>
          <ActionButton onClick={() => void handleExport('json')}><Download size={14} /> JSON</ActionButton>
        </div>
      </div>

      <div className="report-overview">
        <div className="score-hero-group">
          <div className="score-hero">
            <ScoreRing score={health.overallScore} size={120} label="Health" />
            <div className="score-trend">
              <TrendIcon trend={health.trend} />
              <span>{health.trend}</span>
            </div>
          </div>
          {qualityOverallScore > 0 && (
            <div className="score-hero">
              <ScoreRing score={qualityOverallScore} size={120} label="Quality" />
              <div className="score-trend" style={{ visibility: "hidden" }}>
                <Minus size={16} />
                <span>—</span>
              </div>
            </div>
          )}
        </div>

        <FactStrip>
          <FactItem label="Dimensions" value={health.snapshots.length} />
          <FactItem label="Total Members" value={totalMembers} />
          <FactItem label="Orphans" value={totalOrphans} tone={totalOrphans > 0 ? "warning" : "neutral"} />
          <FactItem label="Errors" value={totalErrors} tone={totalErrors > 0 ? "danger" : "neutral"} />
          <FactItem label="Warnings" value={totalWarnings} tone={totalWarnings > 0 ? "warning" : "neutral"} />
        </FactStrip>
      </div>

      {/* Quality Gates */}
      {gates.length > 0 && (
        <Panel className="quality-gates-panel">
          <div className="panel-heading compact">
            <div><h3><Shield size={16} /> Quality Gates</h3></div>
          </div>
          <div className="quality-gates-grid">
            {gates.map(gate => {
              const passed = qualityOverallScore >= gate.threshold;
              return (
                <div key={gate.id} className={`gate-item ${passed ? "passed" : "failed"}`}>
                  {passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  <span className="gate-name">{gate.name}</span>
                  <span className="gate-threshold">≥ {gate.threshold}</span>
                  <StatusBadge tone={passed ? "success" : "danger"}>{passed ? "PASS" : "FAIL"}</StatusBadge>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Dimension Scores Table */}
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

      {/* Per-Dimension Quality Breakdown */}
      {qualityDimensions.length > 0 && (
        <Panel className="dimension-quality-panel">
          <div className="panel-heading compact">
            <div><h3><Shield size={16} /> Per-Dimension Quality Breakdown</h3></div>
            <StatusBadge tone={scoreTone(qualityOverallScore)}>{qualityOverallScore}/100</StatusBadge>
          </div>
          <div className="quality-dimension-grid">
            {qualityDimensions.map(dim => (
              <div key={dim.dimensionType} className="quality-dimension-card">
                <div className="qd-header">
                  <strong>{dim.dimensionName ?? dim.dimensionType}</strong>
                  <StatusBadge tone={scoreTone(dim.overallScore)}>{dim.overallScore}/100</StatusBadge>
                </div>
                <div className="qd-bars">
                  <div className="qd-bar-row">
                    <span>Overall</span>
                    <div className="score-bar-container">
                      <div className={`score-bar ${scoreTone(dim.overallScore)}`} style={{ width: `${dim.overallScore}%` }} />
                      <span className="score-bar-label">{dim.overallScore}</span>
                    </div>
                  </div>
                  {dim.avgMemberScore !== undefined && (
                    <div className="qd-bar-row">
                      <span>Avg Member</span>
                      <div className="score-bar-container">
                        <div className={`score-bar ${scoreTone(dim.avgMemberScore)}`} style={{ width: `${dim.avgMemberScore}%` }} />
                        <span className="score-bar-label">{dim.avgMemberScore}</span>
                      </div>
                    </div>
                  )}
                  {dim.completeness !== undefined && (
                    <div className="qd-bar-row">
                      <span>Completeness</span>
                      <div className="score-bar-container">
                        <div className={`score-bar ${scoreTone(dim.completeness)}`} style={{ width: `${dim.completeness}%` }} />
                        <span className="score-bar-label">{dim.completeness}</span>
                      </div>
                    </div>
                  )}
                  {dim.naming !== undefined && (
                    <div className="qd-bar-row">
                      <span>Naming</span>
                      <div className="score-bar-container">
                        <div className={`score-bar ${scoreTone(dim.naming)}`} style={{ width: `${dim.naming}%` }} />
                        <span className="score-bar-label">{dim.naming}</span>
                      </div>
                    </div>
                  )}
                  {dim.structure !== undefined && (
                    <div className="qd-bar-row">
                      <span>Structure</span>
                      <div className="score-bar-container">
                        <div className={`score-bar ${scoreTone(dim.structure)}`} style={{ width: `${dim.structure}%` }} />
                        <span className="score-bar-label">{dim.structure}</span>
                      </div>
                    </div>
                  )}
                </div>
                {dim.memberCount !== undefined && (
                  <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                    {dim.memberCount} members
                  </div>
                )}
                {dim.lowestScoreMembers && dim.lowestScoreMembers.length > 0 && (
                  <div className="qd-lowest-members">
                    <small>Lowest scoring members:</small>
                    {dim.lowestScoreMembers.slice(0, 3).map(m => (
                      <div key={m.memberKey} className="qd-low-member">
                        <code>{m.memberKey}</code>
                        <span className={`qd-low-score ${scoreTone(m.score)}`}>{m.score}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Coverage Analysis */}
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
