import {
  Activity,
  BarChart3,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  Minus,
  Search,
  Shield,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getAccessToken } from "../api/client";
import { fetchQualityScores, fetchQualityGates } from "../api/intelligence";
import { fetchHealthReport, fetchCoverageReport } from "../api/reports";
import { ActionButton, FactItem, FactStrip, Panel, StatusBadge } from "./ui";
import { SkeletonReportDashboard } from "./Skeleton";
import { ScoreRing } from "./ScoreRing";

interface HealthSnapshot {
  dimensionType: string;
  dimensionName?: string;
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
    dimensionName?: string;
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
  if (trend === "improving") return <TrendingUp size={16} className="trend-up" style={{ color: "#16a34a" }} />;
  if (trend === "declining") return <TrendingDown size={16} className="trend-down" style={{ color: "#dc2626" }} />;
  return <Minus size={16} className="trend-stable" style={{ color: "#64748b" }} />;
}

function ScoreBar({ score, compact = false }: { score: number; compact?: boolean }) {
  const tone = scoreTone(score);
  const colorMap = {
    success: "linear-gradient(90deg, #22c55e, #16a34a)",
    warning: "linear-gradient(90deg, #f59e0b, #d97706)",
    danger: "linear-gradient(90deg, #ef4444, #dc2626)",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, width: "100%" }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: compact ? 6 : 8,
          background: "var(--surface-subtle)",
          borderRadius: 999,
          overflow: "hidden",
          position: "relative",
          border: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            width: `${Math.min(100, Math.max(0, score))}%`,
            height: "100%",
            background: colorMap[tone],
            borderRadius: 999,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span
        style={{
          fontSize: compact ? "11px" : "12px",
          fontWeight: 700,
          minWidth: compact ? 22 : 26,
          textAlign: "right",
          color: "var(--text)",
        }}
      >
        {score}
      </span>
    </div>
  );
}

