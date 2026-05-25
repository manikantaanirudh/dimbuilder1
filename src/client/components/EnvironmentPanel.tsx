import { Cloud, Plus, RefreshCw, Rocket, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ConnectionTestResult, EnvironmentSafe } from "../../shared/environmentTypes";
import {
  createEnvironment,
  deleteEnvironment,
  deployToEnvironment,
  fetchDeployments,
  fetchEnvironments,
  testEnvironmentConnection
} from "../api/client";
import { ActionButton, Panel, StatusBadge } from "./ui";
import { ConfirmDialog } from "./ConfirmDialog";

export function EnvironmentPanel({ projectId }: { projectId?: string }) {
  const [environments, setEnvironments] = useState<EnvironmentSafe[]>([]);
  const [deployments, setDeployments] = useState<{ id: string; environmentId: string; status: string; createdAt: string }[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [testResults, setTestResults] = useState<Record<string, ConnectionTestResult>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newEnv, setNewEnv] = useState({ name: "", type: "mock" as "mock" | "onestream", baseUrl: "", clientId: "", clientSecret: "" });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [envs, deps] = await Promise.all([
          fetchEnvironments(),
          projectId ? fetchDeployments({ projectId }) : Promise.resolve([])
        ]);
        if (cancelled) return;
        setEnvironments(envs);
        setDeployments(deps as typeof deployments);
        setStatus(envs.length ? `${envs.length} environment${envs.length === 1 ? "" : "s"}` : "No environments configured");
      } catch (err) {
        if (!cancelled) setStatus(err instanceof Error ? err.message : "Failed to load");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId]);

  async function handleCreate() {
    try {
      const created = await createEnvironment(newEnv);
      setEnvironments(prev => [...prev, created]);
      setShowCreate(false);
      setNewEnv({ name: "", type: "mock", baseUrl: "", clientId: "", clientSecret: "" });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteEnvironment(id);
      setEnvironments(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleTest(id: string) {
    try {
      const result = await testEnvironmentConnection(id);
      setTestResults(prev => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResults(prev => ({ ...prev, [id]: { success: false, message: err instanceof Error ? err.message : "Test failed", latencyMs: 0, testedAt: new Date().toISOString() } }));
    }
  }

  async function handleDeploy(envId: string) {
    if (!projectId) return;
    try {
      const result = await deployToEnvironment(envId, { projectId });
      setDeployments(prev => [{ id: result.id, environmentId: result.environmentId, status: result.status, createdAt: result.createdAt }, ...prev]);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Deploy failed");
    }
  }

  return (
    <Panel>
      <div className="panel-heading">
        <div>
          <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Cloud size={16} /> Environments
          </h3>
          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{status}</span>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <ActionButton onClick={() => setShowCreate(!showCreate)}>
          <Plus size={14} /> Add Environment
        </ActionButton>
      </div>

      {showCreate && (
        <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginBottom: 12 }}>
          <input placeholder="Name" value={newEnv.name} onChange={e => setNewEnv(prev => ({ ...prev, name: e.target.value }))} style={{ display: "block", width: "100%", marginBottom: 8 }} />
          <select value={newEnv.type} onChange={e => setNewEnv(prev => ({ ...prev, type: e.target.value as "mock" | "onestream" }))} style={{ display: "block", width: "100%", marginBottom: 8 }}>
            <option value="mock">Mock (Testing)</option>
            <option value="onestream">OneStream</option>
          </select>
          <input placeholder="Base URL" value={newEnv.baseUrl} onChange={e => setNewEnv(prev => ({ ...prev, baseUrl: e.target.value }))} style={{ display: "block", width: "100%", marginBottom: 8 }} />
          <input placeholder="Client ID" value={newEnv.clientId} onChange={e => setNewEnv(prev => ({ ...prev, clientId: e.target.value }))} style={{ display: "block", width: "100%", marginBottom: 8 }} />
          <input placeholder="Client Secret" type="password" value={newEnv.clientSecret} onChange={e => setNewEnv(prev => ({ ...prev, clientSecret: e.target.value }))} style={{ display: "block", width: "100%", marginBottom: 8 }} />
          <ActionButton onClick={handleCreate}>Create</ActionButton>
        </div>
      )}

      {environments.map(env => (
        <div key={env.id} style={{ padding: 10, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <strong>{env.name}</strong>
              <StatusBadge tone={env.isActive ? "success" : "neutral"}>{env.isActive ? "active" : "inactive"}</StatusBadge>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            {env.type} &mdash; {env.baseUrl || "(no URL)"}
          </div>
          {testResults[env.id] && (
            <div style={{ fontSize: 12, marginTop: 4, color: testResults[env.id].success ? "var(--success)" : "var(--danger)" }}>
              {testResults[env.id].message} ({testResults[env.id].latencyMs}ms)
            </div>
          )}
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <ActionButton onClick={() => handleTest(env.id)}><RefreshCw size={12} /> Test</ActionButton>
            {projectId && <ActionButton onClick={() => handleDeploy(env.id)}><Rocket size={12} /> Deploy</ActionButton>}
            <ActionButton variant="danger" onClick={() => setConfirmDeleteId(env.id)}><Trash2 size={12} /> Delete</ActionButton>
          </div>
        </div>
      ))}

      {deployments.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>Recent Deployments</h4>
          {deployments.slice(0, 10).map(d => (
            <div key={d.id} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <StatusBadge tone={d.status === "success" ? "success" : d.status === "failed" ? "danger" : "info"}>{d.status}</StatusBadge>
              <span>{new Date(d.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete Environment"
        message="This will permanently remove the environment and all associated configuration. This cannot be undone."
        onConfirm={() => { if (confirmDeleteId) { void handleDelete(confirmDeleteId); setConfirmDeleteId(null); } }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </Panel>
  );
}
