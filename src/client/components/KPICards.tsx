import { useEffect, useState } from "react";
import { TrendingUp, AlertTriangle, Users, BarChart3 } from "lucide-react";
import { fetchQualityScores, fetchCoverageReport } from "../api/client";
import { ScoreRing } from "./ScoreRing";
import type { DashboardSummary, Severity, ValidationIssue } from "../../shared/types";
import { buildIssueSummary } from "../ui/viewModel";

export function KPICards({ projectId, summary, issues, blockedSeverities }: {
  projectId: string;
  summary: DashboardSummary | null;
  issues: ValidationIssue[];
  blockedSeverities: Severity[];
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
  }, [projectId]);

  return (
    <div className="kpi-cards">
      <div className="kpi-card">
        <div className="kpi-icon"><BarChart3 size={20} /></div>
        <div className="kpi-content">
          <span className="kpi-label">Quality Score</span>
          {qualityScore !== null ? (
            <ScoreRing score={qualityScore} size={64} label="" />
          ) : (
            <span className="kpi-value">—</span>
          )}
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-icon"><Users size={20} /></div>
        <div className="kpi-content">
          <span className="kpi-label">Total Members</span>
          <span className="kpi-value">{summary?.totalMembers ?? 0}</span>
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-icon"><AlertTriangle size={20} /></div>
        <div className="kpi-content">
          <span className="kpi-label">Issues</span>
          <span className={`kpi-value ${issueSummary.total > 0 ? "kpi-danger" : "kpi-success"}`}>
            {issueSummary.total}
          </span>
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-icon"><TrendingUp size={20} /></div>
        <div className="kpi-content">
          <span className="kpi-label">Coverage</span>
          <span className="kpi-value">{coverage !== null ? `${coverage}%` : "—"}</span>
        </div>
      </div>
    </div>
  );
}
