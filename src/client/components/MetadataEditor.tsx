import { useState } from "react";
import type { DimensionRecord } from "../../shared/types";
import { patchDimension } from "../api/client";

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
    <div className="panel form-panel">
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
      <div className="form-status">{status}</div>
    </div>
  );
}

