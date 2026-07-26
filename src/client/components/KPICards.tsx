import { useEffect, useMemo, useState } from "react";
import { TrendingUp, AlertTriangle, Users, Layers, GitFork } from "lucide-react";
import { fetchQualityScores } from "../api/client";
import { fetchCoverageReport } from "../api/reports";
import { ScoreRing } from "./ScoreRing";
import type { DashboardSummary, Severity, ValidationIssue } from "../../shared/types";
import {
  buildIssueSummary,
  computeProjectHealthFallback,
  formatProjectHealthTitle,
  scoreValidationHealth
} from "../ui/viewModel";

export function KPICards({ projectId, summary, issues, blockedSeverities, dimensionCount }: {
  projectId: string;
  summary: DashboardSummary | null;
  issues: ValidationIssue[];
  blockedSeverities: Severity[];
  dimensionCount: number;
}) {
  const [qualityScore, setQualityScore] = useState<number | null>(null);
  const [metadataScore, setMetadataScore] = useState<number | null>(null);
  const [validationScore, setValidationScore] = useState<number | null>(null);
  const [coverage, setCoverage] = useState<number | null>(null);
  const [qualityLoaded, setQualityLoaded] = useState(false);
  const [coverageLoaded, setCoverageLoaded] = useState(false);
  const issueSummary = buildIssueSummary(issues, blockedSeverities);

  useEffect(() => {
    let cancelled = false;
    setQualityLoaded(false);
    setCoverageLoaded(false);
    setQualityScore(null);
    setMetadataScore(null);
    setValidationScore(null);
    setCoverage(null);

    async function load() {
      const [qualityResult, coverageResult] = await Promise.allSettled([
        fetchQualityScores(projectId),
        fetchCoverageReport(projectId)
      ]);

      if (cancelled) return;

      if (qualityResult.status === "fulfilled") {
        setQualityScore(qualityResult.value.overallScore);
        setMetadataScore(qualityResult.value.metadataScore ?? null);
        setValidationScore(qualityResult.value.validationScore ?? scoreValidationHealth(issues));
      }
      setQualityLoaded(true);

      if (coverageResult.status === "fulfilled") {
        setCoverage(coverageResult.value.overallCoverage ?? null);
      }
      setCoverageLoaded(true);
    }

    void load();
    return () => { cancelled = true; };
  }, [projectId, issueSummary.total, issues]);

  const healthPresentation = useMemo(() => {
    const fallbackValidation = validationScore ?? scoreValidationHealth(issues);
    const fallbackScore = computeProjectHealthFallback(coverage, issues);
    const usingFallback = qualityScore === null && fallbackScore !== null;

    if (qualityScore !== null) {
      return {
        score: qualityScore,
        title: formatProjectHealthTitle({
          metadataScore: metadataScore ?? undefined,
          validationScore: fallbackValidation,
          coverage
        }),
        fallback: false
      };
    }

    if (fallbackScore !== null && (qualityLoaded || coverageLoaded)) {
      return {
        score: fallbackScore,
        title: formatProjectHealthTitle({
          metadataScore: coverage,
          validationScore: fallbackValidation,
          coverage,
          fallback: true
        }),
        fallback: true
      };
    }

    return null;
  }, [qualityScore, metadataScore, validationScore, coverage, issues, qualityLoaded, coverageLoaded]);

  const metricsLoaded = qualityLoaded && coverageLoaded;

  return (
    <div className="kpi-section">
      <div className="kpi-featured">
        {healthPresentation ? (
          <ScoreRing
            score={healthPresentation.score}
            size={88}
            label="Health"
            title={healthPresentation.title}
          />
        ) : metricsLoaded ? (
          <div className="kpi-featured-unavailable" aria-label="Project health unavailable">
            <span>—</span>
            <small>Health</small>
          </div>
        ) : (
          <div className="kpi-featured-skeleton" aria-label="Loading project health" />
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
