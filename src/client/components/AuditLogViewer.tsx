import { FileText, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAuditLog } from "../api/client";
import { Panel, StatusBadge } from "./ui";
import { SkeletonAuditLog } from "./Skeleton";

interface AuditEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: Record<string, unknown>;
  timestamp: string;
}

function actionTone(action: string): "info" | "success" | "warning" | "danger" {
  if (action.includes("delete") || action.includes("remove")) return "danger";
  if (action.includes("create") || action.includes("add")) return "success";
  if (action.includes("update") || action.includes("modify")) return "warning";
  return "info";
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ts; }
}

export function AuditLogViewer({ projectId }: { projectId: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await fetchAuditLog(projectId);
        if (!cancelled) setEntries(data ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load audit log");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) return <SkeletonAuditLog />;
  if (error) return <div className="banner error">{error}</div>;

  const filtered = filter
    ? entries.filter(e =>
      e.action.toLowerCase().includes(filter.toLowerCase()) ||
      e.entityType.toLowerCase().includes(filter.toLowerCase()) ||
      e.userId.toLowerCase().includes(filter.toLowerCase()) ||
      e.entityId.toLowerCase().includes(filter.toLowerCase())
    )
    : entries;

  return (
    <section className="audit-log-viewer">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Audit & Compliance</span>
          <h2><FileText size={20} /> Audit Log</h2>
        </div>
        <StatusBadge tone="info">{entries.length} entries</StatusBadge>
      </div>

      <div className="audit-filter">
        <Search size={14} />
        <input
          type="text"
          placeholder="Filter by action, user, entity..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>

      <Panel className="audit-table-panel">
        {filtered.length === 0 ? (
          <div className="empty-state-block">
            <strong>{entries.length === 0 ? "No audit entries yet" : "No matching entries"}</strong>
            <div className="empty-state-description">
              {entries.length === 0 ? "Actions will be logged as users interact with the project." : "Try a different filter."}
            </div>
          </div>
        ) : (
          <table className="audit-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => (
                <tr key={entry.id}>
                  <td className="audit-time">{formatTimestamp(entry.timestamp)}</td>
                  <td className="audit-user">{entry.userId}</td>
                  <td><StatusBadge tone={actionTone(entry.action)}>{entry.action}</StatusBadge></td>
                  <td><code>{entry.entityType}</code> <small>{entry.entityId.slice(0, 8)}</small></td>
                  <td className="audit-changes">
                    {Object.keys(entry.changes).length > 0
                      ? Object.keys(entry.changes).slice(0, 3).join(", ")
                      : "n/a"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </section>
  );
}
