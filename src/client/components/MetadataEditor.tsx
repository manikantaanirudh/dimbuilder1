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
  const draftRef = useRef(dimension);
  const savingRef = useRef(false);
  const inFlightSaveKeyRef = useRef<string | null>(null);
  const lastSavedRef = useRef(getDraftSaveKey(dimension));
  const pendingSaveRef = useRef(false);

  useEffect(() => {
    setDraft(dimension);
    draftRef.current = dimension;
    setStatus("");
    savingRef.current = false;
    inFlightSaveKeyRef.current = null;
    lastSavedRef.current = getDraftSaveKey(dimension);
    pendingSaveRef.current = false;
  }, [dimension.id]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  async function save() {
    const draftToSave = draftRef.current;
    const saveKey = getDraftSaveKey(draftToSave);
    if (saveKey === lastSavedRef.current) return;

    if (savingRef.current) {
      if (saveKey !== inFlightSaveKeyRef.current) pendingSaveRef.current = true;
      return;
    }

    savingRef.current = true;
    inFlightSaveKeyRef.current = saveKey;
    setStatus("Saving...");
    try {
      await patchDimension(projectId, dimension.id, draftToSave);
      lastSavedRef.current = saveKey;
      setStatus("Saved");
      onSaved();
    } finally {
      savingRef.current = false;
      inFlightSaveKeyRef.current = null;
      if (pendingSaveRef.current && getDraftSaveKey(draftRef.current) !== lastSavedRef.current) {
        pendingSaveRef.current = false;
        void save();
      } else {
        pendingSaveRef.current = false;
      }
    }
  }

  return (
    <Panel className="metadata-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Dimension details</span>
          <h2>Metadata</h2>
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
              className={key === "dimensionType" ? "readonly-field" : undefined}
              value={String(draft[key] ?? "")}
              readOnly={key === "dimensionType"}
              onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
              onBlur={() => void save()}
            />
          </label>
        ))}
      </div>
      <div className="metadata-actions">
        <ActionButton onClick={() => void save()}><Save size={15} /> Save</ActionButton>
      </div>
    </Panel>
  );
}
