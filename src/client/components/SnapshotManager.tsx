import { GitBranch, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ProjectRecord, ProjectSnapshotSummaryRecord } from "../../shared/types";
import {
  branchProjectSnapshot,
  fetchProjectSnapshots,
  restoreProjectSnapshot
} from "../api/client";
import { ActionButton, EmptyState, StatusBadge } from "./ui";

export function SnapshotManager({
  project,
  onProjectChanged
}: {
  project: ProjectRecord;
  onProjectChanged?: (projectId: string) => void;
}) {
  const [snapshots, setSnapshots] = useState<ProjectSnapshotSummaryRecord[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [branchName, setBranchName] = useState(`${project.name} branch`);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? snapshots[0] ?? null,
    [selectedSnapshotId, snapshots]
  );

  async function loadSnapshots() {
    setLoading(true);
    try {
      const rows = await fetchProjectSnapshots(project.id);
      setSnapshots(rows);
      setSelectedSnapshotId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? "");
      setStatus(rows.length ? `${rows.length} snapshot${rows.length === 1 ? "" : "s"} available` : "No snapshots yet");
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Failed to load snapshots");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setBranchName(`${project.name} branch`);
    void loadSnapshots();
  }, [project.id]);

  async function restoreSelectedSnapshot() {
    if (!selectedSnapshot) return;
    const confirmed = window.confirm("Restore replaces current metadata. A safety snapshot will be created first.");
    if (!confirmed) return;
    setStatus("Restoring snapshot...");
    const summary = await restoreProjectSnapshot(project.id, selectedSnapshot.id);
    setStatus(`Restored ${summary.membersRestored} members and ${summary.relationshipsRestored} relationships`);
    onProjectChanged?.(project.id);
    await loadSnapshots();
  }

  async function createBranch() {
    if (!selectedSnapshot) return;
    const result = await branchProjectSnapshot(project.id, selectedSnapshot.id, {
      name: branchName.trim() || `${project.name} branch`
    });
    setStatus(`Created branch ${result.project.name}`);
    onProjectChanged?.(result.project.id);
  }

  return (
    <section className="snapshot-manager" aria-label="Project snapshots">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Rollback and branch</span>
          <h2>Snapshots</h2>
        </div>
        <StatusBadge tone={snapshots.length ? "info" : "neutral"}>{loading ? "Loading" : snapshots.length}</StatusBadge>
      </div>

      <p className="snapshot-warning">Restore replaces current metadata. A safety snapshot is created before restore.</p>

      {snapshots.length ? (
        <div className="snapshot-controls">
          <label>
            <span>Snapshot</span>
            <select
              value={selectedSnapshot?.id ?? ""}
              onChange={(event) => setSelectedSnapshotId(event.currentTarget.value)}
            >
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {snapshot.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Branch name</span>
            <input
              value={branchName}
              onChange={(event) => setBranchName(event.currentTarget.value)}
            />
          </label>
        </div>
      ) : (
        <EmptyState title="No snapshots saved">
          Create a JSON snapshot from Export to enable restore and branch workflows.
        </EmptyState>
      )}

      <div className="snapshot-actions">
        <ActionButton disabled={!selectedSnapshot} onClick={restoreSelectedSnapshot}>
          <RefreshCcw size={16} /> Restore current project
        </ActionButton>
        <ActionButton disabled={!selectedSnapshot} onClick={createBranch}>
          <GitBranch size={16} /> Create branch
        </ActionButton>
      </div>

      {status ? <p className="snapshot-status">{status}</p> : null}
    </section>
  );
}
