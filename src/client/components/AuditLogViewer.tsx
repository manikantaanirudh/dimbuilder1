import { FileText, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { getDimensionDisplayLabel } from "../../shared/dimensionDisplay";
import type { DimensionRecord } from "../../shared/types";
import { fetchAuditLog, fetchDimensions } from "../api/client";
import { SkeletonAuditLog } from "./Skeleton";
import { Panel, StatusBadge } from "./ui";

interface AuditEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  timestamp: string;
}

function actionTone(action: string): "info" | "success" | "warning" | "danger" {
  if (action.includes("delete") || action.includes("remove")) return "danger";
  if (action.includes("create") || action.includes("add")) return "success";
  if (action.includes("update") || action.includes("modify") || action.includes("patch")) return "warning";
  return "info";
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ts; }
}

function getDimSuffix(
  entry: AuditEntry,
  dimMap?: Map<string, DimensionRecord>,
  displayConfig?: ClientAppConfig["dimensions"]["display"]
): string {
  if (!dimMap || dimMap.size === 0) return "";
  const data = entry.changes || entry.after || entry.before || {};
  const dimId =
    (data.dimensionId as string) ||
    (entry.after?.dimensionId as string) ||
    (entry.before?.dimensionId as string) ||
    (entry.entityType === "dimension" ? entry.entityId : undefined);
  if (!dimId) return "";
  const dim = dimMap.get(dimId);
  if (!dim) return "";
  const label = getDimensionDisplayLabel(dim, displayConfig);
  return ` in dimension "${label}"`;
}

