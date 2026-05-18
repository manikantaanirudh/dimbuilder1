import { useEffect, useRef, useState } from "react";
import { Save } from "lucide-react";
import type { DimensionRecord } from "../../shared/types";
import { patchDimension } from "../api/client";
import { ActionButton, Panel, StatusBadge } from "./ui";

const fields: Array<[keyof DimensionRecord, string, boolean]> = [
  ["dimensionType", "Dimension Type", true],
  ["dimensionName", "Dimension Name", true],
  ["description", "Description", false],
  ["accessGroup", "Access Group", false],
  ["maintenanceGroup", "Maintenance Group", false],
  ["inheritedDimension", "Inherited Dimension", false]
];

function getDraftSaveKey(draft: DimensionRecord) {
  return JSON.stringify(Object.fromEntries(fields.map(([key]) => [key, draft[key] ?? ""])));
}

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
  const savingRef = useRef(false);
  const lastSavedRef = useRef(getDraftSaveKey(dimension));

  useEffect(() => {
    setDraft(dimension);
    setStatus("");
    savingRef.current = false;
    lastSavedRef.current = getDraftSaveKey(dimension);
  }, [dimension.id]);

  async function save() {
    const saveKey = getDraftSaveKey(draft);
    if (savingRef.current || saveKey === lastSavedRef.current) return;

    savingRef.current = true;
    setStatus("Saving...");
    try {
      await patchDimension(projectId, dimension.id, draft);
      lastSavedRef.current = saveKey;
      setStatus("Saved");
      onSaved();
    } finally {
      savingRef.current = false;
    }
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
