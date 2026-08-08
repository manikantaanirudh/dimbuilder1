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
    <section className="workspace">
      <div className="workspace-page">
        <span className="workspace-page-icon" aria-hidden="true">
          <Database size={24} />
        </span>
        <div className="workspace-page-body">
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
          <div className="workspace-document">
            <div
              className={`workspace-grid${activeTab === "Issues" ? " workspace-grid--single" : ""}`}
            >
              <div className="workspace-primary">
                <nav
                  className="tabs workspace-tablist"
                  aria-label="Dimension workspace tabs"
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
                <div className="workspace-main">
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
                    <EditableGrid
                      projectId={projectId}
                      kind="members"
                      dimension={dimension}
                      pageSize={appConfig.ui.gridPageSize}
                      highlightedEntityId={highlightedEntityId}
                      issueFilteredIds={filteredEntityIds}
                      issues={dimensionIssues}
                      refreshSignal={relationshipRefreshSignal}
                      onRefresh={onRefresh}
                      onSelectRow={setSelectedMember}
                    />
                  )}
                  {activeTab === "Relationships" && (
                    <EditableGrid
                      projectId={projectId}
                      kind="relationships"
                      dimension={dimension}
                      pageSize={appConfig.ui.gridPageSize}
                      highlightedEntityId={highlightedEntityId}
                      issueFilteredIds={filteredEntityIds}
                      issues={dimensionIssues}
                      refreshSignal={relationshipRefreshSignal}
                      onRefresh={onRefresh}
                      onSelectRow={setSelectedMember}
                    />
                  )}
                  {activeTab === "Hierarchy" && (
                    <HierarchyTree
                      projectId={projectId}
                      dimension={dimension}
                      onRelationshipChanged={handleRelationshipChanged}
                      refreshSignal={relationshipRefreshSignal}
                      onNodeClick={(memberKey) => {
                        setTab("Members");
                        setHighlightedEntityId(memberKey);
                      }}
                    />
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
              {activeTab !== "Issues" && (
                selectedMember ? (
                  <aside className="panel issue-panel details-rail">
                    <div className="details-rail-page" style={{ height: "calc(100vh - 200px)", display: "flex", flexDirection: "column" }}>
                      <div className="panel-heading compact" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "10px", marginBottom: "12px", flexShrink: 0 }}>
                        <div>
                          <span className="section-kicker">Inspector</span>
                          <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>
                            {selectedMember.memberKey !== undefined ? "Member Properties" : "Relationship"}
                          </h2>
                        </div>
                        <StatusBadge tone="info">Selected</StatusBadge>
                      </div>

                      <div className="inspector-scroll-container" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                        {selectedMember.memberKey !== undefined ? (
                          <div style={{ marginBottom: "1rem" }}>
                            <div style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                              Member Key
                            </div>
                            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", wordBreak: "break-all" }}>
                              {selectedMember.memberKey}
                            </div>
                            {selectedMember.description && (
                              <div style={{ fontSize: "0.85rem", color: "var(--muted-strong)", marginTop: "4px" }}>
                                {selectedMember.description}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ marginBottom: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                            <div>
                              <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 650, textTransform: "uppercase" }}>Parent</div>
                              <div style={{ fontSize: "0.95rem", fontWeight: 700, wordBreak: "break-all" }}>{selectedMember.parentKey || "None"}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 650, textTransform: "uppercase" }}>Child</div>
                              <div style={{ fontSize: "0.95rem", fontWeight: 700, wordBreak: "break-all" }}>{selectedMember.childKey || "None"}</div>
                            </div>
                          </div>
                        )}

                        <div className="rail-section">
                          <h3 style={{ fontSize: "0.85rem", fontWeight: 750, textTransform: "uppercase", color: "var(--text)", marginBottom: "8px" }}>
                            Properties
                          </h3>
                          <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                            <table className="data-table" style={{ margin: 0, width: "100%", fontSize: "0.85rem" }}>
                              <thead>
                                <tr style={{ background: "var(--surface-subtle)", borderBottom: "1px solid var(--border)" }}>
                                  <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700 }}>Property</th>
                                  <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700 }}>Value</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  const schema = getDimensionSchema(dimension.dimensionType);
                                  const fields = selectedMember.memberKey !== undefined ? schema.memberFields : schema.relationshipFields;
                                  const rowsToDisplay: { name: string; value: string }[] = [];
                                  const processedFieldNames = new Set<string>();

                                  // 1. Add schema fields in schema order
                                  for (const field of fields) {
                                    let val = selectedMember.properties[field.name];
                                    if ((val === null || val === undefined || String(val).trim() === "") && field.name === schema.memberKeyField) {
                                      val = selectedMember.memberKey;
                                    }
                                    if (val !== null && val !== undefined && String(val).trim() !== "") {
                                      rowsToDisplay.push({ name: field.name, value: String(val) });
                                      processedFieldNames.add(field.name);
                                    }
                                  }

                                  // 2. Add extra properties, ignoring metadata/internal keys and __unknownXml
                                  const ignoredKeys = new Set(["id", "dimensionid", "roworder", "createdat", "updatedat", "isactive", "sourcerownumber", "operation", "operationsource", "operationnotes", "__unknownxml", "parent", "child"]);
                                  for (const [key, val] of Object.entries(selectedMember.properties ?? {})) {
                                    if (processedFieldNames.has(key)) continue;
                                    if (ignoredKeys.has(key.toLowerCase())) continue;
                                    if (val === null || val === undefined || String(val).trim() === "") continue;
                                    rowsToDisplay.push({ name: key, value: String(val) });
                                  }

                                  return rowsToDisplay.map((row) => (
                                    <tr key={row.name} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                      <td style={{ padding: "6px 10px", fontWeight: 600, color: "var(--text)", width: "45%" }}>{row.name}</td>
                                      <td style={{ padding: "6px 10px", color: "var(--muted-strong)", wordBreak: "break-all" }}>{row.value}</td>
                                    </tr>
                                  ));
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  </aside>
                ) : (
                  <IssuePanel
                    dimension={dimension}
                    issues={dimensionIssues}
                    appConfig={appConfig}
                    onIssueClick={handleIssueClick}
                  />
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
