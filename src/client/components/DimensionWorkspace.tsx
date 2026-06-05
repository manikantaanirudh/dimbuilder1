import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database } from "lucide-react";
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
import { BulkUpdatePanel } from "./BulkUpdatePanel";
import { EditableGrid } from "./EditableGrid";
import { ChangeSetsPanel } from "./ChangeSetsPanel";
import { HierarchyTree } from "./HierarchyTree";
import { IssuePanel } from "./IssuePanel";
import { DimensionLifecyclePanel } from "./DimensionLifecyclePanel";
import { MetadataEditor } from "./MetadataEditor";
import { MetadataDiffPanel } from "./MetadataDiffPanel";
import { FactItem, FactStrip, StatusBadge } from "./ui";
import { VaryingPropertiesPanel } from "./VaryingPropertiesPanel";
import { WorkflowPanel } from "./WorkflowPanel";
import { PropertyDefaultsPanel } from "./PropertyDefaultsPanel";
import { XmlPreview } from "./XmlPreview";

type WorkspaceTab = "Overview" | "Members" | "Relationships" | "Hierarchy" | "Varying" | "Property Defaults" | "Bulk Update" | "Compare" | "Change Sets" | "Workflows" | "XML" | "Issues";

function getFallbackTab(defaultWorkspaceTab: string, xmlPreviewEnabled: boolean): WorkspaceTab {
  const availableTabs = getWorkspaceTabs(xmlPreviewEnabled).map((item) => item.label);
  return availableTabs.includes(defaultWorkspaceTab as WorkspaceTab) ? defaultWorkspaceTab as WorkspaceTab : "Overview";
}

