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
import {
  buildOptimisticGridRecord,
  clampGridPageSize,
  shouldRollbackGridRecord,
  type GridRecord
} from "../ui/gridViewModel";
import { ActionButton, StatusBadge } from "./ui";

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
  const recordsRef = useRef<GridRecord[]>([]);
  const saveSequenceRef = useRef(0);
  const rowSaveTokensRef = useRef(new Map<string, number>());
  const columnMenuId = `${kind}-column-menu`;
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
    recordsRef.current = result.rows;
    setRecords(result.rows);
    setTotal(result.total);
    setOffset(nextOffset);
    setStatus(`${result.rows.length} of ${result.total} rows loaded`);
  }, [dimension.id, effectivePageSize, kind, projectId]);

  useEffect(() => {
    void loadPage(0);
  }, [loadPage]);

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  async function saveCell(record: GridRecord, field: FieldDefinition, value: string) {
    const sequence = saveSequenceRef.current + 1;
    saveSequenceRef.current = sequence;
    const rowSaveToken = (rowSaveTokensRef.current.get(record.id) ?? 0) + 1;
    rowSaveTokensRef.current.set(record.id, rowSaveToken);
    const previousRecord = recordsRef.current.find((candidate) => candidate.id === record.id) ?? record;
    const optimisticRecord = buildOptimisticGridRecord(previousRecord, kind, schema.memberKeyField, field.name, value);
    const replaceOptimisticRecord = (candidate: GridRecord) => candidate.id === previousRecord.id ? optimisticRecord : candidate;
    recordsRef.current = recordsRef.current.map(replaceOptimisticRecord);
    setRecords((current) => current.map(replaceOptimisticRecord));
    setStatus("Saving...");

    try {
      const properties = optimisticRecord.properties;
      if (kind === "members") {
        const member = optimisticRecord as DimensionMemberRecord;
        const memberKey = member.memberKey;
        await patchMember(projectId, member.id, { memberKey, properties });
      } else {
        const relationship = optimisticRecord as DimensionRelationshipRecord;
        const parentKey = relationship.parentKey;
        const childKey = relationship.childKey;
        await patchRelationship(projectId, relationship.id, { parentKey, childKey, properties });
      }
      if (sequence === saveSequenceRef.current) setStatus("Saved");
    } catch (caught) {
      const isLatestRowSave = rowSaveTokensRef.current.get(record.id) === rowSaveToken;
      const rollbackOptimisticRecord = (candidate: GridRecord) => (
        isLatestRowSave && candidate.id === previousRecord.id && shouldRollbackGridRecord(candidate, optimisticRecord) ? previousRecord : candidate
      );
      recordsRef.current = recordsRef.current.map(rollbackOptimisticRecord);
      setRecords((current) => current.map(rollbackOptimisticRecord));
      if (sequence === saveSequenceRef.current) setStatus(caught instanceof Error ? caught.message : "Save failed");
    }
  }

  async function addRow() {
    if (kind === "members") {
      const properties = Object.fromEntries(columns.map((column) => [column.name, ""]));
      const created = await createMember(projectId, dimension.id, { memberKey: "", properties });
      recordsRef.current = [...recordsRef.current, created];
      setRecords((current) => [...current, created]);
      setSelectedId(created.id);
    } else {
      const properties = Object.fromEntries(columns.map((column) => [column.name, ""]));
      const created = await createRelationship(projectId, dimension.id, { parentKey: "", childKey: "", properties });
      recordsRef.current = [...recordsRef.current, created];
      setRecords((current) => [...current, created]);
      setSelectedId(created.id);
    }
    setTotal((current) => current + 1);
  }

  async function duplicateRow() {
    const source = recordsRef.current.find((record) => record.id === selectedId);
    if (!source) return;
    if (kind === "members") {
      const member = source as DimensionMemberRecord;
      const created = await createMember(projectId, dimension.id, { memberKey: `${member.memberKey}_Copy`, properties: { ...member.properties, [schema.memberKeyField]: `${member.memberKey}_Copy` } });
      recordsRef.current = [...recordsRef.current, created];
      setRecords((current) => [...current, created]);
      setSelectedId(created.id);
    } else {
      const relationship = source as DimensionRelationshipRecord;
      const created = await createRelationship(projectId, dimension.id, { parentKey: relationship.parentKey, childKey: relationship.childKey, properties: relationship.properties });
      recordsRef.current = [...recordsRef.current, created];
      setRecords((current) => [...current, created]);
      setSelectedId(created.id);
    }
  }

  async function deleteSelected() {
    if (!selectedId) return;
    if (kind === "members") await deleteMember(projectId, selectedId);
    else await deleteRelationship(projectId, selectedId);
    recordsRef.current = recordsRef.current.filter((record) => record.id !== selectedId);
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
        <div className="grid-toolbar-primary">
          <div className="search-box">
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${kind}`} />
          </div>
          <StatusBadge tone={status === "Saved" ? "success" : status.startsWith("Loading") ? "info" : "neutral"}>
            {status || `${total} rows`}
          </StatusBadge>
        </div>
        <div className="grid-toolbar-actions">
          <ActionButton onClick={() => void addRow()}><Plus size={15} /> Add</ActionButton>
          <ActionButton disabled={!selectedId} title={selectedId ? "Duplicate selected row" : "Select a row to duplicate"} onClick={() => void duplicateRow()}><Copy size={15} /> Duplicate</ActionButton>
          <ActionButton variant="danger" disabled={!selectedId} title={selectedId ? "Delete selected row" : "Select a row to delete"} onClick={() => void deleteSelected()}><Trash2 size={15} /> Delete</ActionButton>
          <ActionButton aria-controls={columnMenuId} aria-expanded={showColumns} onClick={() => setShowColumns((current) => !current)}><EyeOff size={15} /> Columns</ActionButton>
        </div>
      </div>
      {showColumns && (
        <div id={columnMenuId} className="column-menu" aria-label="Column visibility">
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
              <span>{column.name}{column.required ? " *" : ""}</span>
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