function formatAuditDetails(
  entry: AuditEntry,
  dimMap?: Map<string, DimensionRecord>,
  displayConfig?: ClientAppConfig["dimensions"]["display"]
): string {
  const { action, changes, before, after } = entry;
  const data = changes || after || before || {};
  const beforeData = before || {};
  const afterData = after || changes || {};
  const dimSuffix = getDimSuffix(entry, dimMap, displayConfig);

  // Member actions
  if (action === "member.create") {
    const key = (data.memberKey as string) || (data.name as string);
    if (key) return `Created member "${key}"${dimSuffix}`;
    return `Created member (${entry.entityId.slice(0, 8)})${dimSuffix}`;
  }

  if (action === "member.update" || action === "member.patch") {
    const key = (afterData.memberKey as string) || (beforeData.memberKey as string) || (data.memberKey as string);
    const updatedKeys = Object.keys(data).filter(k => k !== "id" && k !== "dimensionId");
    const fieldsText = updatedKeys.length > 0 ? ` (${updatedKeys.slice(0, 3).join(", ")})` : "";
    if (key) return `Updated member "${key}"${fieldsText}${dimSuffix}`;
    return `Updated member (${entry.entityId.slice(0, 8)})${fieldsText}${dimSuffix}`;
  }

  if (action === "member.delete") {
    const key = (beforeData.memberKey as string) || (data.memberKey as string);
    if (key) return `Deleted member "${key}"${dimSuffix}`;
    return `Deleted member (${entry.entityId.slice(0, 8)})${dimSuffix}`;
  }

  if (action === "member.bulkDelete") {
    const count = (data.membersDeleted as number) || (afterData.membersDeleted as number) || (data.memberIds as string[])?.length || 0;
    const relCount = (data.relationshipsDeleted as number) || (afterData.relationshipsDeleted as number) || 0;
    const memberKeys =
      (data.memberKeys as string[]) ||
      (afterData.memberKeys as string[]) ||
      (beforeData.memberKeys as string[]) ||
      (data.deletedMemberKeys as string[]) ||
      (afterData.deletedMemberKeys as string[]) ||
      (beforeData.deletedMemberKeys as string[]);
    let keysStr = "";
    if (memberKeys && Array.isArray(memberKeys) && memberKeys.length > 0) {
      const shown = memberKeys.slice(0, 5).map(k => `"${k}"`).join(", ");
      const more = memberKeys.length > 5 ? `, +${memberKeys.length - 5} more` : "";
      keysStr = `: ${shown}${more}`;
    }
    let desc = `Bulk deleted ${count} member(s)${keysStr}`;
    if (relCount > 0) desc += ` (${relCount} relationship(s) removed)`;
    return desc + dimSuffix;
  }

  // Relationship actions
  if (action === "relationship.create") {
    const parent = (data.parentKey as string) || (data.parent as string);
    const child = (data.childKey as string) || (data.child as string);
    if (parent && child) return `Created relationship: "${parent}" → "${child}"${dimSuffix}`;
    if (child) return `Created relationship for child "${child}"${dimSuffix}`;
    return `Created relationship (${entry.entityId.slice(0, 8)})${dimSuffix}`;
  }

  if (action === "relationship.update") {
    const parent = (afterData.parentKey as string) || (beforeData.parentKey as string) || (data.parentKey as string);
    const child = (afterData.childKey as string) || (beforeData.childKey as string) || (data.childKey as string);
    if (parent && child) return `Updated relationship: "${parent}" → "${child}"${dimSuffix}`;
    return `Updated relationship (${entry.entityId.slice(0, 8)})${dimSuffix}`;
  }

  if (action === "relationship.delete") {
    const parent = (beforeData.parentKey as string) || (data.parentKey as string);
    const child = (beforeData.childKey as string) || (data.childKey as string);
    if (parent && child) return `Deleted relationship: "${parent}" → "${child}"${dimSuffix}`;
    return `Deleted relationship (${entry.entityId.slice(0, 8)})${dimSuffix}`;
  }

  if (action === "relationship.bulkDelete") {
    const count = (data.relationshipsDeleted as number) || (data.relationshipIds as string[])?.length || 0;
    const rels = (data.relationships as string[]) || (beforeData.relationships as string[]);
    let relsStr = "";
    if (rels && rels.length > 0) {
      const shown = rels.slice(0, 3).join(", ");
      const more = rels.length > 3 ? `, +${rels.length - 3} more` : "";
      relsStr = ` (${shown}${more})`;
    }
    return `Bulk deleted ${count} relationship(s)${relsStr}${dimSuffix}`;
  }

  // Validation
  if (action === "validation.run") {
    const issues = data.issues !== undefined ? data.issues : (afterData.issues !== undefined ? afterData.issues : undefined);
    if (typeof issues === "number") return `Ran project validation (${issues} issue(s) found)${dimSuffix}`;
    return `Ran project validation${dimSuffix}`;
  }

  if (action === "validation.configUpdate") {
    return "Updated validation rule configurations";
  }

  // Exports & Imports
  if (action === "export.xml") {
    const mode = (data.mode as string) || "standard";
    return `Exported XML (${mode} mode)${dimSuffix}`;
  }

  if (action === "project.import" || action === "project.importXml") {
    const members = (data.createdMembersCount as number) || (data.membersCount as number) || (data.members as number);
    const rels = (data.createdRelationshipsCount as number) || (data.relationshipsCount as number) || (data.relationships as number);
    if (members !== undefined || rels !== undefined) {
      return `Imported project (${members ?? 0} members, ${rels ?? 0} relationships)`;
    }
    return "Imported project data";
  }

  // Bulk Updates
  if (action === "bulkUpdate.apply") {
    const op = (data.request as any)?.operation || data.operation;
    const summary = data.summary as any;
    const count = summary?.updatedMembersCount || summary?.createdMembersCount;
    if (op && count !== undefined) return `Applied bulk update "${op}" on ${count} member(s)${dimSuffix}`;
    if (op) return `Applied bulk update "${op}"${dimSuffix}`;
    return `Applied bulk update${dimSuffix}`;
  }

  // Varying properties / defaults
  if (action.startsWith("varyingProperty.")) {
    const prop = (data.propertyName as string) || (data.targetType as string);
    const val = (data.value as string) || (data.overrideValue as string);
    const act = action.split(".")[1];
    if (prop && val) return `Varying property ${act}: ${prop} = "${val}"${dimSuffix}`;
    if (prop) return `Varying property ${act}: ${prop}${dimSuffix}`;
    return `Varying property ${act}${dimSuffix}`;
  }

  if (action.startsWith("propertyDefault.")) {
    const prop = (data.propertyName as string) || (data.propertyNameKey as string);
    const val = (data.defaultValue as string);
    const act = action.split(".")[1];
    if (prop && val) return `Property default ${act}: ${prop} = "${val}"${dimSuffix}`;
    if (prop) return `Property default ${act}: ${prop}${dimSuffix}`;
    return `Property default ${act}${dimSuffix}`;
  }

  // ChangeSets
  if (action.startsWith("changeSet.")) {
    const csId = (data.id as string) || (data.changeSetId as string) || entry.entityId;
    const act = action.split(".")[1];
    return `ChangeSet ${act}: ${csId.slice(0, 8)}${dimSuffix}`;
  }

  // Baselines & Snapshots
  if (action.includes("snapshot") || action.includes("baseline")) {
    const name = (data.name as string) || (data.label as string) || (data.id as string);
    if (name) return `${action}: "${name}"${dimSuffix}`;
    return `${action} (${entry.entityId.slice(0, 8)})${dimSuffix}`;
  }

  // Fallback for any other action
  const keyItems: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      if (k !== "id" && k !== "projectId" && k !== "dimensionId") {
        keyItems.push(`${k}: "${v}"`);
      }
    }
  }
  if (keyItems.length > 0) {
    return keyItems.slice(0, 3).join(", ") + dimSuffix;
  }

  const keys = Object.keys(data);
  if (keys.length > 0) return keys.slice(0, 3).join(", ") + dimSuffix;

  return `Completed${dimSuffix}`;
}

export function AuditLogViewer({
  projectId,
  dimensions: propDimensions,
  appConfig,
}: {
  projectId: string;
  dimensions?: DimensionRecord[];
  appConfig?: ClientAppConfig;
}) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [fetchedDimensions, setFetchedDimensions] = useState<DimensionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  const activeDimensions = propDimensions ?? fetchedDimensions;
  const dimMap = new Map(activeDimensions.map((d) => [d.id, d]));
  const displayConfig = appConfig?.dimensions.display;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [data, dims] = await Promise.all([
          fetchAuditLog(projectId),
          propDimensions ? Promise.resolve(null) : fetchDimensions(projectId).catch(() => null),
        ]);
        if (!cancelled) {
          setEntries(data ?? []);
          if (dims) setFetchedDimensions(dims);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load audit log");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId, propDimensions]);

  if (loading) return <SkeletonAuditLog />;
  if (error) return <div className="banner error">{error}</div>;

  const filtered = filter
    ? entries.filter(e => {
        const details = formatAuditDetails(e, dimMap, displayConfig).toLowerCase();
        const f = filter.toLowerCase();
        return (
          e.action.toLowerCase().includes(f) ||
          e.entityType.toLowerCase().includes(f) ||
          e.userId.toLowerCase().includes(f) ||
          e.entityId.toLowerCase().includes(f) ||
          details.includes(f)
        );
      })
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
          placeholder="Filter by action, user, entity, dimension, details..."
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
                    {formatAuditDetails(entry, dimMap, displayConfig)}
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
