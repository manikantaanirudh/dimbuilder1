import { FileUp } from "lucide-react";
import type { DashboardSummary, DimensionRecord, ProjectRecord } from "../../shared/types";

export function Dashboard({
  projects,
  dimensions,
  summary,
  onImport
}: {
  projects: ProjectRecord[];
  dimensions: DimensionRecord[];
  summary: DashboardSummary | null;
  onImport: () => void;
}) {
  const metrics = [
    ["Dimensions", summary?.totalDimensions ?? dimensions.length],
    ["Members", summary?.totalMembers ?? 0],
    ["Relationships", summary?.totalRelationships ?? 0],
    ["Blocking errors", summary?.validationErrors ?? 0],
    ["Warnings", summary?.validationWarnings ?? 0],
    ["Projects", projects.length]
  ];

  return (
    <section className="dashboard">
      <div className="dashboard-hero">
        <div>
          <h1>OneStream XF Dimension Builder</h1>
          <p>Import the metadata template, manage dimensions in controlled grids, validate hierarchy issues, and export OneStream-compatible files.</p>
        </div>
        <button onClick={onImport}><FileUp size={16} /> Import XLSX</button>
      </div>
      <div className="metric-grid">
        {metrics.map(([label, value]) => (
          <div className="metric" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="panel recent-panel">
        <h2>Recently Edited Dimensions</h2>
        {summary?.recentDimensions.length ? (
          summary.recentDimensions.map((dimension) => (
            <div className="recent-row" key={dimension.id}>
              <b>{dimension.sheetName}</b>
              <span>{dimension.dimensionType} / {dimension.dimensionName}</span>
            </div>
          ))
        ) : (
          <div className="empty-state">No imported project yet.</div>
        )}
      </div>
    </section>
  );
}

