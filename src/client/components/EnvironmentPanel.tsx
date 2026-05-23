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

export function EnvironmentPanel({ projectId }: { projectId?: string }) {
  const [environments, setEnvironments] = useState<EnvironmentSafe[]>([]);
  const [deployments, setDeployments] = useState<{ id: string; environmentId: string; status: string; createdAt: string }[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [testResults, setTestResults] = useState<Record<string, ConnectionTestResult>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newEnv, setNewEnv] = useState({ name: "", type: "mock" as const, baseUrl: "", clientId: "", clientSecret: "" });

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
    <Panel title="Environments" icon={<Cloud size={16} />} status={status}>
      <div style={{ marginBottom: 12 }}>
        <ActionButton icon={<Plus size={14} />} onClick={() => setShowCreate(!showCreate)}>
          Add Environment
        </ActionButton>
      </div>

      {showCreate && (
        <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 6, marginBottom: 12 }}>
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
        <div key={env.id} style={{ padding: 8, border: "1px solid var(--border)", borderRadius: 6, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{env.name}</strong>
            <StatusBadge status={env.isActive ? "active" : "inactive"} />
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            {env.type} &mdash; {env.baseUrl || "(no URL)"}
          </div>
          {testResults[env.id] && (
            <div style={{ fontSize: 12, marginTop: 4, color: testResults[env.id].success ? "green" : "red" }}>
              {testResults[env.id].message} ({testResults[env.id].latencyMs}ms)
            </div>
          )}
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <ActionButton icon={<RefreshCw size={12} />} onClick={() => handleTest(env.id)}>Test</ActionButton>
            {projectId && <ActionButton icon={<Rocket size={12} />} onClick={() => handleDeploy(env.id)}>Deploy</ActionButton>}
            <ActionButton icon={<Trash2 size={12} />} onClick={() => handleDelete(env.id)}>Delete</ActionButton>
          </div>
        </div>
      ))}

      {deployments.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4>Recent Deployments</h4>
          {deployments.slice(0, 10).map(d => (
            <div key={d.id} style={{ fontSize: 12, padding: 4, borderBottom: "1px solid var(--border)" }}>
              <StatusBadge status={d.status} /> &mdash; {new Date(d.createdAt).toLocaleString()}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
