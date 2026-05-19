import { Download, GitCompare, PlayCircle, PlusCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { MetadataDiffItemRecord, MetadataDiffRunRecord, ProjectBaselineRecord } from "../../shared/types";
import {
  createProjectBaseline,
  fetchMetadataDiffItems,
  fetchProjectBaselines,
  runProjectDiff
} from "../api/client";
import { ActionButton, FactItem, FactStrip, Panel, StatusBadge } from "./ui";

export function MetadataDiffPanel({
  projectId,
  hasBlockingIssues = false
}: {
  projectId: string;
  hasBlockingIssues?: boolean;
}) {
  const [baselines, setBaselines] = useState<ProjectBaselineRecord[]>([]);
  const [selectedBaselineId, setSelectedBaselineId] = useState("");
  const [baselineName, setBaselineName] = useState("Release baseline");
  const [run, setRun] = useState<MetadataDiffRunRecord | null>(null);
  const [items, setItems] = useState<MetadataDiffItemRecord[]>([]);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const loaded = await fetchProjectBaselines(projectId);
        if (cancelled) return;
        setBaselines(loaded);
        setSelectedBaselineId((current) => current || loaded[0]?.id || "");
        setStatus(loaded.length ? `${loaded.length} baseline${loaded.length === 1 ? "" : "s"}` : "No baselines yet");
      } catch (caught) {
        if (!cancelled) setStatus(caught instanceof Error ? caught.message : "Failed to load baselines");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const filteredItems = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => [
      item.dimensionType,
      item.dimensionName,
      item.targetType,
      item.changeType,
      item.severity,
      item.objectKey,
      item.parentKey,
      item.childKey,
      item.propertyName,
      item.oldValue,
      item.newValue
    ].some((value) => String(value).toLowerCase().includes(needle)));
  }, [filter, items]);

  async function createSnapshotBaseline() {
    setStatus("Creating baseline...");
    const baseline = await createProjectBaseline(projectId, {
      name: baselineName.trim() || "Release baseline",
      sourceType: "snapshot"
    });
    setBaselines((current) => [baseline, ...current.filter((item) => item.id !== baseline.id)]);
    setSelectedBaselineId(baseline.id);
    setStatus("Baseline created");
  }

  async function runComparison() {
    if (!selectedBaselineId) return;
    setStatus("Running comparison...");
    const diffRun = await runProjectDiff(projectId, { baselineId: selectedBaselineId });
    const diffItems = await fetchMetadataDiffItems(projectId, diffRun.id);
    setRun(diffRun);
    setItems(diffItems);
    setStatus(`${diffItems.length} diff ${diffItems.length === 1 ? "item" : "items"}`);
  }

  function downloadCsv() {
    const csv = toDiffCsv(filteredItems);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "metadata-diff.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel className="metadata-diff-panel">
      <div className="diff-toolbar">
        <div className="grid-toolbar-title">
          <strong>Compare Metadata</strong>
          <span>Baseline snapshots and structured change review</span>
        </div>
        <StatusBadge tone={status.toLowerCase().includes("failed") ? "danger" : "neutral"}>{status}</StatusBadge>
      </div>

      {hasBlockingIssues && (
        <div className="diff-warning">
          Current validation has blocking issues. Diff is still available for review.
        </div>
      )}

      <div className="diff-controls">
        <label>
          <span>Baseline name</span>
          <input value={baselineName} onChange={(event) => setBaselineName(event.currentTarget.value)} />
        </label>
        <div className="diff-control-actions">
          <ActionButton variant="primary" onClick={() => void createSnapshotBaseline()}>
            <PlusCircle size={15} /> Create baseline
          </ActionButton>
        </div>
        <label>
          <span>Baseline</span>
          <select value={selectedBaselineId} onChange={(event) => setSelectedBaselineId(event.currentTarget.value)}>
            <option value="">Select baseline</option>
            {baselines.map((baseline) => (
              <option key={baseline.id} value={baseline.id}>{baseline.name}</option>
            ))}
          </select>
        </label>
        <div className="diff-control-actions">
          <ActionButton disabled={!selectedBaselineId} onClick={() => void runComparison()}>
            <PlayCircle size={15} /> Run comparison
          </ActionButton>
        </div>
      </div>

      <FactStrip className="diff-summary">
        <FactItem label="Member adds" value={run?.summary.members.adds ?? 0} />
        <FactItem label="Member deletes" value={run?.summary.members.deletes ?? 0} tone={(run?.summary.members.deletes ?? 0) ? "warning" : "neutral"} />
        <FactItem label="Relationship moves" value={run?.summary.relationships.moves ?? 0} tone={(run?.summary.relationships.moves ?? 0) ? "warning" : "neutral"} />
        <FactItem label="Relationship copies" value={run?.summary.relationships.copies ?? 0} />
        <FactItem label="Property updates" value={run?.summary.properties.updates ?? 0} />
        <FactItem label="Warnings" value={run?.summary.warnings ?? 0} tone={(run?.summary.warnings ?? 0) ? "warning" : "neutral"} />
      </FactStrip>

      <div className="diff-filter-row">
        <div className="search-box">
          <GitCompare size={14} />
          <input value={filter} onChange={(event) => setFilter(event.currentTarget.value)} placeholder="Filter diff items" aria-label="Filter diff items" />
        </div>
        <ActionButton disabled={filteredItems.length === 0} onClick={downloadCsv}>
          <Download size={15} /> CSV
        </ActionButton>
      </div>

      <div className="diff-table" role="table" aria-label="Metadata diff items">
        <div className="diff-row header" role="row">
          <span>Change</span>
          <span>Object</span>
          <span>Property</span>
          <span>Old</span>
          <span>New</span>
          <span>Severity</span>
        </div>
        {filteredItems.map((item) => (
          <div key={item.id} className="diff-row" role="row">
            <span>{item.changeType}</span>
            <span>{item.objectKey}</span>
            <span>{item.propertyName || item.targetType}</span>
            <span>{item.oldValue}</span>
            <span>{item.newValue}</span>
            <span><StatusBadge tone={item.severity === "error" ? "danger" : item.severity === "warning" ? "warning" : "info"}>{item.severity}</StatusBadge></span>
          </div>
        ))}
        {filteredItems.length === 0 && <div className="diff-empty">Create a baseline and run comparison to review changes.</div>}
      </div>
    </Panel>
  );
}

function toDiffCsv(items: MetadataDiffItemRecord[]): string {
  const headers = ["dimensionType", "dimensionName", "targetType", "changeType", "severity", "objectKey", "propertyName", "oldValue", "newValue"];
  const rows = items.map((item) => headers.map((header) => quoteCsv(String(item[header as keyof MetadataDiffItemRecord] ?? ""))).join(","));
  return [headers.join(","), ...rows].join("\n");
}

function quoteCsv(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replace(/"/g, "\"\"")}"`;
}