export function DimensionWorkspace({
  projectId,
  dimension,
  issues,
  onRefresh,
  onDimensionDeleted,
  onDimensionRecreated,
  appConfig,
  exportAvailability
}: {
  projectId: string;
  dimension: DimensionRecord;
  issues: ValidationIssue[];
  onRefresh: () => void;
  onDimensionDeleted: () => void;
  onDimensionRecreated: (dimension: DimensionRecord) => void;
  appConfig: ClientAppConfig;
  exportAvailability: ExportAvailability;
}) {
  const xmlPreviewEnabled = appConfig.features.enableXmlPreview && appConfig.export.xml.enabled;
  const defaultWorkspaceTab = appConfig.ui.defaultWorkspaceTab;
  const [tab, setTab] = useState<WorkspaceTab>(() => getFallbackTab(defaultWorkspaceTab, xmlPreviewEnabled));
  const [highlightedEntityId, setHighlightedEntityId] = useState<string | null>(null);
  const [issueFilter, setIssueFilter] = useState<"all" | "errors" | "warnings">("all");
  const dimensionIssues = issues.filter((issue) => issue.dimensionId === dimension.id);
  const issueSummary = buildIssueSummary(dimensionIssues, appConfig.validation.exportBlockedBySeverities);
  const projectIssueSummary = buildIssueSummary(issues, appConfig.validation.exportBlockedBySeverities);
  const readinessLabel = getReadinessLabel(issueSummary);
  const facts = buildDimensionFacts(dimension, issueSummary);
  const filteredEntityIds = useMemo(() => {
    if (issueFilter === "all") return null;
    const targetSeverity = issueFilter === "errors" ? "error" : "warning";
    return new Set(dimensionIssues.filter((i) => i.severity === targetSeverity).map((i) => i.entityId));
  }, [dimensionIssues, issueFilter]);
  const availableTabs = getWorkspaceTabs(xmlPreviewEnabled).map((item) => item.label);
  const activeTab = availableTabs.includes(tab) ? tab : getFallbackTab(defaultWorkspaceTab, xmlPreviewEnabled);
  const dimensionDisplayConfig = appConfig.dimensions.display;

  useEffect(() => {
    if (tab === activeTab) return;
    setTab(activeTab);
  }, [activeTab, tab]);

  function handleIssueClick(issue: ValidationIssue) {
    const targetTab: WorkspaceTab = issue.entityType === "relationship" ? "Relationships" : "Members";
    setTab(targetTab);
    setHighlightedEntityId(issue.entityId);
  }

  useEffect(() => {
    setIssueFilter("all");
  }, [dimension.id]);

  return (
    <section className="workspace">
      <div className="workspace-page">
        <span className="workspace-page-icon" aria-hidden="true">
          <Database size={24} />
        </span>
        <div className="workspace-page-body">
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
            {facts.filter(f => f.label !== "Errors" && f.label !== "Warnings").map((fact) => (
              <FactItem key={fact.label} label={fact.label} value={fact.value} tone={fact.tone ?? "neutral"} />
            ))}
            <button
              className={`fact-button ${issueFilter === "errors" ? "active" : ""}`}
              onClick={() => setIssueFilter(issueFilter === "errors" ? "all" : "errors")}
              title="Click to filter grid to rows with errors"
            >
              <FactItem label="Errors" value={String(issueSummary.errors)} tone={issueSummary.errors > 0 ? "danger" : "neutral"} />
            </button>
            <button
              className={`fact-button ${issueFilter === "warnings" ? "active" : ""}`}
              onClick={() => setIssueFilter(issueFilter === "warnings" ? "all" : "warnings")}
              title="Click to filter grid to rows with warnings"
            >
              <FactItem label="Warnings" value={String(issueSummary.warnings)} tone={issueSummary.warnings > 0 ? "warning" : "neutral"} />
            </button>
          </FactStrip>
          <div className="workspace-document">
            <div className={`workspace-grid${activeTab === "Issues" ? " workspace-grid--single" : ""}`}>
              <div className="workspace-primary">
                <nav className="tabs workspace-tablist" aria-label="Dimension workspace tabs">
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
                <div className="workspace-main">
                  {activeTab === "Overview" && (
                    <>
                      <MetadataEditor projectId={projectId} dimension={dimension} onSaved={onRefresh} />
                      <DimensionLifecyclePanel
                        projectId={projectId}
                        dimension={dimension}
                        appConfig={appConfig}
                        onDeleted={onDimensionDeleted}
                        onRecreated={onDimensionRecreated}
                      />
                    </>
                  )}
                  {activeTab === "Members" && <EditableGrid projectId={projectId} kind="members" dimension={dimension} pageSize={appConfig.ui.gridPageSize} highlightedEntityId={highlightedEntityId} issueFilteredIds={filteredEntityIds} issues={dimensionIssues} />}
                  {activeTab === "Relationships" && <EditableGrid projectId={projectId} kind="relationships" dimension={dimension} pageSize={appConfig.ui.gridPageSize} highlightedEntityId={highlightedEntityId} issueFilteredIds={filteredEntityIds} issues={dimensionIssues} />}
                  {activeTab === "Hierarchy" && <HierarchyTree projectId={projectId} dimension={dimension} />}
                  {activeTab === "Varying" && <VaryingPropertiesPanel projectId={projectId} dimension={dimension} />}
                  {activeTab === "Property Defaults" && (
                    <PropertyDefaultsPanel projectId={projectId} dimension={dimension} />
                  )}
                  {activeTab === "Bulk Update" && <BulkUpdatePanel projectId={projectId} dimension={dimension} onApplied={onRefresh} />}
                  {activeTab === "Compare" && (
                    <MetadataDiffPanel
                      projectId={projectId}
                      hasBlockingIssues={projectIssueSummary.blocksExport}
                    />
                  )}
                  {activeTab === "Change Sets" && (
                    <ChangeSetsPanel
                      projectId={projectId}
                      hasBlockingIssues={projectIssueSummary.blocksExport}
                    />
                  )}
                  {activeTab === "Workflows" && (
                    <WorkflowPanel projectId={projectId} />
                  )}
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
                  {activeTab === "Issues" && <IssuePanel dimension={dimension} issues={dimensionIssues} appConfig={appConfig} expanded onIssueClick={handleIssueClick} />}
                </div>
              </div>
              {activeTab !== "Issues" && (
                <IssuePanel dimension={dimension} issues={dimensionIssues} appConfig={appConfig} onIssueClick={handleIssueClick} />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
