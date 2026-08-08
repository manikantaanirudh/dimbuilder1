import { Download, GitBranch, GitCompare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DimensionRecord, ProjectVersionRecord } from "../../shared/types";
import { fetchProjectVersions } from "../api/client";
import { ActionButton, EmptyState, FactItem, FactStrip, Panel, StatusBadge } from "./ui";

export interface VersionDiffItem {
  id: string;
  dimensionType: string;
  dimensionName: string;
  targetType: "member" | "relationship" | "property";
  changeType: "Member Added" | "Member Deleted" | "Property Modified" | "Status Changed" | "Relationship Added" | "Relationship Deleted";
  severity: "info" | "warning" | "danger" | "success";
  objectKey: string;
  propertyName?: string;
  oldValue?: string;
  newValue?: string;
}

export function MetadataDiffPanel({
  projectId,
  dimension,
  hasBlockingIssues = false
}: {
  projectId: string;
  dimension?: DimensionRecord;
  hasBlockingIssues?: boolean;
}) {
  const [versions, setVersions] = useState<ProjectVersionRecord[]>([]);
  const [baseVerNum, setBaseVerNum] = useState<number | "">(1);
  const [compareVerNum, setCompareVerNum] = useState<number | "">(2);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const loaded = await fetchProjectVersions(projectId);
        if (cancelled) return;
        setVersions(loaded);

        if (loaded.length >= 2) {
          const sorted = [...loaded].sort((a, b) => a.versionNumber - b.versionNumber);
          setBaseVerNum(sorted[0].versionNumber);
          setCompareVerNum(sorted[sorted.length - 1].versionNumber);
        } else if (loaded.length === 1) {
          setBaseVerNum(loaded[0].versionNumber);
          setCompareVerNum("");
        }
      } catch (err) {
        console.error("Failed to load project versions:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const baseVersion = useMemo(() => {
    return versions.find((v) => v.versionNumber === Number(baseVerNum)) || null;
  }, [versions, baseVerNum]);

  const compareVersion = useMemo(() => {
    return versions.find((v) => v.versionNumber === Number(compareVerNum)) || null;
  }, [versions, compareVerNum]);

  const diffItems = useMemo(() => {
    if (!baseVersion || !compareVersion || baseVersion.versionNumber === compareVersion.versionNumber) {
      return [];
    }
    return computeVersionDiff(baseVersion, compareVersion, dimension);
  }, [baseVersion, compareVersion, dimension]);

  const filteredItems = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return diffItems;
    return diffItems.filter((item) =>
      [
        item.dimensionType,
        item.dimensionName,
        item.changeType,
        item.objectKey,
        item.propertyName,
        item.oldValue,
        item.newValue
      ].some((val) => String(val ?? "").toLowerCase().includes(needle))
    );
  }, [filter, diffItems]);

  const summary = useMemo(() => {
    const memberAdds = diffItems.filter((i) => i.changeType === "Member Added").length;
    const memberDeletes = diffItems.filter((i) => i.changeType === "Member Deleted").length;
    const propUpdates = diffItems.filter((i) => i.changeType === "Property Modified" || i.changeType === "Status Changed").length;
    const relChanges = diffItems.filter((i) => i.changeType.startsWith("Relationship")).length;
    return { memberAdds, memberDeletes, propUpdates, relChanges, total: diffItems.length };
  }, [diffItems]);

  function downloadCsv() {
    const csv = toVersionDiffCsv(filteredItems, baseVersion?.versionLabel || "Base", compareVersion?.versionLabel || "Compare");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `version-diff-${baseVersion?.versionLabel ?? "v1"}-vs-${compareVersion?.versionLabel ?? "v2"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!loading && versions.length < 2) {
    return (
      <Panel className="metadata-diff-panel" style={{ padding: 24 }}>
        <EmptyState title="Version Comparison Requires 2+ Versions">
          <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "var(--color-text-muted, #475569)" }}>
            Version comparison allows you to inspect metadata changes across different seeded versions of your project. Currently, this project has only {versions.length} version recorded ({versions[0]?.versionLabel ?? "v1"}).
          </p>
          <div style={{ padding: "12px 16px", background: "var(--color-bg-subtle, #f8fafc)", borderRadius: 6, border: "1px solid var(--color-border, #e2e8f0)", fontSize: "13px", textAlign: "left" }}>
            <div style={{ fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
              <GitBranch size={14} /> How to create Version 2:
            </div>
            <span>Click <strong>Import</strong> in the top toolbar ➔ select <strong>Seed from file</strong> or <strong>Import XML</strong> ➔ set Target to <strong>Existing project</strong> and re-seed this project.</span>
          </div>
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel className="metadata-diff-panel">
      <div className="diff-toolbar">
        <div className="grid-toolbar-title">
          <strong>Compare Versions</strong>
          <span>
            {dimension
              ? `Comparing metadata for dimension "${dimension.dimensionName || dimension.dimensionType}"`
              : "Comparing metadata across project versions"}
          </span>
        </div>
        <StatusBadge tone="info">
          {versions.length} Version{versions.length === 1 ? "" : "s"} Recorded
        </StatusBadge>
      </div>

      {hasBlockingIssues && (
        <div className="diff-warning" style={{ background: "#fffbeb", border: "1px solid #fef3c7", padding: "8px 12px", borderRadius: 6, color: "#b45309", fontSize: "12px", marginBottom: 12 }}>
          Current project has validation issues. Diff is generated based on recorded version snapshots.
        </div>
      )}

      {/* VERSION SELECTORS */}
      <div className="diff-controls" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: "12px", fontWeight: 600, opacity: 0.8 }}>Base Version (Source)</span>
          <select
            value={baseVerNum}
            onChange={(e) => setBaseVerNum(Number(e.target.value))}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-border, #cbd5e1)" }}
          >
            {versions.map((ver) => (
              <option key={ver.id} value={ver.versionNumber}>
                {ver.versionLabel} — {ver.sourceFileName || "Seeded"} ({new Date(ver.seededAt).toLocaleString()})
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: "12px", fontWeight: 600, opacity: 0.8 }}>Target Version (Compare)</span>
          <select
            value={compareVerNum}
            onChange={(e) => setCompareVerNum(Number(e.target.value))}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-border, #cbd5e1)" }}
          >
            {versions.map((ver) => (
              <option key={ver.id} value={ver.versionNumber}>
                {ver.versionLabel} — {ver.sourceFileName || "Seeded"} ({new Date(ver.seededAt).toLocaleString()})
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* SUMMARY STATS */}
      <FactStrip className="diff-summary">
        <FactItem label="Added Members" value={summary.memberAdds} tone={summary.memberAdds ? "success" : "neutral"} />
        <FactItem label="Deleted Members" value={summary.memberDeletes} tone={summary.memberDeletes ? "danger" : "neutral"} />
        <FactItem label="Property Modifications" value={summary.propUpdates} tone={summary.propUpdates ? "warning" : "neutral"} />
        <FactItem label="Hierarchy Changes" value={summary.relChanges} tone={summary.relChanges ? "info" : "neutral"} />
        <FactItem label="Total Changes" value={summary.total} />
      </FactStrip>

      {/* SEARCH AND DOWNLOAD */}
      <div className="diff-filter-row" style={{ display: "flex", justifyContent: "space-between", margin: "16px 0 12px 0", gap: 12 }}>
        <div className="search-box" style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--color-bg-subtle, #f8fafc)", border: "1px solid var(--color-border, #e2e8f0)", borderRadius: 6 }}>
          <GitCompare size={14} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value)}
            placeholder="Search diff items by member, property, or value..."
            style={{ border: "none", background: "transparent", width: "100%", outline: "none", fontSize: "13px" }}
          />
        </div>
        <ActionButton disabled={filteredItems.length === 0} onClick={downloadCsv}>
          <Download size={15} /> Export CSV
        </ActionButton>
      </div>

      {/* DIFF TABLE */}
      <div className="diff-table" role="table" aria-label="Version diff items">
        <div className="diff-row header" role="row" style={{ display: "grid", gridTemplateColumns: "1.2fr 1.5fr 1.2fr 2fr 2fr 1fr", gap: 8, padding: "8px 12px", background: "var(--color-bg-subtle, #f1f5f9)", fontWeight: 600, fontSize: "12px", borderRadius: "6px 6px 0 0" }}>
          <span>Change Type</span>
          <span>Member / Object</span>
          <span>Property</span>
          <span>{baseVersion ? baseVersion.versionLabel : "Base Version"}</span>
          <span>{compareVersion ? compareVersion.versionLabel : "Compare Version"}</span>
          <span>Status</span>
        </div>
        {filteredItems.map((item) => (
          <div key={item.id} className="diff-row" role="row" style={{ display: "grid", gridTemplateColumns: "1.2fr 1.5fr 1.2fr 2fr 2fr 1fr", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--color-border-subtle, #f1f5f9)", fontSize: "13px", alignItems: "center" }}>
            <span style={{ fontWeight: 500 }}>{item.changeType}</span>
            <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{item.objectKey}</span>
            <span>{item.propertyName || "—"}</span>
            <span style={{ color: item.changeType === "Member Deleted" ? "var(--color-danger, #ef4444)" : "inherit" }}>{item.oldValue || "—"}</span>
            <span style={{ color: item.changeType === "Member Added" ? "var(--color-success, #10b981)" : "inherit" }}>{item.newValue || "—"}</span>
            <span>
              <StatusBadge tone={item.severity}>{item.changeType}</StatusBadge>
            </span>
          </div>
        ))}
        {filteredItems.length === 0 && (
          <div className="diff-empty" style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted, #64748b)", fontSize: "13px" }}>
            {baseVerNum === compareVerNum
              ? "Base version and compare version are identical. Select different versions above."
              : "No metadata differences found between these two versions for this dimension."}
          </div>
        )}
      </div>
    </Panel>
  );
}

function getRelParentKey(r: any): string {
  return String(r.parentKey || r.parentMemberKey || r.parent || "").trim();
}

function getRelChildKey(r: any): string {
  return String(r.childKey || r.childMemberKey || r.child || "").trim();
}

function computeVersionDiff(
  versionA: ProjectVersionRecord,
  versionB: ProjectVersionRecord,
  currentDimension?: DimensionRecord
): VersionDiffItem[] {
  const snapA = (versionA.snapshot || {}) as { dimensions?: DimensionRecord[]; members?: any[]; relationships?: any[] };
  const snapB = (versionB.snapshot || {}) as { dimensions?: DimensionRecord[]; members?: any[]; relationships?: any[] };

  const dimsA = snapA.dimensions || [];
  const dimsB = snapB.dimensions || [];
  const memsA = snapA.members || [];
  const memsB = snapB.members || [];
  const relsA = snapA.relationships || [];
  const relsB = snapB.relationships || [];

  let targetDimsB: DimensionRecord[] = [];
  if (currentDimension) {
    const match = dimsB.find(
      (d) =>
        (currentDimension.dimensionName && d.dimensionName === currentDimension.dimensionName) ||
        d.id === currentDimension.id ||
        (d.dimensionType === currentDimension.dimensionType && d.dimensionName === currentDimension.dimensionName)
    );
    targetDimsB = match ? [match] : dimsB.filter((d) => d.dimensionType === currentDimension.dimensionType);
  } else {
    targetDimsB = dimsB;
  }

  const diffItems: VersionDiffItem[] = [];

  for (const dimB of targetDimsB) {
    const dimA = dimsA.find(
      (d) =>
        (dimB.dimensionName && d.dimensionName === dimB.dimensionName) ||
        d.dimensionType === dimB.dimensionType
    );

    let dimMemsA = dimA ? memsA.filter((m) => m.dimensionId === dimA.id) : [];
    let dimMemsB = memsB.filter((m) => m.dimensionId === dimB.id);

    if (dimA && dimMemsA.length === 0 && memsA.length > 0) {
      const idxA = dimsA.indexOf(dimA);
      const uniqueDimIdsA = Array.from(new Set(memsA.map((m) => m.dimensionId)));
      if (idxA >= 0 && idxA < uniqueDimIdsA.length) {
        dimMemsA = memsA.filter((m) => m.dimensionId === uniqueDimIdsA[idxA]);
      }
    }
    if (dimMemsB.length === 0 && memsB.length > 0) {
      const idxB = dimsB.indexOf(dimB);
      const uniqueDimIdsB = Array.from(new Set(memsB.map((m) => m.dimensionId)));
      if (idxB >= 0 && idxB < uniqueDimIdsB.length) {
        dimMemsB = memsB.filter((m) => m.dimensionId === uniqueDimIdsB[idxB]);
      }
    }

    let dimRelsA = dimA ? relsA.filter((r) => r.dimensionId === dimA.id) : [];
    let dimRelsB = relsB.filter((r) => r.dimensionId === dimB.id);

    if (dimA && dimRelsA.length === 0 && relsA.length > 0) {
      const idxA = dimsA.indexOf(dimA);
      const uniqueDimIdsA = Array.from(new Set(relsA.map((r) => r.dimensionId)));
      if (idxA >= 0 && idxA < uniqueDimIdsA.length) {
        dimRelsA = relsA.filter((r) => r.dimensionId === uniqueDimIdsA[idxA]);
      }
    }
    if (dimRelsB.length === 0 && relsB.length > 0) {
      const idxB = dimsB.indexOf(dimB);
      const uniqueDimIdsB = Array.from(new Set(relsB.map((r) => r.dimensionId)));
      if (idxB >= 0 && idxB < uniqueDimIdsB.length) {
        dimRelsB = relsB.filter((r) => r.dimensionId === uniqueDimIdsB[idxB]);
      }
    }

    const mapA = new Map(dimMemsA.map((m) => [m.memberKey, m]));
    const mapB = new Map(dimMemsB.map((m) => [m.memberKey, m]));

    for (const [key, mB] of mapB.entries()) {
      if (!mapA.has(key)) {
        diffItems.push({
          id: `add-mem-${dimB.id}-${key}`,
          dimensionType: dimB.dimensionType,
          dimensionName: dimB.dimensionName,
          targetType: "member",
          changeType: "Member Added",
          severity: "success",
          objectKey: key,
          propertyName: "Member",
          oldValue: "—",
          newValue: mB.description ? `${key} (${mB.description})` : key
        });
      } else {
        const mA = mapA.get(key)!;
        if (mA.description !== mB.description && (mA.description || mB.description)) {
          diffItems.push({
            id: `mod-desc-${dimB.id}-${key}`,
            dimensionType: dimB.dimensionType,
            dimensionName: dimB.dimensionName,
            targetType: "property",
            changeType: "Property Modified",
            severity: "info",
            objectKey: key,
            propertyName: "Description",
            oldValue: mA.description || "—",
            newValue: mB.description || "—"
          });
        }
        if (mA.memberType !== mB.memberType && (mA.memberType || mB.memberType)) {
          diffItems.push({
            id: `mod-type-${dimB.id}-${key}`,
            dimensionType: dimB.dimensionType,
            dimensionName: dimB.dimensionName,
            targetType: "property",
            changeType: "Property Modified",
            severity: "info",
            objectKey: key,
            propertyName: "Member Type",
            oldValue: mA.memberType || "—",
            newValue: mB.memberType || "—"
          });
        }
      }
    }

    for (const [key, mA] of mapA.entries()) {
      if (!mapB.has(key)) {
        diffItems.push({
          id: `del-mem-${dimB.id}-${key}`,
          dimensionType: dimB.dimensionType,
          dimensionName: dimB.dimensionName,
          targetType: "member",
          changeType: "Member Deleted",
          severity: "danger",
          objectKey: key,
          propertyName: "Member",
          oldValue: mA.description ? `${key} (${mA.description})` : key,
          newValue: "—"
        });
      }
    }

    const relMapA = new Map(dimRelsA.map((r) => [`${getRelParentKey(r)}::${getRelChildKey(r)}`, r]));
    const relMapB = new Map(dimRelsB.map((r) => [`${getRelParentKey(r)}::${getRelChildKey(r)}`, r]));

    for (const [pairKey, rB] of relMapB.entries()) {
      if (!relMapA.has(pairKey)) {
        const parent = getRelParentKey(rB);
        const child = getRelChildKey(rB);
        diffItems.push({
          id: `add-rel-${dimB.id}-${pairKey}`,
          dimensionType: dimB.dimensionType,
          dimensionName: dimB.dimensionName,
          targetType: "relationship",
          changeType: "Relationship Added",
          severity: "success",
          objectKey: `${parent} ➔ ${child}`,
          propertyName: "Hierarchy Link",
          oldValue: "—",
          newValue: `${parent} ➔ ${child}`
        });
      }
    }

    for (const [pairKey, rA] of relMapA.entries()) {
      if (!relMapB.has(pairKey)) {
        const parent = getRelParentKey(rA);
        const child = getRelChildKey(rA);
        diffItems.push({
          id: `del-rel-${dimB.id}-${pairKey}`,
          dimensionType: dimB.dimensionType,
          dimensionName: dimB.dimensionName,
          targetType: "relationship",
          changeType: "Relationship Deleted",
          severity: "danger",
          objectKey: `${parent} ➔ ${child}`,
          propertyName: "Hierarchy Link",
          oldValue: `${parent} ➔ ${child}`,
          newValue: "—"
        });
      }
    }
  }

  return diffItems;
}

function toVersionDiffCsv(items: VersionDiffItem[], baseLabel: string, compareLabel: string): string {
  const headers = ["dimensionType", "dimensionName", "changeType", "objectKey", "propertyName", "oldValue", "newValue"];
  const headerRow = ["Dimension Type", "Dimension Name", "Change Type", "Object / Member", "Property", `Base (${baseLabel})`, `Compare (${compareLabel})`].map(quoteCsv).join(",");
  const rows = items.map((item) =>
    headers.map((h) => quoteCsv(String((item as any)[h] ?? ""))).join(",")
  );
  return [headerRow, ...rows].join("\n");
}

function quoteCsv(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
