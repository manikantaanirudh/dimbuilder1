import { useCallback, useEffect, useMemo, useState } from "react";
import type { DimensionRecord } from "../../shared/types";
import { fetchPropertyDefaults, updatePropertyDefault } from "../api/client";

type TargetLevel = "dimension" | "member" | "relationship";

interface PropertyDefaultValueRow {
  id: string;
  dimensionType: string;
  targetLevel: TargetLevel;
  propertyName: string;
  xmlName: string;
  defaultValue: string;
  enabled: boolean;
}

const TARGET_LEVEL_ORDER: TargetLevel[] = ["dimension", "member", "relationship"];

export function PropertyDefaultsPanel({
  projectId,
  dimension
}: {
  projectId: string;
  dimension: DimensionRecord;
}) {
  const [values, setValues] = useState<PropertyDefaultValueRow[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetchPropertyDefaults(projectId, dimension.dimensionType);
    setValues(response.values[dimension.dimensionType] ?? []);
  }, [dimension.dimensionType, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const groups: Record<TargetLevel, PropertyDefaultValueRow[]> = {
      dimension: [],
      member: [],
      relationship: []
    };
    for (const value of values) {
      groups[value.targetLevel].push(value);
    }
    return groups;
  }, [values]);

  async function handleValueChange(row: PropertyDefaultValueRow, patch: { defaultValue?: string; enabled?: boolean }) {
    setBusy(true);
    setStatus("");
    try {
      const response = await updatePropertyDefault(projectId, row.id, patch);
      setValues((current) => current.map((value) => (value.id === row.id ? response.value : value)));
      setStatus("Default saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update default.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Property Defaults</h2>
          <p className="panel-subtitle">
            Default property values for <strong>{dimension.dimensionType}</strong> apply on export and validation for every project.
            Import hierarchy-only CSV or XLSX; missing member and relationship properties are filled from these defaults.
          </p>
        </div>
      </header>

      {status && <p className="panel-status">{status}</p>}

      {TARGET_LEVEL_ORDER.map((targetLevel) => (
        <div key={targetLevel} className="property-defaults-group">
          <h3>{targetLevel === "dimension" ? "Dimension" : targetLevel === "member" ? "Member" : "Relationship"}</h3>
          {grouped[targetLevel].length === 0 ? (
            <p className="empty-state">No defaults for this level.</p>
          ) : (
            <table className="data-table property-defaults-table">
              <thead>
                <tr>
                  <th>Enabled</th>
                  <th>Property</th>
                  <th>XML name</th>
                  <th>Default value</th>
                </tr>
              </thead>
              <tbody>
                {grouped[targetLevel].map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        disabled={busy}
                        onChange={(event) => void handleValueChange(row, { enabled: event.target.checked })}
                      />
                    </td>
                    <td>{row.propertyName}</td>
                    <td><code>{row.xmlName}</code></td>
                    <td>
                      <input
                        className="inline-input"
                        value={row.defaultValue}
                        disabled={busy}
                        onChange={(event) => {
                          const next = event.target.value;
                          setValues((current) => current.map((value) => (value.id === row.id ? { ...value, defaultValue: next } : value)));
                        }}
                        onBlur={(event) => {
                          if (event.target.value !== row.defaultValue) {
                            void handleValueChange(row, { defaultValue: event.target.value });
                          }
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </section>
  );
}
