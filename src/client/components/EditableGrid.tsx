import { useVirtualizer } from "@tanstack/react-virtual";
import { Columns3, Copy, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDimensionSchema } from "../../shared/dimensionSchemas";
import { getPropertyDefinitionByName } from "../../shared/oneStreamPropertyDictionary";
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
  buildGridActionTitles,
  buildGridStatusTone,
  buildOptimisticGridRecord,
  clampGridPageSize,
  shouldRollbackGridRecord,
  type GridRecord
} from "../ui/gridViewModel";
import { IconButton, StatusBadge } from "./ui";

export function EditableGrid({
  projectId,
  kind,
  dimension,
  pageSize = 600,
  highlightedEntityId = null,
  issueFilteredIds = null
}: {
  projectId: string;
  kind: "members" | "relationships";
  dimension: DimensionRecord;
  pageSize?: number;
  highlightedEntityId?: string | null;
  issueFilteredIds?: Set<string> | null;
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
  const confirmedRecordsRef = useRef(new Map<string, GridRecord>());
  const rowSaveQueuesRef = useRef(new Map<string, Promise<void>>());
  const saveSequenceRef = useRef(0);
  const rowSaveTokensRef = useRef(new Map<string, number>());
  const columnMenuId = `${kind}-column-menu`;
  const actionTitles = buildGridActionTitles(selectedId);
  const statusTone = buildGridStatusTone(status);
  const visibleColumns = columns.filter((column) => !hiddenColumns.has(column.name));
  const gridTitle = kind === "members" ? "Members" : "Relationships";
  const rowNoun = kind === "members" ? "member" : "relationship";

  const gridTemplateColumns = useMemo(() => {
    const colWidths = visibleColumns.map((column) => {
      if (column.kind === "boolean") return "minmax(90px, 0.6fr)";
      if (column.kind === "number") return "minmax(110px, 0.7fr)";
      if (column.name === schema.memberKeyField || column.name === "Parent" || column.name === "Child") return "minmax(200px, 1.5fr)";
      return "minmax(160px, 1fr)";
    });
    return `48px ${colWidths.join(" ")}`;
  }, [visibleColumns, schema.memberKeyField]);

  const gridMinWidth = useMemo(() => {
    return 48 + visibleColumns.length * 160;
  }, [visibleColumns.length]);
  const filteredRecords = useMemo(() => {
    const needle = search.toLowerCase();
    if (!needle) return records;
    return records.filter((record) => {
      const r = record as Record<string, unknown>;
      const searchable = [r.memberKey, r.description, r.parentKey, r.childKey, r.memberKey]
        .filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(needle);
    });
  }, [records, search]);
  const rowSummary = issueFilteredIds
    ? `${records.length} with issues`
    : search
      ? `${filteredRecords.length} shown of ${total}`
      : `${total} rows`;

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
    confirmedRecordsRef.current = new Map(result.rows.map((row) => [row.id, row]));
    setRecords(result.rows);
    setTotal(result.total);
    setOffset(nextOffset);
    setStatus(`${result.rows.length} of ${result.total} rows loaded`);
  }, [dimension.id, effectivePageSize, kind, projectId]);

  const loadFilteredRecords = useCallback(async (ids: string[]) => {
    setStatus("Loading filtered rows...");
    const result = kind === "members"
      ? await fetchMembers(projectId, dimension.id, 0, 0, ids)
      : await fetchRelationships(projectId, dimension.id, 0, 0, ids);
    setRecords(result.rows);
    setTotal(result.total);
    setOffset(0);
    setStatus("");
  }, [projectId, dimension.id, kind]);

  useEffect(() => {
    if (issueFilteredIds && issueFilteredIds.size > 0) {
      void loadFilteredRecords([...issueFilteredIds]);
    } else if (issueFilteredIds === null) {
      void loadPage(0);
    }
  }, [issueFilteredIds, loadFilteredRecords, loadPage]);

  useEffect(() => {
    void loadPage(0);
  }, [loadPage]);

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => {
    if (!highlightedEntityId) return;
    const index = filteredRecords.findIndex((record) => record.id === highlightedEntityId);
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: "center" });
      setSelectedId(highlightedEntityId);
    }
  }, [highlightedEntityId, filteredRecords, virtualizer]);

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

    const operation = async () => {
      const properties = optimisticRecord.properties;
      try {
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
        confirmedRecordsRef.current.set(previousRecord.id, optimisticRecord);
        if (sequence === saveSequenceRef.current) setStatus("Saved");
      } catch (caught) {
        const isLatestRowSave = rowSaveTokensRef.current.get(record.id) === rowSaveToken;
        const rollbackRecord = confirmedRecordsRef.current.get(previousRecord.id) ?? previousRecord;
        const rollbackOptimisticRecord = (candidate: GridRecord) => (
          isLatestRowSave && candidate.id === previousRecord.id && shouldRollbackGridRecord(candidate, optimisticRecord) ? rollbackRecord : candidate
        );
        recordsRef.current = recordsRef.current.map(rollbackOptimisticRecord);
        setRecords((current) => current.map(rollbackOptimisticRecord));
        if (sequence === saveSequenceRef.current) setStatus(caught instanceof Error ? caught.message : "Save failed");
      }
    };

    const previousQueue = rowSaveQueuesRef.current.get(previousRecord.id) ?? Promise.resolve();
    const queuedSave = previousQueue.catch(() => undefined).then(operation);
    rowSaveQueuesRef.current.set(previousRecord.id, queuedSave);
    await queuedSave.finally(() => {
      if (rowSaveQueuesRef.current.get(previousRecord.id) === queuedSave) {
        rowSaveQueuesRef.current.delete(previousRecord.id);
      }
    });
  }

  async function addRow() {
    if (kind === "members") {
      const properties = Object.fromEntries(columns.map((column) => [column.name, ""]));
      const created = await createMember(projectId, dimension.id, { memberKey: "", properties });
      recordsRef.current = [...recordsRef.current, created];
      confirmedRecordsRef.current.set(created.id, created);
      setRecords((current) => [...current, created]);
      setSelectedId(created.id);
    } else {
      const properties = Object.fromEntries(columns.map((column) => [column.name, ""]));
      const created = await createRelationship(projectId, dimension.id, { parentKey: "", childKey: "", properties });
      recordsRef.current = [...recordsRef.current, created];
      confirmedRecordsRef.current.set(created.id, created);
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
      confirmedRecordsRef.current.set(created.id, created);
      setRecords((current) => [...current, created]);
      setSelectedId(created.id);
    } else {
      const relationship = source as DimensionRelationshipRecord;
      const created = await createRelationship(projectId, dimension.id, { parentKey: relationship.parentKey, childKey: relationship.childKey, properties: relationship.properties });
      recordsRef.current = [...recordsRef.current, created];
      confirmedRecordsRef.current.set(created.id, created);
      setRecords((current) => [...current, created]);
      setSelectedId(created.id);
    }
  }

  async function deleteSelected() {
    if (!selectedId) return;
    if (kind === "members") await deleteMember(projectId, selectedId);
    else await deleteRelationship(projectId, selectedId);
    recordsRef.current = recordsRef.current.filter((record) => record.id !== selectedId);
    confirmedRecordsRef.current.delete(selectedId);
    rowSaveQueuesRef.current.delete(selectedId);
    rowSaveTokensRef.current.delete(selectedId);
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

  function columnTitle(column: FieldDefinition): string | undefined {
    const definition = getPropertyDefinitionByName(dimension.dimensionType, kind === "members" ? "member" : "relationship", column.name);
    if (!definition?.helpText) return undefined;
    return `${definition.displayName}: ${definition.helpText}`;
  }

  return (
    <div className="panel grid-panel">
      <div className="grid-toolbar workbench-grid-toolbar">
        <div className="grid-toolbar-primary">
          <div className="grid-toolbar-title">
            <strong>{gridTitle}</strong>
            <span>{rowSummary}</span>
          </div>
          <div className="search-box">
            <Search size={15} />
            <input aria-label={`Search ${kind}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${kind}`} />
          </div>
          <StatusBadge tone={statusTone}>
            {status || `${total} rows`}
          </StatusBadge>
        </div>
        <div className="grid-toolbar-actions grid-toolbar-tools" role="toolbar" aria-label={`${gridTitle} table actions`}>
          <span className="grid-selection-summary">{selectedId ? "1 row selected" : "No row selected"}</span>
          <IconButton className="grid-icon-button primary" aria-label={`Add ${rowNoun}`} title={`Add ${rowNoun}`} onClick={() => void addRow()}>
            <Plus size={15} />
          </IconButton>
          <IconButton className="grid-icon-button" aria-label="Duplicate selected row" disabled={!selectedId} title={actionTitles.duplicateTitle} onClick={() => void duplicateRow()}>
            <Copy size={15} />
          </IconButton>
          <IconButton className="grid-icon-button danger" aria-label="Delete selected row" disabled={!selectedId} title={actionTitles.deleteTitle} onClick={() => void deleteSelected()}>
            <Trash2 size={15} />
          </IconButton>
          <IconButton className="grid-icon-button" aria-label="Toggle columns" title="Toggle columns" aria-controls={columnMenuId} aria-expanded={showColumns} onClick={() => setShowColumns((current) => !current)}>
            <Columns3 size={15} />
          </IconButton>
        </div>
      </div>
      {showColumns && (
        <div id={columnMenuId} className="column-menu workbench-column-menu" aria-label="Column visibility">
          <div className="grid-column-menu-title">
            <strong>Visible columns</strong>
            <span>{visibleColumns.length} of {columns.length}</span>
          </div>
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
      <div className="data-grid workbench-data-grid" ref={parentRef}>
        <div className="grid-surface" style={{ minWidth: `${gridMinWidth}px` }}>
          <div className="grid-header" style={{ gridTemplateColumns }}>
            <div className="grid-row-number">#</div>
            {visibleColumns.map((column) => <div key={column.name} title={columnTitle(column)}>{column.name}{column.required ? " *" : ""}</div>)}
          </div>
          <div className="grid-body" style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((item) => {
              const record = filteredRecords[item.index];
              return (
                <div
                  key={record.id}
                  className={`grid-row ${selectedId === record.id ? "selected" : ""} ${highlightedEntityId === record.id ? "highlighted" : ""}`}
                  style={{ transform: `translateY(${item.start}px)`, gridTemplateColumns }}
                  onClick={() => setSelectedId(record.id)}
                >
                  <span className="grid-row-number">{offset + item.index + 1}</span>
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
      </div>
      {!issueFilteredIds && (
        <div className="pager">
          <button disabled={offset === 0} onClick={() => void loadPage(Math.max(0, offset - effectivePageSize))}>Previous</button>
          <span>Rows {total === 0 ? 0 : offset + 1}-{Math.min(offset + records.length, total)} of {total}</span>
          <button disabled={offset + records.length >= total} onClick={() => void loadPage(offset + effectivePageSize)}>Next</button>
        </div>
      )}
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
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function commit(nextValue: string) {
    if (nextValue !== value) onSave(nextValue);
  }

  if (column.kind === "boolean") {
    return (
      <select
        value={draft}
        aria-label={column.name}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={(event) => commit(event.currentTarget.value)}
      >
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
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={(event) => commit(event.currentTarget.value)}
    />
  );
}
