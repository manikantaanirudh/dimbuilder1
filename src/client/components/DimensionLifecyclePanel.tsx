import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import type { DimensionRecord, DimensionType } from "../../shared/types";
import { createDimensionFromBlueprint, deleteDimension } from "../api/client";
import { ActionButton, Panel, StatusBadge } from "./ui";

export function DimensionLifecyclePanel({
  projectId,
  dimension,
  appConfig,
  onDeleted,
  onRecreated
}: {
  projectId: string;
  dimension: DimensionRecord;
  appConfig: ClientAppConfig;
  onDeleted: () => void;
  onRecreated: (dimension: DimensionRecord) => void;
}) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [recreateType, setRecreateType] = useState<DimensionType>(dimension.dimensionType);
  const [recreateName, setRecreateName] = useState(dimension.dimensionName);

  const enabledTypes = appConfig.dimensions.enabledTypes;

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete the entire "${dimension.dimensionName}" (${dimension.dimensionType}) dimension?\n\n` +
        "All members, relationships, varying properties, and validation issues for this dimension will be removed. This cannot be undone."
    );
    if (!confirmed) return;

    setBusy(true);
    setStatus("Deleting dimension...");
    try {
      const result = await deleteDimension(projectId, dimension.id);
      setStatus(
        `Deleted ${result.dimensionName}: ${result.membersRemoved} member(s), ${result.relationshipsRemoved} relationship(s) removed.`
      );
      onDeleted();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRecreate() {
    setBusy(true);
    setStatus("Creating dimension from blueprint...");
    try {
      const created = await createDimensionFromBlueprint(projectId, {
        dimensionType: recreateType,
        dimensionName: recreateName.trim() || undefined
      });
      setStatus(`Created ${created.dimensionName} with blueprint root members. Import or edit to add data.`);
      onRecreated(created);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="dimension-lifecycle-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Dimension lifecycle</span>
          <h2>Remove or recreate</h2>
        </div>
        {status ? <StatusBadge tone={status.toLowerCase().includes("fail") ? "danger" : "info"}>{status}</StatusBadge> : null}
      </div>

      <p className="import-csv-mapping-hint">
        Delete this dimension to clear a bad import or start over. Use recreate to add an empty dimension shell
        (blueprint root members) before CSV import or manual editing.
      </p>

      <div className="dimension-lifecycle-actions">
        <ActionButton variant="danger" disabled={busy} onClick={() => void handleDelete()}>
          <Trash2 size={15} /> Delete this dimension
        </ActionButton>
      </div>

      <div className="dimension-lifecycle-recreate">
        <span className="import-csv-mapping-subtitle">Recreate dimension (after delete)</span>
        <div className="import-csv-mapping-grid">
          <label className="modal-field">
            <span>Dimension type</span>
            <select value={recreateType} disabled={busy} onChange={(event) => setRecreateType(event.target.value as DimensionType)}>
              {enabledTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="modal-field">
            <span>Dimension name</span>
            <input
              value={recreateName}
              disabled={busy}
              onChange={(event) => setRecreateName(event.target.value)}
              placeholder="Uses blueprint default if empty"
            />
          </label>
        </div>
        <ActionButton variant="secondary" disabled={busy} onClick={() => void handleRecreate()}>
          <Plus size={15} /> Create from blueprint
        </ActionButton>
      </div>
    </Panel>
  );
}
