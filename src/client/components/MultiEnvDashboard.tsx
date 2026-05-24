import { useMemo } from "react";
import type { PromotionPipeline, EnvironmentSyncStatus, EnvironmentOverride } from "../../shared/multiEnvTypes";
import type { EnvironmentSafe } from "../../shared/environmentTypes";
import { StatusBadge } from "./ui";

export interface SyncStatusSummary {
  environmentId: string;
  environmentName: string;
  statuses: EnvironmentSyncStatus[];
  totalDimTypes: number;
  inSync: number;
  localAhead: number;
  remoteAhead: number;
  diverged: number;
  unknown: number;
}

export function MultiEnvDashboard({
  pipelines,
  syncSummaries,
  overrides,
  environments,
  onPromote,
  onRefreshSync,
  onCreateOverride,
  onDeleteOverride
}: {
  pipelines: PromotionPipeline[];
  syncSummaries: SyncStatusSummary[];
  overrides: EnvironmentOverride[];
  environments: EnvironmentSafe[];
  onPromote?: (pipelineId: string, fromStageIndex: number, toStageIndex: number) => void;
  onRefreshSync?: () => void;
  onCreateOverride?: (data: { environmentId: string; projectId: string; dimensionType: string; memberKey: string; propertyName: string; overrideValue: string; reason?: string }) => void;
  onDeleteOverride?: (id: string) => void;
}) {
  const activePipelines = useMemo(() => pipelines.filter(p => p.isActive), [pipelines]);
  const totalEnvs = environments.length;
  const totalInSync = syncSummaries.reduce((sum, s) => sum + s.inSync, 0);
  const totalAhead = syncSummaries.reduce((sum, s) => sum + s.localAhead, 0);
  const totalDiverged = syncSummaries.reduce((sum, s) => sum + s.diverged, 0);

  return (
    <section className="panel multi-env-dashboard">
      <div className="admin-page">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Multi-Environment</span>
            <h1>Environment Management</h1>
          </div>
          <StatusBadge tone={totalDiverged > 0 ? "danger" : totalAhead > 0 ? "warning" : "success"}>
            {totalDiverged > 0 ? "Diverged" : totalAhead > 0 ? "Changes Pending" : "All Synced"}
          </StatusBadge>
        </div>

        <div className="validation-summary-cards">
          <div className="summary-card info">
            <span className="summary-value">{totalEnvs}</span>
            <span className="summary-label">Environments</span>
          </div>
          <div className="summary-card success">
            <span className="summary-value">{totalInSync}</span>
            <span className="summary-label">In Sync</span>
          </div>
          <div className="summary-card warning">
            <span className="summary-value">{totalAhead}</span>
            <span className="summary-label">Local Ahead</span>
          </div>
          <div className="summary-card danger">
            <span className="summary-value">{totalDiverged}</span>
            <span className="summary-label">Diverged</span>
          </div>
        </div>

        {onRefreshSync && (
          <div className="section-actions">
            <button className="btn btn-secondary" onClick={onRefreshSync}>Refresh Sync Status</button>
          </div>
        )}

        <section className="section">
          <h2>Promotion Pipelines</h2>
          {activePipelines.length === 0 && <p className="text-muted">No active pipelines configured.</p>}
          {activePipelines.map(pipeline => (
            <div key={pipeline.id} className="card">
              <h3>{pipeline.name}</h3>
              <div className="pipeline-stages">
                {pipeline.stages.map((stage, idx) => (
                  <span key={idx} className="badge">
                    {stage.name}
                    {idx < pipeline.stages.length - 1 && onPromote && (
                      <button
                        className="btn btn-xs btn-primary"
                        onClick={() => onPromote(pipeline.id, idx, idx + 1)}
                      >
                        →
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="section">
          <h2>Sync Status by Environment</h2>
          {syncSummaries.map(summary => (
            <div key={summary.environmentId} className="card">
              <h3>{summary.environmentName}</h3>
              <div className="sync-breakdown">
                <span>{summary.inSync} in sync</span>
                <span>{summary.localAhead} local ahead</span>
                <span>{summary.diverged} diverged</span>
                <span>{summary.unknown} unknown</span>
              </div>
            </div>
          ))}
        </section>

        <section className="section">
          <h2>Environment Overrides ({overrides.length})</h2>
          {overrides.length === 0 && <p className="text-muted">No overrides configured.</p>}
          <table className="data-table">
            <thead>
              <tr>
                <th>Environment</th>
                <th>Dimension</th>
                <th>Member</th>
                <th>Property</th>
                <th>Value</th>
                <th>Reason</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {overrides.map(override => (
                <tr key={override.id}>
                  <td>{environments.find(e => e.id === override.environmentId)?.name ?? override.environmentId}</td>
                  <td>{override.dimensionType}</td>
                  <td>{override.memberKey}</td>
                  <td>{override.propertyName}</td>
                  <td>{override.overrideValue}</td>
                  <td>{override.reason}</td>
                  <td>
                    {onDeleteOverride && (
                      <button className="btn btn-xs btn-danger" onClick={() => onDeleteOverride(override.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </section>
  );
}
