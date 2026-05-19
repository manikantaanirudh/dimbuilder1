import { CheckCircle2, FileArchive, PackageOpen, PlayCircle, PlusCircle, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChangeSetDetail, ChangeSetRecord, ReleasePackageMode } from "../../shared/types";
import {
  approveChangeSet,
  createChangeSet,
  fetchChangeSet,
  fetchChangeSets,
  packageChangeSet,
  rejectChangeSet,
  validateChangeSet
} from "../api/client";
import { ActionButton, FactItem, FactStrip, Panel, StatusBadge } from "./ui";

export function ChangeSetsPanel({
  projectId,
  hasBlockingIssues = false
}: {
  projectId: string;
  hasBlockingIssues?: boolean;
}) {
  const [changeSets, setChangeSets] = useState<ChangeSetRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<ChangeSetDetail | null>(null);
  const [name, setName] = useState("Release change set");
  const [targetEnvironment, setTargetEnvironment] = useState("Production");
  const [comment, setComment] = useState("");
  const [mode, setMode] = useState<ReleasePackageMode>("full");
  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const loaded = await fetchChangeSets(projectId);
        if (cancelled) return;
        setChangeSets(loaded);
        const firstId = loaded[0]?.id ?? "";
        setSelectedId((current) => current || firstId);
        setStatus(loaded.length ? `${loaded.length} change set${loaded.length === 1 ? "" : "s"}` : "No change sets yet");
      } catch (caught) {
        if (!cancelled) setStatus(caught instanceof Error ? caught.message : "Failed to load change sets");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    async function loadDetail() {
      if (!selectedId) {
        setDetail(null);
        return;
      }
      try {
        const loaded = await fetchChangeSet(projectId, selectedId);
        if (!cancelled) setDetail(loaded);
      } catch (caught) {
        if (!cancelled) setStatus(caught instanceof Error ? caught.message : "Failed to load change set");
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedId]);

  const summary = useMemo(() => {
    const items = detail?.items ?? [];
    return {
      total: items.length,
      warnings: items.filter((item) => item.severity === "warning").length,
      errors: items.filter((item) => item.severity === "error").length,
      adds: items.filter((item) => item.changeType === "add").length,
      updates: items.filter((item) => item.changeType === "update").length,
      deletes: items.filter((item) => item.changeType === "delete").length
    };
  }, [detail]);

  async function refresh(nextId = selectedId) {
    const loaded = await fetchChangeSets(projectId);
    setChangeSets(loaded);
    if (nextId) {
      setSelectedId(nextId);
      setDetail(await fetchChangeSet(projectId, nextId));
    }
  }

  async function createFromLatestDiff() {
    setStatus("Creating change set...");
    const created = await createChangeSet(projectId, {
      name: name.trim() || "Release change set",
      targetEnvironment: targetEnvironment.trim()
    });
    setDetail(created);
    await refresh(created.changeSet.id);
    setStatus("Change set created");
  }

  async function validateSelected() {
    if (!selectedId) return;
    setStatus("Validating...");
    const result = await validateChangeSet(projectId, selectedId);
    setDetail(result);
    await refresh(selectedId);
    setStatus("Validation complete");
  }

  async function approveSelected() {
    if (!selectedId) return;
    setStatus("Approving...");
    const result = await approveChangeSet(projectId, selectedId, { comment });
    setDetail(result);
    await refresh(selectedId);
    setStatus("Approved");
  }

  async function rejectSelected() {
    if (!selectedId) return;
    setStatus("Rejecting...");
    const result = await rejectChangeSet(projectId, selectedId, { comment });
    setDetail(result);
    await refresh(selectedId);
    setStatus("Rejected");
  }

  async function packageSelected() {
    if (!selectedId) return;
    setStatus("Packaging...");
    const result = await packageChangeSet(projectId, selectedId, { mode });
    setDetail(result);
    await refresh(selectedId);
    setStatus("Package created");
  }

  return (
    <Panel className="change-sets-panel">
      <div className="change-set-toolbar">
        <div className="grid-toolbar-title">
          <strong>Change Sets</strong>
          <span>Validate, approve, and package reviewed metadata changes</span>
        </div>
        <StatusBadge tone={status.toLowerCase().includes("failed") ? "danger" : "neutral"}>{status}</StatusBadge>
      </div>

      {hasBlockingIssues && (
        <div className="diff-warning">
          Current validation has blocking issues. Approval will require a recorded bypass until they are resolved.
        </div>
      )}

      <div className="change-set-controls">
        <label>
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.currentTarget.value)} />
        </label>
        <label>
          <span>Target environment</span>
          <input value={targetEnvironment} onChange={(event) => setTargetEnvironment(event.currentTarget.value)} />
        </label>
        <label>
          <span>Change set</span>
          <select value={selectedId} onChange={(event) => setSelectedId(event.currentTarget.value)}>
            <option value="">Select change set</option>
            {changeSets.map((changeSet) => (
              <option key={changeSet.id} value={changeSet.id}>{changeSet.name}</option>
            ))}
          </select>
        </label>
        <div className="change-set-action-cell">
          <ActionButton variant="primary" onClick={() => void createFromLatestDiff()}>
            <PlusCircle size={15} /> Create from latest diff
          </ActionButton>
        </div>
      </div>

      <FactStrip className="change-set-summary">
        <FactItem label="Items" value={summary.total} />
        <FactItem label="Adds" value={summary.adds} />
        <FactItem label="Updates" value={summary.updates} />
        <FactItem label="Deletes" value={summary.deletes} tone={summary.deletes ? "warning" : "neutral"} />
        <FactItem label="Warnings" value={summary.warnings} tone={summary.warnings ? "warning" : "neutral"} />
        <FactItem label="Errors" value={summary.errors} tone={summary.errors ? "danger" : "neutral"} />
      </FactStrip>

      <div className="change-set-lifecycle">
        <label>
          <span>Comment</span>
          <input value={comment} onChange={(event) => setComment(event.currentTarget.value)} />
        </label>
        <label>
          <span>Package mode</span>
          <select value={mode} onChange={(event) => setMode(event.currentTarget.value as ReleasePackageMode)}>
            <option value="full">Full</option>
            <option value="additive">Additive</option>
            <option value="propertyUpdate">Property update</option>
            <option value="relationshipDelete">Relationship delete</option>
            <option value="breakBuild">Break/build</option>
          </select>
        </label>
        <ActionButton disabled={!selectedId} onClick={() => void validateSelected()}><PlayCircle size={15} /> Validate</ActionButton>
        <ActionButton disabled={!selectedId} onClick={() => void approveSelected()}><CheckCircle2 size={15} /> Approve</ActionButton>
        <ActionButton disabled={!selectedId} variant="danger" onClick={() => void rejectSelected()}><XCircle size={15} /> Reject</ActionButton>
        <ActionButton disabled={!selectedId} onClick={() => void packageSelected()}><PackageOpen size={15} /> Package</ActionButton>
      </div>

      <div className="change-set-table" role="table" aria-label="Change set items">
        <div className="change-set-row header" role="row">
          <span>Change</span>
          <span>Type</span>
          <span>Object</span>
          <span>Property</span>
          <span>Severity</span>
        </div>
        {(detail?.items ?? []).map((item) => (
          <div key={item.id} className="change-set-row" role="row">
            <span>{item.changeType}</span>
            <span>{item.itemType}</span>
            <span>{item.objectKey}</span>
            <span>{item.propertyName || "-"}</span>
            <span><StatusBadge tone={item.severity === "error" ? "danger" : item.severity === "warning" ? "warning" : "info"}>{item.severity}</StatusBadge></span>
          </div>
        ))}
        {!detail?.items.length && (
          <div className="change-set-empty">
            <FileArchive size={16} /> Create a change set from the latest diff run to start release packaging.
          </div>
        )}
      </div>
    </Panel>
  );
}
