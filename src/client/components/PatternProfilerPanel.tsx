import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import {
  createPatternProfile,
  evaluatePatternProfile,
  fetchPatternProfiles
} from "../api/client";
import type { PatternEvaluation, PatternProfile } from "../../shared/clientPatternProfiler";
import { ActionButton, Panel, StatusBadge } from "./ui";

/**
 * Client Pattern Profiler (TASK-16). Learns client-specific conventions from the current project
 * and evaluates the project against a learned profile. Findings are confidence-scored suggestions,
 * not hard OneStream validation rules.
 */
export function PatternProfilerPanel({ projectId }: { projectId: string }) {
  const [profiles, setProfiles] = useState<PatternProfile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [evaluation, setEvaluation] = useState<PatternEvaluation | null>(null);
  const [status, setStatus] = useState("Ready");

  async function refresh() {
    const result = await fetchPatternProfiles(projectId);
    setProfiles(result.profiles);
    if (result.profiles.length > 0 && !selectedId) setSelectedId(result.profiles[result.profiles.length - 1].id);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function create() {
    setStatus("Learning patterns...");
    const { profile } = await createPatternProfile(projectId);
    setStatus(`Created profile with ${profile.rules.length} rule(s)`);
    setSelectedId(profile.id);
    await refresh();
  }

  async function evaluate() {
    if (!selectedId) return;
    setStatus("Evaluating...");
    const { evaluation: result } = await evaluatePatternProfile(projectId, selectedId);
    setEvaluation(result);
    setStatus(`Found ${result.deviations.length} deviation(s)`);
  }

  function exportProfile() {
    const profile = profiles.find((p) => p.id === selectedId);
    if (!profile) return;
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${profile.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  return (
    <Panel className="pattern-profiler-panel">
      <div className="grid-toolbar">
        <div className="grid-toolbar-title">
          <strong><Fingerprint size={16} /> Client Pattern Profiler</strong>
          <span>Learn client-specific conventions and flag deviations. Findings are suggestions, not OneStream rules.</span>
        </div>
        <StatusBadge tone="neutral">{status}</StatusBadge>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0" }}>
        <ActionButton variant="primary" onClick={() => void create()}>Create profile from project</ActionButton>
        <select value={selectedId} onChange={(e) => { setSelectedId(e.currentTarget.value); setEvaluation(null); }}>
          <option value="">Select a profile...</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.rules.length} rules)</option>)}
        </select>
        <ActionButton disabled={!selectedId} onClick={() => void evaluate()}>Evaluate against current project</ActionButton>
        <ActionButton disabled={!selectedId} onClick={exportProfile}>Export profile JSON</ActionButton>
      </div>

      {selected && (
        <section style={{ margin: "8px 0" }}>
          <strong>Learned rules (min confidence {selected.minimumConfidence})</strong>
          <table className="data-table" style={{ fontSize: "0.8rem" }}>
            <thead><tr><th>Rule</th><th>Dimension</th><th>Observed</th><th>Confidence</th></tr></thead>
            <tbody>
              {selected.rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.dimensionType ?? "-"}</td>
                  <td>{r.observedPattern}</td>
                  <td>{Math.round(r.confidence * 100)}%</td>
                </tr>
              ))}
              {selected.rules.length === 0 && <tr><td colSpan={4}>No rules met the minimum confidence threshold.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {evaluation && (
        <section style={{ margin: "8px 0" }}>
          <strong>Deviations ({evaluation.deviations.length})</strong>
          <table className="data-table" style={{ fontSize: "0.8rem" }}>
            <thead><tr><th>Rule</th><th>Count</th><th>Affected (sample)</th><th>Suggested remediation</th></tr></thead>
            <tbody>
              {evaluation.deviations.map((d) => (
                <tr key={d.ruleId}>
                  <td>{d.ruleName}</td>
                  <td>{d.deviationCount}</td>
                  <td>{d.affectedMembers.slice(0, 8).join(", ")}</td>
                  <td style={{ color: "var(--muted)" }}>{d.suggestedRemediation}</td>
                </tr>
              ))}
              {evaluation.deviations.length === 0 && <tr><td colSpan={4}>No deviations from the learned conventions.</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </Panel>
  );
}
