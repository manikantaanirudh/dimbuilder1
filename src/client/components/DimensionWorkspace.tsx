import { useEffect, useState } from "react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { getDimensionDisplayLabel, getDimensionDisplaySubtitle } from "../../shared/dimensionDisplay";
import type { DimensionRecord, ValidationIssue } from "../../shared/types";
import { EditableGrid } from "./EditableGrid";
import { HierarchyTree } from "./HierarchyTree";
import { IssuePanel } from "./IssuePanel";
import { MetadataEditor } from "./MetadataEditor";
import { XmlPreview } from "./XmlPreview";

const allTabs = ["Overview", "Members", "Relationships", "Hierarchy", "XML Preview", "Issues"] as const;
type WorkspaceTab = (typeof allTabs)[number];
const tabsWithoutXml: readonly WorkspaceTab[] = ["Overview", "Members", "Relationships", "Hierarchy", "Issues"];

function isWorkspaceTab(value: string): value is WorkspaceTab {
  return allTabs.includes(value as WorkspaceTab);
}

function getAvailableTabs(xmlPreviewEnabled: boolean): readonly WorkspaceTab[] {
  return xmlPreviewEnabled ? allTabs : tabsWithoutXml;
}

function getFallbackTab(defaultWorkspaceTab: string, xmlPreviewEnabled: boolean): WorkspaceTab {
  const availableTabs = getAvailableTabs(xmlPreviewEnabled);
  return isWorkspaceTab(defaultWorkspaceTab) && availableTabs.includes(defaultWorkspaceTab)
    ? defaultWorkspaceTab
    : "Overview";
}

export function DimensionWorkspace({
  projectId,
  dimension,
  issues,
  onRefresh,
  appConfig
}: {
  projectId: string;
  dimension: DimensionRecord;
  issues: ValidationIssue[];
  onRefresh: () => void;
  appConfig: ClientAppConfig;
}) {
  const xmlPreviewEnabled = appConfig.features.enableXmlPreview;
  const defaultWorkspaceTab = appConfig.ui.defaultWorkspaceTab;
  const availableTabs = getAvailableTabs(xmlPreviewEnabled);
  const [tab, setTab] = useState<WorkspaceTab>(() => getFallbackTab(defaultWorkspaceTab, xmlPreviewEnabled));
  const dimensionIssues = issues.filter((issue) => issue.dimensionId === dimension.id);
  const blockingErrors = dimensionIssues.filter((issue) => issue.severity === "error").length;

  useEffect(() => {
    if (availableTabs.includes(tab)) return;
    setTab(getFallbackTab(defaultWorkspaceTab, xmlPreviewEnabled));
  }, [defaultWorkspaceTab, tab, xmlPreviewEnabled]);

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
        {availableTabs.map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>
      <div className="workspace-grid">
        <div className="workspace-main">
          {tab === "Overview" && <MetadataEditor projectId={projectId} dimension={dimension} onSaved={onRefresh} />}
          {tab === "Members" && <EditableGrid projectId={projectId} kind="members" dimension={dimension} pageSize={appConfig.ui.gridPageSize} />}
          {tab === "Relationships" && <EditableGrid projectId={projectId} kind="relationships" dimension={dimension} pageSize={appConfig.ui.gridPageSize} />}
          {tab === "Hierarchy" && <HierarchyTree projectId={projectId} dimension={dimension} />}
          {tab === "XML Preview" && (
            <XmlPreview
              projectId={projectId}
              dimension={dimension}
              defaultScope={appConfig.ui.xmlPreview.defaultScope}
              allowAllDimensions={appConfig.ui.xmlPreview.allowAllDimensions}
            />
          )}
          {tab === "Issues" && <IssuePanel dimension={dimension} issues={dimensionIssues} expanded />}
        </div>
        <IssuePanel dimension={dimension} issues={dimensionIssues} />
      </div>
    </section>
  );
}
