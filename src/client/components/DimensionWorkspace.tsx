import { useState } from "react";
import { getDimensionDisplayLabel, getDimensionDisplaySubtitle } from "../../shared/dimensionDisplay";
import type { DimensionRecord, ValidationIssue } from "../../shared/types";
import { EditableGrid } from "./EditableGrid";
import { HierarchyTree } from "./HierarchyTree";
import { IssuePanel } from "./IssuePanel";
import { MetadataEditor } from "./MetadataEditor";
import { XmlPreview } from "./XmlPreview";

const tabs = ["Overview", "Members", "Relationships", "Hierarchy", "XML Preview", "Issues"] as const;

export function DimensionWorkspace({
  projectId,
  dimension,
  issues,
  onRefresh
}: {
  projectId: string;
  dimension: DimensionRecord;
  issues: ValidationIssue[];
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const dimensionIssues = issues.filter((issue) => issue.dimensionId === dimension.id);
  const blockingErrors = dimensionIssues.filter((issue) => issue.severity === "error").length;

  return (
    <section className="workspace">
      <div className="workspace-header">
        <div>
          <h1>{getDimensionDisplayLabel(dimension)}</h1>
          <span>{getDimensionDisplaySubtitle(dimension)}</span>
        </div>
        <div className={blockingErrors ? "status-strip error" : "status-strip"}>
          <b>{blockingErrors}</b> blocking errors
        </div>
      </div>
      <nav className="tabs">
        {tabs.map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>
      <div className="workspace-grid">
        <div className="workspace-main">
          {tab === "Overview" && <MetadataEditor projectId={projectId} dimension={dimension} onSaved={onRefresh} />}
          {tab === "Members" && <EditableGrid projectId={projectId} kind="members" dimension={dimension} />}
          {tab === "Relationships" && <EditableGrid projectId={projectId} kind="relationships" dimension={dimension} />}
          {tab === "Hierarchy" && <HierarchyTree projectId={projectId} dimension={dimension} />}
          {tab === "XML Preview" && <XmlPreview projectId={projectId} dimension={dimension} />}
          {tab === "Issues" && <IssuePanel dimension={dimension} issues={dimensionIssues} expanded />}
        </div>
        <IssuePanel dimension={dimension} issues={dimensionIssues} />
      </div>
    </section>
  );
}
