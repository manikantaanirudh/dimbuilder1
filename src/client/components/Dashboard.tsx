import { FileUp } from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { getDimensionDisplayLabel, getDimensionDisplaySubtitle } from "../../shared/dimensionDisplay";
import type { DashboardSummary, DimensionRecord } from "../../shared/types";

export function Dashboard({
  dimensions,
  summary,
  onImport,
  appConfig
}: {
  dimensions: DimensionRecord[];
  summary: DashboardSummary | null;
  onImport: () => void;
  appConfig: ClientAppConfig;
}) {
  const cards = appConfig.dashboard.cards;
  const dimensionDisplayConfig = appConfig.dimensions.display;
  const metrics = [
    { key: "totalDimensions", label: "Dimensions", value: summary?.totalDimensions ?? dimensions.length, enabled: cards.totalDimensions },
    { key: "totalMembers", label: "Members", value: summary?.totalMembers ?? 0, enabled: cards.totalMembers },
    { key: "totalRelationships", label: "Relationships", value: summary?.totalRelationships ?? 0, enabled: cards.totalRelationships },
    { key: "validationErrors", label: "Blocking errors", value: summary?.validationErrors ?? 0, enabled: cards.validationErrors },
    { key: "validationWarnings", label: "Warnings", value: summary?.validationWarnings ?? 0, enabled: cards.validationWarnings }
  ];

  return (
    <section className="dashboard">
      <div className="dashboard-hero">
        <div>
          <h1>{appConfig.application.title}</h1>
          <p>{appConfig.application.description}</p>
        </div>
        <button onClick={onImport}><FileUp size={16} /> Import XLSX</button>
      </div>
      <div className="metric-grid">
        {metrics.filter((metric) => metric.enabled).map(({ key, label, value }) => (
          <div className="metric" key={key}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {cards.recentDimensions && (
        <div className="panel recent-panel">
          <h2>Recently Edited Dimensions</h2>
          {summary?.recentDimensions.length ? (
            summary.recentDimensions.map((dimension) => (
              <div className="recent-row" key={dimension.id}>
                <b>{getDimensionDisplayLabel(dimension, dimensionDisplayConfig)}</b>
                <span>{getDimensionDisplaySubtitle(dimension, dimensionDisplayConfig)}</span>
              </div>
            ))
          ) : (
            <div className="empty-state">No imported project yet.</div>
          )}
        </div>
      )}
    </section>
  );
}
