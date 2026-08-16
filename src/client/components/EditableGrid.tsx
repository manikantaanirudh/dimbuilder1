import { useVirtualizer } from "@tanstack/react-virtual";
import { Columns3, Copy, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDimensionSchema } from "../../shared/dimensionSchemas";
import { getPropertyDefinitionByName } from "../../shared/oneStreamPropertyDictionary";
import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  FieldDefinition,
  ValidationIssue,
} from "../../shared/types";
import {
  bulkDeleteMembers,
  bulkDeleteRelationships,
  createMember,
  createRelationship,
  deleteMember,
  deleteRelationship,
  fetchMembers,
  fetchRelationships,
  patchMember,
  patchRelationship,
} from "../api/client";
import {
  buildGridActionTitles,
  buildGridSelectionSummary,
  buildGridStatusTone,
  buildOptimisticGridRecord,
  clampGridPageSize,
  shouldRollbackGridRecord,
  type GridRecord,
} from "../ui/gridViewModel";
import { IconButton, StatusBadge } from "./ui";

export function EditableGrid({
  projectId,
  kind,
  dimension,
  pageSize = 600,
  highlightedEntityId = null,
  issueFilteredIds = null,
  issues = [],
  refreshSignal = 0,
  selectedRow = null,
  onRefresh,
  onSelectRow,
}: {
  projectId: string;
  kind: "members" | "relationships";
  dimension: DimensionRecord;
  pageSize?: number;
  highlightedEntityId?: string | null;
  issueFilteredIds?: Set<string> | null;
  issues?: ValidationIssue[];
  refreshSignal?: number;
  selectedRow?: any | null;
  onRefresh?: () => void;
  onSelectRow?: (row: any | null) => void;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const schema = getDimensionSchema(dimension.dimensionType);
  const columns = useMemo(() => {
    if (kind === "members") {
      const baseFields = [...schema.memberFields];
      if (!baseFields.some((f) => f.name === "Parent")) {
        const insertIdx = baseFields.findIndex((f) => f.name === "Description");
        const parentField: FieldDefinition = { name: "Parent", kind: "text", required: false };
        if (insertIdx !== -1) {
          baseFields.splice(insertIdx + 1, 0, parentField);
        } else {
          baseFields.splice(1, 0, parentField);
        }
      }
      return baseFields;
    }
    return schema.relationshipFields;
  }, [kind, schema]);
  const effectivePageSize = useMemo(
    () => clampGridPageSize(pageSize),
    [pageSize],
  );
  const [records, setRecords] = useState<GridRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectionAnchorIndexRef = useRef<number | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showColumns, setShowColumns] = useState(false);
  const [status, setStatus] = useState("");
  const recordsRef = useRef<GridRecord[]>([]);
  const confirmedRecordsRef = useRef(new Map<string, GridRecord>());
  const rowSaveQueuesRef = useRef(new Map<string, Promise<void>>());
  const saveSequenceRef = useRef(0);
  const rowSaveTokensRef = useRef(new Map<string, number>());
  const columnMenuId = `${kind}-column-menu`;
  const selectionCount = selectedIds.size;
  const actionTitles = buildGridActionTitles(selectedId, selectionCount);
  const selectionSummary = buildGridSelectionSummary(kind, selectionCount);
  const supportsMultiSelect = true;
  const statusTone = buildGridStatusTone(status);
  const visibleColumns = columns.filter(
    (column) => !hiddenColumns.has(column.name),
  );
  const gridTitle = kind === "members" ? "Members" : "Relationships";
  const rowNoun = kind === "members" ? "member" : "relationship";

  const gridTemplateColumns = useMemo(() => {
    const colWidths = visibleColumns.map((column) => {
      if (column.kind === "boolean") return "minmax(90px, 0.6fr)";
      if (column.kind === "number") return "minmax(110px, 0.7fr)";
      if (
        column.name === schema.memberKeyField ||
        column.name === "Parent" ||
        column.name === "Child"
      )
        return "minmax(200px, 1.5fr)";
      return "minmax(160px, 1fr)";
    });
    const selectWidth = supportsMultiSelect ? "72px" : "48px";
    return `${selectWidth} ${colWidths.join(" ")}`;
  }, [visibleColumns, schema.memberKeyField, supportsMultiSelect]);

  const gridMinWidth = useMemo(() => {
    return (supportsMultiSelect ? 72 : 48) + visibleColumns.length * 160;
  }, [visibleColumns.length, supportsMultiSelect]);
  const filteredRecords = useMemo(() => {
    const needle = search.toLowerCase();
    if (!needle) return records;
    return records.filter((record) => {
      const r = record as unknown as Record<string, unknown>;
      const searchable = [
        r.memberKey,
        r.description,
        r.parentKey,
        r.childKey,
        r.memberKey,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
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
    overscan: 12,
  });

  const loadPage = useCallback(
    async (nextOffset: number) => {
      setStatus("Loading rows...");
      if (kind === "members") {
        const [memberRes, relRes] = await Promise.all([
          fetchMembers(projectId, dimension.id, nextOffset, effectivePageSize),
          fetchRelationships(projectId, dimension.id, 0, 10000),
        ]);
        const relMap = new Map<string, string>();
        relRes.rows.forEach((rel: any) => {
          const childKey = rel.childKey || rel.Child || rel.childMemberKey;
          const parentKey = rel.parentKey || rel.Parent || rel.parentMemberKey;
          if (childKey && parentKey) {
            relMap.set(childKey, parentKey);
          }
        });
        const enrichedRows = memberRes.rows.map((row: any) => {
          const mKey = row.memberKey || row[schema.memberKeyField] || row.Member || row.Entity;
          return {
            ...row,
            Parent: row.Parent || relMap.get(mKey) || "",
          };
        });
        recordsRef.current = enrichedRows;
        confirmedRecordsRef.current = new Map(
          enrichedRows.map((r: any) => [r.id, r]),
        );
        setRecords(enrichedRows);
        setTotal(memberRes.total);
        setOffset(nextOffset);
        setStatus(`${enrichedRows.length} of ${memberRes.total} rows loaded`);
      } else {
        const result = await fetchRelationships(
          projectId,
          dimension.id,
          nextOffset,
          effectivePageSize,
        );
        recordsRef.current = result.rows;
        confirmedRecordsRef.current = new Map(
          result.rows.map((row) => [row.id, row]),
        );
        setRecords(result.rows);
        setTotal(result.total);
        setOffset(nextOffset);
        setStatus(`${result.rows.length} of ${result.total} rows loaded`);
      }
    },
    [dimension.id, effectivePageSize, kind, projectId, schema.memberKeyField],
  );

  const loadFilteredRecords = useCallback(
    async (ids: string[]) => {
      setStatus("Loading filtered rows...");
      const result =
        kind === "members"
          ? await fetchMembers(projectId, dimension.id, 0, 0, ids)
          : await fetchRelationships(projectId, dimension.id, 0, 0, ids);
      setRecords(result.rows);
      setTotal(result.total);
      setOffset(0);
      setStatus("");
    },
    [projectId, dimension.id, kind],
  );

  useEffect(() => {
    if (issueFilteredIds && issueFilteredIds.size > 0) {
      void loadFilteredRecords([...issueFilteredIds]);
    } else if (issueFilteredIds === null) {
      void loadPage(0);
    }
  }, [issueFilteredIds, loadFilteredRecords, loadPage, refreshSignal]);

  useEffect(() => {
    void loadPage(0);
  }, [loadPage]);

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => {
    if (selectedRow && selectedRow.id) {
      setRecords((current) =>
        current.map((r) => {
          if (r.id === selectedRow.id) {
            if (JSON.stringify(r) !== JSON.stringify(selectedRow)) {
              return selectedRow;
            }
          }
          return r;
        })
      );
    }
  }, [selectedRow]);

  useEffect(() => {
    const selectedRow = selectedId ? records.find((r) => r.id === selectedId) || null : null;
    onSelectRow?.(selectedRow);
  }, [selectedId, records, onSelectRow]);

  useEffect(() => {
    if (!highlightedEntityId) return;
    const index = filteredRecords.findIndex(
      (record) =>
        record.id === highlightedEntityId ||
        (kind === "members" &&
          (record as DimensionMemberRecord).memberKey === highlightedEntityId),
    );
    if (index >= 0) {
      const targetRecord = filteredRecords[index];
      virtualizer.scrollToIndex(index, { align: "center" });
      setSelectedId(targetRecord.id);
      setSelectedIds(new Set([targetRecord.id]));
    }
  }, [highlightedEntityId, filteredRecords, virtualizer, kind]);

  async function saveCell(
    record: GridRecord,
    field: FieldDefinition,
    value: string,
  ) {
    const sequence = saveSequenceRef.current + 1;
    saveSequenceRef.current = sequence;
    const rowSaveToken = (rowSaveTokensRef.current.get(record.id) ?? 0) + 1;
    rowSaveTokensRef.current.set(record.id, rowSaveToken);
    const previousRecord =
      recordsRef.current.find((candidate) => candidate.id === record.id) ??
      record;
    const optimisticRecord = buildOptimisticGridRecord(
      previousRecord,
      kind,
      schema.memberKeyField,
      field.name,
      value,
    );
    const replaceOptimisticRecord = (candidate: GridRecord) =>
      candidate.id === previousRecord.id ? optimisticRecord : candidate;
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
          await patchRelationship(projectId, relationship.id, {
            parentKey,
            childKey,
            properties,
          });
        }
        confirmedRecordsRef.current.set(previousRecord.id, optimisticRecord);
        if (sequence === saveSequenceRef.current) setStatus("Saved");
      } catch (caught) {
        const isLatestRowSave =
          rowSaveTokensRef.current.get(record.id) === rowSaveToken;
        const rollbackRecord =
          confirmedRecordsRef.current.get(previousRecord.id) ?? previousRecord;
        const rollbackOptimisticRecord = (candidate: GridRecord) =>
          isLatestRowSave &&
            candidate.id === previousRecord.id &&
            shouldRollbackGridRecord(candidate, optimisticRecord)
            ? rollbackRecord
            : candidate;
        recordsRef.current = recordsRef.current.map(rollbackOptimisticRecord);
        setRecords((current) => current.map(rollbackOptimisticRecord));
        if (sequence === saveSequenceRef.current)
          setStatus(caught instanceof Error ? caught.message : "Save failed");
      }
    };

    const previousQueue =
      rowSaveQueuesRef.current.get(previousRecord.id) ?? Promise.resolve();
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
      const existingKeys = new Set(
        recordsRef.current
          .map((r) =>
            "memberKey" in r ? (r as DimensionMemberRecord).memberKey : "",
          )
          .filter(Boolean),
      );
      let index = 1;
      while (existingKeys.has(`NewMember_${index}`)) {
        index += 1;
      }
      const defaultKey = `NewMember_${index}`;
      const properties = Object.fromEntries(
        columns.map((column) => [column.name, ""]),
      );
      if (schema.memberKeyField) {
        properties[schema.memberKeyField] = defaultKey;
      }
      const created = await createMember(projectId, dimension.id, {
        memberKey: defaultKey,
        properties,
      });
      recordsRef.current = [created, ...recordsRef.current];
      confirmedRecordsRef.current.set(created.id, created);
      setRecords((current) => [created, ...current]);
      setSelectedId(created.id);
      setSelectedIds(new Set([created.id]));
    } else {
      const properties = Object.fromEntries(
        columns.map((column) => [column.name, ""]),
      );
      const created = await createRelationship(projectId, dimension.id, {
        parentKey: "",
        childKey: "",
        properties,
      });
      recordsRef.current = [created, ...recordsRef.current];
      confirmedRecordsRef.current.set(created.id, created);
      setRecords((current) => [created, ...current]);
      setSelectedId(created.id);
      setSelectedIds(new Set([created.id]));
    }
    setTotal((current) => current + 1);
    onRefresh?.();
  }

  async function duplicateRow() {
    const source = recordsRef.current.find(
      (record) => record.id === selectedId,
    );
    if (!source) return;
    if (kind === "members") {
      const member = source as DimensionMemberRecord;
      const created = await createMember(projectId, dimension.id, {
        memberKey: `${member.memberKey}_Copy`,
        properties: {
          ...member.properties,
          [schema.memberKeyField]: `${member.memberKey}_Copy`,
        },
      });
      recordsRef.current = [created, ...recordsRef.current];
      confirmedRecordsRef.current.set(created.id, created);
      setRecords((current) => [created, ...current]);
      setSelectedId(created.id);
      setSelectedIds(new Set([created.id]));
    } else {
      const relationship = source as DimensionRelationshipRecord;
      const created = await createRelationship(projectId, dimension.id, {
        parentKey: relationship.parentKey,
        childKey: relationship.childKey,
        properties: relationship.properties,
      });
      recordsRef.current = [created, ...recordsRef.current];
      confirmedRecordsRef.current.set(created.id, created);
      setRecords((current) => [created, ...current]);
      setSelectedId(created.id);
      setSelectedIds(new Set([created.id]));
    }
    onRefresh?.();
  }

  function clearSelectionState() {
    setSelectedIds(new Set());
    setSelectedId(null);
    selectionAnchorIndexRef.current = null;
  }

  function toggleRowSelection(
    recordId: string,
    rowIndex: number,
    useRange: boolean,
    exclusive: boolean,
  ) {
    if (exclusive) {
      setSelectedIds(new Set([recordId]));
      setSelectedId(recordId);
      selectionAnchorIndexRef.current = rowIndex;
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);
      if (useRange && selectionAnchorIndexRef.current !== null) {
        const anchor = selectionAnchorIndexRef.current;
        const start = Math.min(anchor, rowIndex);
        const end = Math.max(anchor, rowIndex);
        for (let index = start; index <= end; index += 1) {
          const rec = filteredRecords[index];
          if (rec) next.add(rec.id);
        }
      } else if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }

      if (next.size === 0) {
        setSelectedId(null);
      } else if (!next.has(recordId)) {
        setSelectedId(Array.from(next).pop() ?? null);
      } else {
        setSelectedId(recordId);
      }

      return next;
    });
    selectionAnchorIndexRef.current = rowIndex;
  }

  function toggleSelectAllOnPage(checked: boolean) {
    if (!checked) {
      clearSelectionState();
      return;
    }
    const next = new Set(filteredRecords.map((record) => record.id));
    setSelectedIds(next);
    setSelectedId(filteredRecords[0]?.id ?? null);
    selectionAnchorIndexRef.current = 0;
  }

  const allOnPageSelected =
    filteredRecords.length > 0 &&
    filteredRecords.every((record) => selectedIds.has(record.id));

  async function deleteSelected() {
    const idsToDelete =
      selectedIds.size > 0 ? [...selectedIds] : selectedId ? [selectedId] : [];
    if (idsToDelete.length === 0) return;

    setStatus(
      idsToDelete.length > 1
        ? `Deleting ${idsToDelete.length} rows...`
        : "Deleting row...",
    );
    try {
      if (kind === "members") {
        if (idsToDelete.length === 1) {
          await deleteMember(projectId, idsToDelete[0]!);
        } else {
          const result = await bulkDeleteMembers(
            projectId,
            dimension.id,
            idsToDelete,
          );
          setStatus(
            `Deleted ${result.membersDeleted} members and ${result.relationshipsDeleted} relationships`,
          );
        }
      } else if (idsToDelete.length === 1) {
        await deleteRelationship(projectId, idsToDelete[0]!);
      } else {
        const result = await bulkDeleteRelationships(
          projectId,
          dimension.id,
          idsToDelete,
        );
        setStatus(`Deleted ${result.relationshipsDeleted} relationships`);
      }

      const deleteSet = new Set(idsToDelete);
      recordsRef.current = recordsRef.current.filter(
        (record) => !deleteSet.has(record.id),
      );
      for (const id of idsToDelete) {
        confirmedRecordsRef.current.delete(id);
        rowSaveQueuesRef.current.delete(id);
        rowSaveTokensRef.current.delete(id);
      }
      setRecords((current) =>
        current.filter((record) => !deleteSet.has(record.id)),
      );
      clearSelectionState();
      setTotal((current) => Math.max(0, current - idsToDelete.length));
      if (idsToDelete.length === 1) {
        setStatus("Deleted");
      }
      onRefresh?.();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Delete failed");
    }
  }

  function valueFor(record: GridRecord, column: FieldDefinition): string {
    if (kind === "relationships") {
      const relationship = record as DimensionRelationshipRecord;
      if (column.name === "Parent") return relationship.parentKey;
      if (column.name === "Child") return relationship.childKey;
    }
    if (kind === "members" && column.name === schema.memberKeyField)
      return (record as DimensionMemberRecord).memberKey;
    return String(record.properties[column.name] ?? "");
  }

  function columnTitle(column: FieldDefinition): string | undefined {
    const definition = getPropertyDefinitionByName(
      dimension.dimensionType,
      kind === "members" ? "member" : "relationship",
      column.name,
    );
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
            <input
              aria-label={`Search ${kind}`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${kind}`}
            />
          </div>
          <StatusBadge tone={statusTone}>
            {status || `${total} rows`}
          </StatusBadge>
        </div>
        <div
          className="grid-toolbar-actions grid-toolbar-tools"
          role="toolbar"
          aria-label={`${gridTitle} table actions`}
        >
          <span className="grid-selection-summary">{selectionSummary}</span>
          <IconButton
            className="grid-icon-button primary"
            aria-label={`Add ${rowNoun}`}
            title={`Add ${rowNoun}`}
            onClick={() => void addRow()}
          >
            <Plus size={15} />
          </IconButton>
          <IconButton
            className="grid-icon-button"
            aria-label="Duplicate selected row"
            disabled={!selectedId}
            title={actionTitles.duplicateTitle}
            onClick={() => void duplicateRow()}
          >
            <Copy size={15} />
          </IconButton>
          <IconButton
            className="grid-icon-button danger"
            aria-label="Delete selected rows"
            disabled={selectionCount === 0}
            title={actionTitles.deleteTitle}
            onClick={() => void deleteSelected()}
          >
            <Trash2 size={15} />
          </IconButton>
          <IconButton
            className="grid-icon-button"
            aria-label="Toggle columns"
            title="Toggle columns"
            aria-controls={columnMenuId}
            aria-expanded={showColumns}
            onClick={() => setShowColumns((current) => !current)}
          >
            <Columns3 size={15} />
          </IconButton>
        </div>
      </div>
      {showColumns && (
        <div
          id={columnMenuId}
          className="column-menu workbench-column-menu"
          aria-label="Column visibility"
        >
          <div className="grid-column-menu-title">
            <strong>Visible columns</strong>
            <span>
              {visibleColumns.length} of {columns.length}
            </span>
          </div>
          {columns.map((column) => (
            <label key={column.name}>
              <input
                type="checkbox"
                checked={!hiddenColumns.has(column.name)}
                onChange={() =>
                  setHiddenColumns((current) => {
                    const next = new Set(current);
                    if (next.has(column.name)) next.delete(column.name);
                    else next.add(column.name);
                    return next;
                  })
                }
              />
              <span>
                {column.name}
                {column.required ? " *" : ""}
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="data-grid workbench-data-grid" ref={parentRef}>
        <div
          className="grid-surface"
          style={{ minWidth: `${gridMinWidth}px`, width: "max-content" }}
        >
          <div
            className="grid-header"
            style={{ gridTemplateColumns, minWidth: `${gridMinWidth}px`, width: "100%" }}
          >
            <div className="grid-select-cell">
              <input
                type="checkbox"
                aria-label="Select all rows on this page"
                checked={allOnPageSelected}
                onChange={(event) =>
                  toggleSelectAllOnPage(event.currentTarget.checked)
                }
              />
            </div>
            {visibleColumns.map((column) => (
              <div key={column.name} title={columnTitle(column)}>
                {column.name}
                {column.required ? " *" : ""}
              </div>
            ))}
          </div>
          <div
            className="grid-body"
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              minWidth: `${gridMinWidth}px`,
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const record = filteredRecords[item.index];
              const rowIssues = issues.filter((i) => i.entityId === record.id);
              const rowTooltip =
                rowIssues.length > 0
                  ? rowIssues
                    .map(
                      (i) =>
                        `[${i.severity.toUpperCase()}] ${i.code}: ${i.message}`,
                    )
                    .join("\n")
                  : undefined;
              return (
                <div
                  key={record.id}
                  className={`grid-row ${selectedId === record.id ? "selected" : ""} ${selectedIds.has(record.id) ? "multi-selected" : ""} ${highlightedEntityId === record.id ? "highlighted" : ""} ${rowIssues.length > 0 ? "has-issues" : ""}`}
                  style={{
                    transform: `translateY(${item.start}px)`,
                    gridTemplateColumns,
                    minWidth: `${gridMinWidth}px`,
                    width: "100%",
                  }}
                  onClick={(event) => {
                    toggleRowSelection(
                      record.id,
                      item.index,
                      event.shiftKey,
                      !event.ctrlKey && !event.metaKey,
                    );
                  }}
                  title={rowTooltip}
                >
                  <span
                    className="grid-select-cell"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select row ${offset + item.index + 1}`}
                      checked={selectedIds.has(record.id)}
                      onChange={() =>
                        toggleRowSelection(record.id, item.index, false, false)
                      }
                    />
                  </span>
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
          <button
            disabled={offset === 0}
            onClick={() =>
              void loadPage(Math.max(0, offset - effectivePageSize))
            }
          >
            Previous
          </button>
          <span>
            Rows {total === 0 ? 0 : offset + 1}-
            {Math.min(offset + records.length, total)} of {total}
          </span>
          <button
            disabled={offset + records.length >= total}
            onClick={() => void loadPage(offset + effectivePageSize)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function GridCell({
  column,
  value,
  onSave,
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
        className="grid-cell-input"
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
      className="grid-cell-input"
      type={column.kind === "number" ? "number" : "text"}
      aria-label={column.name}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={(event) => commit(event.currentTarget.value)}
    />
  );
}
