import { Download, RefreshCw } from "lucide-react";
import type { DimensionRecord } from "../../shared/types";
import type { HierarchyAnalyticsResult } from "../../shared/hierarchyAnalytics";
import {
  hierarchyLevelizedCsvUrl,
  hierarchyOrphansCsvUrl,
  hierarchyParentChildCsvUrl,
  hierarchyPathsCsvUrl,
  hierarchySharedMembersCsvUrl,
} from "../api/client";
import { StatusBadge } from "./ui";

export function HierarchyAnalyticsPanel({
  projectId,
  dimension,
  analytics,
  status,
  isOrphansFiltered,
  onOrphansToggle,
}: {
  projectId: string;
  dimension: DimensionRecord;
  analytics: HierarchyAnalyticsResult | null;
  status: "loading" | "ready" | "error";
  isOrphansFiltered: boolean;
  onOrphansToggle: () => void;
}) {
  const summary = analytics?.summary;
  const statusTone =
    status === "error" ? "danger" : summary?.hasCycle ? "warning" : "neutral";

  return (
    <section
      className="hierarchy-analytics-panel"
      aria-label={`${dimension.dimensionName} hierarchy analytics`}
    >
      <div className="hierarchy-analytics-header">
        <div className="grid-toolbar-title">
          <strong>Hierarchy analytics</strong>
          <span>Levelized exports and health checks</span>
        </div>
        <StatusBadge tone={statusTone}>
          {status === "loading" && <RefreshCw size={13} />}
          {status === "error"
            ? "Unavailable"
            : summary?.hasCycle
              ? "Cycle warning"
              : "Ready"}
        </StatusBadge>
      </div>
      <div className="hierarchy-metrics">
        <Metric label="Max depth" value={formatMetric(summary?.maxDepth)} />
        <Metric label="Members" value={formatMetric(summary?.memberCount)} />
        <Metric
          label="Relationships"
          value={formatMetric(summary?.relationshipCount)}
        />
        <Metric label="Leaves" value={formatMetric(summary?.leafCount)} />
        <Metric label="Parents" value={formatMetric(summary?.parentCount)} />
        <Metric
          label="Orphans"
          value={formatMetric(summary?.orphanCount)}
          tone={summary?.orphanCount ? "warning" : undefined}
          interactive
          active={isOrphansFiltered}
          onClick={onOrphansToggle}
        />
        <Metric
          label="Shared"
          value={formatMetric(summary?.sharedMemberCount)}
          tone={summary?.sharedMemberCount ? "info" : undefined}
        />
      </div>
      <div
        className="hierarchy-export-actions"
        aria-label="Hierarchy CSV exports"
      >
        <ExportLink
          href={hierarchyLevelizedCsvUrl(projectId, dimension.id)}
          label="Export levelized CSV"
        />
        <ExportLink
          href={hierarchyPathsCsvUrl(projectId, dimension.id)}
          label="Export paths CSV"
        />
        <ExportLink
          href={hierarchyParentChildCsvUrl(projectId, dimension.id)}
          label="Export parent-child CSV"
        />
        <ExportLink
          href={hierarchySharedMembersCsvUrl(projectId, dimension.id)}
          label="Export shared CSV"
        />
        <ExportLink
          href={hierarchyOrphansCsvUrl(projectId, dimension.id)}
          label="Export orphan CSV"
        />
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
  interactive = false,
  active = false,
  onClick,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warning" | "info";
  interactive?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = `hierarchy-metric ${tone} ${interactive ? "interactive" : ""} ${active ? "active" : ""}`;
  
  if (interactive) {
    return (
      <button
        className={className}
        onClick={onClick}
        type="button"
        style={{
          borderStyle: "solid",
          textAlign: "left",
          fontFamily: "inherit",
          width: "100%",
          cursor: "pointer",
        }}
      >
        <span>{label}</span>
        <b>{value}</b>
      </button>
    );
  }

  return (
    <span className={className}>
      <span>{label}</span>
      <b>{value}</b>
    </span>
  );
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a className="hierarchy-export-link" href={href}>
      <Download size={14} />
      {label}
    </a>
  );
}

function formatMetric(value: number | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "0";
}
