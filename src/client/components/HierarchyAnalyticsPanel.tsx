import { Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { DimensionRecord } from "../../shared/types";
import type { HierarchyAnalyticsResult } from "../../shared/hierarchyAnalytics";
import {
  fetchHierarchyAnalytics,
  hierarchyLevelizedCsvUrl,
  hierarchyOrphansCsvUrl,
  hierarchyParentChildCsvUrl,
  hierarchyPathsCsvUrl,
  hierarchySharedMembersCsvUrl
} from "../api/client";
import { StatusBadge } from "./ui";

export function HierarchyAnalyticsPanel({ projectId, dimension }: { projectId: string; dimension: DimensionRecord }) {
  const [analytics, setAnalytics] = useState<HierarchyAnalyticsResult | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    void fetchHierarchyAnalytics(projectId, dimension.id)
      .then((result) => {
        if (cancelled) return;
        setAnalytics(result);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, dimension.id]);

  const summary = analytics?.summary;
  const statusTone = status === "error" ? "danger" : summary?.hasCycle ? "warning" : "neutral";

  return (
    <section className="hierarchy-analytics-panel" aria-label={`${dimension.dimensionName} hierarchy analytics`}>
      <div className="hierarchy-analytics-header">
        <div className="grid-toolbar-title">
          <strong>Hierarchy analytics</strong>
          <span>Levelized exports and health checks</span>
        </div>
        <StatusBadge tone={statusTone}>
          {status === "loading" && <RefreshCw size={13} />}
          {status === "error" ? "Unavailable" : summary?.hasCycle ? "Cycle warning" : "Ready"}
        </StatusBadge>
      </div>
      <div className="hierarchy-metrics">
        <Metric label="Max depth" value={formatMetric(summary?.maxDepth)} />
        <Metric label="Members" value={formatMetric(summary?.memberCount)} />
        <Metric label="Relationships" value={formatMetric(summary?.relationshipCount)} />
        <Metric label="Leaves" value={formatMetric(summary?.leafCount)} />
        <Metric label="Parents" value={formatMetric(summary?.parentCount)} />
        <Metric label="Orphans" value={formatMetric(summary?.orphanCount)} tone={summary?.orphanCount ? "warning" : undefined} />
        <Metric label="Shared" value={formatMetric(summary?.sharedMemberCount)} tone={summary?.sharedMemberCount ? "info" : undefined} />
      </div>
      <div className="hierarchy-export-actions" aria-label="Hierarchy CSV exports">
        <ExportLink href={hierarchyLevelizedCsvUrl(projectId, dimension.id)} label="Export levelized CSV" />
        <ExportLink href={hierarchyPathsCsvUrl(projectId, dimension.id)} label="Export paths CSV" />
        <ExportLink href={hierarchyParentChildCsvUrl(projectId, dimension.id)} label="Export parent-child CSV" />
        <ExportLink href={hierarchySharedMembersCsvUrl(projectId, dimension.id)} label="Export shared CSV" />
        <ExportLink href={hierarchyOrphansCsvUrl(projectId, dimension.id)} label="Export orphan CSV" />
      </div>
    </section>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warning" | "info" }) {
  return (
    <span className={`hierarchy-metric ${tone}`}>
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