export function ReportingDashboard({ projectId }: { projectId: string }) {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [qualityOverallScore, setQualityOverallScore] = useState(0);
  const [qualityDimensions, setQualityDimensions] = useState<DimensionScore[]>([]);
  const [gates, setGates] = useState<QualityGate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

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
          fetchQualityGates(projectId).catch(() => [] as QualityGate[]),
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
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function handleExport(format: "html" | "csv" | "json") {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      let response = await fetch(`/api/reports/export/executive`, {
        method: "POST",
        headers,
        body: JSON.stringify({ projectId, format }),
      });
      if (!response.ok) {
        response = await fetch(`/api/reports/export/health`, {
          method: "POST",
          headers,
          body: JSON.stringify({ projectId, format }),
        });
      }
      if (!response.ok) throw new Error(`Export failed with status ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `executive-governance-report.${format}`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);
    } catch (err) {
      console.error("Export error:", err);
      alert("Failed to export report: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  const filteredSnapshots = useMemo(() => {
    if (!health?.snapshots) return [];
    if (!searchQuery.trim()) return health.snapshots;
    const q = searchQuery.toLowerCase();
    return health.snapshots.filter(
      (snap) =>
        (snap.dimensionName && snap.dimensionName.toLowerCase().includes(q)) ||
        snap.dimensionType.toLowerCase().includes(q)
    );
  }, [health, searchQuery]);

  if (loading) return <SkeletonReportDashboard />;
  if (error) return <div className="banner error">{error}</div>;
  if (!health) return <div className="empty-state">No report data available</div>;

  const totalErrors = health.snapshots.reduce((s, d) => s + d.validationErrorCount, 0);
  const totalWarnings = health.snapshots.reduce((s, d) => s + d.validationWarningCount, 0);
  const totalOrphans = health.snapshots.reduce((s, d) => s + d.orphanCount, 0);
  const totalMembers = health.snapshots.reduce((s, d) => s + d.memberCount, 0);

  return (
    <section className="reporting-dashboard" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header Bar - Using standard panel-heading matching all other tabs */}
      <div className="panel-heading">
        <div>
          <span className="section-kicker">REPORTING &amp; ANALYTICS</span>
          <h2>
            <BarChart3 size={20} /> Executive Metadata &amp; Governance Dashboard
          </h2>
        </div>
        <div className="export-buttons" style={{ display: "flex", gap: 8 }}>
          <ActionButton onClick={() => void handleExport("html")}>
            <Download size={14} /> HTML
          </ActionButton>
          <ActionButton onClick={() => void handleExport("csv")}>
            <Download size={14} /> CSV
          </ActionButton>
          <ActionButton onClick={() => void handleExport("json")}>
            <Download size={14} /> JSON
          </ActionButton>
        </div>
      </div>

      {/* Overview Top Hero Cards */}
      <div
        className="report-overview"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 20,
          boxShadow: "var(--shadow-sm)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          color: "var(--text)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
          {/* Top Hero Circles: Health, Quality, and Overall Coverage */}
          <div className="score-hero-group" style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <div className="score-hero" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <ScoreRing score={health.overallScore} size={110} label="Health" />
              <div
                className="score-trend"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: "12px",
                  fontWeight: 600,
                  textTransform: "capitalize",
                }}
              >
                <TrendIcon trend={health.trend} />
                <span>{health.trend}</span>
              </div>
            </div>

            {qualityOverallScore > 0 && (
              <div className="score-hero" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <ScoreRing score={qualityOverallScore} size={110} label="Quality" />
                <div className="score-trend" style={{ opacity: 0.7, fontSize: "12px", fontWeight: 500 }}>
                  <span>Quality Score</span>
                </div>
              </div>
            )}

            {coverage && (
              <div className="score-hero" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <ScoreRing score={coverage.overallCoverage} size={110} label="Coverage" />
                <div className="score-trend" style={{ opacity: 0.7, fontSize: "12px", fontWeight: 500 }}>
                  <span>Metadata Coverage</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 280 }}>
            <FactStrip>
              <FactItem label="Dimensions" value={health.snapshots.length} />
              <FactItem label="Total Members" value={totalMembers} />
              <FactItem label="Orphans" value={totalOrphans} tone={totalOrphans > 0 ? "warning" : "neutral"} />
              <FactItem label="Errors" value={totalErrors} tone={totalErrors > 0 ? "danger" : "neutral"} />
              <FactItem label="Warnings" value={totalWarnings} tone={totalWarnings > 0 ? "warning" : "neutral"} />
            </FactStrip>
          </div>
        </div>
      </div>

      {/* Quality Gates */}
      {gates.length > 0 && (
        <Panel className="quality-gates-panel">
          <div className="panel-heading compact" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Shield size={16} /> Quality Gates
            </h3>
          </div>
          <div className="quality-gates-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {gates.map((gate) => {
              const passed = qualityOverallScore >= gate.threshold;
              return (
                <div
                  key={gate.id}
                  className={`gate-item ${passed ? "passed" : "failed"}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: passed ? "var(--success-soft)" : "var(--danger-soft)",
                    border: `1px solid ${passed ? "var(--success-border)" : "var(--danger-border)"}`,
                    borderRadius: 8,
                    color: "var(--text)"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {passed ? <CheckCircle2 size={16} style={{ color: "var(--success)" }} /> : <XCircle size={16} style={{ color: "var(--danger)" }} />}
                    <span className="gate-name" style={{ fontWeight: 600, fontSize: "13px" }}>
                      {gate.name}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="gate-threshold" style={{ fontSize: "11px", opacity: 0.8 }}>
                      ≥ {gate.threshold}
                    </span>
                    <StatusBadge tone={passed ? "success" : "danger"}>{passed ? "PASS" : "FAIL"}</StatusBadge>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Dimension Scores Table */}
      <Panel className="dimension-scores-panel">
        <div
          className="panel-heading compact"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Layers size={16} />
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>Dimension Scores</h3>
            <span style={{ fontSize: "12px", opacity: 0.7 }}>({filteredSnapshots.length} dimensions)</span>
          </div>
          {health.snapshots.length > 3 && (
            <div style={{ position: "relative", minWidth: 220 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 9, opacity: 0.5 }} />
              <input
                type="text"
                placeholder="Search dimensions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "4px 10px 4px 30px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--surface-subtle)",
                  color: "var(--text)",
                  fontSize: "12px",
                }}
              />
            </div>
          )}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="scores-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", fontSize: "12px", opacity: 0.85, color: "var(--text)" }}>
                <th style={{ padding: "8px 12px" }}>DIMENSION</th>
                <th style={{ padding: "8px 12px" }}>QUALITY</th>
                <th style={{ padding: "8px 12px" }}>COMPLETENESS</th>
                <th style={{ padding: "8px 12px" }}>NAMING</th>
                <th style={{ padding: "8px 12px" }}>MEMBERS</th>
                <th style={{ padding: "8px 12px" }}>ISSUES</th>
              </tr>
            </thead>
            <tbody>
              {filteredSnapshots.map((snap) => {
                const displayName = snap.dimensionName || snap.dimensionType;
                const hasNameDiff = snap.dimensionName && snap.dimensionName !== snap.dimensionType;
                return (
                  <tr
                    key={snap.dimensionName ? `${snap.dimensionType}-${snap.dimensionName}` : snap.dimensionType}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td className="dim-name" style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text)" }}>
                          {displayName}
                        </span>
                        {hasNameDiff && (
                          <span style={{ fontSize: "11px", background: "var(--surface-subtle)", color: "var(--muted)", padding: "2px 6px", borderRadius: 4, fontWeight: 500 }}>
                            {snap.dimensionType}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <ScoreBar score={snap.qualityScore} />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <ScoreBar score={snap.completenessScore} />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <ScoreBar score={snap.namingScore} />
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 600, fontSize: "13px", color: "var(--text)" }}>{snap.memberCount}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {snap.validationErrorCount > 0 && <StatusBadge tone="danger">{snap.validationErrorCount} errors</StatusBadge>}
                        {snap.validationWarningCount > 0 && <StatusBadge tone="warning">{snap.validationWarningCount} warn</StatusBadge>}
                        {snap.validationErrorCount === 0 && snap.validationWarningCount === 0 && <StatusBadge tone="success">Clean</StatusBadge>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Per-Dimension Quality Breakdown */}
      {qualityDimensions.length > 0 && (
        <Panel className="dimension-quality-panel">
          <div className="panel-heading compact" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Shield size={16} /> Per-Dimension Quality Breakdown
              </h3>
            </div>
            <StatusBadge tone={scoreTone(qualityOverallScore)}>{qualityOverallScore}/100 Overall</StatusBadge>
          </div>
          <div className="quality-dimension-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {qualityDimensions.map((dim) => (
              <div
                key={dim.dimensionName || dim.dimensionType}
                className="quality-dimension-card"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 14,
                  overflow: "hidden",
                  boxSizing: "border-box",
                  color: "var(--text)"
                }}
              >
                <div className="qd-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <strong style={{ fontSize: "14px", color: "var(--text)" }}>{dim.dimensionName ?? dim.dimensionType}</strong>
                  <StatusBadge tone={scoreTone(dim.overallScore)}>{dim.overallScore}/100</StatusBadge>
                </div>
                <div className="qd-bars" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="qd-bar-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", gap: 8 }}>
                    <span style={{ width: 85, color: "var(--muted)", flexShrink: 0 }}>Overall</span>
                    <ScoreBar score={dim.overallScore} compact />
                  </div>
                  {dim.avgMemberScore !== undefined && (
                    <div className="qd-bar-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", gap: 8 }}>
                      <span style={{ width: 85, color: "var(--muted)", flexShrink: 0 }}>Avg Member</span>
                      <ScoreBar score={dim.avgMemberScore} compact />
                    </div>
                  )}
                  {dim.completeness !== undefined && (
                    <div className="qd-bar-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", gap: 8 }}>
                      <span style={{ width: 85, color: "var(--muted)", flexShrink: 0 }}>Completeness</span>
                      <ScoreBar score={dim.completeness} compact />
                    </div>
                  )}
                  {dim.naming !== undefined && (
                    <div className="qd-bar-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", gap: 8 }}>
                      <span style={{ width: 85, color: "var(--muted)", flexShrink: 0 }}>Naming</span>
                      <ScoreBar score={dim.naming} compact />
                    </div>
                  )}
                  {dim.structure !== undefined && (
                    <div className="qd-bar-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", gap: 8 }}>
                      <span style={{ width: 85, color: "var(--muted)", flexShrink: 0 }}>Structure</span>
                      <ScoreBar score={dim.structure} compact />
                    </div>
                  )}
                </div>
                {dim.memberCount !== undefined && (
                  <div style={{ marginTop: 10, fontSize: "12px", color: "var(--muted)" }}>
                    {dim.memberCount} member(s)
                  </div>
                )}
                {dim.lowestScoreMembers && dim.lowestScoreMembers.length > 0 && (
                  <div className="qd-lowest-members" style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed var(--border)" }}>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>Lowest scoring members:</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {dim.lowestScoreMembers.slice(0, 3).map((m) => (
                        <div
                          key={m.memberKey}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            background: "var(--surface-subtle)",
                            border: "1px solid var(--border)",
                            padding: "2px 6px",
                            borderRadius: 4,
                            fontSize: "11px",
                            color: "var(--text)"
                          }}
                        >
                          <code style={{ color: "var(--text)" }}>{m.memberKey}</code>
                          <span style={{ fontWeight: 700, color: m.score < 50 ? "var(--danger)" : "var(--warning)" }}>{m.score}</span>
                        </div>
                      ))}
                    </div>
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
          <div className="panel-heading compact" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>Coverage Analysis</h3>
            </div>
            <StatusBadge tone={scoreTone(coverage.overallCoverage)}>{coverage.overallCoverage}% overall</StatusBadge>
          </div>
          <div
            className="coverage-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            {coverage.dimensions.map((dim) => (
              <div
                key={dim.dimensionName || dim.dimensionType}
                className="coverage-card"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "14px 16px",
                  overflow: "hidden",
                  boxSizing: "border-box",
                  color: "var(--text)"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <strong style={{ fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text)" }}>
                    {dim.dimensionName || dim.dimensionType}
                  </strong>
                  {dim.isStale && <StatusBadge tone="warning">Stale</StatusBadge>}
                </div>
                <div className="coverage-metrics" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="coverage-metric" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", gap: 8 }}>
                    <span style={{ width: 80, color: "var(--muted)", flexShrink: 0 }}>Properties</span>
                    <ScoreBar score={dim.propertyCoverage} compact />
                  </div>
                  <div className="coverage-metric" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", gap: 8 }}>
                    <span style={{ width: 80, color: "var(--muted)", flexShrink: 0 }}>Descriptions</span>
                    <ScoreBar score={dim.descriptionCoverage} compact />
                  </div>
                </div>
                <div style={{ marginTop: 12, fontSize: "12px", color: "var(--muted)" }}>
                  {dim.memberCount} member(s)
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </section>
  );
}
