import { useState, useRef, useEffect } from "react";
import { Download, ChevronDown, RefreshCw } from "lucide-react";
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
  const [isExportOpen, setIsExportOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsExportOpen(false);
      }
    }
    if (isExportOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isExportOpen]);

  const exportOptions = [
    {
      label: "Export levelized CSV",
      href: hierarchyLevelizedCsvUrl(projectId, dimension.id),
    },
    {
      label: "Export paths CSV",
      href: hierarchyPathsCsvUrl(projectId, dimension.id),
    },
    {
      label: "Export parent-child CSV",
      href: hierarchyParentChildCsvUrl(projectId, dimension.id),
    },
    {
      label: "Export shared CSV",
      href: hierarchySharedMembersCsvUrl(projectId, dimension.id),
    },
    {
      label: "Export orphan CSV",
      href: hierarchyOrphansCsvUrl(projectId, dimension.id),
    },
  ];

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
        className="hierarchy-export-container"
        ref={dropdownRef}
        style={{ position: "relative", marginTop: "8px" }}
      >
        <button
          type="button"
          className="hierarchy-export-dropdown-btn"
          onClick={() => setIsExportOpen((prev) => !prev)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            width: "100%",
            padding: "6px 12px",
            fontSize: "12px",
            fontWeight: 650,
            color: "var(--text)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm, 6px)",
            cursor: "pointer",
            boxShadow: "var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.05))",
            transition: "all 0.15s ease",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <Download size={14} style={{ color: "var(--primary)" }} />
            <span>Export as</span>
          </span>
          <ChevronDown
            size={14}
            style={{
              transition: "transform 0.2s ease",
              transform: isExportOpen ? "rotate(180deg)" : "rotate(0deg)",
              color: "var(--muted)",
            }}
          />
        </button>

        {isExportOpen && (
          <div
            className="hierarchy-export-menu"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              zIndex: 60,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm, 6px)",
              boxShadow: "0 6px 16px rgba(0, 0, 0, 0.14)",
              padding: "4px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            {exportOptions.map((opt) => (
              <a
                key={opt.label}
                href={opt.href}
                className="hierarchy-export-menu-item"
                onClick={() => setIsExportOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--text)",
                  textDecoration: "none",
                  borderRadius: "4px",
                  transition: "background 0.12s ease",
                }}
              >
                <span>{opt.label}</span>
                <Download size={12} style={{ color: "var(--muted)", opacity: 0.7 }} />
              </a>
            ))}
          </div>
        )}
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

function formatMetric(value: number | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "0";
}
