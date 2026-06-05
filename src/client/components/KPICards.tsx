import { useEffect, useState } from "react";
import { TrendingUp, AlertTriangle, Users, Layers, GitFork } from "lucide-react";
import { fetchQualityScores, fetchCoverageReport } from "../api/client";
import { ScoreRing } from "./ScoreRing";
import type { DashboardSummary, Severity, ValidationIssue } from "../../shared/types";
import { buildIssueSummary } from "../ui/viewModel";

export function KPICards({ projectId, summary, issues, blockedSeverities, dimensionCount }: {
  projectId: string;
  summary: DashboardSummary | null;
  issues: ValidationIssue[];
  blockedSeverities: Severity[];
  dimensionCount: number;
}) {
  const [qualityScore, setQualityScore] = useState<number | null>(null);
  const [coverage, setCoverage] = useState<number | null>(null);
  const issueSummary = buildIssueSummary(issues, blockedSeverities);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [q, c] = await Promise.all([
          fetchQualityScores(projectId).catch(() => null),
          fetchCoverageReport(projectId).catch(() => null)
        ]);
        if (!cancelled) {
          setQualityScore(q?.overallScore ?? null);
          setCoverage(c?.overallCoverage ?? null);
        }
      } catch { /* ignore */ }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId, issueSummary.total]);

  return (
    <div className="kpi-section">
      <div className="kpi-featured">
        {qualityScore !== null ? (
          <ScoreRing
            score={qualityScore}
            size={88}
            label="Quality"
            title="Metadata completeness and naming, adjusted for validation issues"
          />
        ) : (
          <div className="kpi-featured-skeleton" aria-label="Loading quality score" />
        )}
      </div>

      <div className="kpi-metrics">
        <div className="kpi-metric">
          <Layers size={16} className="kpi-metric-icon" />
          <span className="kpi-metric-value">{summary?.totalDimensions ?? dimensionCount}</span>
          <span className="kpi-metric-label" title="Number of configured dimension types in this project">Dimensions</span>
        </div>
        <div className="kpi-metric">
          <Users size={16} className="kpi-metric-icon" />
          <span className="kpi-metric-value">{summary?.totalMembers ?? 0}</span>
          <span className="kpi-metric-label" title="Total member records across all dimensions">Members</span>
        </div>
        <div className="kpi-metric">
          <GitFork size={16} className="kpi-metric-icon" />
          <span className="kpi-metric-value">{summary?.totalRelationships ?? 0}</span>
          <span className="kpi-metric-label" title="Parent-child relationships between members">Relationships</span>
        </div>
        <div className="kpi-metric">
          <AlertTriangle size={16} className="kpi-metric-icon" />
          <span className={`kpi-metric-value ${issueSummary.total > 0 ? "kpi-danger" : "kpi-success"}`}>
            {issueSummary.total}
          </span>
          <span className="kpi-metric-label" title="Validation errors and warnings that need attention">Issues</span>
        </div>
        <div className="kpi-metric">
          <TrendingUp size={16} className="kpi-metric-icon" />
          {coverage !== null ? (
            <span className="kpi-metric-value">{coverage}%</span>
          ) : (
            <span className="kpi-metric-value kpi-skeleton">&nbsp;</span>
          )}
          <span className="kpi-metric-label" title="Percentage of required member properties that are filled">Coverage</span>
        </div>
      </div>
    </div>
  );
}
