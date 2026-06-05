import { useEffect, useState } from "react";
import { ScanSearch } from "lucide-react";
import { fetchXdXray } from "../api/client";
import type { MemberLineageStatus, XdXrayReport } from "../../shared/xdXray";
import { Panel, StatusBadge } from "./ui";

type LineageFilter = "all" | "inherited" | "overridden" | "local" | "conflicts";

const STATUS_TONE: Record<MemberLineageStatus, "success" | "info" | "warning" | "neutral"> = {
  base: "neutral",
  inherited: "info",
  overridden: "warning",
  local: "success"
};

/**
 * Extensible Dimensionality X-Ray (TASK-11). Visualizes base vs extended dimensions, member
 * lineage, and risks. Inferred links are clearly labelled and never shown as definite.
 */
export function XdXrayPanel({ projectId }: { projectId: string }) {
  const [report, setReport] = useState<XdXrayReport | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<LineageFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    void fetchXdXray(projectId)
      .then((r) => { if (!cancelled) setReport(r); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "X-Ray unavailable"); });
    return () => { cancelled = true; };
  }, [projectId]);

  if (error) return <Panel className="xd-xray-panel"><StatusBadge tone="danger">{error}</StatusBadge></Panel>;
  if (!report) return <Panel className="xd-xray-panel">Loading XD X-Ray...</Panel>;

  const conflictMembers = new Set(
    report.risks.filter((r) => r.code === "MEMBER_DIVERGENT_BEHAVIOR" && r.memberKey).map((r) => r.memberKey!)
  );

  const lineage = report.memberLineage.filter((l) => {
    if (search && !l.memberKey.toLowerCase().includes(search.toLowerCase())) return false;
    switch (filter) {
      case "inherited": return l.status === "inherited";
      case "overridden": return l.status === "overridden";
      case "local": return l.status === "local";
      case "conflicts": return conflictMembers.has(l.memberKey.trim().toLowerCase());
      default: return true;
    }
  });

  return (
    <Panel className="xd-xray-panel">
      <div className="grid-toolbar">
        <div className="grid-toolbar-title">
          <strong><ScanSearch size={16} /> XD X-Ray</strong>
          <span>Base vs extended dimension behavior. Inferred links are labelled and not treated as definite.</span>
        </div>
        <StatusBadge tone="neutral">{report.summary.baseCount} base / {report.summary.extendedCount} extended</StatusBadge>
      </div>

      <section style={{ margin: "8px 0" }}>
        <strong>Dimension lineage</strong>
        <table className="data-table" style={{ fontSize: "0.8rem" }}>
          <thead><tr><th>Dimension</th><th>Type</th><th>Role</th><th>Base</th><th>Confidence</th></tr></thead>
          <tbody>
            {report.dimensions.map((d) => (
              <tr key={d.dimensionId}>
                <td>{d.dimensionName}</td>
                <td>{d.dimensionType}</td>
                <td>{d.role}</td>
                <td>{d.baseDimensionName ?? "-"}</td>
                <td>
                  <StatusBadge tone={d.confidence === "explicit" ? "success" : d.confidence === "inferred" ? "warning" : "neutral"}>
                    {d.confidence}
                  </StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {report.risks.length > 0 && (
        <section style={{ margin: "8px 0" }}>
          <strong>Risks</strong>
          <ul style={{ fontSize: "0.82rem", margin: "4px 0" }}>
            {report.risks.map((r, i) => (
              <li key={i}>
                <StatusBadge tone={r.severity === "warning" ? "warning" : "info"}>{r.severity}</StatusBadge>{" "}
                {r.message} <em>({r.confidence})</em>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={{ margin: "8px 0" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>Member lineage</strong>
          <select value={filter} onChange={(e) => setFilter(e.currentTarget.value as LineageFilter)}>
            <option value="all">All</option>
            <option value="inherited">Inherited only</option>
            <option value="overridden">Overridden only</option>
            <option value="local">Local only</option>
            <option value="conflicts">Conflicts only</option>
          </select>
          <input placeholder="Search member" value={search} onChange={(e) => setSearch(e.currentTarget.value)} />
          <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
            {report.summary.inheritedMembers} inherited / {report.summary.overriddenMembers} overridden / {report.summary.localMembers} local
          </span>
        </div>
        <table className="data-table" style={{ fontSize: "0.78rem", marginTop: 6 }}>
          <thead><tr><th>Dimension</th><th>Member</th><th>Status</th><th>Overridden properties</th></tr></thead>
          <tbody>
            {lineage.slice(0, 500).map((l, i) => (
              <tr key={i}>
                <td>{l.dimensionName}</td>
                <td>{l.memberKey}</td>
                <td><StatusBadge tone={STATUS_TONE[l.status]}>{l.status}</StatusBadge></td>
                <td>{l.overriddenProperties.map((p) => p.property).join(", ")}</td>
              </tr>
            ))}
            {lineage.length === 0 && <tr><td colSpan={4}>No members match the current filter.</td></tr>}
          </tbody>
        </table>
      </section>
    </Panel>
  );
}
