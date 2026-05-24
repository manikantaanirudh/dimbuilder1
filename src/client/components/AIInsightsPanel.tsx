import { Brain, Copy, AlertTriangle, GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchDuplicateDetection, fetchNamingAnomalies, fetchHierarchyOptimizations } from "../api/client";
import { Panel, StatusBadge } from "./ui";
import { SkeletonAIInsights } from "./Skeleton";

interface DuplicateGroup {
  canonical: string;
  duplicates: Array<{ memberKey: string; similarity: number; reason: string }>;
}

interface NamingAnomaly {
  memberKey: string;
  dimensionType: string;
  anomalyType: string;
  description: string;
  suggestion: string;
}

interface HierarchyOptimization {
  type: string;
  description: string;
  impact: string;
  affectedMembers: string[];
}

export function AIInsightsPanel({ projectId }: { projectId: string }) {
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [anomalies, setAnomalies] = useState<NamingAnomaly[]>([]);
  const [optimizations, setOptimizations] = useState<HierarchyOptimization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"duplicates" | "naming" | "hierarchy">("duplicates");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [dupRes, namRes, hierRes] = await Promise.all([
          fetchDuplicateDetection(projectId),
          fetchNamingAnomalies(projectId),
          fetchHierarchyOptimizations(projectId)
        ]);
        if (!cancelled) {
          setDuplicates(dupRes.groups ?? []);
          setAnomalies(namRes.anomalies ?? []);
          setOptimizations(hierRes.optimizations ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load AI insights");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) return <SkeletonAIInsights />;
  if (error) return <div className="banner error">{error}</div>;

  const totalInsights = duplicates.length + anomalies.length + optimizations.length;

  return (
    <section className="ai-insights-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">AI-Powered Intelligence</span>
          <h2><Brain size={20} /> Metadata Insights</h2>
        </div>
        <StatusBadge tone={totalInsights > 0 ? "info" : "success"}>
          {totalInsights > 0 ? `${totalInsights} insights found` : "All clean"}
        </StatusBadge>
      </div>

      <div className="ai-tabs">
        <button className={`ai-tab ${activeTab === "duplicates" ? "active" : ""}`} onClick={() => setActiveTab("duplicates")}>
          <Copy size={14} /> Duplicates {duplicates.length > 0 && <span className="tab-count">{duplicates.length}</span>}
        </button>
        <button className={`ai-tab ${activeTab === "naming" ? "active" : ""}`} onClick={() => setActiveTab("naming")}>
          <AlertTriangle size={14} /> Naming {anomalies.length > 0 && <span className="tab-count">{anomalies.length}</span>}
        </button>
        <button className={`ai-tab ${activeTab === "hierarchy" ? "active" : ""}`} onClick={() => setActiveTab("hierarchy")}>
          <GitBranch size={14} /> Hierarchy {optimizations.length > 0 && <span className="tab-count">{optimizations.length}</span>}
        </button>
      </div>

      {activeTab === "duplicates" && (
        <Panel className="ai-results-panel">
          {duplicates.length === 0 ? (
            <div className="empty-state-block"><strong>No duplicates detected</strong><div className="empty-state-description">All member keys are unique across dimensions.</div></div>
          ) : (
            <div className="duplicate-groups">
              {duplicates.map((group, idx) => (
                <div key={idx} className="duplicate-group">
                  <div className="duplicate-canonical">
                    <strong>{group.canonical}</strong>
                    <StatusBadge tone="warning">{group.duplicates.length} similar</StatusBadge>
                  </div>
                  <ul className="duplicate-list">
                    {group.duplicates.map((dup, i) => (
                      <li key={i}>
                        <code>{dup.memberKey}</code>
                        <span className="dup-similarity">{Math.round(dup.similarity * 100)}% match</span>
                        <small>{dup.reason}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {activeTab === "naming" && (
        <Panel className="ai-results-panel">
          {anomalies.length === 0 ? (
            <div className="empty-state-block"><strong>No naming anomalies</strong><div className="empty-state-description">All member names follow consistent patterns.</div></div>
          ) : (
            <table className="anomalies-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Dimension</th>
                  <th>Issue</th>
                  <th>Suggestion</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((a, idx) => (
                  <tr key={idx}>
                    <td><code>{a.memberKey}</code></td>
                    <td>{a.dimensionType}</td>
                    <td><StatusBadge tone="warning">{a.anomalyType}</StatusBadge> {a.description}</td>
                    <td className="suggestion-cell">{a.suggestion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {activeTab === "hierarchy" && (
        <Panel className="ai-results-panel">
          {optimizations.length === 0 ? (
            <div className="empty-state-block"><strong>No optimizations suggested</strong><div className="empty-state-description">Hierarchy structure looks healthy.</div></div>
          ) : (
            <div className="optimization-cards">
              {optimizations.map((opt, idx) => (
                <div key={idx} className="optimization-card">
                  <div className="opt-header">
                    <StatusBadge tone="info">{opt.type}</StatusBadge>
                    <span className="opt-impact">{opt.impact}</span>
                  </div>
                  <p>{opt.description}</p>
                  {opt.affectedMembers.length > 0 && (
                    <div className="opt-members">
                      Affects: {opt.affectedMembers.slice(0, 5).map(m => <code key={m}>{m}</code>)}
                      {opt.affectedMembers.length > 5 && <span> +{opt.affectedMembers.length - 5} more</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </section>
  );
}
