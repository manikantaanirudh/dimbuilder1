import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import type { DimensionRecord } from "../../shared/types";
import { patchDimension } from "../api/client";
import { ActionButton, Panel, StatusBadge } from "./ui";

export function MetadataEditor({
  projectId,
  dimension,
  onSaved
}: {
  projectId: string;
  dimension: DimensionRecord;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(dimension);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setDraft(dimension);
    setStatus("");
  }, [dimension.id]);
  const fields: Array<[keyof DimensionRecord, string, boolean]> = [
    ["dimensionType", "Dimension Type", true],
    ["dimensionName", "Dimension Name", true],
    ["description", "Description", false],
    ["accessGroup", "Access Group", false],
    ["maintenanceGroup", "Maintenance Group", false],
    ["inheritedDimension", "Inherited Dimension", false]
  ];

  async function save() {
    setStatus("Saving...");
    await patchDimension(projectId, dimension.id, draft);
    setStatus("Saved");
    onSaved();
  }

  return (
    <Panel className="metadata-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Overview</span>
          <h2>Dimension metadata</h2>
        </div>
        <StatusBadge tone={status === "Saved" ? "success" : status ? "info" : "neutral"}>
          {status || "Idle"}
        </StatusBadge>
      </div>
      <div className="form-panel">
        {fields.map(([key, label, required]) => (
          <label key={key}>
            <span>{label}{required ? " *" : ""}</span>
            <input
              value={String(draft[key] ?? "")}
              readOnly={key === "dimensionType"}
              onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
              onBlur={() => void save()}
            />
          </label>
        ))}
      </div>
      <div className="metadata-actions">
        <ActionButton onClick={() => void save()}><Save size={15} /> Save metadata</ActionButton>
      </div>
    </Panel>
  );
}
