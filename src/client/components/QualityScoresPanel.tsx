import { Shield, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchQualityScores, fetchQualityGates } from "../api/client";
import { Panel, StatusBadge } from "./ui";
import { SkeletonQualityScores } from "./Skeleton";
import { ScoreRing } from "./ScoreRing";

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

export function QualityScoresPanel({ projectId }: { projectId: string }) {
  const [overallScore, setOverallScore] = useState(0);
  const [dimensions, setDimensions] = useState<DimensionScore[]>([]);
  const [gates, setGates] = useState<QualityGate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [scores, gatesData] = await Promise.all([
          fetchQualityScores(projectId),
          fetchQualityGates(projectId).catch(() => [] as QualityGate[])
        ]);
        if (!cancelled) {
          setOverallScore(scores.overallScore);
          setDimensions(scores.dimensions ?? []);
          setGates(gatesData ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load quality scores");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) return <SkeletonQualityScores />;
  if (error) return <div className="banner error">{error}</div>;

  return (
    <section className="quality-scores-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Data Quality</span>
          <h2><Shield size={20} /> Quality Scores</h2>
        </div>
      </div>

      <div className="quality-overview">
        <ScoreRing score={overallScore} size={140} label="Overall Quality" />

        {gates.length > 0 && (
          <div className="quality-gates">
            <h4>Quality Gates</h4>
            {gates.map(gate => {
              const passed = overallScore >= gate.threshold;
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
        )}
      </div>

      <Panel className="dimension-quality-panel">
        <div className="panel-heading compact">
          <div><h3>Per-Dimension Breakdown</h3></div>
        </div>
        {dimensions.length === 0 ? (
          <div className="empty-state-block"><strong>No dimensions to score</strong><div className="empty-state-description">Import or create dimensions to see quality metrics.</div></div>
        ) : (
          <div className="quality-dimension-grid">
            {dimensions.map(dim => (
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
                </div>
                {dim.memberCount !== undefined && (
                  <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                    {dim.memberCount} members
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </section>
  );
}
