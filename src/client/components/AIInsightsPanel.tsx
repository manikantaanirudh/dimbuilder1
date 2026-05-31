import { Brain, Copy, AlertTriangle, GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchDuplicateDetection, fetchAIAnalysis } from "../api/client";
import { Panel, StatusBadge } from "./ui";
import { SkeletonAIInsights } from "./Skeleton";

interface DuplicateGroup {
  members: string[];
  similarity: number;
  method: string;
}

interface AISuggestion {
  id: string;
  suggestionType: string;
  targetMemberKey?: string;
  suggestion: Record<string, unknown>;
  confidence: number;
}

export function AIInsightsPanel({ projectId }: { projectId: string }) {
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [namingAnomalies, setNamingAnomalies] = useState<AISuggestion[]>([]);
  const [hierarchyOpts, setHierarchyOpts] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"duplicates" | "naming" | "hierarchy">("duplicates");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [dupRes, analysisRes] = await Promise.all([
          fetchDuplicateDetection(projectId).catch(() => []),
          fetchAIAnalysis(projectId).catch(() => ({ suggestions: [], totalGenerated: 0 }))
        ]);
        if (!cancelled) {
          // Duplicates endpoint returns array directly
          setDuplicates(Array.isArray(dupRes) ? dupRes : []);
          // Full analysis returns suggestions with types
          const suggestions = analysisRes.suggestions ?? [];
          setNamingAnomalies(suggestions.filter(s => s.suggestionType === 'naming'));
          setHierarchyOpts(suggestions.filter(s => s.suggestionType === 'hierarchy'));
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

  const totalInsights = duplicates.length + namingAnomalies.length + hierarchyOpts.length;

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
          <AlertTriangle size={14} /> Naming {namingAnomalies.length > 0 && <span className="tab-count">{namingAnomalies.length}</span>}
        </button>
        <button className={`ai-tab ${activeTab === "hierarchy" ? "active" : ""}`} onClick={() => setActiveTab("hierarchy")}>
          <GitBranch size={14} /> Hierarchy {hierarchyOpts.length > 0 && <span className="tab-count">{hierarchyOpts.length}</span>}
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
                    <strong>{group.members[0]}</strong>
                    <StatusBadge tone="warning">{group.members.length} similar members</StatusBadge>
                    <span className="dup-similarity">{Math.round(group.similarity * 100)}% match</span>
                  </div>
                  <ul className="duplicate-list">
                    {group.members.slice(1).map((member, i) => (
                      <li key={i}>
                        <code>{member}</code>
                        <small>detected by {group.method}</small>
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
          {namingAnomalies.length === 0 ? (
            <div className="empty-state-block"><strong>No naming anomalies</strong><div className="empty-state-description">All member names follow consistent patterns.</div></div>
          ) : (
            <table className="anomalies-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Issue</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {namingAnomalies.map((a, idx) => (
                  <tr key={idx}>
                    <td><code>{a.targetMemberKey ?? "n/a"}</code></td>
                    <td>
                      <StatusBadge tone="warning">{String(a.suggestion.anomalyType ?? "naming")}</StatusBadge>
                      {" "}{String(a.suggestion.description ?? "")}
                    </td>
                    <td>{Math.round((a.confidence ?? 0) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {activeTab === "hierarchy" && (
        <Panel className="ai-results-panel">
          {hierarchyOpts.length === 0 ? (
            <div className="empty-state-block"><strong>No optimizations suggested</strong><div className="empty-state-description">Hierarchy structure looks healthy.</div></div>
          ) : (
            <div className="optimization-cards">
              {hierarchyOpts.map((opt, idx) => (
                <div key={idx} className="optimization-card">
                  <div className="opt-header">
                    <StatusBadge tone="info">{String(opt.suggestion.strategy ?? "optimize")}</StatusBadge>
                    <span className="opt-impact">{Math.round((opt.confidence ?? 0) * 100)}% confidence</span>
                  </div>
                  <p>{String(opt.suggestion.description ?? opt.suggestion.reason ?? "Hierarchy optimization suggestion")}</p>
                  {opt.targetMemberKey && (
                    <div className="opt-members">
                      Affects: <code>{opt.targetMemberKey}</code>
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
