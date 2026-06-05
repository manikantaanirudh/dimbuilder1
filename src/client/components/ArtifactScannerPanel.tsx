import { useEffect, useState } from "react";
import { FileSearch, Upload } from "lucide-react";
import {
  assessProposedArtifactChange,
  fetchArtifacts,
  scanArtifact,
  uploadArtifact,
  type ArtifactRecord
} from "../api/client";
import type { ProposedChangeImpact, ProposedChangeType } from "../../shared/artifactReferenceScanner";
import { ActionButton, Panel, StatusBadge } from "./ui";

/**
 * OneStream Artifact Impact Scanner (TASK-09). Upload artifact text, scan for member references,
 * and preview proposed-change impact. Confidence levels are surfaced so users do not treat every
 * text match as a guaranteed dependency.
 */
export function ArtifactScannerPanel({ projectId }: { projectId: string }) {
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [status, setStatus] = useState("Ready");
  const [dimensionType, setDimensionType] = useState("Account");
  const [memberKey, setMemberKey] = useState("");
  const [changeType, setChangeType] = useState<ProposedChangeType>("delete");
  const [impact, setImpact] = useState<ProposedChangeImpact | null>(null);

  async function refresh() {
    const result = await fetchArtifacts(projectId);
    setArtifacts(result.artifacts);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setStatus(`Uploading ${file.name}...`);
    try {
      const content = await file.text();
      const { artifact } = await uploadArtifact(projectId, { name: file.name, fileName: file.name, content });
      await scanArtifact(projectId, artifact.id);
      setStatus(`Uploaded and scanned ${file.name}`);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Upload failed");
    } finally {
      event.currentTarget.value = "";
    }
  }

  async function rescan(artifactId: string) {
    setStatus("Scanning...");
    await scanArtifact(projectId, artifactId);
    setStatus("Scan complete");
    await refresh();
  }

  async function runProposedChange() {
    if (!memberKey.trim()) {
      setStatus("Enter a member key to assess impact");
      return;
    }
    setStatus("Assessing impact...");
    const { impact: result } = await assessProposedArtifactChange(projectId, { dimensionType, memberKey: memberKey.trim(), changeType });
    setImpact(result);
    setStatus("Impact assessed");
  }

  const riskTone = (risk: string) =>
    risk === "high" ? "danger" : risk === "medium" ? "warning" : risk === "low" ? "info" : "success";

  return (
    <Panel className="artifact-scanner-panel">
      <div className="grid-toolbar">
        <div className="grid-toolbar-title">
          <strong><FileSearch size={16} /> Artifact Impact Scanner</strong>
          <span>Scan Business Rules, Cube Views, Member Lists, and other exports for member references.</span>
        </div>
        <StatusBadge tone={status.toLowerCase().includes("fail") ? "danger" : "neutral"}>{status}</StatusBadge>
      </div>

      <label className="artifact-upload" style={{ display: "inline-flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
        <Upload size={15} /> Upload artifact (text/XML)
        <input type="file" accept=".txt,.xml,.vb,.cs,.csv,.json,.xfr,.xfbr" onChange={(e) => void onUpload(e)} />
      </label>

      <table className="data-table" style={{ fontSize: "0.82rem" }}>
        <thead>
          <tr><th>Artifact</th><th>Type</th><th>Status</th><th>References</th><th></th></tr>
        </thead>
        <tbody>
          {artifacts.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td>{a.artifactType}</td>
              <td><StatusBadge tone={a.scanStatus === "scanned" ? "success" : "neutral"}>{a.scanStatus}</StatusBadge></td>
              <td>{a.referenceCount}</td>
              <td><ActionButton onClick={() => void rescan(a.id)}>Rescan</ActionButton></td>
            </tr>
          ))}
          {artifacts.length === 0 && (
            <tr><td colSpan={5}>No artifacts uploaded yet.</td></tr>
          )}
        </tbody>
      </table>

      <div className="proposed-change" style={{ marginTop: 14 }}>
        <strong>Proposed change impact (where-used)</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0", alignItems: "center" }}>
          <input placeholder="Dimension type" value={dimensionType} onChange={(e) => setDimensionType(e.currentTarget.value)} style={{ width: 130 }} />
          <input placeholder="Member key" value={memberKey} onChange={(e) => setMemberKey(e.currentTarget.value)} style={{ width: 180 }} />
          <select value={changeType} onChange={(e) => setChangeType(e.currentTarget.value as ProposedChangeType)}>
            <option value="delete">Delete</option>
            <option value="rename">Rename</option>
            <option value="move">Move</option>
            <option value="update">Update</option>
          </select>
          <ActionButton variant="primary" onClick={() => void runProposedChange()}>Assess impact</ActionButton>
        </div>

        {impact && (
          <div className="impact-result" style={{ fontSize: "0.82rem" }}>
            <StatusBadge tone={riskTone(impact.riskLevel)}>{impact.riskLevel} risk</StatusBadge>
            <span style={{ marginLeft: 10 }}>{impact.affectedArtifacts} artifact(s), {impact.totalReferences} reference(s)</span>
            <p style={{ color: "var(--muted)" }}>{impact.recommendedAction}</p>
            {impact.whereUsed.references.length > 0 && (
              <table className="data-table" style={{ fontSize: "0.78rem" }}>
                <thead>
                  <tr><th>Artifact</th><th>Line</th><th>Confidence</th><th>Snippet</th></tr>
                </thead>
                <tbody>
                  {impact.whereUsed.references.map((r, i) => (
                    <tr key={i}>
                      <td>{r.artifactName}</td>
                      <td>{r.lineNumber}</td>
                      <td><StatusBadge tone={r.confidence === "high" ? "danger" : r.confidence === "medium" ? "warning" : "info"}>{r.confidence}</StatusBadge></td>
                      <td><code>{r.snippet}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
