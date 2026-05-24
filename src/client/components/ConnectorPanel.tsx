import { Database, Plus, Play, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ConnectorDefinition } from "../../shared/connectorTypes";
import {
  fetchConnectors,
  createConnector,
  deleteConnector,
  testConnectorConnection
} from "../api/client";
import { ActionButton, Panel, StatusBadge } from "./ui";

export function ConnectorPanel() {
  const [connectors, setConnectors] = useState<ConnectorDefinition[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [showCreate, setShowCreate] = useState(false);
  const [newConn, setNewConn] = useState({ name: "", connectorType: "rest" as const, connectionConfig: {} as Record<string, unknown>, extractionConfig: {} as Record<string, unknown> });
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await fetchConnectors();
        if (cancelled) return;
        setConnectors(list);
        setStatus(list.length ? `${list.length} connector${list.length === 1 ? "" : "s"}` : "No connectors configured");
      } catch (err) {
        if (!cancelled) setStatus(err instanceof Error ? err.message : "Failed to load");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function handleCreate() {
    try {
      const created = await createConnector(newConn);
      setConnectors(prev => [...prev, created]);
      setShowCreate(false);
      setNewConn({ name: "", connectorType: "rest", connectionConfig: {}, extractionConfig: {} });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function handleTest(id: string) {
    try {
      const result = await testConnectorConnection(id);
      setTestResults(prev => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResults(prev => ({ ...prev, [id]: { success: false, message: err instanceof Error ? err.message : "Test failed" } }));
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteConnector(id);
      setConnectors(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <Panel title="ERP Connectors" icon={<Database size={16} />} subtitle={status}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <ActionButton icon={<Plus size={14} />} onClick={() => setShowCreate(!showCreate)}>New Connector</ActionButton>
      </div>

      {showCreate && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 12, marginBottom: 12 }}>
          <input placeholder="Name" value={newConn.name} onChange={e => setNewConn(p => ({ ...p, name: e.target.value }))} style={{ width: "100%", marginBottom: 8 }} />
          <select value={newConn.connectorType} onChange={e => setNewConn(p => ({ ...p, connectorType: e.target.value as "rest" }))} style={{ width: "100%", marginBottom: 8 }}>
            <option value="rest">REST / Mock</option>
            <option value="csv">CSV</option>
            <option value="sql">Generic SQL</option>
            <option value="sap">SAP</option>
            <option value="oracle">Oracle</option>
          </select>
          <ActionButton onClick={handleCreate}>Create</ActionButton>
        </div>
      )}

      {connectors.map(conn => (
        <div key={conn.id} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 10, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{conn.name}</strong>
              <StatusBadge status={conn.isActive ? "active" : "inactive"} />
              <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 12 }}>{conn.connectorType}</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <ActionButton icon={<Play size={12} />} onClick={() => handleTest(conn.id)} title="Test Connection" />
              <ActionButton icon={<Trash2 size={12} />} onClick={() => handleDelete(conn.id)} title="Delete" />
            </div>
          </div>
          {testResults[conn.id] && (
            <div style={{ marginTop: 6, fontSize: 12, color: testResults[conn.id].success ? "var(--success)" : "var(--error)" }}>
              {testResults[conn.id].message}
            </div>
          )}
        </div>
      ))}
    </Panel>
  );
}
