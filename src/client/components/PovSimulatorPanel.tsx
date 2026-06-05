import { useEffect, useState } from "react";
import { Crosshair } from "lucide-react";
import { fetchEffectivePov, type EffectivePovResponse } from "../api/client";
import { fetchDimensions } from "../api/client";
import type { DimensionRecord } from "../../shared/types";
import { ActionButton, Panel, StatusBadge } from "./ui";

const SOURCE_LABEL: Record<string, string> = {
  varyingOverride: "Varying override",
  varyingDefault: "Varying default",
  baseProperty: "Base property",
  dictionaryDefault: "Dictionary default",
  missing: "Unresolved"
};

const SOURCE_TONE: Record<string, "success" | "info" | "warning" | "danger" | "neutral"> = {
  varyingOverride: "success",
  varyingDefault: "info",
  baseProperty: "neutral",
  dictionaryDefault: "info",
  missing: "warning"
};

/**
 * Effective POV Simulator (TASK-10). Select a target and POV context, then see which property
 * values effectively apply and why. Works even when some context fields are blank.
 */
export function PovSimulatorPanel({ projectId }: { projectId: string }) {
  const [dimensions, setDimensions] = useState<DimensionRecord[]>([]);
  const [dimensionId, setDimensionId] = useState("");
  const [memberKey, setMemberKey] = useState("");
  const [cubeType, setCubeType] = useState("");
  const [scenarioType, setScenarioType] = useState("");
  const [timeMember, setTimeMember] = useState("");
  const [report, setReport] = useState<EffectivePovResponse | null>(null);
  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    void fetchDimensions(projectId).then((dims) => {
      setDimensions(dims);
      if (dims.length > 0) setDimensionId(dims[0].id);
    });
  }, [projectId]);

  async function simulate() {
    if (!memberKey.trim()) {
      setStatus("Enter a member key");
      return;
    }
    setStatus("Resolving...");
    try {
      const result = await fetchEffectivePov(projectId, {
        targetType: "member",
        dimensionId,
        memberKey: memberKey.trim(),
        context: { cubeType, scenarioType, timeMember }
      });
      setReport(result);
      setStatus("Resolved");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Resolve failed");
    }
  }

  return (
    <Panel className="pov-simulator-panel">
      <div className="grid-toolbar">
        <div className="grid-toolbar-title">
          <strong><Crosshair size={16} /> Effective POV Simulator</strong>
          <span>See which property values effectively apply for a member under a POV context.</span>
        </div>
        <StatusBadge tone={status.toLowerCase().includes("fail") ? "danger" : "neutral"}>{status}</StatusBadge>
      </div>

      <div className="pov-inputs" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "8px 0" }}>
        <select value={dimensionId} onChange={(e) => setDimensionId(e.currentTarget.value)}>
          {dimensions.map((d) => <option key={d.id} value={d.id}>{d.dimensionName} ({d.dimensionType})</option>)}
        </select>
        <input placeholder="Member key" value={memberKey} onChange={(e) => setMemberKey(e.currentTarget.value)} />
        <input placeholder="Cube type" value={cubeType} onChange={(e) => setCubeType(e.currentTarget.value)} style={{ width: 110 }} />
        <input placeholder="Scenario type" value={scenarioType} onChange={(e) => setScenarioType(e.currentTarget.value)} style={{ width: 120 }} />
        <input placeholder="Time member" value={timeMember} onChange={(e) => setTimeMember(e.currentTarget.value)} style={{ width: 120 }} />
        <ActionButton variant="primary" onClick={() => void simulate()}>Simulate</ActionButton>
      </div>

      {report && report.warnings.length > 0 && (
        <ul style={{ color: "var(--warning, #a60)", fontSize: "0.82rem", margin: "4px 0" }}>
          {report.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}

      {report && (
        <table className="data-table" style={{ fontSize: "0.8rem" }}>
          <thead>
            <tr><th>Property</th><th>Effective value</th><th>Source</th><th>Required</th><th>Explanation</th></tr>
          </thead>
          <tbody>
            {report.properties.map((p) => (
              <tr key={p.propertyName} style={p.conflict ? { background: "rgba(200,0,0,0.06)" } : undefined}>
                <td>{p.propertyName}</td>
                <td>{p.value || <em>(none)</em>}</td>
                <td><StatusBadge tone={SOURCE_TONE[p.source] ?? "neutral"}>{SOURCE_LABEL[p.source] ?? p.source}</StatusBadge></td>
                <td>{p.required ? "Yes" : ""}</td>
                <td style={{ color: "var(--muted)" }}>{p.explanation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
