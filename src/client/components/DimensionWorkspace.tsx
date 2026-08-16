import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database } from "lucide-react";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import {
  getDimensionDisplayLabel,
  getDimensionDisplaySubtitle,
} from "../../shared/dimensionDisplay";
import type { DimensionRecord, ValidationIssue } from "../../shared/types";
import {
  buildDimensionFacts,
  buildIssueSummary,
  getReadinessLabel,
  getWorkspaceTabs,
  type ExportAvailability,
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
import { ErrorBoundary } from "./ErrorBoundary";
import { WorkflowPanel } from "./WorkflowPanel";
import { PropertyDefaultsPanel } from "./PropertyDefaultsPanel";
import { XmlPreview } from "./XmlPreview";
import { getDimensionSchema } from "../../shared/dimensionSchemas";
import { patchMember, patchRelationship } from "../api/client";
import { FormulaEditorModal } from "./FormulaEditorModal";

type WorkspaceTab =
  | "Overview"
  | "Members"
  | "Relationships"
  | "Hierarchy"
  | "Varying"
  | "Property Defaults"
  | "Bulk Update"
  | "Compare"
  | "Change Sets"
  | "Workflows"
  | "XML"
  | "Issues";

function getFallbackTab(
  defaultWorkspaceTab: string,
  xmlPreviewEnabled: boolean,
): WorkspaceTab {
  const availableTabs = getWorkspaceTabs(xmlPreviewEnabled).map(
    (item) => item.label,
  );
  return availableTabs.includes(defaultWorkspaceTab as WorkspaceTab)
    ? (defaultWorkspaceTab as WorkspaceTab)
    : "Overview";
}

export function DimensionWorkspace({
  projectId,
  dimension,
  issues,
  onRefresh,
  onDimensionDeleted,
  onDimensionRecreated,
  appConfig,
  exportAvailability,
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
  const xmlPreviewEnabled =
    appConfig.features.enableXmlPreview && appConfig.export.xml.enabled;
  const defaultWorkspaceTab = appConfig.ui.defaultWorkspaceTab;
  const [tab, setTab] = useState<WorkspaceTab>(() =>
    getFallbackTab(defaultWorkspaceTab, xmlPreviewEnabled),
  );
  const [highlightedEntityId, setHighlightedEntityId] = useState<string | null>(
    null,
  );
  const [issueFilter, setIssueFilter] = useState<"all" | "errors" | "warnings">(
    "all",
  );
  const [relationshipRefreshSignal, setRelationshipRefreshSignal] = useState(0);
  const dimensionIssues = issues.filter(
    (issue) => issue.dimensionId === dimension.id,
  );
  const issueSummary = buildIssueSummary(
    dimensionIssues,
    appConfig.validation.exportBlockedBySeverities,
  );
  const projectIssueSummary = buildIssueSummary(
    issues,
    appConfig.validation.exportBlockedBySeverities,
  );
  const readinessLabel = getReadinessLabel(issueSummary);
  const facts = buildDimensionFacts(dimension, issueSummary);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);

  const [treeWidth, setTreeWidth] = useState<number>(() => {
    const saved = localStorage.getItem("dimbuilder_hierarchy_tree_width");
    const parsed = saved ? parseInt(saved, 10) : 310;
    return isNaN(parsed) || parsed < 180 ? 310 : parsed;
  });
  const [inspectorWidth, setInspectorWidth] = useState<number>(() => {
    const saved = localStorage.getItem("dimbuilder_inspector_width");
    const parsed = saved ? parseInt(saved, 10) : 360;
    return isNaN(parsed) || parsed < 240 ? 360 : parsed;
  });
  const [isDraggingTree, setIsDraggingTree] = useState(false);
  const [isDraggingInspector, setIsDraggingInspector] = useState(false);

  const handleTreeResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingTree(true);
    const startX = e.clientX;
    const startWidth = treeWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(180, Math.min(650, startWidth + deltaX));
      setTreeWidth(newWidth);
      localStorage.setItem("dimbuilder_hierarchy_tree_width", String(newWidth));
    };

    const onMouseUp = () => {
      setIsDraggingTree(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleInspectorResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingInspector(true);
    const startX = e.clientX;
    const startWidth = inspectorWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.max(220, Math.min(700, startWidth + deltaX));
      setInspectorWidth(newWidth);
      localStorage.setItem("dimbuilder_inspector_width", String(newWidth));
    };

    const onMouseUp = () => {
      setIsDraggingInspector(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  useEffect(() => {
    setSelectedMember(null);
  }, [tab, dimension.id]);

  const filteredEntityIds = useMemo(() => {
    if (issueFilter === "all") return null;
    const targetSeverity = issueFilter === "errors" ? "error" : "warning";
    return new Set(
      dimensionIssues
        .filter((i) => i.severity === targetSeverity)
        .map((i) => i.entityId),
    );
  }, [dimensionIssues, issueFilter]);
  const availableTabs = getWorkspaceTabs(xmlPreviewEnabled).map(
    (item) => item.label,
  );
  const activeTab = availableTabs.includes(tab)
    ? tab
    : getFallbackTab(defaultWorkspaceTab, xmlPreviewEnabled);
  const dimensionDisplayConfig = appConfig.dimensions.display;

  useEffect(() => {
    if (tab === activeTab) return;
    setTab(activeTab);
  }, [activeTab, tab]);

  function handleIssueClick(issue: ValidationIssue) {
    const targetTab: WorkspaceTab =
      issue.entityType === "relationship" ? "Relationships" : "Members";
    setTab(targetTab);
    setHighlightedEntityId(issue.entityId);
  }

  function handleRelationshipChanged() {
    setRelationshipRefreshSignal((current) => current + 1);
    onRefresh();
  }

  useEffect(() => {
    setIssueFilter("all");
  }, [dimension.id]);

  return (
    <section className="workspace" style={{ width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <div className="workspace-page" style={{ width: "100%", maxWidth: "100%", minWidth: 0, display: "flex", gap: "16px", boxSizing: "border-box" }}>
        <span className="workspace-page-icon" aria-hidden="true">
          <Database size={24} />
        </span>
        <div className="workspace-page-body" style={{ width: "100%", maxWidth: "100%", minWidth: 0, flex: "1 1 0%", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
          <div className="workspace-header">
            <div className="workspace-title-block">
              <h1>
                {getDimensionDisplayLabel(dimension, dimensionDisplayConfig)}
              </h1>
              <small>
                {getDimensionDisplaySubtitle(dimension, dimensionDisplayConfig)}
              </small>
            </div>
            <div className="workspace-health">
              <StatusBadge
                tone={
                  issueSummary.blocksExport
                    ? "danger"
                    : issueSummary.total
                      ? "warning"
                      : "success"
                }
              >
                {issueSummary.blocksExport ? (
                  <AlertTriangle size={14} />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                {readinessLabel}
              </StatusBadge>
            </div>
          </div>
          <FactStrip className="workspace-facts">
            {facts
              .filter((f) => f.label !== "Errors" && f.label !== "Warnings")
              .map((fact) => (
                <FactItem
                  key={fact.label}
                  label={fact.label}
                  value={fact.value}
                  tone={fact.tone ?? "neutral"}
                />
              ))}
            <button
              className={`fact-button ${issueFilter === "errors" ? "active" : ""}`}
              onClick={() =>
                setIssueFilter(issueFilter === "errors" ? "all" : "errors")
              }
              title="Click to filter grid to rows with errors"
            >
              <FactItem
                label="Errors"
                value={String(issueSummary.errors)}
                tone={issueSummary.errors > 0 ? "danger" : "neutral"}
              />
            </button>
            <button
              className={`fact-button ${issueFilter === "warnings" ? "active" : ""}`}
              onClick={() =>
                setIssueFilter(issueFilter === "warnings" ? "all" : "warnings")
              }
              title="Click to filter grid to rows with warnings"
            >
              <FactItem
                label="Warnings"
                value={String(issueSummary.warnings)}
                tone={issueSummary.warnings > 0 ? "warning" : "neutral"}
              />
            </button>
          </FactStrip>
          <div className="workspace-document" style={{ width: "100%", maxWidth: "100%", minWidth: 0, flex: "1 1 0%", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
            <nav
              className="tabs workspace-tablist"
              aria-label="Dimension workspace tabs"
              style={{ width: "100%", maxWidth: "100%", display: "flex", justifyContent: "space-evenly", boxSizing: "border-box" }}
            >
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
            <div
              className={`workspace-grid${activeTab === "Issues" ? " workspace-grid--single" : ""}`}
              style={{ width: "100%", maxWidth: "100%", minWidth: 0, flex: "1 1 0%", display: "flex", boxSizing: "border-box" }}
            >
              <div className="workspace-primary" style={{ width: "100%", maxWidth: "100%", minWidth: 0, flex: "1 1 0%", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
                <div className="workspace-main" style={{ width: "100%", maxWidth: "100%", minWidth: 0, flex: "1 1 0%", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
                  {activeTab === "Overview" && (
                    <>
                      <MetadataEditor
                        projectId={projectId}
                        dimension={dimension}
                        onSaved={onRefresh}
                      />
                      <DimensionLifecyclePanel
                        projectId={projectId}
                        dimension={dimension}
                        appConfig={appConfig}
                        onDeleted={onDimensionDeleted}
                        onRecreated={onDimensionRecreated}
                      />
                    </>
                  )}
                  {activeTab === "Members" && (
                    <div className="unified-members-workbench" style={{ width: "100%", maxWidth: "100%", minWidth: 0, flex: "1 1 0%", display: "flex", gap: "12px", alignItems: "stretch", height: "calc(100vh - 210px)", minHeight: "560px", boxSizing: "border-box" }}>
                      <div className="members-tree-pane" style={{ flex: `0 0 ${treeWidth}px`, width: `${treeWidth}px` }}>
                        <div className="members-tree-pane-header">
                          <span>Hierarchy Tree</span>
                        </div>
                        <div className="members-tree-pane-content">
                          <HierarchyTree
                            projectId={projectId}
                            dimension={dimension}
                            onRelationshipChanged={() => {
                              handleRelationshipChanged();
                              setRelationshipRefreshSignal((s) => s + 1);
                            }}
                            refreshSignal={relationshipRefreshSignal}
                            onNodeClick={(memberKey) => {
                              setHighlightedEntityId(memberKey);
                            }}
                          />
                        </div>
                      </div>
                      <div
                        className={`panel-resizer-handle ${isDraggingTree ? "dragging" : ""}`}
                        onMouseDown={handleTreeResizeStart}
                        onDoubleClick={() => setTreeWidth(310)}
                        title="Drag left/right to resize Hierarchy Tree panel (Double-click to reset width)"
                      />
                      <div className="members-grid-pane" style={{ flex: "1 1 0%", minWidth: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
                        <EditableGrid
                          projectId={projectId}
                          kind="members"
                          dimension={dimension}
                          pageSize={appConfig.ui.gridPageSize}
                          highlightedEntityId={highlightedEntityId}
                          issueFilteredIds={filteredEntityIds}
                          issues={dimensionIssues}
                          refreshSignal={relationshipRefreshSignal}
                          selectedRow={selectedMember}
                          onRefresh={onRefresh}
                          onSelectRow={setSelectedMember}
                        />
                      </div>
                      <div
                        className={`panel-resizer-handle ${isDraggingInspector ? "dragging" : ""}`}
                        onMouseDown={handleInspectorResizeStart}
                        onDoubleClick={() => setInspectorWidth(360)}
                        title="Drag left/right to resize right panel (Double-click to reset width)"
                      />
                      <div className="members-workbench-right-rail" style={{ flex: `0 0 ${inspectorWidth}px`, width: `${inspectorWidth}px`, minWidth: "240px", maxWidth: "800px" }}>
                        {selectedMember ? (
                          <InspectorRail
                            selectedMember={selectedMember}
                            dimension={dimension}
                            width={inspectorWidth}
                            projectId={projectId}
                            onMemberUpdated={(updated) => {
                              setSelectedMember(updated);
                              onRefresh();
                            }}
                          />
                        ) : (
                          <IssuePanel
                            dimension={dimension}
                            issues={dimensionIssues}
                            appConfig={appConfig}
                            onIssueClick={handleIssueClick}
                          />
                        )}
                      </div>
                    </div>
                  )}
                  {activeTab === "Varying" && (
                    <ErrorBoundary fallbackTitle="Error displaying Varying Properties">
                      <VaryingPropertiesPanel
                        projectId={projectId}
                        dimension={dimension}
                        refreshSignal={relationshipRefreshSignal}
                      />
                    </ErrorBoundary>
                  )}
                  {activeTab === "Property Defaults" && (
                    <PropertyDefaultsPanel
                      projectId={projectId}
                      dimension={dimension}
                    />
                  )}
                  {activeTab === "Bulk Update" && (
                    <BulkUpdatePanel
                      projectId={projectId}
                      dimension={dimension}
                      onApplied={onRefresh}
                    />
                  )}
                  {activeTab === "Compare" && (
                    <MetadataDiffPanel
                      projectId={projectId}
                      dimension={dimension}
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
                      allowAllDimensions={
                        appConfig.ui.xmlPreview.allowAllDimensions
                      }
                      xmlExportEnabled={appConfig.export.xml.enabled}
                      exportAvailability={exportAvailability}
                      dimensionIssues={dimensionIssues}
                    />
                  )}
                  {activeTab === "Issues" && (
                    <IssuePanel
                      dimension={dimension}
                      issues={dimensionIssues}
                      appConfig={appConfig}
                      expanded
                      onIssueClick={handleIssueClick}
                    />
                  )}
                </div>
              </div>
              {activeTab !== "Issues" && activeTab !== "Members" && (
                <aside className="static-readiness-rail">
                  <IssuePanel
                    dimension={dimension}
                    issues={dimensionIssues}
                    appConfig={appConfig}
                    onIssueClick={handleIssueClick}
                  />
                </aside>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function getScenarioPropertyValue(selectedMember: any, propName: string, defaultValue: string = ""): string {
  if (!selectedMember) return defaultValue;
  const props = selectedMember.properties ?? {};

  if (props[propName] !== undefined && props[propName] !== null && String(props[propName]).trim() !== "") {
    return String(props[propName]);
  }
  if (selectedMember[propName] !== undefined && selectedMember[propName] !== null && String(selectedMember[propName]).trim() !== "") {
    return String(selectedMember[propName]);
  }

  const aliasMap: Record<string, string[]> = {
    "Name": ["memberKey", "childKey", "Entity", "Scenario", "Member"],
    "Default Description": ["Description", "description"],
    "English (United States)": ["Description_En", "description_en", "English Description"],
    "Read Data Group": ["Read Group", "ReadGroup"],
    "Read and Write Data Group": ["Read Write Data Group", "Read Write Group", "ReadWriteDataGroup"],
    "Calculate From Grids Group": ["Calculate from Grids Group", "CalculateFromGridsGroup"],
    "Manage Data Group": ["Manage Group", "ManageDataGroup"],
    "Force Consolidate/Translate/Calculate Group": ["Force Consolidate Group", "ForceConsolidateGroup"],
    "Number Of No Input Periods Per Workflow Unit": ["# of No Input Periods", "Number of No Input Periods", "No Input Periods"],
    "Input Frequency (Vary By Year)": ["Input Frequency", "InputFrequency"],
    "Use Input Frequency Data In Lower Frequencies": ["Use Input Frequency In Lower Frequencies"],
    "Retain Next Period Data Using Default View": ["Retain Next Period Data Using DefaultView"],
    "Input View For Adjustments": ["Input View For Adj", "Input View For Adjustment"],
    "Use Input View For Adj In Calculations": ["Use Input View For Adj In Calcs"],
    "No Data Zero View For Adjustments": ["No Data Zero View For Adj"],
    "No Data Zero View For NonAdjustments": ["No Data Zero View For Non Adj", "No Data Zero View For Non-Adj"],
    "Formula For Calculation Drill Down": ["Formula For Calc Drill Down"],
    "Use Two Pass Elimination": ["Use Two Pass Eliminations"],
    "Allow Input Into the Aggregated Consolidation Member": ["Allow Input Into Aggregated Consolidation Member"],
    "Rate Type For Revenues And Expenses": ["FX Rate Type Revenue Expense", "Rate Type For Revenue And Expense"],
    "Rule Type For Revenues And Expenses": ["FX Rule Type Revenue Expense", "Rule Type For Revenue And Expense"],
    "Rate Type For Assets And Liabilities": ["FX Rate Type Asset Liability", "Rate Type For Asset And Liability"],
    "Rule Type For Assets And Liabilities": ["FX Rule Type Asset Liability", "Rule Type For Asset And Liability"],
    "Constant Year For FX Rates": ["FX Rates Constant Year"],
    "Source Scenario Or Workspace Assembly": ["Source Scenario or Workspace Assembly"],
    "Pre-aggregated Members": ["Preaggregated Members", "Pre-Aggregated Members"],
    "Text 1": ["Text1"],
    "Text 2": ["Text2"],
    "Text 3": ["Text3"],
    "Text 4": ["Text4"],
    "Text 5": ["Text5"],
    "Text 6": ["Text6"],
    "Text 7": ["Text7"],
    "Text 8": ["Text8"],
  };

  const aliases = aliasMap[propName] ?? [];
  for (const alias of aliases) {
    if (props[alias] !== undefined && props[alias] !== null && String(props[alias]).trim() !== "") {
      return String(props[alias]);
    }
    if (selectedMember[alias] !== undefined && selectedMember[alias] !== null && String(selectedMember[alias]).trim() !== "") {
      return String(selectedMember[alias]);
    }
  }

  return defaultValue;
}

function getEntityPropertyValue(selectedMember: any, propName: string, defaultValue: string = ""): string {
  if (!selectedMember) return defaultValue;
  const props = selectedMember.properties ?? {};

  if (props[propName] !== undefined && props[propName] !== null && String(props[propName]).trim() !== "") {
    return String(props[propName]);
  }
  if (selectedMember[propName] !== undefined && selectedMember[propName] !== null && String(selectedMember[propName]).trim() !== "") {
    return String(selectedMember[propName]);
  }

  const aliasMap: Record<string, string[]> = {
    "Name": ["memberKey", "childKey", "Entity", "Scenario", "Member"],
    "Default Description": ["Description", "description", "Default Description"],
    "English (United States)": ["Description_En", "description_en", "English Description", "English (United States)"],
    "Display Member Group": ["Display Group", "Display Member Group"],
    "Read Data Group": ["Read Group", "Read Data Group"],
    "Read Data Group 2": ["Read Group2", "Read Data Group 2"],
    "Read and Write Data Group": ["Read Write Group", "Read and Write Data Group"],
    "Read and Write Data Group 2": ["Read Write Group2", "Read and Write Data Group 2"],
    "Cube Data Management Access Categories": ["Cube Data Mgmt Access Categories", "Cube Data Management Access Categories"],
    "Is Consolidated": ["IsConsolidated", "Is Consolidated"],
    "Is IC Entity": ["Is IC", "Is IC Entity", "IsIC"],
    "UD8 Default": ["UD8 Default", "UD8 Constraint"],
    "Sibling Consolidation Pass": ["Sibling Consol Pass", "Sibling Consolidation Pass"],
    "Sibling Repeat Calculation Pass": ["Sibling Repeat Calc Pass", "Sibling Repeat Calculation Pass"],
    "Auto Translation Currencies": ["Auto Translate Currencies", "Auto Translation Currencies"],
    "In Use": ["In Use", "InUse"],
    "Allow Adjustments": ["Allow Adj", "Allow Adjustments"],
    "Allow Adjustments From Children": ["Allow Adj From Child", "Allow Adjustments From Children"],
    "Text 1": ["Text1"],
    "Text 2": ["Text2"],
    "Text 3": ["Text3"],
    "Text 4": ["Text4"],
    "Text 5": ["Text5"],
    "Text 6": ["Text6"],
    "Text 7": ["Text7"],
    "Text 8": ["Text8"],
  };

  const aliases = aliasMap[propName] ?? [];
  for (const alias of aliases) {
    if (props[alias] !== undefined && props[alias] !== null && String(props[alias]).trim() !== "") {
      return String(props[alias]);
    }
    if (selectedMember[alias] !== undefined && selectedMember[alias] !== null && String(selectedMember[alias]).trim() !== "") {
      return String(selectedMember[alias]);
    }
  }

  return defaultValue;
}

function getAccountPropertyValue(selectedMember: any, propName: string, defaultValue: string = ""): string {
  if (!selectedMember) return defaultValue;
  const props = selectedMember.properties ?? {};

  if (props[propName] !== undefined && props[propName] !== null && String(props[propName]).trim() !== "") {
    return String(props[propName]);
  }
  if (selectedMember[propName] !== undefined && selectedMember[propName] !== null && String(selectedMember[propName]).trim() !== "") {
    return String(selectedMember[propName]);
  }

  const aliasMap: Record<string, string[]> = {
    "Name": ["memberKey", "childKey", "Account", "Name", "Member"],
    "Default Description": ["Description", "description", "Default Description"],
    "English (United States)": ["Description_En", "description_en", "English Description", "English (United States)"],
    "Display Member Group": ["Display Group", "Display Member Group"],
    "Is Consolidated": ["IsConsolidated", "Is Consolidated"],
    "Is IC Account": ["Is IC", "Is IC Account", "IsIC"],
    "Use Alternate Input Currency In Flow": ["Use Alt Input Cur In Flow", "Use Alternate Input Currency In Flow"],
    "Input View For Adjustments": ["Input View For Adj", "Input View For Adjustments"],
    "No Data Zero View For Adjustments": ["No Data Zero View For Adj", "No Data Zero View For Adjustments"],
    "No Data Zero View For NonAdjustments": ["No Data Zero View For Non-Adj", "No Data Zero View For NonAdjustments"],
    "Used On Entity Dimension": ["Used On Entity Dim", "Used On Entity Dimension"],
    "Used On Consolidation Dimension": ["Used On Cons Dim", "Used On Consolidation Dimension"],
    "Enable Flow Aggregation": ["Flow Aggregation", "Enable Flow Aggregation"],
    "Enable Origin Aggregation": ["Origin Aggregation", "Enable Origin Aggregation"],
    "Enable IC Aggregation": ["IC Aggregation", "Enable IC Aggregation"],
    "Enable UD1 Aggregation": ["UD1 Aggregation", "Enable UD1 Aggregation"],
    "Enable UD2 Aggregation": ["UD2 Aggregation", "Enable UD2 Aggregation"],
    "Enable UD3 Aggregation": ["UD3 Aggregation", "Enable UD3 Aggregation"],
    "Enable UD4 Aggregation": ["UD4 Aggregation", "Enable UD4 Aggregation"],
    "Enable UD5 Aggregation": ["UD5 Aggregation", "Enable UD5 Aggregation"],
    "Enable UD6 Aggregation": ["UD6 Aggregation", "Enable UD6 Aggregation"],
    "Enable UD7 Aggregation": ["UD7 Aggregation", "Enable UD7 Aggregation"],
    "Enable UD8 Aggregation": ["UD8 Aggregation", "Enable UD8 Aggregation"],
    "In Use": ["In Use", "InUse"],
    "Formula For Calculation Drill Down": ["Formula For Calc Drill Down", "Formula For Calculation Drill Down"],
    "Text 1": ["Text1"],
    "Text 2": ["Text2"],
    "Text 3": ["Text3"],
    "Text 4": ["Text4"],
    "Text 5": ["Text5"],
    "Text 6": ["Text6"],
    "Text 7": ["Text7"],
    "Text 8": ["Text8"],
  };

  const aliases = aliasMap[propName] ?? [];
  for (const alias of aliases) {
    if (props[alias] !== undefined && props[alias] !== null && String(props[alias]).trim() !== "") {
      return String(props[alias]);
    }
    if (selectedMember[alias] !== undefined && selectedMember[alias] !== null && String(selectedMember[alias]).trim() !== "") {
      return String(selectedMember[alias]);
    }
  }

  return defaultValue;
}

function getFlowPropertyValue(selectedMember: any, propName: string, defaultValue: string = ""): string {
  if (!selectedMember) return defaultValue;
  const props = selectedMember.properties ?? {};

  if (props[propName] !== undefined && props[propName] !== null && String(props[propName]).trim() !== "") {
    return String(props[propName]);
  }
  if (selectedMember[propName] !== undefined && selectedMember[propName] !== null && String(selectedMember[propName]).trim() !== "") {
    return String(selectedMember[propName]);
  }

  const aliasMap: Record<string, string[]> = {
    "Name": ["memberKey", "childKey", "Flow Member", "Name", "Member"],
    "Default Description": ["Description", "description", "Default Description"],
    "English (United States)": ["Description_En", "description_en", "English Description", "English (United States)"],
    "Display Member Group": ["Display Group", "Display Member Group"],
    "Is Consolidated": ["IsConsolidated", "Is Consolidated"],
    "Switch Sign": ["Switch Sign", "SwitchSign"],
    "Switch Type": ["Switch Type", "SwitchType"],
    "Flow Processing Type": ["Flow Processing Type", "FlowProcessingType"],
    "Alternate Input Currency": ["Alternate Input Currency", "AlternateInputCurrency"],
    "Source Member For Alternate Input Currency": ["Source Member For Alternate Input Currency", "SourceMemberForAlternateInputCurrency", "Source Member For Alternanate Input Currency"],
    "In Use": ["In Use", "InUse"],
    "Formula For Calculation Drill Down": ["Formula For Calc Drill Down", "Formula For Calculation Drill Down"],
    "Text 1": ["Text1"],
    "Text 2": ["Text2"],
    "Text 3": ["Text3"],
    "Text 4": ["Text4"],
    "Text 5": ["Text5"],
    "Text 6": ["Text6"],
    "Text 7": ["Text7"],
    "Text 8": ["Text8"],
  };

  const aliases = aliasMap[propName] ?? [];
  for (const alias of aliases) {
    if (props[alias] !== undefined && props[alias] !== null && String(props[alias]).trim() !== "") {
      return String(props[alias]);
    }
    if (selectedMember[alias] !== undefined && selectedMember[alias] !== null && String(selectedMember[alias]).trim() !== "") {
      return String(selectedMember[alias]);
    }
  }

  return defaultValue;
}

function getUdPropertyValue(selectedMember: any, propName: string, defaultValue: string = ""): string {
  if (!selectedMember) return defaultValue;
  const props = selectedMember.properties ?? {};

  if (props[propName] !== undefined && props[propName] !== null && String(props[propName]).trim() !== "") {
    return String(props[propName]);
  }
  if (selectedMember[propName] !== undefined && selectedMember[propName] !== null && String(selectedMember[propName]).trim() !== "") {
    return String(selectedMember[propName]);
  }

  const aliasMap: Record<string, string[]> = {
    "Name": ["memberKey", "childKey", "Member", "Name"],
    "Default Description": ["Description", "description", "Default Description"],
    "English (United States)": ["Description_En", "description_en", "English Description", "English (United States)"],
    "Display Member Group": ["Display Group", "Display Member Group"],
    "Is Consolidated": ["IsConsolidated", "Is Consolidated"],
    "Allow Input": ["Allow Input", "AllowInput"],
    "Is Attribute Member": ["Is Attribute Member", "IsAttributeMember"],
    "In Use": ["In Use", "InUse"],
    "Formula For Calculation Drill Down": ["Formula For Calc Drill Down", "Formula For Calculation Drill Down"],
    "Text 1": ["Text1"],
    "Text 2": ["Text2"],
    "Text 3": ["Text3"],
    "Text 4": ["Text4"],
    "Text 5": ["Text5"],
    "Text 6": ["Text6"],
    "Text 7": ["Text7"],
    "Text 8": ["Text8"],
  };

  const aliases = aliasMap[propName] ?? [];
  for (const alias of aliases) {
    if (props[alias] !== undefined && props[alias] !== null && String(props[alias]).trim() !== "") {
      return String(props[alias]);
    }
    if (selectedMember[alias] !== undefined && selectedMember[alias] !== null && String(selectedMember[alias]).trim() !== "") {
      return String(selectedMember[alias]);
    }
  }

  return defaultValue;
}

function EditablePropertyInput({
  propName,
  value,
  isBoolean = false,
  isNumber = false,
  isFormula = false,
  isReadOnly = false,
  onOpenFormulaEditor,
  onSave,
}: {
  propName: string;
  value: string;
  isBoolean?: boolean;
  isNumber?: boolean;
  isFormula?: boolean;
  isReadOnly?: boolean;
  onOpenFormulaEditor?: () => void;
  onSave: (val: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (nextVal: string) => {
    if (nextVal !== value) {
      onSave(nextVal);
    }
  };

  if (isReadOnly) {
    return (
      <span style={{ color: value ? "var(--text)" : "var(--muted)", fontStyle: value ? "normal" : "italic", fontSize: "12px" }}>
        {value || "(empty)"}
      </span>
    );
  }

  if (isBoolean) {
    return (
      <select
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
        style={{
          width: "100%",
          padding: "3px 6px",
          fontSize: "12px",
          border: "1px solid var(--border)",
          borderRadius: "3px",
          background: "var(--surface)",
          color: "var(--text)",
          outline: "none",
        }}
      >
        <option value="">(empty)</option>
        <option value="True">True</option>
        <option value="False">False</option>
      </select>
    );
  }

  if (isFormula || onOpenFormulaEditor) {
    return (
      <div style={{ display: "flex", gap: "2px", alignItems: "center", width: "100%" }}>
        <input
          type="text"
          value={draft}
          placeholder="(empty)"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit(e.currentTarget.value);
              e.currentTarget.blur();
            }
          }}
          style={{
            flex: 1,
            padding: "3px 6px",
            fontSize: "12px",
            border: "1px solid var(--border)",
            borderRadius: "3px 0 0 3px",
            background: "var(--surface)",
            color: "var(--text)",
            boxSizing: "border-box",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={onOpenFormulaEditor}
          title="Open OneStream Formula Editor"
          style={{
            padding: "3px 7px",
            fontSize: "12px",
            fontWeight: 700,
            border: "1px solid var(--border)",
            borderLeft: "none",
            borderRadius: "0 3px 3px 0",
            background: "var(--surface-subtle)",
            color: "var(--text)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            userSelect: "none",
          }}
        >
          ...
        </button>
      </div>
    );
  }

  return (
    <input
      type={isNumber ? "number" : "text"}
      value={draft}
      placeholder="(empty)"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit(e.currentTarget.value);
          e.currentTarget.blur();
        }
      }}
      style={{
        width: "100%",
        padding: "3px 6px",
        fontSize: "12px",
        border: "1px solid var(--border)",
        borderRadius: "3px",
        background: "var(--surface)",
        color: "var(--text)",
        boxSizing: "border-box",
        outline: "none",
      }}
    />
  );
}

function InspectorRail({
  selectedMember,
  dimension,
  width = 340,
  projectId,
  onMemberUpdated,
}: {
  selectedMember: any;
  dimension: DimensionRecord;
  width?: number;
  projectId?: string;
  onMemberUpdated?: (updated: any) => void;
}) {
  const [activeInspectorTab, setActiveInspectorTab] = useState<"member" | "relationship">("member");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [formulaModalState, setFormulaModalState] = useState<{
    isOpen: boolean;
    propName: string;
    value: string;
  }>({
    isOpen: false,
    propName: "Formula",
    value: "",
  });

  const toggleSection = (sectionName: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionName]: !prev[sectionName],
    }));
  };

  const dimType = dimension.dimensionType || "Entity";
  const dimName = dimension.dimensionName || "Dimension";
  const parentKey = selectedMember?.Parent || selectedMember?.parentKey || "Root";
  const memberKey = selectedMember?.memberKey || selectedMember?.childKey || selectedMember?.Name || "Member";

  const saveMemberProp = async (propName: string, nextValue: string) => {
    if (!selectedMember) return;
    setSaveStatus("saving");

    try {
      const currentProps = { ...(selectedMember.properties ?? {}) };
      let newMemberKey = selectedMember.memberKey || selectedMember.Name || selectedMember.Entity || selectedMember.Account || "Member";
      let newDescription = selectedMember.description;

      const schema = getDimensionSchema(dimension.dimensionType);

      if (propName === schema.memberKeyField || propName === "Name" || propName === "Member" || propName === "Entity" || propName === "Account") {
        newMemberKey = nextValue;
      }

      if (propName === "Description" || propName === "description" || propName === "Default Description") {
        newDescription = nextValue;
        currentProps["Default Description"] = nextValue;
        currentProps["Description"] = nextValue;
      } else {
        currentProps[propName] = nextValue;
      }

      const updatedRecord = {
        ...selectedMember,
        memberKey: newMemberKey,
        description: newDescription,
        properties: currentProps,
      };

      if (projectId && selectedMember.id) {
        await patchMember(projectId, selectedMember.id, {
          memberKey: newMemberKey,
          properties: currentProps,
        });
      }

      setSaveStatus("saved");
      onMemberUpdated?.(updatedRecord);
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Failed to save member property", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const saveRelProp = async (propName: string, nextValue: string) => {
    if (!selectedMember) return;
    setSaveStatus("saving");

    try {
      const currentProps = { ...(selectedMember.properties ?? {}) };
      let newParentKey = selectedMember.Parent || selectedMember.parentKey || "Root";
      let newChildKey = selectedMember.Child || selectedMember.childKey || selectedMember.memberKey || "Member";

      if (propName === "Parent" || propName === "parentKey" || propName === "Parent Member Name") {
        newParentKey = nextValue;
        currentProps["Parent"] = nextValue;
      } else if (propName === "Child" || propName === "childKey" || propName === "Member Name") {
        newChildKey = nextValue;
        currentProps["Child"] = nextValue;
      } else {
        currentProps[propName] = nextValue;
      }

      const updatedRecord = {
        ...selectedMember,
        parentKey: newParentKey,
        childKey: newChildKey,
        properties: currentProps,
      };

      if (projectId && selectedMember.id) {
        await patchRelationship(projectId, selectedMember.id, {
          parentKey: newParentKey,
          childKey: newChildKey,
          properties: currentProps,
        });
      }

      setSaveStatus("saved");
      onMemberUpdated?.(updatedRecord);
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Failed to save relationship property", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const renderScenarioMemberProperties = () => {
    const getVal = (propName: string, fallback: string = "") => {
      return getScenarioPropertyValue(selectedMember, propName, fallback);
    };

    const groups: {
      id: string;
      title: string;
      rows: { label: string; propName: string; value: string; isBoolean?: boolean; isNumber?: boolean; isReadOnly?: boolean }[];
    }[] = [
      {
        id: "scenario_general",
        title: "⊞ General",
        rows: [
          { label: "Dimension Type", propName: "Dimension Type", value: "Scenario Dimension Type", isReadOnly: true },
          { label: "Dimension", propName: "Dimension", value: `${dimName} Dimension`, isReadOnly: true },
          { label: "Member Dimension", propName: "Member Dimension", value: `${dimName} Dimension`, isReadOnly: true },
          { label: "Id", propName: "Id", value: selectedMember.id ? String(selectedMember.id).slice(0, 8) : "1", isReadOnly: true },
          { label: "Name", propName: "Entity", value: memberKey },
          { label: "Alias", propName: "Alias", value: getVal("Alias", "") },
        ],
      },
      {
        id: "scenario_descriptions",
        title: "⊞ Descriptions",
        rows: [
          { label: "Default Description", propName: "Default Description", value: selectedMember.description || getVal("Default Description", "") },
          { label: "English (United States)", propName: "English (United States)", value: getVal("English (United States)", "") },
        ],
      },
      {
        id: "scenario_security",
        title: "⊞ Security",
        rows: [
          { label: "Read Data Group", propName: "Read Data Group", value: getVal("Read Data Group", "Everyone") },
          { label: "Read and Write Data Group", propName: "Read and Write Data Group", value: getVal("Read and Write Data Group", "Everyone") },
          { label: "Calculate From Grids Group", propName: "Calculate From Grids Group", value: getVal("Calculate From Grids Group", "Everyone") },
          { label: "Manage Data Group", propName: "Manage Data Group", value: getVal("Manage Data Group", "Administrators") },
          { label: "Force Consolidate/Translate/Calculate Group", propName: "Force Consolidate/Translate/Calculate Group", value: getVal("Force Consolidate/Translate/Calculate Group", "Everyone") },
        ],
      },
      {
        id: "scenario_workflow",
        title: "⊞ Workflow",
        rows: [
          { label: "Use In Workflow", propName: "Use In Workflow", value: getVal("Use In Workflow", "True"), isBoolean: true },
          { label: "Workflow Tracking Frequency", propName: "Workflow Tracking Frequency", value: getVal("Workflow Tracking Frequency", "Monthly") },
          { label: "Workflow Time", propName: "Workflow Time", value: getVal("Workflow Time", "") },
          { label: "Workflow Start Time", propName: "Workflow Start Time", value: getVal("Workflow Start Time", "") },
          { label: "Workflow End Time", propName: "Workflow End Time", value: getVal("Workflow End Time", "") },
          { label: "Number Of No Input Periods Per Workflow Unit", propName: "Number Of No Input Periods Per Workflow Unit", value: getVal("Number Of No Input Periods Per Workflow Unit", "0"), isNumber: true },
        ],
      },
      {
        id: "scenario_settings",
        title: "⊞ Settings",
        rows: [
          { label: "Scenario Type", propName: "Scenario Type", value: getVal("Scenario Type", "Actual") },
          { label: "Input Frequency (Vary By Year)", propName: "Input Frequency (Vary By Year)", value: getVal("Input Frequency (Vary By Year)", "Monthly") },
          { label: "Use Input Frequency Data In Lower Frequencies", propName: "Use Input Frequency Data In Lower Frequencies", value: getVal("Use Input Frequency Data In Lower Frequencies", "False"), isBoolean: true },
          { label: "Default View", propName: "Default View", value: getVal("Default View", "YTD") },
          { label: "Retain Next Period Data Using Default View", propName: "Retain Next Period Data Using Default View", value: getVal("Retain Next Period Data Using Default View", "True"), isBoolean: true },
          { label: "Input View For Adjustments", propName: "Input View For Adjustments", value: getVal("Input View For Adjustments", "Periodic") },
          { label: "Use Input View For Adj In Calculations", propName: "Use Input View For Adj In Calculations", value: getVal("Use Input View For Adj In Calculations", "False"), isBoolean: true },
          { label: "No Data Zero View For Adjustments", propName: "No Data Zero View For Adjustments", value: getVal("No Data Zero View For Adjustments", "Periodic") },
          { label: "No Data Zero View For NonAdjustments", propName: "No Data Zero View For NonAdjustments", value: getVal("No Data Zero View For NonAdjustments", "YTD") },
          { label: "Consolidation View", propName: "Consolidation View", value: getVal("Consolidation View", "YTD") },
          { label: "Formula", propName: "Formula", value: getVal("Formula", "") },
          { label: "Formula For Calculation Drill Down", propName: "Formula For Calculation Drill Down", value: getVal("Formula For Calculation Drill Down", "") },
          { label: "Clear Calculated Data During Calc", propName: "Clear Calculated Data During Calc", value: getVal("Clear Calculated Data During Calc", "True"), isBoolean: true },
          { label: "Use Two Pass Elimination", propName: "Use Two Pass Elimination", value: getVal("Use Two Pass Elimination", "False"), isBoolean: true },
          { label: "Allow Input Into the Aggregated Consolidation Member", propName: "Allow Input Into the Aggregated Consolidation Member", value: getVal("Allow Input Into the Aggregated Consolidation Member", "False"), isBoolean: true },
        ],
      },
      {
        id: "scenario_fx_rates",
        title: "⊞ FX Rates",
        rows: [
          { label: "Use Cube FX Settings", propName: "Use Cube FX Settings", value: getVal("Use Cube FX Settings", "True"), isBoolean: true },
          { label: "Rate Type For Revenues And Expenses", propName: "Rate Type For Revenues And Expenses", value: getVal("Rate Type For Revenues And Expenses", "AverageRate") },
          { label: "Rule Type For Revenues And Expenses", propName: "Rule Type For Revenues And Expenses", value: getVal("Rule Type For Revenues And Expenses", "Periodic") },
          { label: "Rate Type For Assets And Liabilities", propName: "Rate Type For Assets And Liabilities", value: getVal("Rate Type For Assets And Liabilities", "ClosingRate") },
          { label: "Rule Type For Assets And Liabilities", propName: "Rule Type For Assets And Liabilities", value: getVal("Rule Type For Assets And Liabilities", "Direct") },
          { label: "Constant Year For FX Rates", propName: "Constant Year For FX Rates", value: getVal("Constant Year For FX Rates", "(Not Used)") },
        ],
      },
      {
        id: "scenario_dynamic_source",
        title: "⊞ Dynamic Source Data",
        rows: [
          { label: "Data Binding Type", propName: "Data Binding Type", value: getVal("Data Binding Type", "(Not Used)") },
          { label: "Source Scenario Or Workspace Assembly", propName: "Source Scenario Or Workspace Assembly", value: getVal("Source Scenario Or Workspace Assembly", "") },
          { label: "End Year", propName: "End Year", value: getVal("End Year", "") },
          { label: "Member Filters", propName: "Member Filters", value: getVal("Member Filters", "") },
          { label: "Member Filters To Exclude", propName: "Member Filters To Exclude", value: getVal("Member Filters To Exclude", "") },
          { label: "Pre-aggregated Members", propName: "Pre-aggregated Members", value: getVal("Pre-aggregated Members", "") },
          { label: "Options", propName: "Options", value: getVal("Options", "") },
        ],
      },
      {
        id: "scenario_custom_settings",
        title: "⊞ Custom Settings",
        rows: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
          label: `Text ${n}`,
          propName: `Text${n}`,
          value: getVal(`Text ${n}`, ""),
        })),
      },
    ];

    return (
      <div className="onestream-scenario-properties" style={{ fontSize: "12px" }}>
        {groups.map((group) => (
          <div key={group.id} className="rel-group" style={{ marginBottom: "8px" }}>
            <div
              onClick={() => toggleSection(group.id)}
              style={{
                background: "var(--surface-subtle)",
                padding: "5px 8px",
                fontWeight: 700,
                fontSize: "12px",
                border: "1px solid var(--border)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                userSelect: "none",
              }}
            >
              <span>{group.title}</span>
            </div>
            {!collapsedSections[group.id] && (
              <table
                className="data-table"
                style={{
                  width: "100%",
                  margin: 0,
                  border: "1px solid var(--border)",
                  borderTop: "none",
                  borderCollapse: "collapse",
                }}
              >
                <tbody>
                  {group.rows.map((r) => (
                    <tr key={r.label} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td
                        style={{
                          padding: "4px 8px",
                          fontWeight: 500,
                          color: "var(--text)",
                          width: "48%",
                        }}
                      >
                        {r.label}
                      </td>
                      <td
                        style={{
                          padding: "2px 6px",
                          width: "52%",
                        }}
                      >
                        <EditablePropertyInput
                          propName={r.propName}
                          value={r.value}
                          isBoolean={r.isBoolean}
                          isNumber={r.isNumber}
                          isReadOnly={r.isReadOnly}
                          isFormula={r.propName.toLowerCase().includes("formula") && r.propName !== "Formula Type"}
                          onOpenFormulaEditor={
                            r.propName.toLowerCase().includes("formula") && r.propName !== "Formula Type"
                              ? () => setFormulaModalState({ isOpen: true, propName: r.propName, value: r.value })
                              : undefined
                          }
                          onSave={(val) => saveMemberProp(r.propName, val)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderEntityMemberProperties = () => {
    const getVal = (propName: string, fallback: string = "") => {
      return getEntityPropertyValue(selectedMember, propName, fallback);
    };

    const groups: {
      id: string;
      title: string;
      rows: (
        | { type: "property"; label: string; propName: string; value: string; isBoolean?: boolean; isNumber?: boolean; isReadOnly?: boolean }
        | { type: "subhead"; label: string }
      )[];
    }[] = [
      {
        id: "entity_general",
        title: "⊞ General",
        rows: [
          { type: "property", label: "Dimension Type", propName: "Dimension Type", value: "Entity Dimension Type", isReadOnly: true },
          { type: "property", label: "Dimension", propName: "Dimension", value: `${dimName} Dimension`, isReadOnly: true },
          { type: "property", label: "Member Dimension", propName: "Member Dimension", value: `${dimName} Dimension`, isReadOnly: true },
          { type: "property", label: "Id", propName: "Id", value: selectedMember.id ? String(selectedMember.id).slice(0, 8) : "1", isReadOnly: true },
          { type: "property", label: "Name", propName: "Entity", value: memberKey },
          { type: "property", label: "Alias", propName: "Alias", value: getVal("Alias", "") },
        ],
      },
      {
        id: "entity_descriptions",
        title: "⊞ Descriptions",
        rows: [
          { type: "property", label: "Default Description", propName: "Default Description", value: selectedMember.description || getVal("Default Description", "") },
          { type: "property", label: "English (United States)", propName: "English (United States)", value: getVal("English (United States)", "") },
        ],
      },
      {
        id: "entity_security",
        title: "⊞ Security",
        rows: [
          { type: "property", label: "Display Member Group", propName: "Display Member Group", value: getVal("Display Member Group", "Everyone") },
          { type: "property", label: "Read Data Group", propName: "Read Data Group", value: getVal("Read Data Group", "Everyone") },
          { type: "property", label: "Read Data Group 2", propName: "Read Data Group 2", value: getVal("Read Data Group 2", "Nobody") },
          { type: "property", label: "Read and Write Data Group", propName: "Read and Write Data Group", value: getVal("Read and Write Data Group", "Everyone") },
          { type: "property", label: "Read and Write Data Group 2", propName: "Read and Write Data Group 2", value: getVal("Read and Write Data Group 2", "Nobody") },
          { type: "property", label: "Use Cube Data Access Security", propName: "Use Cube Data Access Security", value: getVal("Use Cube Data Access Security", "False"), isBoolean: true },
          { type: "property", label: "Cube Data Cell Access Categories", propName: "Cube Data Cell Access Categories", value: getVal("Cube Data Cell Access Categories", "") },
          { type: "property", label: "Cube Conditional Input Categories", propName: "Cube Conditional Input Categories", value: getVal("Cube Conditional Input Categories", "") },
          { type: "property", label: "Cube Data Management Access Categories", propName: "Cube Data Management Access Categories", value: getVal("Cube Data Management Access Categories", "") },
        ],
      },
      {
        id: "entity_settings",
        title: "⊞ Settings",
        rows: [
          { type: "property", label: "Currency", propName: "Currency", value: getVal("Currency", "USD") },
          { type: "property", label: "Is Consolidated", propName: "Is Consolidated", value: getVal("Is Consolidated", "True"), isBoolean: true },
          { type: "property", label: "Is IC Entity", propName: "Is IC Entity", value: getVal("Is IC Entity", "False"), isBoolean: true },
        ],
      },
      {
        id: "entity_vary_cube",
        title: "⊞ Vary By Cube Type",
        rows: [
          { type: "subhead", label: "Constraints" },
          { type: "property", label: "Flow Constraint", propName: "Flow Constraint", value: getVal("Flow Constraint", "Root") },
          { type: "property", label: "IC Constraint", propName: "IC Constraint", value: getVal("IC Constraint", "Top") },
          { type: "property", label: "IC Member Filter", propName: "IC Member Filter", value: getVal("IC Member Filter", "") },
          { type: "property", label: "UD1 Constraint", propName: "UD1 Constraint", value: getVal("UD1 Constraint", "Root") },
          { type: "property", label: "UD2 Constraint", propName: "UD2 Constraint", value: getVal("UD2 Constraint", "Root") },
          { type: "property", label: "UD3 Constraint", propName: "UD3 Constraint", value: getVal("UD3 Constraint", "Root") },
          { type: "property", label: "UD4 Constraint", propName: "UD4 Constraint", value: getVal("UD4 Constraint", "Root") },
          { type: "property", label: "UD5 Constraint", propName: "UD5 Constraint", value: getVal("UD5 Constraint", "Root") },
          { type: "property", label: "UD6 Constraint", propName: "UD6 Constraint", value: getVal("UD6 Constraint", "Root") },
          { type: "property", label: "UD7 Constraint", propName: "UD7 Constraint", value: getVal("UD7 Constraint", "Root") },
          { type: "property", label: "UD8 Default", propName: "UD8 Default", value: getVal("UD8 Default", "None") },
        ],
      },
      {
        id: "entity_vary_scenario",
        title: "⊞ Vary By Scenario Type",
        rows: [
          { type: "subhead", label: "Equity Pickup" },
          { type: "property", label: "Sibling Consolidation Pass", propName: "Sibling Consolidation Pass", value: getVal("Sibling Consolidation Pass", "(Use Default)") },
          { type: "property", label: "Sibling Repeat Calculation Pass", propName: "Sibling Repeat Calculation Pass", value: getVal("Sibling Repeat Calculation Pass", "(Use Default)") },
          { type: "property", label: "Auto Translation Currencies", propName: "Auto Translation Currencies", value: getVal("Auto Translation Currencies", "") },
        ],
      },
      {
        id: "entity_vary_scenario_time",
        title: "⊞ Vary By Scenario Type And Time",
        rows: [
          { type: "subhead", label: "General" },
          { type: "property", label: "In Use", propName: "In Use", value: getVal("In Use", "True"), isBoolean: true },
          { type: "property", label: "Allow Adjustments", propName: "Allow Adjustments", value: getVal("Allow Adjustments", "True"), isBoolean: true },
          { type: "property", label: "Allow Adjustments From Children", propName: "Allow Adjustments From Children", value: getVal("Allow Adjustments From Children", "True"), isBoolean: true },
          { type: "subhead", label: "Text" },
          ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
            type: "property" as const,
            label: `Text ${n}`,
            propName: `Text${n}`,
            value: getVal(`Text ${n}`, ""),
          })),
        ],
      },
    ];

    return (
      <div className="onestream-scenario-properties" style={{ fontSize: "12px" }}>
        {groups.map((group) => (
          <div key={group.id} className="rel-group" style={{ marginBottom: "8px" }}>
            <div
              onClick={() => toggleSection(group.id)}
              style={{
                background: "var(--surface-subtle)",
                padding: "5px 8px",
                fontWeight: 700,
                fontSize: "12px",
                border: "1px solid var(--border)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                userSelect: "none",
              }}
            >
              <span>{group.title}</span>
            </div>
            {!collapsedSections[group.id] && (
              <table
                className="data-table"
                style={{
                  width: "100%",
                  margin: 0,
                  border: "1px solid var(--border)",
                  borderTop: "none",
                  borderCollapse: "collapse",
                }}
              >
                <tbody>
                  {group.rows.map((r, idx) => {
                    if (r.type === "subhead") {
                      return (
                        <tr key={`sh-${idx}`} style={{ background: "var(--surface-subtle)" }}>
                          <td colSpan={2} style={{ padding: "4px 8px", fontWeight: 700, fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>
                            {r.label}
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={r.label} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td
                          style={{
                            padding: "4px 8px",
                            fontWeight: 500,
                            color: "var(--text)",
                            width: "48%",
                            paddingLeft: group.id.startsWith("entity_vary") ? "16px" : "8px",
                          }}
                        >
                          {r.label}
                        </td>
                        <td
                          style={{
                            padding: "2px 6px",
                            width: "52%",
                          }}
                        >
                          <EditablePropertyInput
                            propName={r.propName}
                            value={r.value}
                            isBoolean={r.isBoolean}
                            isNumber={r.isNumber}
                            isReadOnly={r.isReadOnly}
                            isFormula={r.propName.toLowerCase().includes("formula") && r.propName !== "Formula Type"}
                            onOpenFormulaEditor={
                              r.propName.toLowerCase().includes("formula") && r.propName !== "Formula Type"
                                ? () => setFormulaModalState({ isOpen: true, propName: r.propName, value: r.value })
                                : undefined
                            }
                            onSave={(val) => saveMemberProp(r.propName, val)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderAccountMemberProperties = () => {
    const getVal = (propName: string, fallback: string = "") => {
      return getAccountPropertyValue(selectedMember, propName, fallback);
    };

    const groups: {
      id: string;
      title: string;
      rows: (
        | { type: "property"; label: string; propName: string; value: string; isBoolean?: boolean; isNumber?: boolean; isReadOnly?: boolean }
        | { type: "subhead"; label: string }
      )[];
    }[] = [
      {
        id: "account_general",
        title: "⊞ General",
        rows: [
          { type: "property", label: "Dimension Type", propName: "Dimension Type", value: "Account Dimension Type", isReadOnly: true },
          { type: "property", label: "Dimension", propName: "Dimension", value: `${dimName} Dimension`, isReadOnly: true },
          { type: "property", label: "Member Dimension", propName: "Member Dimension", value: `${dimName} Dimension`, isReadOnly: true },
          { type: "property", label: "Id", propName: "Id", value: selectedMember.id ? String(selectedMember.id).slice(0, 8) : "1", isReadOnly: true },
          { type: "property", label: "Name", propName: "Account", value: memberKey },
          { type: "property", label: "Alias", propName: "Alias", value: getVal("Alias", "") },
        ],
      },
      {
        id: "account_descriptions",
        title: "⊞ Descriptions",
        rows: [
          { type: "property", label: "Default Description", propName: "Default Description", value: selectedMember.description || getVal("Default Description", "") },
          { type: "property", label: "English (United States)", propName: "English (United States)", value: getVal("English (United States)", "") },
        ],
      },
      {
        id: "account_security",
        title: "⊞ Security",
        rows: [
          { type: "property", label: "Display Member Group", propName: "Display Member Group", value: getVal("Display Member Group", "Everyone") },
        ],
      },
      {
        id: "account_settings",
        title: "⊞ Settings",
        rows: [
          { type: "property", label: "Account Type", propName: "Account Type", value: getVal("Account Type", "DynamicCalc") },
          { type: "property", label: "Formula Type", propName: "Formula Type", value: getVal("Formula Type", "DynamicCalcTextInput") },
          { type: "property", label: "Allow Input", propName: "Allow Input", value: getVal("Allow Input", "True"), isBoolean: true },
          { type: "property", label: "Is Consolidated", propName: "Is Consolidated", value: getVal("Is Consolidated", "Conditional (True if no Formula Type (default))") },
          { type: "property", label: "Is IC Account", propName: "Is IC Account", value: getVal("Is IC Account", "False"), isBoolean: true },
          { type: "property", label: "Use Alternate Input Currency In Flow", propName: "Use Alternate Input Currency In Flow", value: getVal("Use Alternate Input Currency In Flow", "False"), isBoolean: true },
          { type: "property", label: "Plug Account", propName: "Plug Account", value: getVal("Plug Account", "") },
          { type: "property", label: "Input View For Adjustments", propName: "Input View For Adjustments", value: getVal("Input View For Adjustments", "Use Scenario Setting (Default)") },
          { type: "property", label: "No Data Zero View For Adjustments", propName: "No Data Zero View For Adjustments", value: getVal("No Data Zero View For Adjustments", "Use Scenario Setting (Default)") },
          { type: "property", label: "No Data Zero View For NonAdjustments", propName: "No Data Zero View For NonAdjustments", value: getVal("No Data Zero View For NonAdjustments", "Use Scenario Setting (Default)") },
        ],
      },
      {
        id: "account_aggregation",
        title: "⊞ Aggregation",
        rows: [
          { type: "property", label: "Used On Entity Dimension", propName: "Used On Entity Dimension", value: getVal("Used On Entity Dimension", "True"), isBoolean: true },
          { type: "property", label: "Used On Consolidation Dimension", propName: "Used On Consolidation Dimension", value: getVal("Used On Consolidation Dimension", "True"), isBoolean: true },
          { type: "property", label: "Enable Flow Aggregation", propName: "Enable Flow Aggregation", value: getVal("Enable Flow Aggregation", "True"), isBoolean: true },
          { type: "property", label: "Enable Origin Aggregation", propName: "Enable Origin Aggregation", value: getVal("Enable Origin Aggregation", "True"), isBoolean: true },
          { type: "property", label: "Enable IC Aggregation", propName: "Enable IC Aggregation", value: getVal("Enable IC Aggregation", "True"), isBoolean: true },
          { type: "property", label: "Enable UD1 Aggregation", propName: "Enable UD1 Aggregation", value: getVal("Enable UD1 Aggregation", "True"), isBoolean: true },
          { type: "property", label: "Enable UD2 Aggregation", propName: "Enable UD2 Aggregation", value: getVal("Enable UD2 Aggregation", "True"), isBoolean: true },
          { type: "property", label: "Enable UD3 Aggregation", propName: "Enable UD3 Aggregation", value: getVal("Enable UD3 Aggregation", "True"), isBoolean: true },
          { type: "property", label: "Enable UD4 Aggregation", propName: "Enable UD4 Aggregation", value: getVal("Enable UD4 Aggregation", "True"), isBoolean: true },
          { type: "property", label: "Enable UD5 Aggregation", propName: "Enable UD5 Aggregation", value: getVal("Enable UD5 Aggregation", "True"), isBoolean: true },
          { type: "property", label: "Enable UD6 Aggregation", propName: "Enable UD6 Aggregation", value: getVal("Enable UD6 Aggregation", "True"), isBoolean: true },
          { type: "property", label: "Enable UD7 Aggregation", propName: "Enable UD7 Aggregation", value: getVal("Enable UD7 Aggregation", "True"), isBoolean: true },
          { type: "property", label: "Enable UD8 Aggregation", propName: "Enable UD8 Aggregation", value: getVal("Enable UD8 Aggregation", "True"), isBoolean: true },
        ],
      },
      {
        id: "account_vary_cube",
        title: "⊞ Vary By Cube Type",
        rows: [
          { type: "property", label: "Flow Constraint", propName: "Flow Constraint", value: getVal("Flow Constraint", "Root") },
          { type: "property", label: "IC Constraint", propName: "IC Constraint", value: getVal("IC Constraint", "Root") },
          { type: "property", label: "IC Member Filter", propName: "IC Member Filter", value: getVal("IC Member Filter", "Root") },
          { type: "property", label: "UD1 Constraint", propName: "UD1 Constraint", value: getVal("UD1 Constraint", "Root") },
          { type: "property", label: "UD2 Constraint", propName: "UD2 Constraint", value: getVal("UD2 Constraint", "Root") },
          { type: "property", label: "UD3 Constraint", propName: "UD3 Constraint", value: getVal("UD3 Constraint", "Root") },
          { type: "property", label: "UD4 Constraint", propName: "UD4 Constraint", value: getVal("UD4 Constraint", "Root") },
          { type: "property", label: "UD5 Constraint", propName: "UD5 Constraint", value: getVal("UD5 Constraint", "Root") },
          { type: "property", label: "UD6 Constraint", propName: "UD6 Constraint", value: getVal("UD6 Constraint", "Root") },
          { type: "property", label: "UD7 Constraint", propName: "UD7 Constraint", value: getVal("UD7 Constraint", "Root") },
          { type: "property", label: "UD8 Constraint", propName: "UD8 Constraint", value: getVal("UD8 Constraint", "Root") },
        ],
      },
      {
        id: "account_vary_scenario",
        title: "⊞ Vary By Scenario Type",
        rows: [
          { type: "property", label: "Workflow Channel", propName: "Workflow Channel", value: getVal("Workflow Channel", "Standard") },
        ],
      },
      {
        id: "account_vary_scenario_time",
        title: "⊞ Vary By Scenario Type And Time",
        rows: [
          { type: "subhead", label: "General" },
          { type: "property", label: "In Use", propName: "In Use", value: getVal("In Use", "True"), isBoolean: true },
          { type: "property", label: "Formula", propName: "Formula", value: getVal("Formula", "") },
          { type: "property", label: "Formula For Calculation Drill Down", propName: "Formula For Calculation Drill Down", value: getVal("Formula For Calculation Drill Down", "") },
          { type: "property", label: "Adjustment Type", propName: "Adjustment Type", value: getVal("Adjustment Type", "Journals") },
          { type: "subhead", label: "Text" },
          ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
            type: "property" as const,
            label: `Text ${n}`,
            propName: `Text${n}`,
            value: getVal(`Text ${n}`, ""),
          })),
        ],
      },
    ];

    return (
      <div className="onestream-scenario-properties" style={{ fontSize: "12px" }}>
        {groups.map((group) => (
          <div key={group.id} className="rel-group" style={{ marginBottom: "8px" }}>
            <div
              onClick={() => toggleSection(group.id)}
              style={{
                background: "var(--surface-subtle)",
                padding: "5px 8px",
                fontWeight: 700,
                fontSize: "12px",
                border: "1px solid var(--border)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                userSelect: "none",
              }}
            >
              <span>{group.title}</span>
            </div>
            {!collapsedSections[group.id] && (
              <table
                className="data-table"
                style={{
                  width: "100%",
                  margin: 0,
                  border: "1px solid var(--border)",
                  borderTop: "none",
                  borderCollapse: "collapse",
                }}
              >
                <tbody>
                  {group.rows.map((r, idx) => {
                    if (r.type === "subhead") {
                      return (
                        <tr key={`sh-${idx}`} style={{ background: "var(--surface-subtle)" }}>
                          <td colSpan={2} style={{ padding: "4px 8px", fontWeight: 700, fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>
                            {r.label}
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={r.label} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td
                          style={{
                            padding: "4px 8px",
                            fontWeight: 500,
                            color: "var(--text)",
                            width: "48%",
                            paddingLeft: group.id.startsWith("account_vary") ? "16px" : "8px",
                          }}
                        >
                          {r.label}
                        </td>
                        <td
                          style={{
                            padding: "2px 6px",
                            width: "52%",
                          }}
                        >
                          <EditablePropertyInput
                            propName={r.propName}
                            value={r.value}
                            isBoolean={r.isBoolean}
                            isNumber={r.isNumber}
                            isReadOnly={r.isReadOnly}
                            isFormula={r.propName.toLowerCase().includes("formula") && r.propName !== "Formula Type"}
                            onOpenFormulaEditor={
                              r.propName.toLowerCase().includes("formula") && r.propName !== "Formula Type"
                                ? () => setFormulaModalState({ isOpen: true, propName: r.propName, value: r.value })
                                : undefined
                            }
                            onSave={(val) => saveMemberProp(r.propName, val)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderFlowMemberProperties = () => {
    const getVal = (propName: string, fallback: string = "") => {
      return getFlowPropertyValue(selectedMember, propName, fallback);
    };

    const groups: {
      id: string;
      title: string;
      rows: (
        | { type: "property"; label: string; propName: string; value: string; isBoolean?: boolean; isNumber?: boolean; isReadOnly?: boolean }
        | { type: "subhead"; label: string }
      )[];
    }[] = [
      {
        id: "flow_general",
        title: "⊞ General",
        rows: [
          { type: "property", label: "Dimension Type", propName: "Dimension Type", value: "Flow Dimension Type", isReadOnly: true },
          { type: "property", label: "Dimension", propName: "Dimension", value: `${dimName} Dimension`, isReadOnly: true },
          { type: "property", label: "Member Dimension", propName: "Member Dimension", value: `${dimName} Dimension`, isReadOnly: true },
          { type: "property", label: "Id", propName: "Id", value: selectedMember.id ? String(selectedMember.id).slice(0, 8) : "1", isReadOnly: true },
          { type: "property", label: "Name", propName: "Flow Member", value: memberKey },
          { type: "property", label: "Alias", propName: "Alias", value: getVal("Alias", "") },
        ],
      },
      {
        id: "flow_descriptions",
        title: "⊞ Descriptions",
        rows: [
          { type: "property", label: "Default Description", propName: "Default Description", value: selectedMember.description || getVal("Default Description", "") },
          { type: "property", label: "English (United States)", propName: "English (United States)", value: getVal("English (United States)", "") },
        ],
      },
      {
        id: "flow_security",
        title: "⊞ Security",
        rows: [
          { type: "property", label: "Display Member Group", propName: "Display Member Group", value: getVal("Display Member Group", "Everyone") },
        ],
      },
      {
        id: "flow_settings",
        title: "⊞ Settings",
        rows: [
          { type: "property", label: "Formula Type", propName: "Formula Type", value: getVal("Formula Type", "DynamicCalc") },
          { type: "property", label: "Allow Input", propName: "Allow Input", value: getVal("Allow Input", "False"), isBoolean: true },
          { type: "property", label: "Is Consolidated", propName: "Is Consolidated", value: getVal("Is Consolidated", "Conditional (True if no Formula Type (default))") },
          { type: "property", label: "Switch Sign", propName: "Switch Sign", value: getVal("Switch Sign", "False"), isBoolean: true },
          { type: "property", label: "Switch Type", propName: "Switch Type", value: getVal("Switch Type", "False"), isBoolean: true },
        ],
      },
      {
        id: "flow_processing",
        title: "⊞ Flow Processing",
        rows: [
          { type: "property", label: "Flow Processing Type", propName: "Flow Processing Type", value: getVal("Flow Processing Type", "(Not Used)") },
          { type: "property", label: "Alternate Input Currency", propName: "Alternate Input Currency", value: getVal("Alternate Input Currency", "(Not Used)") },
          { type: "property", label: "Source Member For Alternate Input Currency", propName: "Source Member For Alternate Input Currency", value: getVal("Source Member For Alternate Input Currency", "") },
        ],
      },
      {
        id: "flow_vary_scenario_time",
        title: "⊞ Vary By Scenario Type And Time",
        rows: [
          { type: "subhead", label: "General" },
          { type: "property", label: "In Use", propName: "In Use", value: getVal("In Use", "True"), isBoolean: true },
          { type: "property", label: "Formula", propName: "Formula", value: getVal("Formula", "") },
          { type: "property", label: "Formula For Calculation Drill Down", propName: "Formula For Calculation Drill Down", value: getVal("Formula For Calculation Drill Down", "") },
          { type: "subhead", label: "Text" },
          ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
            type: "property" as const,
            label: `Text ${n}`,
            propName: `Text${n}`,
            value: getVal(`Text ${n}`, ""),
          })),
        ],
      },
    ];

    return (
      <div className="onestream-scenario-properties" style={{ fontSize: "12px" }}>
        {groups.map((group) => (
          <div key={group.id} className="rel-group" style={{ marginBottom: "8px" }}>
            <div
              onClick={() => toggleSection(group.id)}
              style={{
                background: "var(--surface-subtle)",
                padding: "5px 8px",
                fontWeight: 700,
                fontSize: "12px",
                border: "1px solid var(--border)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                userSelect: "none",
              }}
            >
              <span>{group.title}</span>
            </div>
            {!collapsedSections[group.id] && (
              <table
                className="data-table"
                style={{
                  width: "100%",
                  margin: 0,
                  border: "1px solid var(--border)",
                  borderTop: "none",
                  borderCollapse: "collapse",
                }}
              >
                <tbody>
                  {group.rows.map((r, idx) => {
                    if (r.type === "subhead") {
                      return (
                        <tr key={`sh-${idx}`} style={{ background: "var(--surface-subtle)" }}>
                          <td colSpan={2} style={{ padding: "4px 8px", fontWeight: 700, fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>
                            {r.label}
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={r.label} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td
                          style={{
                            padding: "4px 8px",
                            fontWeight: 500,
                            color: "var(--text)",
                            width: "48%",
                            paddingLeft: group.id.startsWith("flow_vary") ? "16px" : "8px",
                          }}
                        >
                          {r.label}
                        </td>
                        <td
                          style={{
                            padding: "2px 6px",
                            width: "52%",
                          }}
                        >
                          <EditablePropertyInput
                            propName={r.propName}
                            value={r.value}
                            isBoolean={r.isBoolean}
                            isNumber={r.isNumber}
                            isReadOnly={r.isReadOnly}
                            isFormula={r.propName.toLowerCase().includes("formula") && r.propName !== "Formula Type"}
                            onOpenFormulaEditor={
                              r.propName.toLowerCase().includes("formula") && r.propName !== "Formula Type"
                                ? () => setFormulaModalState({ isOpen: true, propName: r.propName, value: r.value })
                                : undefined
                            }
                            onSave={(val) => saveMemberProp(r.propName, val)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderUdMemberProperties = () => {
    const getVal = (propName: string, fallback: string = "") => {
      return getUdPropertyValue(selectedMember, propName, fallback);
    };

    const constraintsRows: (
      | { type: "property"; label: string; propName: string; value: string; isBoolean?: boolean; isNumber?: boolean; isReadOnly?: boolean }
      | { type: "subhead"; label: string }
    )[] = [
      { type: "subhead" as const, label: "Constraints" }
    ];

    for (let u = 1; u <= 8; u++) {
      if (`UD${u}` === dimType) continue;
      const label = u <= 5 ? `UD${u} Constraint` : `UD${u} Default`;
      constraintsRows.push({
        type: "property" as const,
        label,
        propName: label,
        value: getVal(label, u <= 5 ? "Root" : "None")
      });
    }

    const groups: {
      id: string;
      title: string;
      rows: (
        | { type: "property"; label: string; propName: string; value: string; isBoolean?: boolean; isNumber?: boolean; isReadOnly?: boolean }
        | { type: "subhead"; label: string }
      )[];
    }[] = [
      {
        id: "ud_general",
        title: "⊞ General",
        rows: [
          { type: "property", label: "Dimension Type", propName: "Dimension Type", value: `${dimType} Dimension Type`, isReadOnly: true },
          { type: "property", label: "Dimension", propName: "Dimension", value: `${dimName} Dimension`, isReadOnly: true },
          { type: "property", label: "Member Dimension", propName: "Member Dimension", value: `${dimName} Dimension`, isReadOnly: true },
          { type: "property", label: "Id", propName: "Id", value: selectedMember.id ? String(selectedMember.id).slice(0, 8) : "1", isReadOnly: true },
          { type: "property", label: "Name", propName: "Member", value: memberKey },
          { type: "property", label: "Alias", propName: "Alias", value: getVal("Alias", "") },
        ],
      },
      {
        id: "ud_descriptions",
        title: "⊞ Descriptions",
        rows: [
          { type: "property", label: "Default Description", propName: "Default Description", value: selectedMember.description || getVal("Default Description", "") },
          { type: "property", label: "English (United States)", propName: "English (United States)", value: getVal("English (United States)", "") },
        ],
      },
      {
        id: "ud_security",
        title: "⊞ Security",
        rows: [
          { type: "property", label: "Display Member Group", propName: "Display Member Group", value: getVal("Display Member Group", "Everyone") },
        ],
      },
      {
        id: "ud_settings",
        title: "⊞ Settings",
        rows: [
          { type: "subhead", label: "General" },
          { type: "property", label: "Formula Type", propName: "Formula Type", value: getVal("Formula Type", "(Not Used)") },
          { type: "property", label: "Allow Input", propName: "Allow Input", value: getVal("Allow Input", "True"), isBoolean: true },
          { type: "property", label: "Is Consolidated", propName: "Is Consolidated", value: getVal("Is Consolidated", "Conditional (True if no Formula Type and no Attribute (default))") },
          { type: "property", label: "Alternate Currency For Display", propName: "Alternate Currency For Display", value: getVal("Alternate Currency For Display", "(Not Used)") },
          { type: "subhead", label: "Attribute Member" },
          { type: "property", label: "Is Attribute Member", propName: "Is Attribute Member", value: getVal("Is Attribute Member", "False"), isBoolean: true },
          { type: "property", label: "Source Member For Data", propName: "Source Member For Data", value: getVal("Source Member For Data", "") },
          { type: "property", label: "Expression Type", propName: "Expression Type", value: getVal("Expression Type", "(Select One)") },
          { type: "property", label: "Related Dimension Type 1", propName: "Related Dimension Type 1", value: getVal("Related Dimension Type 1", "(Select One)") },
          { type: "property", label: "Related Property 1", propName: "Related Property 1", value: getVal("Related Property 1", "(Select One)") },
          { type: "property", label: "Comparison Text 1", propName: "Comparison Text 1", value: getVal("Comparison Text 1", "") },
          { type: "property", label: "Comparison Operator 1", propName: "Comparison Operator 1", value: getVal("Comparison Operator 1", "(Select One)") },
          { type: "property", label: "Related Dimension Type 2", propName: "Related Dimension Type 2", value: getVal("Related Dimension Type 2", "(Select One)") },
          { type: "property", label: "Related Property 2", propName: "Related Property 2", value: getVal("Related Property 2", "(Select One)") },
          { type: "property", label: "Comparison Text 2", propName: "Comparison Text 2", value: getVal("Comparison Text 2", "") },
          { type: "property", label: "Comparison Operator 2", propName: "Comparison Operator 2", value: getVal("Comparison Operator 2", "(Select One)") },
        ],
      },
      {
        id: "ud_vary_cube",
        title: "⊞ Vary By Cube Type",
        rows: constraintsRows,
      },
      {
        id: "ud_vary_scenario",
        title: "⊞ Vary By Scenario Type",
        rows: [
          { type: "property", label: "Workflow Channel", propName: "Workflow Channel", value: getVal("Workflow Channel", "NoDataLock") },
        ],
      },
      {
        id: "ud_vary_scenario_time",
        title: "⊞ Vary By Scenario Type And Time",
        rows: [
          { type: "subhead", label: "General" },
          { type: "property", label: "In Use", propName: "In Use", value: getVal("In Use", "True"), isBoolean: true },
          { type: "property", label: "Formula", propName: "Formula", value: getVal("Formula", "") },
          { type: "property", label: "Formula For Calculation Drill Down", propName: "Formula For Calculation Drill Down", value: getVal("Formula For Calculation Drill Down", "") },
          { type: "subhead", label: "Text" },
          ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
            type: "property" as const,
            label: `Text ${n}`,
            propName: `Text${n}`,
            value: getVal(`Text ${n}`, ""),
          })),
        ],
      },
    ];

    return (
      <div className="onestream-scenario-properties" style={{ fontSize: "12px" }}>
        {groups.map((group) => (
          <div key={group.id} className="rel-group" style={{ marginBottom: "8px" }}>
            <div
              onClick={() => toggleSection(group.id)}
              style={{
                background: "var(--surface-subtle)",
                padding: "5px 8px",
                fontWeight: 700,
                fontSize: "12px",
                border: "1px solid var(--border)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                userSelect: "none",
              }}
            >
              <span>{group.title}</span>
            </div>
            {!collapsedSections[group.id] && (
              <table
                className="data-table"
                style={{
                  width: "100%",
                  margin: 0,
                  border: "1px solid var(--border)",
                  borderTop: "none",
                  borderCollapse: "collapse",
                }}
              >
                <tbody>
                  {group.rows.map((r, idx) => {
                    if (r.type === "subhead") {
                      return (
                        <tr key={`sh-${idx}`} style={{ background: "var(--surface-subtle)" }}>
                          <td colSpan={2} style={{ padding: "4px 8px", fontWeight: 700, fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>
                            {r.label}
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={r.label} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td
                          style={{
                            padding: "4px 8px",
                            fontWeight: 500,
                            color: "var(--text)",
                            width: "48%",
                            paddingLeft: group.id.startsWith("ud_vary") ? "16px" : "8px",
                          }}
                        >
                          {r.label}
                        </td>
                        <td
                          style={{
                            padding: "2px 6px",
                            width: "52%",
                          }}
                        >
                          <EditablePropertyInput
                            propName={r.propName}
                            value={r.value}
                            isBoolean={r.isBoolean}
                            isNumber={r.isNumber}
                            isReadOnly={r.isReadOnly}
                            isFormula={r.propName.toLowerCase().includes("formula") && r.propName !== "Formula Type"}
                            onOpenFormulaEditor={
                              r.propName.toLowerCase().includes("formula") && r.propName !== "Formula Type"
                                ? () => setFormulaModalState({ isOpen: true, propName: r.propName, value: r.value })
                                : undefined
                            }
                            onSave={(val) => saveMemberProp(r.propName, val)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <aside className="panel issue-panel details-rail" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", flex: "1 1 0%" }}>
      <div className="details-rail-page" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        {/* Header with Sub-Tabs */}
        <div className="panel-heading compact" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "8px", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: "6px", width: "100%", marginBottom: "6px" }}>
            <button
              className={`inspector-subtab ${activeInspectorTab === "member" ? "active" : ""}`}
              onClick={() => setActiveInspectorTab("member")}
              style={{
                flex: 1,
                padding: "6px 10px",
                fontSize: "12px",
                fontWeight: 700,
                borderRadius: "4px",
                border: "1px solid var(--border)",
                background: activeInspectorTab === "member" ? "var(--primary)" : "var(--surface)",
                color: activeInspectorTab === "member" ? "#ffffff" : "var(--text)",
                cursor: "pointer",
              }}
            >
              Member Properties
            </button>
            <button
              className={`inspector-subtab ${activeInspectorTab === "relationship" ? "active" : ""}`}
              onClick={() => setActiveInspectorTab("relationship")}
              style={{
                flex: 1,
                padding: "6px 10px",
                fontSize: "12px",
                fontWeight: 700,
                borderRadius: "4px",
                border: "1px solid var(--border)",
                background: activeInspectorTab === "relationship" ? "var(--primary)" : "var(--surface)",
                color: activeInspectorTab === "relationship" ? "#ffffff" : "var(--text)",
                cursor: "pointer",
              }}
            >
              Relationship Properties
            </button>
          </div>
          {saveStatus !== "idle" && (
            <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: saveStatus === "saved" ? "#10b981" : saveStatus === "error" ? "#ef4444" : "var(--primary)" }}>
              <span>{saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "✓ Saved" : "Error saving"}</span>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="inspector-scroll-container" style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingRight: "4px" }}>
          {activeInspectorTab === "member" ? (
            /* Member Properties Tab */
            dimType === "Scenario" ? (
              renderScenarioMemberProperties()
            ) : dimType === "Entity" ? (
              renderEntityMemberProperties()
            ) : dimType === "Account" ? (
              renderAccountMemberProperties()
            ) : dimType === "Flow" ? (
              renderFlowMemberProperties()
            ) : dimType.startsWith("UD") ? (
              renderUdMemberProperties()
            ) : (
              <div>
                <div style={{ marginBottom: "10px", paddingBottom: "8px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>
                    Selected Member
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", wordBreak: "break-all" }}>
                    {memberKey}
                  </div>
                  {selectedMember.description && (
                    <div style={{ fontSize: "12px", color: "var(--muted-strong)", marginTop: "2px" }}>
                      {selectedMember.description}
                    </div>
                  )}
                </div>

                <table className="data-table" style={{ width: "100%", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ background: "var(--surface-subtle)", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "4px 8px", textAlign: "left", width: "45%" }}>Property</th>
                      <th style={{ padding: "4px 8px", textAlign: "left", width: "55%" }}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const schema = getDimensionSchema(dimension.dimensionType);
                      const fields = schema.memberFields;
                      const rowsToDisplay: {
                        name: string;
                        value: string;
                        isBoolean: boolean;
                        isNumber: boolean;
                      }[] = [];
                      const processedNames = new Set<string>();

                      for (const field of fields) {
                        if (field.name.startsWith("__") || field.name.startsWith("_")) continue;
                        let val = selectedMember.properties?.[field.name] ?? selectedMember[field.name];
                        if ((val === null || val === undefined || String(val).trim() === "") && field.name === schema.memberKeyField) {
                          val = memberKey;
                        }
                        const isBool = field.kind === "boolean" || (schema.booleanFields ?? []).includes(field.name);
                        const isNum = field.kind === "number" || (schema.numericFields ?? []).includes(field.name);
                        const strVal = val !== null && val !== undefined && typeof val !== "object" ? String(val) : "";

                        rowsToDisplay.push({
                          name: field.name,
                          value: strVal,
                          isBoolean: isBool,
                          isNumber: isNum,
                        });
                        processedNames.add(field.name);
                        for (const alias of field.aliases ?? []) {
                          processedNames.add(alias);
                        }
                      }

                      for (const [key, val] of Object.entries(selectedMember.properties ?? {})) {
                        if (processedNames.has(key)) continue;
                        if (key.startsWith("__") || key.startsWith("_")) continue;
                        if (["id", "dimensionid", "roworder", "createdat", "updatedat", "unknownxml"].includes(key.toLowerCase())) continue;
                        if (typeof val === "object") continue;
                        const strVal = val !== null && val !== undefined ? String(val) : "";
                        if (strVal === "[object Object]") continue;
                        const isBool = ["true", "false"].includes(strVal.toLowerCase());
                        const isNum = !isNaN(Number(strVal)) && strVal.trim() !== "";
                        rowsToDisplay.push({
                          name: key,
                          value: strVal,
                          isBoolean: isBool,
                          isNumber: isNum,
                        });
                      }

                      return rowsToDisplay.map((r) => (
                        <tr key={r.name} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "4px 8px", fontWeight: 600, color: "var(--text)", width: "45%" }}>{r.name}</td>
                          <td style={{ padding: "2px 6px", width: "55%" }}>
                            <EditablePropertyInput
                              propName={r.name}
                              value={r.value}
                              isBoolean={r.isBoolean}
                              isNumber={r.isNumber}
                              isFormula={r.name.toLowerCase().includes("formula") && r.name !== "Formula Type"}
                              onOpenFormulaEditor={
                                r.name.toLowerCase().includes("formula") && r.name !== "Formula Type"
                                  ? () => setFormulaModalState({ isOpen: true, propName: r.name, value: r.value })
                                  : undefined
                              }
                              onSave={(val) => saveMemberProp(r.name, val)}
                            />
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            /* Relationship Properties Tab (Original OneStream Grouped Layout with Edit Access) */
            <div className="onestream-rel-properties" style={{ fontSize: "12px" }}>
              {/* Group 1: General */}
              <div className="rel-group" style={{ marginBottom: "10px" }}>
                <div
                  onClick={() => toggleSection("general")}
                  style={{
                    background: "var(--surface-subtle)",
                    padding: "6px 8px",
                    fontWeight: 700,
                    fontSize: "12px",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    userSelect: "none",
                  }}
                >
                  <span>{"⊞ General"}</span>
                </div>
                {!collapsedSections["general"] && (
                  <table className="data-table" style={{ width: "100%", margin: 0, border: "1px solid var(--border)", borderTop: "none" }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: "4px 8px", fontWeight: 600, color: "var(--text)", width: "48%" }}>Dimension Type</td>
                        <td style={{ padding: "4px 8px", color: "var(--muted)", width: "52%" }}>{dimType} Dimension Type</td>
                      </tr>
                      <tr>
                        <td style={{ padding: "4px 8px", fontWeight: 600, color: "var(--text)" }}>Dimension</td>
                        <td style={{ padding: "4px 8px", color: "var(--muted)" }}>{dimName} Dimension</td>
                      </tr>
                      <tr>
                        <td style={{ padding: "4px 8px", fontWeight: 600, color: "var(--text)" }}>Parent Member Dimension</td>
                        <td style={{ padding: "4px 8px", color: "var(--muted)" }}>{dimName} Dimension</td>
                      </tr>
                      <tr>
                        <td style={{ padding: "4px 8px", fontWeight: 600, color: "var(--text)" }}>Member Dimension</td>
                        <td style={{ padding: "4px 8px", color: "var(--muted)" }}>{dimName} Dimension</td>
                      </tr>
                      <tr>
                        <td style={{ padding: "4px 8px", fontWeight: 600, color: "var(--text)" }}>Parent Member Name</td>
                        <td style={{ padding: "2px 6px" }}>
                          <EditablePropertyInput
                            propName="Parent"
                            value={parentKey}
                            onSave={(val) => saveRelProp("Parent", val)}
                          />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: "4px 8px", fontWeight: 600, color: "var(--text)" }}>Member Name</td>
                        <td style={{ padding: "2px 6px" }}>
                          <EditablePropertyInput
                            propName="Child"
                            value={memberKey}
                            onSave={(val) => saveRelProp("Child", val)}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>

              {/* Group 2: Position Within Parent */}
              <div className="rel-group" style={{ marginBottom: "10px" }}>
                <div
                  onClick={() => toggleSection("position")}
                  style={{
                    background: "var(--surface-subtle)",
                    padding: "6px 8px",
                    fontWeight: 700,
                    fontSize: "12px",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    userSelect: "none",
                  }}
                >
                  <span>{"⊞ Position Within Parent"}</span>
                </div>
                {!collapsedSections["position"] && (
                  <table className="data-table" style={{ width: "100%", margin: 0, border: "1px solid var(--border)", borderTop: "none" }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: "4px 8px", fontWeight: 600, color: "var(--text)", width: "48%" }}>Position</td>
                        <td style={{ padding: "2px 6px", width: "52%" }}>
                          <EditablePropertyInput
                            propName="Position"
                            value={selectedMember.Position || selectedMember.properties?.Position || "Retain Current Position"}
                            onSave={(val) => saveRelProp("Position", val)}
                          />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: "4px 8px", fontWeight: 600, color: "var(--text)" }}>Sibling Member</td>
                        <td style={{ padding: "2px 6px" }}>
                          <EditablePropertyInput
                            propName="Sibling Member"
                            value={selectedMember["Sibling Member"] || selectedMember.properties?.["Sibling Member"] || "(Not Used)"}
                            onSave={(val) => saveRelProp("Sibling Member", val)}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>

              {/* Group 3: Default Parent (For Entity dimensions) */}
              {dimType === "Entity" && (
                <div className="rel-group" style={{ marginBottom: "10px" }}>
                  <div
                    onClick={() => toggleSection("defaultParent")}
                    style={{
                      background: "var(--surface-subtle)",
                      padding: "6px 8px",
                      fontWeight: 700,
                      fontSize: "12px",
                      border: "1px solid var(--border)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      userSelect: "none",
                    }}
                  >
                    <span>{"⊞ Default Parent"}</span>
                  </div>
                  {!collapsedSections["defaultParent"] && (
                    <table className="data-table" style={{ width: "100%", margin: 0, border: "1px solid var(--border)", borderTop: "none" }}>
                      <tbody>
                        <tr>
                          <td style={{ padding: "4px 8px", fontWeight: 600, color: "var(--text)", width: "48%" }}>Parent Sort Order</td>
                          <td style={{ padding: "2px 6px", width: "52%" }}>
                            <EditablePropertyInput
                              propName="Parent Sort Order"
                              value={selectedMember.ParentSortOrder || selectedMember.properties?.ParentSortOrder || selectedMember.properties?.["Parent Sort Order"] || "0"}
                              isNumber={true}
                              onSave={(val) => saveRelProp("Parent Sort Order", val)}
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Group 4: Aggregation (For Account, Flow, UD1-8 dimensions) */}
              {["Account", "Flow", "UD1", "UD2", "UD3", "UD4", "UD5", "UD6", "UD7", "UD8"].includes(dimType) && (
                <div className="rel-group" style={{ marginBottom: "10px" }}>
                  <div
                    onClick={() => toggleSection("aggregation")}
                    style={{
                      background: "var(--surface-subtle)",
                      padding: "6px 8px",
                      fontWeight: 700,
                      fontSize: "12px",
                      border: "1px solid var(--border)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      userSelect: "none",
                    }}
                  >
                    <span>{"⊞ Aggregation"}</span>
                  </div>
                  {!collapsedSections["aggregation"] && (
                    <table className="data-table" style={{ width: "100%", margin: 0, border: "1px solid var(--border)", borderTop: "none" }}>
                      <tbody>
                        <tr>
                          <td style={{ padding: "4px 8px", fontWeight: 600, color: "var(--text)", width: "48%" }}>Aggregation Weight</td>
                          <td style={{ padding: "2px 6px", width: "52%" }}>
                            <EditablePropertyInput
                              propName="Aggregation Weight"
                              value={String(selectedMember["Aggregation Weight"] ?? selectedMember.aggregationWeight ?? selectedMember.properties?.["Aggregation Weight"] ?? selectedMember.properties?.aggregationWeight ?? "1.00")}
                              isNumber={true}
                              onSave={(val) => saveRelProp("Aggregation Weight", val)}
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Group 5: Vary By Scenario Type And Time (For Entity dimensions) */}
              {dimType === "Entity" && (
                <div className="rel-group" style={{ marginBottom: "10px" }}>
                  <div
                    onClick={() => toggleSection("varyByScenario")}
                    style={{
                      background: "var(--surface-subtle)",
                      padding: "6px 8px",
                      fontWeight: 700,
                      fontSize: "12px",
                      border: "1px solid var(--border)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      userSelect: "none",
                    }}
                  >
                    <span>{"⊞ Vary By Scenario Type And Time"}</span>
                  </div>
                  {!collapsedSections["varyByScenario"] && (
                    <div style={{ border: "1px solid var(--border)", borderTop: "none" }}>
                      <div style={{ padding: "4px 8px", background: "var(--surface)", fontWeight: 700, fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>
                        General
                      </div>
                      <table className="data-table" style={{ width: "100%", margin: 0, borderBottom: "1px solid var(--border)" }}>
                        <tbody>
                          <tr>
                            <td style={{ padding: "4px 8px", fontWeight: 600, width: "48%" }}>Percent Consolidation</td>
                            <td style={{ padding: "2px 6px", width: "52%" }}>
                              <EditablePropertyInput
                                propName="Percent Consol"
                                value={selectedMember["Percent Consol"] || selectedMember.properties?.["Percent Consol"] || selectedMember.properties?.["Percent Consolidation"] || "100.00"}
                                isNumber={true}
                                onSave={(val) => saveRelProp("Percent Consol", val)}
                              />
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "4px 8px", fontWeight: 600 }}>Percent Ownership</td>
                            <td style={{ padding: "2px 6px" }}>
                              <EditablePropertyInput
                                propName="Percent Ownership"
                                value={selectedMember["Percent Ownership"] || selectedMember.properties?.["Percent Ownership"] || "100.00"}
                                isNumber={true}
                                onSave={(val) => saveRelProp("Percent Ownership", val)}
                              />
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "4px 8px", fontWeight: 600 }}>Ownership Type</td>
                            <td style={{ padding: "2px 6px" }}>
                              <EditablePropertyInput
                                propName="Ownership Type"
                                value={selectedMember["Ownership Type"] || selectedMember.properties?.["Ownership Type"] || "Full Consolidation"}
                                onSave={(val) => saveRelProp("Ownership Type", val)}
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <div style={{ padding: "4px 8px", background: "var(--surface)", fontWeight: 700, fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>
                        Text
                      </div>
                      <table className="data-table" style={{ width: "100%", margin: 0 }}>
                        <tbody>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                            <tr key={num}>
                              <td style={{ padding: "4px 8px", fontWeight: 600, width: "48%" }}>Text {num}</td>
                              <td style={{ padding: "2px 6px", width: "52%" }}>
                                <EditablePropertyInput
                                  propName={`Text${num}`}
                                  value={selectedMember[`Text${num}`] || selectedMember.properties?.[`Text${num}`] || selectedMember.properties?.[`Text ${num}`] || ""}
                                  onSave={(val) => saveRelProp(`Text${num}`, val)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {formulaModalState.isOpen && (
        <FormulaEditorModal
          isOpen={formulaModalState.isOpen}
          memberName={memberKey}
          dimensionType={dimType}
          initialFormula={formulaModalState.value}
          onClose={() => setFormulaModalState((prev) => ({ ...prev, isOpen: false }))}
          onSave={(updatedFormula) => {
            saveMemberProp(formulaModalState.propName, updatedFormula);
            setFormulaModalState((prev) => ({ ...prev, isOpen: false }));
          }}
        />
      )}
    </aside>
  );
}
