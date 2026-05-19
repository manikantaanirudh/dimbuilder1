import { Edit3, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getPropertyDefinitionsForDimension,
  type OneStreamPropertyTargetLevel
} from "../../shared/oneStreamPropertyDictionary";
import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  VaryingPropertyTargetType,
  VaryingPropertyValueRecord
} from "../../shared/types";
import {
  createVaryingPropertyValue,
  deleteVaryingPropertyValue,
  fetchMembers,
  fetchRelationships,
  fetchVaryingPropertyValues,
  patchVaryingPropertyValue
} from "../api/client";
import { ActionButton, IconButton, Panel, StatusBadge } from "./ui";

interface VaryingPropertyDraft {
  targetType: VaryingPropertyTargetType;
  targetId: string;
  propertyName: string;
  cubeType: string;
  scenarioType: string;
  timeMember: string;
  value: string;
  isDefault: boolean;
}

const emptyDraft = (dimensionId: string): VaryingPropertyDraft => ({
  targetType: "dimension",
  targetId: dimensionId,
  propertyName: "",
  cubeType: "",
  scenarioType: "",
  timeMember: "",
  value: "",
  isDefault: true
});

export function VaryingPropertiesPanel({
  projectId,
  dimension
}: {
  projectId: string;
  dimension: DimensionRecord;
}) {
  const [members, setMembers] = useState<DimensionMemberRecord[]>([]);
  const [relationships, setRelationships] = useState<DimensionRelationshipRecord[]>([]);
  const [values, setValues] = useState<VaryingPropertyValueRecord[]>([]);
  const [draft, setDraft] = useState<VaryingPropertyDraft>(() => emptyDraft(dimension.id));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const propertyDefinitions = useMemo(
    () => getPropertyDefinitionsForDimension(dimension.dimensionType, draft.targetType as OneStreamPropertyTargetLevel),
    [dimension.dimensionType, draft.targetType]
  );
  const targetOptions = useMemo(
    () => buildTargetOptions(dimension, members, relationships, draft.targetType),
    [dimension, draft.targetType, members, relationships]
  );

  useEffect(() => {
    setDraft(emptyDraft(dimension.id));
    setEditingId(null);
  }, [dimension.id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus("Loading varying properties...");
      try {
        const [loadedValues, loadedMembers, loadedRelationships] = await Promise.all([
          fetchVaryingPropertyValues(projectId, { dimensionId: dimension.id }),
          fetchMembers(projectId, dimension.id, 0, 300),
          fetchRelationships(projectId, dimension.id, 0, 300)
        ]);
        if (cancelled) return;
        setValues(loadedValues);
        setMembers(loadedMembers.rows);
        setRelationships(loadedRelationships.rows);
        setStatus(`${loadedValues.length} varying ${loadedValues.length === 1 ? "value" : "values"}`);
      } catch (caught) {
        if (!cancelled) setStatus(caught instanceof Error ? caught.message : "Failed to load varying properties");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [dimension.id, projectId]);

  useEffect(() => {
    if (targetOptions.some((option) => option.id === draft.targetId)) return;
    setDraft((current) => ({ ...current, targetId: targetOptions[0]?.id ?? "" }));
  }, [draft.targetId, targetOptions]);

  useEffect(() => {
    if (propertyDefinitions.length === 0) return;
    if (propertyDefinitions.some((definition) => definition.displayName === draft.propertyName)) return;
    setDraft((current) => ({ ...current, propertyName: propertyDefinitions[0]?.displayName ?? "" }));
  }, [draft.propertyName, propertyDefinitions]);

  async function submit() {
    if (!draft.targetId || !draft.propertyName) return;
    const body = {
      dimensionId: dimension.id,
      targetType: draft.targetType,
      targetId: draft.targetId,
      propertyName: draft.propertyName,
      value: draft.value,
      cubeType: draft.cubeType,
      scenarioType: draft.scenarioType,
      timeMember: draft.timeMember,
      isDefault: draft.isDefault
    };
    setStatus("Saving varying property...");
    const saved = editingId
      ? await patchVaryingPropertyValue(projectId, editingId, body)
      : await createVaryingPropertyValue(projectId, body);
    setValues((current) => [saved, ...current.filter((value) => value.id !== saved.id)]);
    setEditingId(null);
    setDraft(emptyDraft(dimension.id));
    setStatus("Saved");
  }

  async function remove(valueId: string) {
    await deleteVaryingPropertyValue(projectId, valueId);
    setValues((current) => current.filter((value) => value.id !== valueId));
    if (editingId === valueId) {
      setEditingId(null);
      setDraft(emptyDraft(dimension.id));
    }
    setStatus("Deleted");
  }

  function edit(value: VaryingPropertyValueRecord) {
    setEditingId(value.id);
    setDraft({
      targetType: value.targetType,
      targetId: value.targetId,
      propertyName: value.propertyName,
      cubeType: value.cubeType,
      scenarioType: value.scenarioType,
      timeMember: value.timeMember,
      value: value.value,
      isDefault: value.isDefault
    });
  }

  return (
    <Panel className="varying-properties-panel">
      <div className="varying-toolbar">
        <div className="grid-toolbar-title">
          <strong>Varying Properties</strong>
          <span>Default values and contextual overrides</span>
        </div>
        <StatusBadge tone={status.includes("failed") || status.includes("Failed") ? "danger" : "neutral"}>
          {status || "Ready"}
        </StatusBadge>
      </div>

      <div className="varying-form">
        <label>
          <span>Target type</span>
          <select
            value={draft.targetType}
            onChange={(event) => setDraft((current) => ({ ...current, targetType: event.currentTarget.value as VaryingPropertyTargetType, targetId: "" }))}
          >
            <option value="dimension">Dimension</option>
            <option value="member">Member</option>
            <option value="relationship">Relationship</option>
          </select>
        </label>
        <label>
          <span>Target</span>
          <select value={draft.targetId} onChange={(event) => setDraft((current) => ({ ...current, targetId: event.currentTarget.value }))}>
            {targetOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span>Property</span>
          <select value={draft.propertyName} onChange={(event) => setDraft((current) => ({ ...current, propertyName: event.currentTarget.value }))}>
            {propertyDefinitions.map((definition) => (
              <option key={definition.propertyKey} value={definition.displayName}>{definition.displayName}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Cube type</span>
          <input value={draft.cubeType} onChange={(event) => setDraft((current) => ({ ...current, cubeType: event.currentTarget.value }))} />
        </label>
        <label>
          <span>Scenario type</span>
          <input value={draft.scenarioType} onChange={(event) => setDraft((current) => ({ ...current, scenarioType: event.currentTarget.value }))} />
        </label>
        <label>
          <span>Time member</span>
          <input value={draft.timeMember} onChange={(event) => setDraft((current) => ({ ...current, timeMember: event.currentTarget.value }))} />
        </label>
        <label className="varying-value-input">
          <span>Value</span>
          <input value={draft.value} onChange={(event) => setDraft((current) => ({ ...current, value: event.currentTarget.value }))} />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={draft.isDefault} onChange={(event) => setDraft((current) => ({ ...current, isDefault: event.currentTarget.checked }))} />
          <span>Default</span>
        </label>
        <div className="varying-actions">
          <ActionButton variant="primary" disabled={!draft.targetId || !draft.propertyName} onClick={() => void submit()}>
            {editingId ? "Update" : "Add"}
          </ActionButton>
          {editingId && (
            <ActionButton variant="ghost" onClick={() => {
              setEditingId(null);
              setDraft(emptyDraft(dimension.id));
            }}>
              Cancel
            </ActionButton>
          )}
        </div>
      </div>

      <div className="varying-table" role="table" aria-label="Varying property values">
        <div className="varying-row header" role="row">
          <span>Property</span>
          <span>Target</span>
          <span>Context</span>
          <span>Value</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {values.map((value) => (
          <div key={value.id} className="varying-row" role="row">
            <span>{value.propertyName}</span>
            <span>{targetLabel(value, dimension, members, relationships)}</span>
            <span>{contextLabel(value)}</span>
            <span>{value.value}</span>
            <span><StatusBadge tone={value.isDefault ? "info" : "warning"}>{value.isDefault ? "Default" : "Override"}</StatusBadge></span>
            <span className="row-actions">
              <IconButton aria-label={`Edit ${value.propertyName}`} title="Edit" onClick={() => edit(value)}><Edit3 size={14} /></IconButton>
              <IconButton aria-label={`Delete ${value.propertyName}`} title="Delete" onClick={() => void remove(value.id)}><Trash2 size={14} /></IconButton>
            </span>
          </div>
        ))}
        {values.length === 0 && <div className="varying-empty">No varying properties configured for this dimension.</div>}
      </div>
    </Panel>
  );
}

function buildTargetOptions(
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[],
  targetType: VaryingPropertyTargetType
) {
  if (targetType === "dimension") return [{ id: dimension.id, label: dimension.dimensionName }];
  if (targetType === "member") return members.map((member) => ({ id: member.id, label: member.memberKey || member.id }));
  return relationships.map((relationship) => ({ id: relationship.id, label: `${relationship.parentKey || "(blank)"} -> ${relationship.childKey || "(blank)"}` }));
}

function targetLabel(
  value: VaryingPropertyValueRecord,
  dimension: DimensionRecord,
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): string {
  if (value.targetType === "dimension") return dimension.dimensionName;
  if (value.targetType === "member") return members.find((member) => member.id === value.targetId)?.memberKey || value.targetId;
  const relationship = relationships.find((candidate) => candidate.id === value.targetId);
  return relationship ? `${relationship.parentKey} -> ${relationship.childKey}` : value.targetId;
}

function contextLabel(value: Pick<VaryingPropertyValueRecord, "cubeType" | "scenarioType" | "timeMember">): string {
  const parts = [
    value.cubeType && `Cube: ${value.cubeType}`,
    value.scenarioType && `Scenario: ${value.scenarioType}`,
    value.timeMember && `Time: ${value.timeMember}`
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : "All contexts";
}
