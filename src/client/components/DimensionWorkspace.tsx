import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { getDimensionDisplayLabel, getDimensionDisplaySubtitle } from "../../shared/dimensionDisplay";
import type { DimensionRecord, ValidationIssue } from "../../shared/types";
import {
  buildDimensionFacts,
  buildIssueSummary,
  getReadinessLabel,
  getWorkspaceTabs,
  type ExportAvailability
} from "../ui/viewModel";
import { EditableGrid } from "./EditableGrid";
import { HierarchyTree } from "./HierarchyTree";
import { IssuePanel } from "./IssuePanel";
import { MetadataEditor } from "./MetadataEditor";
import { FactItem, FactStrip, StatusBadge } from "./ui";
import { XmlPreview } from "./XmlPreview";

type WorkspaceTab = "Overview" | "Members" | "Relationships" | "Hierarchy" | "XML" | "Issues";

function getFallbackTab(defaultWorkspaceTab: string, xmlPreviewEnabled: boolean): WorkspaceTab {
  const availableTabs = getWorkspaceTabs(xmlPreviewEnabled).map((item) => item.label);
  return availableTabs.includes(defaultWorkspaceTab as WorkspaceTab) ? defaultWorkspaceTab as WorkspaceTab : "Overview";
}

export function DimensionWorkspace({
  projectId,
  dimension,
  issues,
  onRefresh,
  appConfig,
  exportAvailability
}: {
  projectId: string;
  dimension: DimensionRecord;
  issues: ValidationIssue[];
  onRefresh: () => void;
  appConfig: ClientAppConfig;
  exportAvailability: ExportAvailability;
}) {
  const xmlPreviewEnabled = appConfig.features.enableXmlPreview && appConfig.export.xml.enabled;
  const defaultWorkspaceTab = appConfig.ui.defaultWorkspaceTab;
  const [tab, setTab] = useState<WorkspaceTab>(() => getFallbackTab(defaultWorkspaceTab, xmlPreviewEnabled));
  const dimensionIssues = issues.filter((issue) => issue.dimensionId === dimension.id);
  const issueSummary = buildIssueSummary(dimensionIssues, appConfig.validation.exportBlockedBySeverities);
  const readinessLabel = getReadinessLabel(issueSummary);
  const facts = buildDimensionFacts(dimension, issueSummary);
  const availableTabs = getWorkspaceTabs(xmlPreviewEnabled).map((item) => item.label);
  const activeTab = availableTabs.includes(tab) ? tab : getFallbackTab(defaultWorkspaceTab, xmlPreviewEnabled);
  const dimensionDisplayConfig = appConfig.dimensions.display;

  useEffect(() => {
    if (tab === activeTab) return;
    setTab(activeTab);
  }, [activeTab, tab]);

  return (
    <section className="workspace">
      <div className="workspace-header">
        <div className="workspace-title-block">
          <h1>{getDimensionDisplayLabel(dimension, dimensionDisplayConfig)}</h1>
          <small>{getDimensionDisplaySubtitle(dimension, dimensionDisplayConfig)}</small>
        </div>
        <div className="workspace-health">
          <StatusBadge tone={issueSummary.blocksExport ? "danger" : issueSummary.total ? "warning" : "success"}>
            {issueSummary.blocksExport ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            {readinessLabel}
          </StatusBadge>
        </div>
      </div>
      <FactStrip className="workspace-facts">
        {facts.map((fact) => (
          <FactItem key={fact.label} label={fact.label} value={fact.value} tone={fact.tone ?? "neutral"} />
        ))}
      </FactStrip>
      <nav className="tabs" aria-label="Dimension workspace tabs">
        {availableTabs.map((item) => (
          <button
            key={item}
            className={activeTab === item ? "active" : ""}
            aria-current={activeTab === item ? "page" : undefined}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="workspace-grid">
        <div className="workspace-main">
          {activeTab === "Overview" && <MetadataEditor projectId={projectId} dimension={dimension} onSaved={onRefresh} />}
          {activeTab === "Members" && <EditableGrid projectId={projectId} kind="members" dimension={dimension} pageSize={appConfig.ui.gridPageSize} />}
          {activeTab === "Relationships" && <EditableGrid projectId={projectId} kind="relationships" dimension={dimension} pageSize={appConfig.ui.gridPageSize} />}
          {activeTab === "Hierarchy" && <HierarchyTree projectId={projectId} dimension={dimension} />}
          {activeTab === "XML" && xmlPreviewEnabled && (
            <XmlPreview
              projectId={projectId}
              dimension={dimension}
              defaultScope={appConfig.ui.xmlPreview.defaultScope}
              allowAllDimensions={appConfig.ui.xmlPreview.allowAllDimensions}
              xmlExportEnabled={appConfig.export.xml.enabled}
              exportAvailability={exportAvailability}
            />
          )}
          {activeTab === "Issues" && <IssuePanel dimension={dimension} issues={dimensionIssues} appConfig={appConfig} expanded />}
        </div>
        <IssuePanel dimension={dimension} issues={dimensionIssues} appConfig={appConfig} />
      </div>
    </section>
  );
}
