import { Plus, Trash2 } from "lucide-react";
import type { MetadataCsvColumnMapping, MetadataCsvHierarchyMode } from "../../shared/metadataCsvMapping";
import { listMappableMemberProperties } from "../../shared/metadataCsvMapping";
import type { DimensionType } from "../../shared/types";
import { ActionButton } from "./ui";

const EMPTY_OPTION = "";

type PropertyMappingRow = { propertyName: string; sourceHeader: string };

function toPropertyRows(properties: Record<string, string> | undefined): PropertyMappingRow[] {
  return Object.entries(properties ?? {}).map(([propertyName, sourceHeader]) => ({ propertyName, sourceHeader }));
}

function fromPropertyRows(rows: PropertyMappingRow[]): Record<string, string> {
  const properties: Record<string, string> = {};
  for (const row of rows) {
    if (row.propertyName && row.sourceHeader) {
      properties[row.propertyName] = row.sourceHeader;
    }
  }
  return properties;
}

export function CsvColumnMappingPanel({
  headers,
  mapping,
  dimensionType,
  disabled,
  onChange
}: {
  headers: string[];
  mapping: MetadataCsvColumnMapping;
  dimensionType: DimensionType;
  disabled?: boolean;
  onChange: (next: MetadataCsvColumnMapping) => void;
}) {
  const fileColumns = ["", ...headers.filter((header) => header.trim().length > 0)];
  const dimensionProperties = listMappableMemberProperties(dimensionType);
  const propertyRows = toPropertyRows(mapping.properties);
  const hierarchyMode: MetadataCsvHierarchyMode = mapping.hierarchyMode ?? "none";
  const hierarchyColumns = mapping.hierarchyColumns ?? [];

  function updateMapping(patch: Partial<MetadataCsvColumnMapping>) {
    onChange({ ...mapping, ...patch });
  }

  function updateHierarchyMode(mode: MetadataCsvHierarchyMode) {
    if (mode === "none") {
      onChange({ ...mapping, hierarchyMode: mode, parent: undefined, hierarchyColumns: undefined });
      return;
    }
    if (mode === "parentColumn") {
      onChange({ ...mapping, hierarchyMode: mode, hierarchyColumns: undefined });
      return;
    }
    onChange({
      ...mapping,
      hierarchyMode: mode,
      parent: undefined,
      hierarchyColumns: hierarchyColumns.length > 0 ? hierarchyColumns : [""]
    });
  }

  function setHierarchyColumn(index: number, header: string) {
    const next = [...hierarchyColumns];
    while (next.length <= index) next.push("");
    next[index] = header;
    onChange({
      ...mapping,
      hierarchyMode: "levelColumns",
      parent: undefined,
      hierarchyColumns: next
    });
  }

  function addHierarchyLevel() {
    onChange({
      ...mapping,
      hierarchyMode: "levelColumns",
      parent: undefined,
      hierarchyColumns: [...hierarchyColumns, ""]
    });
  }

  function removeHierarchyLevel(index: number) {
    const next = hierarchyColumns.filter((_, rowIndex) => rowIndex !== index);
    onChange({
      ...mapping,
      hierarchyMode: next.length > 0 ? "levelColumns" : "none",
      hierarchyColumns: next.length > 0 ? next : undefined
    });
  }

  function addPropertyRow() {
    const used = new Set(propertyRows.map((row) => row.propertyName));
    const nextProperty = dimensionProperties.find((name) => !used.has(name)) ?? "";
    updateMapping({ properties: { ...mapping.properties, [nextProperty]: "" } });
  }

  function updatePropertyRow(index: number, patch: Partial<PropertyMappingRow>) {
    const rows = propertyRows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
    updateMapping({ properties: fromPropertyRows(rows) });
  }

  function removePropertyRow(index: number) {
    updateMapping({ properties: fromPropertyRows(propertyRows.filter((_, rowIndex) => rowIndex !== index)) });
  }

  return (
    <div className="import-csv-mapping">
      <h3 className="import-csv-mapping-title">Column mapping</h3>
      <p className="import-csv-mapping-hint">
        Map file columns to dimension fields. Member key is required. Choose how hierarchy is built from the file.
      </p>

      <label className="modal-field">
        <span>Hierarchy</span>
        <select
          value={hierarchyMode}
          disabled={disabled}
          onChange={(event) => updateHierarchyMode(event.target.value as MetadataCsvHierarchyMode)}
        >
          <option value="none">Flat list (no parent links)</option>
          <option value="parentColumn">Single parent column</option>
          <option value="levelColumns">Stacked level columns</option>
        </select>
      </label>

      <div className="import-csv-mapping-grid">
        <label className="modal-field">
          <span>Member key *</span>
          <select
            value={mapping.member ?? EMPTY_OPTION}
            disabled={disabled}
            onChange={(event) => updateMapping({ member: event.target.value || undefined })}
          >
            {fileColumns.map((header) => (
              <option key={`member-${header || "empty"}`} value={header}>{header || "(not mapped)"}</option>
            ))}
          </select>
        </label>

        {hierarchyMode === "parentColumn" ? (
          <label className="modal-field">
            <span>Parent key</span>
            <select
              value={mapping.parent ?? EMPTY_OPTION}
              disabled={disabled}
              onChange={(event) => updateMapping({ parent: event.target.value || undefined })}
            >
              {fileColumns.map((header) => (
                <option key={`parent-${header || "empty"}`} value={header}>{header || "(not mapped)"}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="modal-field">
          <span>Description</span>
          <select
            value={mapping.description ?? EMPTY_OPTION}
            disabled={disabled}
            onChange={(event) => updateMapping({ description: event.target.value || undefined })}
          >
            {fileColumns.map((header) => (
              <option key={`description-${header || "empty"}`} value={header}>{header || "(not mapped)"}</option>
            ))}
          </select>
        </label>

        <label className="modal-field">
          <span>Alias</span>
          <select
            value={mapping.alias ?? EMPTY_OPTION}
            disabled={disabled}
            onChange={(event) => updateMapping({ alias: event.target.value || undefined })}
          >
            {fileColumns.map((header) => (
              <option key={`alias-${header || "empty"}`} value={header}>{header || "(not mapped)"}</option>
            ))}
          </select>
        </label>

        <label className="modal-field">
          <span>Sort order</span>
          <select
            value={mapping.sortOrder ?? EMPTY_OPTION}
            disabled={disabled}
            onChange={(event) => updateMapping({ sortOrder: event.target.value || undefined })}
          >
            {fileColumns.map((header) => (
              <option key={`sort-${header || "empty"}`} value={header}>{header || "(not mapped)"}</option>
            ))}
          </select>
        </label>
      </div>

      {hierarchyMode === "levelColumns" ? (
        <div className="import-csv-mapping-levels">
          <span className="import-csv-mapping-subtitle">Stacked hierarchy (top → bottom)</span>
          <p className="import-csv-mapping-hint">
            Level 1 is the top parent. For Opex exports, map Level 1 → L03, Level 2 → L02, Level 3 → L01 if your file stores the root in the highest L## column.
          </p>
          {hierarchyColumns.map((header, index) => (
            <div key={`level-${index}-${header || "empty"}`} className="import-csv-mapping-level-row">
              <label className="modal-field">
                <span>Level {index + 1}{index === 0 ? " (top)" : ""}</span>
                <select
                  value={header}
                  disabled={disabled}
                  onChange={(event) => setHierarchyColumn(index, event.target.value)}
                >
                  {fileColumns.map((option) => (
                    <option key={`level-${index}-${option || "empty"}`} value={option}>{option || "(not mapped)"}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="icon-button"
                disabled={disabled}
                aria-label={`Remove level ${index + 1}`}
                onClick={() => removeHierarchyLevel(index)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <ActionButton type="button" variant="secondary" disabled={disabled} onClick={addHierarchyLevel}>
            <Plus size={14} /> Add level column
          </ActionButton>
        </div>
      ) : null}

      <div className="import-csv-mapping-properties">
        <span className="import-csv-mapping-subtitle">Member properties</span>
        {propertyRows.map((row, index) => (
          <div key={`property-${index}-${row.propertyName}`} className="import-csv-mapping-property-row">
            <select
              value={row.propertyName}
              disabled={disabled}
              onChange={(event) => updatePropertyRow(index, { propertyName: event.target.value })}
            >
              <option value="">Property</option>
              {dimensionProperties.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <span className="import-csv-mapping-arrow">←</span>
            <select
              value={row.sourceHeader}
              disabled={disabled}
              onChange={(event) => updatePropertyRow(index, { sourceHeader: event.target.value })}
            >
              <option value="">File column</option>
              {fileColumns.filter(Boolean).map((header) => (
                <option key={`prop-src-${header}`} value={header}>{header}</option>
              ))}
            </select>
            <button
              type="button"
              className="icon-button"
              disabled={disabled}
              aria-label="Remove property mapping"
              onClick={() => removePropertyRow(index)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <ActionButton type="button" variant="secondary" disabled={disabled} onClick={addPropertyRow}>
          <Plus size={14} /> Map property column
        </ActionButton>
      </div>
    </div>
  );
}
