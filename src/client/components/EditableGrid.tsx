import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, EyeOff, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDimensionSchema } from "../../shared/dimensionSchemas";
import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  FieldDefinition
} from "../../shared/types";
import {
  createMember,
  createRelationship,
  deleteMember,
  deleteRelationship,
  fetchMembers,
  fetchRelationships,
  patchMember,
  patchRelationship
} from "../api/client";

type GridRecord = DimensionMemberRecord | DimensionRelationshipRecord;

const MAX_GRID_PAGE_SIZE = 1000;

function clampGridPageSize(pageSize: number) {
  const integerPageSize = Number.isFinite(pageSize) ? Math.trunc(pageSize) : 1;
  return Math.min(MAX_GRID_PAGE_SIZE, Math.max(1, integerPageSize));
}

export function EditableGrid({
  projectId,
  kind,
  dimension,
  pageSize = 600
}: {
  projectId: string;
  kind: "members" | "relationships";
  dimension: DimensionRecord;
  pageSize?: number;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const schema = getDimensionSchema(dimension.dimensionType);
  const columns = kind === "members" ? schema.memberFields : schema.relationshipFields;
  const effectivePageSize = useMemo(() => clampGridPageSize(pageSize), [pageSize]);
  const [records, setRecords] = useState<GridRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showColumns, setShowColumns] = useState(false);
  const [status, setStatus] = useState("");
  const visibleColumns = columns.filter((column) => !hiddenColumns.has(column.name));
  const filteredRecords = useMemo(() => {
    const needle = search.toLowerCase();
    if (!needle) return records;
    return records.filter((record) => JSON.stringify(record).toLowerCase().includes(needle));
  }, [records, search]);

  const virtualizer = useVirtualizer({
    count: filteredRecords.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 12
  });

  const loadPage = useCallback(async (nextOffset: number) => {
    setStatus("Loading rows...");
    const result = kind === "members"
      ? await fetchMembers(projectId, dimension.id, nextOffset, effectivePageSize)
      : await fetchRelationships(projectId, dimension.id, nextOffset, effectivePageSize);
    setRecords(result.rows);
    setTotal(result.total);
    setOffset(nextOffset);
    setStatus(`${result.rows.length} of ${result.total} rows loaded`);
  }, [dimension.id, effectivePageSize, kind, projectId]);

  useEffect(() => {
    void loadPage(0);
  }, [loadPage]);

  async function saveCell(record: GridRecord, field: FieldDefinition, value: string) {
    const properties = { ...record.properties, [field.name]: value };
    setRecords((current) => current.map((candidate) => candidate.id === record.id ? { ...candidate, properties } as GridRecord : candidate));

    if (kind === "members") {
      const member = record as DimensionMemberRecord;
      const memberKey = field.name === schema.memberKeyField ? value : member.memberKey;
      await patchMember(projectId, member.id, { memberKey, properties });
    } else {
      const relationship = record as DimensionRelationshipRecord;
      const parentKey = field.name === "Parent" ? value : relationship.parentKey;
      const childKey = field.name === "Child" ? value : relationship.childKey;
      await patchRelationship(projectId, relationship.id, { parentKey, childKey, properties });
    }
    setStatus("Saved");
  }

  async function addRow() {
    if (kind === "members") {
      const properties = Object.fromEntries(columns.map((column) => [column.name, ""]));
      const created = await createMember(projectId, dimension.id, { memberKey: "", properties });
      setRecords((current) => [...current, created]);
      setSelectedId(created.id);
    } else {
      const properties = Object.fromEntries(columns.map((column) => [column.name, ""]));
      const created = await createRelationship(projectId, dimension.id, { parentKey: "", childKey: "", properties });
      setRecords((current) => [...current, created]);
      setSelectedId(created.id);
    }
    setTotal((current) => current + 1);
  }

  async function duplicateRow() {
    const source = records.find((record) => record.id === selectedId);
    if (!source) return;
    if (kind === "members") {
      const member = source as DimensionMemberRecord;
      const created = await createMember(projectId, dimension.id, { memberKey: `${member.memberKey}_Copy`, properties: { ...member.properties, [schema.memberKeyField]: `${member.memberKey}_Copy` } });
      setRecords((current) => [...current, created]);
      setSelectedId(created.id);
    } else {
      const relationship = source as DimensionRelationshipRecord;
      const created = await createRelationship(projectId, dimension.id, { parentKey: relationship.parentKey, childKey: relationship.childKey, properties: relationship.properties });
      setRecords((current) => [...current, created]);
      setSelectedId(created.id);
    }
  }

  async function deleteSelected() {
    if (!selectedId) return;
    if (kind === "members") await deleteMember(projectId, selectedId);
    else await deleteRelationship(projectId, selectedId);
    setRecords((current) => current.filter((record) => record.id !== selectedId));
    setSelectedId(null);
    setTotal((current) => Math.max(0, current - 1));
  }

  function valueFor(record: GridRecord, column: FieldDefinition): string {
    if (kind === "relationships") {
      const relationship = record as DimensionRelationshipRecord;
      if (column.name === "Parent") return relationship.parentKey;
      if (column.name === "Child") return relationship.childKey;
    }
    if (kind === "members" && column.name === schema.memberKeyField) return (record as DimensionMemberRecord).memberKey;
    return String(record.properties[column.name] ?? "");
  }

  return (
    <div className="panel grid-panel">
      <div className="grid-toolbar">
        <div className="search-box"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${kind}`} /></div>
        <button onClick={() => void addRow()}><Plus size={15} /> Add</button>
        <button disabled={!selectedId} onClick={() => void duplicateRow()}><Copy size={15} /> Duplicate</button>
        <button disabled={!selectedId} onClick={() => void deleteSelected()}><Trash2 size={15} /> Delete</button>
        <button onClick={() => setShowColumns((current) => !current)}><EyeOff size={15} /> Columns</button>
        <span className="grid-status">{status}</span>
      </div>
      {showColumns && (
        <div className="column-menu">
          {columns.map((column) => (
            <label key={column.name}>
              <input
                type="checkbox"
                checked={!hiddenColumns.has(column.name)}
                onChange={() => setHiddenColumns((current) => {
                  const next = new Set(current);
                  if (next.has(column.name)) next.delete(column.name);
                  else next.add(column.name);
                  return next;
                })}
              />
              {column.name}
            </label>
          ))}
        </div>
      )}
      <div className="data-grid" ref={parentRef}>
        <div className="grid-header" style={{ gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(160px, 1fr))` }}>
          {visibleColumns.map((column) => <div key={column.name}>{column.name}{column.required ? " *" : ""}</div>)}
        </div>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative", minWidth: `${visibleColumns.length * 160}px` }}>
          {virtualizer.getVirtualItems().map((item) => {
            const record = filteredRecords[item.index];
            return (
              <div
                key={record.id}
                className={`grid-row ${selectedId === record.id ? "selected" : ""}`}
                style={{ transform: `translateY(${item.start}px)`, gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(160px, 1fr))` }}
                onClick={() => setSelectedId(record.id)}
              >
                {visibleColumns.map((column) => (
                  <GridCell
                    key={column.name}
                    column={column}
                    value={valueFor(record, column)}
                    onSave={(value) => void saveCell(record, column, value)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="pager">
        <button disabled={offset === 0} onClick={() => void loadPage(Math.max(0, offset - effectivePageSize))}>Previous</button>
        <span>Rows {total === 0 ? 0 : offset + 1}-{Math.min(offset + records.length, total)} of {total}</span>
        <button disabled={offset + records.length >= total} onClick={() => void loadPage(offset + effectivePageSize)}>Next</button>
      </div>
    </div>
  );
}

function GridCell({
  column,
  value,
  onSave
}: {
  column: FieldDefinition;
  value: string;
  onSave: (value: string) => void;
}) {
  if (column.kind === "boolean") {
    return (
      <select defaultValue={value} aria-label={column.name} onBlur={(event) => onSave(event.currentTarget.value)}>
        <option value=""></option>
        <option value="True">True</option>
        <option value="False">False</option>
      </select>
    );
  }
  return (
    <input
      type={column.kind === "number" ? "number" : "text"}
      aria-label={column.name}
      defaultValue={value}
      onBlur={(event) => onSave(event.currentTarget.value)}
    />
  );
}
