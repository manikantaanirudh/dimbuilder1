import { AlertTriangle, Play, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { ImpactAnalysisRequest, ImpactReport } from "../../shared/impactTypes";
import { fetchImpactAnalyses, runImpactAnalysis } from "../api/client";
import { ActionButton, Panel, StatusBadge } from "./ui";

interface AnalysisSummary {
  id: string;
  analysisType: string;
  severity: string;
  summary: string;
  createdBy: string;
  createdAt: string;
}

function severityTone(severity: string): "danger" | "warning" | "success" | "neutral" {
  switch (severity) {
    case "high": return "danger";
    case "medium": return "warning";
    case "low": return "success";
    default: return "neutral";
  }
}

export function ImpactAnalysisPanel({ projectId }: { projectId: string }) {
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [results, setResults] = useState<ImpactReport | null>(null);
  const [memberKeys, setMemberKeys] = useState("");
  const [dimensionType, setDimensionType] = useState("");
  const [action, setAction] = useState<"delete" | "move" | "restructure">("delete");
  const [targetParent, setTargetParent] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchImpactAnalyses(projectId);
        if (cancelled) return;
        setAnalyses(data as AnalysisSummary[]);
        setStatus(data.length ? `${data.length} past analysis(es)` : "No analyses yet");
      } catch (err) {
        if (!cancelled) setStatus(err instanceof Error ? err.message : "Failed to load");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId]);

  async function handleRun() {
    if (!dimensionType.trim() || !memberKeys.trim()) {
      setStatus("Dimension type and member keys are required");
      return;
    }
    setRunning(true);
    setResults(null);
    try {
      const keys = memberKeys.split(",").map(k => k.trim()).filter(Boolean);
      const request: ImpactAnalysisRequest = {
        type: action,
        scope: {
          dimensionType: dimensionType.trim(),
          memberKeys: keys,
          action,
          ...(action === "move" && targetParent ? { targetParent: targetParent.trim() } : {})
        }
      };
      const response = await runImpactAnalysis(projectId, request);
      setResults(response.results);
      setStatus(`Analysis complete — severity: ${response.severity}`);
      const refreshed = await fetchImpactAnalyses(projectId);
      setAnalyses(refreshed as AnalysisSummary[]);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Panel>
      <div className="panel-heading">
        <div>
          <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertTriangle size={16} /> Impact Analysis
          </h3>
        </div>
      </div>

      <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1rem" }}>{status}</p>

      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "1rem", marginBottom: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <input
            placeholder="Dimension type (e.g. Account)"
            value={dimensionType}
            onChange={e => setDimensionType(e.target.value)}
          />
          <select
            value={action}
            onChange={e => setAction(e.target.value as typeof action)}
          >
            <option value="delete">Delete</option>
            <option value="move">Move</option>
            <option value="restructure">Restructure</option>
          </select>
        </div>
        <input
          style={{ width: "100%", marginBottom: "0.75rem" }}
          placeholder="Member keys (comma-separated)"
          value={memberKeys}
          onChange={e => setMemberKeys(e.target.value)}
        />
        {action === "move" && (
          <input
            style={{ width: "100%", marginBottom: "0.75rem" }}
            placeholder="Target parent key"
            value={targetParent}
            onChange={e => setTargetParent(e.target.value)}
          />
        )}
        <ActionButton onClick={handleRun} disabled={running}>
          <Play size={14} /> {running ? "Analyzing..." : "Run Analysis"}
        </ActionButton>
      </div>

      {results && (
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "1rem", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <StatusBadge tone={severityTone(results.severity)}>{results.severity.toUpperCase()}</StatusBadge>
            <span style={{ fontSize: "0.85rem" }}>{results.summary}</span>
          </div>
          {results.hierarchyImpact.orphanedMembers.length > 0 && (
            <p style={{ fontSize: "0.85rem", color: "var(--danger)", margin: "0.5rem 0" }}>
              Orphaned members: {results.hierarchyImpact.orphanedMembers.join(", ")}
            </p>
          )}
          {results.crossDimensionImpact.totalReferences > 0 && (
            <p style={{ fontSize: "0.85rem", color: "var(--warning)", margin: "0.5rem 0" }}>
              Cross-dimension references: {results.crossDimensionImpact.totalReferences}
            </p>
          )}
          {results.recommendations.length > 0 && (
            <ul style={{ fontSize: "0.85rem", paddingLeft: "1.25rem", margin: "0.5rem 0" }}>
              {results.recommendations.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </div>
      )}

      {analyses.length > 0 && (
        <div>
          <h4 style={{ fontSize: "0.85rem", fontWeight: 500, display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
            <Search size={14} /> Past Analyses
          </h4>
          {analyses.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", padding: "0.4rem 0", borderBottom: "1px solid var(--border)" }}>
              <StatusBadge tone={severityTone(a.severity)}>{a.severity}</StatusBadge>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.summary}</span>
              <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>{new Date(a.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
