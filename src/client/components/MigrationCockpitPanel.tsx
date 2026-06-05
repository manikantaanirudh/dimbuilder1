import { useState } from "react";
import { GitMerge } from "lucide-react";
import {
  commitMigration,
  createMigrationSession,
  previewMigration
} from "../api/client";
import type { MigrationPreview, MigrationSession, MigrationSourceType } from "../../shared/migrationCockpit";
import { ActionButton, Panel, StatusBadge } from "./ui";

const SOURCE_LABELS: Record<MigrationSourceType, string> = {
  hfm: "Hyperion HFM",
  epma: "Hyperion EPMA",
  sapbpc: "SAP BPC",
  csv: "Generic CSV"
};

/**
 * Migration Cockpit (TASK-17). Preview-first guided workflow: upload source, review detected
 * dimensions/mappings/decisions, preview what will be created, then commit. Unresolved decisions
 * block commit unless overridden.
 */
export function MigrationCockpitPanel({ projectId }: { projectId: string }) {
  const [sourceType, setSourceType] = useState<MigrationSourceType>("hfm");
  const [session, setSession] = useState<MigrationSession | null>(null);
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [unresolved, setUnresolved] = useState(0);
  const [status, setStatus] = useState("Upload a source file to begin.");

  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setStatus(`Parsing ${file.name}...`);
    try {
      const content = await file.text();
      const { session: created } = await createMigrationSession(projectId, { sourceType, fileName: file.name, content });
      setSession(created);
      setPreview(null);
      setStatus(`Parsed ${created.summary.memberCount} member(s) across ${created.summary.dimensionCount} dimension(s).`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Parse failed");
    } finally {
      event.currentTarget.value = "";
    }
  }

  async function runPreview() {
    if (!session) return;
    setStatus("Building preview...");
    const result = await previewMigration(projectId, session.id);
    setPreview(result.preview);
    setUnresolved(result.unresolvedDecisions);
    setStatus(`Preview ready. ${result.unresolvedDecisions} unresolved decision(s).`);
  }

  async function commit(override: boolean) {
    if (!session) return;
    setStatus("Committing...");
    try {
      const { committed } = await commitMigration(projectId, session.id, override);
      setStatus(`Committed ${committed.members} member(s), ${committed.relationships} relationship(s), ${committed.dimensions} new dimension(s).`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Commit blocked (unresolved decisions). Use override to force.");
    }
  }

  return (
    <Panel className="migration-cockpit-panel">
      <div className="grid-toolbar">
        <div className="grid-toolbar-title">
          <strong><GitMerge size={16} /> Migration Cockpit</strong>
          <span>Preview-first migration for HFM, EPMA, SAP BPC, and CSV. Review before committing.</span>
        </div>
        <StatusBadge tone={status.toLowerCase().includes("fail") || status.toLowerCase().includes("block") ? "danger" : "neutral"}>{status}</StatusBadge>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0" }}>
        <select value={sourceType} onChange={(e) => setSourceType(e.currentTarget.value as MigrationSourceType)}>
          {(Object.keys(SOURCE_LABELS) as MigrationSourceType[]).map((k) => <option key={k} value={k}>{SOURCE_LABELS[k]}</option>)}
        </select>
        <label className="action-button">
          Upload source
          <input type="file" accept=".csv,.txt,.dat" style={{ display: "none" }} onChange={(e) => void onUpload(e)} />
        </label>
        <ActionButton disabled={!session} onClick={() => void runPreview()}>Preview</ActionButton>
        <ActionButton disabled={!session} variant="primary" onClick={() => void commit(false)}>Commit</ActionButton>
        <ActionButton disabled={!session || unresolved === 0} variant="danger" onClick={() => void commit(true)}>Commit (override)</ActionButton>
      </div>

      {session && (
        <section style={{ margin: "8px 0", fontSize: "0.82rem" }}>
          <strong>Detected dimensions</strong>
          <table className="data-table">
            <thead><tr><th>Dimension</th><th>Type</th><th>Members</th><th>Relationships</th></tr></thead>
            <tbody>
              {session.summary.dimensions.map((d) => (
                <tr key={d.dimensionName}><td>{d.dimensionName}</td><td>{d.dimensionType}</td><td>{d.memberCount}</td><td>{d.relationshipCount}</td></tr>
              ))}
            </tbody>
          </table>

          <strong>Suggested mappings</strong>
          <table className="data-table">
            <thead><tr><th>Source field</th><th>Target</th><th>Confidence</th></tr></thead>
            <tbody>
              {session.mappings.map((m) => (
                <tr key={m.sourceField}><td>{m.sourceField}</td><td>{m.targetField}</td><td>{Math.round(m.confidence * 100)}%</td></tr>
              ))}
            </tbody>
          </table>

          {session.decisions.length > 0 && (
            <>
              <strong>Unresolved decisions ({session.decisions.filter((d) => !d.resolved).length})</strong>
              <ul>{session.decisions.filter((d) => !d.resolved).map((d) => <li key={d.id}>{d.description}</li>)}</ul>
            </>
          )}
        </section>
      )}

      {preview && (
        <section style={{ margin: "8px 0", fontSize: "0.82rem" }}>
          <strong>Preview — {preview.memberCount} members, {preview.relationshipCount} relationships</strong>
          <table className="data-table">
            <thead><tr><th>Dimension</th><th>Member</th><th>Parent</th><th>Properties</th></tr></thead>
            <tbody>
              {preview.sampleMembers.map((m, i) => (
                <tr key={i}>
                  <td>{m.dimensionName}</td>
                  <td>{m.memberKey}</td>
                  <td>{m.parentKey ?? ""}</td>
                  <td><code>{Object.entries(m.properties).map(([k, v]) => `${k}=${v}`).join("; ")}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.unmappedFields.length > 0 && <p>Unmapped fields: {preview.unmappedFields.join(", ")}</p>}
        </section>
      )}
    </Panel>
  );
}
