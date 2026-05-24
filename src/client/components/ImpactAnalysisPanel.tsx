import { AlertTriangle, Play, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { ImpactAnalysisRequest, ImpactReport, ImpactSeverity } from "../../shared/impactTypes";
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

function severityColor(severity: string): "red" | "yellow" | "green" | "gray" {
  switch (severity) {
    case "high": return "red";
    case "medium": return "yellow";
    case "low": return "green";
    default: return "gray";
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
    <Panel title="Impact Analysis" icon={<AlertTriangle size={16} />}>
      <p className="text-sm text-gray-500 mb-4">{status}</p>

      <div className="space-y-3 mb-4 border rounded p-3">
        <div className="grid grid-cols-2 gap-2">
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Dimension type (e.g. Account)"
            value={dimensionType}
            onChange={e => setDimensionType(e.target.value)}
          />
          <select
            className="border rounded px-2 py-1 text-sm"
            value={action}
            onChange={e => setAction(e.target.value as typeof action)}
          >
            <option value="delete">Delete</option>
            <option value="move">Move</option>
            <option value="restructure">Restructure</option>
          </select>
        </div>
        <input
          className="border rounded px-2 py-1 text-sm w-full"
          placeholder="Member keys (comma-separated)"
          value={memberKeys}
          onChange={e => setMemberKeys(e.target.value)}
        />
        {action === "move" && (
          <input
            className="border rounded px-2 py-1 text-sm w-full"
            placeholder="Target parent key"
            value={targetParent}
            onChange={e => setTargetParent(e.target.value)}
          />
        )}
        <ActionButton icon={<Play size={14} />} onClick={handleRun} disabled={running}>
          {running ? "Analyzing..." : "Run Analysis"}
        </ActionButton>
      </div>

      {results && (
        <div className="border rounded p-3 mb-4 space-y-2">
          <div className="flex items-center gap-2">
            <StatusBadge color={severityColor(results.severity)}>{results.severity.toUpperCase()}</StatusBadge>
            <span className="text-sm">{results.summary}</span>
          </div>
          {results.hierarchyImpact.orphanedMembers.length > 0 && (
            <p className="text-sm text-red-600">
              Orphaned members: {results.hierarchyImpact.orphanedMembers.join(", ")}
            </p>
          )}
          {results.crossDimensionImpact.totalReferences > 0 && (
            <p className="text-sm text-orange-600">
              Cross-dimension references: {results.crossDimensionImpact.totalReferences}
            </p>
          )}
          {results.recommendations.length > 0 && (
            <ul className="text-sm list-disc ml-4">
              {results.recommendations.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </div>
      )}

      {analyses.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-sm font-medium flex items-center gap-1"><Search size={14} /> Past Analyses</h4>
          {analyses.map(a => (
            <div key={a.id} className="flex items-center gap-2 text-sm py-1 border-b">
              <StatusBadge color={severityColor(a.severity)}>{a.severity}</StatusBadge>
              <span className="flex-1 truncate">{a.summary}</span>
              <span className="text-gray-400 text-xs">{new Date(a.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
