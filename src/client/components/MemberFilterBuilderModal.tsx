import React, { useState, useRef } from "react";
import ReactDOM from "react-dom";
import { useTheme } from "../hooks/useTheme";

interface MemberFilterBuilderModalProps {
  isOpen: boolean;
  initialValue?: string;
  onClose: () => void;
  onApply: (filterText: string) => void;
}

export const MemberFilterBuilderModal: React.FC<MemberFilterBuilderModalProps> = ({
  isOpen,
  initialValue = "",
  onClose,
  onApply,
}) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [filterText, setFilterText] = useState(initialValue);
  const [activeTab, setActiveTab] = useState<"expansion" | "time" | "variables" | "samples">("expansion");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!isOpen) return null;

  const insertTextAtCursor = (textToInsert: string) => {
    if (!textareaRef.current) {
      setFilterText((prev) => prev + textToInsert);
      return;
    }

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = filterText;
    const nextVal = current.substring(0, start) + textToInsert + current.substring(end);
    setFilterText(nextVal);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
    }, 0);
  };

  const prefixes = [
    { label: "E#", name: "Entity" },
    { label: "P#", name: "Parent" },
    { label: "C#", name: "Consolidation" },
    { label: "S#", name: "Scenario" },
    { label: "T#", name: "Time" },
    { label: "V#", name: "View" },
    { label: "A#", name: "Account" },
    { label: "F#", name: "Flow" },
    { label: "O#", name: "Origin" },
    { label: "I#", name: "IC" },
    { label: "U1#", name: "UD1" },
    { label: "U2#", name: "UD2" },
    { label: "U3#", name: "UD3" },
    { label: "U4#", name: "UD4" },
    { label: "U5#", name: "UD5" },
    { label: "U6#", name: "UD6" },
    { label: "U7#", name: "UD7" },
    { label: "U8#", name: "UD8" },
  ];

  const expansionFunctions = [
    "ChildrenInclusiveR",
    "TreeDescendantsR",
    "TreeDescendantsInclusiveR",
    "Parents",
    "Ancestors",
    "Branch",
    "Find",
    "FindAt",
    "First",
    "Last",
    "Keep",
    "Remove",
    "List",
    "Where",
    "Options",
    "Base",
    "Children",
    "Descendants",
    "Tree",
  ];

  const whereProperties = [
    "Name",
    "Description",
    "MemberDim",
    "HasChildren",
    "InUse",
    "AccountType",
    "Currency",
    "IsIc",
    "Formula",
    "UserInReadDataGroup",
    "UserInReadDataGroup2",
    "UserInReadWriteDataGroup",
    "UserInReadWriteDataGroup2",
    "UserInAnyDataSecurityGroup",
    "Text1",
    "Text2",
    "Text3",
    "Text4",
    "Text5",
    "Text6",
    "Text7",
    "Text8",
  ];

  const timeFunctions = [
    { label: "T#CurrentPeriod", desc: "Current POV time period" },
    { label: "T#PriorPeriod", desc: "Previous period" },
    { label: "T#NextPeriod", desc: "Next period" },
    { label: "T#YearPrior", desc: "Same period in prior year" },
    { label: "T#FirstPeriod", desc: "First period of year (e.g. 2026M1)" },
    { label: "T#LastPeriod", desc: "Last period of year (e.g. 2026M12)" },
    { label: "T#CurrentPeriodM1", desc: "Current period minus 1" },
    { label: "T#CurrentPeriodP1", desc: "Current period plus 1" },
    { label: "T#QuarterToDate", desc: "QTD periods expansion" },
    { label: "T#YearToDate", desc: "YTD periods expansion" },
  ];

  const variables = [
    { label: "|POV_Time|", desc: "POV Time period" },
    { label: "|POV_Entity|", desc: "POV Entity name" },
    { label: "|POV_Scenario|", desc: "POV Scenario name" },
    { label: "|POV_Account|", desc: "POV Account name" },
    { label: "|POV_Flow|", desc: "POV Flow name" },
    { label: "|POV_UD1|", desc: "POV UD1 member" },
    { label: "|POV_UD2|", desc: "POV UD2 member" },
    { label: "|WFTime|", desc: "Workflow execution time" },
    { label: "|WFScenario|", desc: "Workflow Scenario" },
    { label: "|WFEntity|", desc: "Workflow Entity" },
    { label: "|WFProfile|", desc: "Workflow Profile Name" },
  ];

  const samples = [
    { label: "POV Member Selection", expr: "A#Revenue:E#TotalCorp.Descendants:S#Actual" },
    { label: "Account Calculation Script", expr: "A#NetIncome = A#GrossProfit - A#OperatingExpenses" },
    { label: "GetDataCell Expression", expr: 'api.Data.GetDataCell("A#Cash:E#DefaultEntity:S#Actual").CellAmount' },
    { label: "Filtered Entity Descendants", expr: "E#Root.TreeDescendantsInclusive.Where(InUse = True)" },
    { label: "Dynamic Calc Formula", expr: 'api.Data.Calculate("A#RetainedEarnings = A#NetIncome + A#PriorRetainedEarnings")' },
  ];

  const handleExpansionButtonClick = (type: string) => {
    switch (type) {
      case "Member":
        insertTextAtCursor(".Member");
        break;
      case "Base":
        insertTextAtCursor(".Base");
        break;
      case "Children":
        insertTextAtCursor(".Children");
        break;
      case "Children(I)":
        insertTextAtCursor(".ChildrenInclusive");
        break;
      case "Descendants":
        insertTextAtCursor(".Descendants");
        break;
      case "Descendants(I)":
        insertTextAtCursor(".DescendantsInclusive");
        break;
      case "Tree":
        insertTextAtCursor(".Tree");
        break;
      case "Tree Descendants":
        insertTextAtCursor(".TreeDescendants");
        break;
      case "Tree Descendants(I)":
        insertTextAtCursor(".TreeDescendantsInclusive");
        break;
      case "Profile Entities":
        insertTextAtCursor("E#Root.WorkflowProfileEntities");
        break;
      case "Calculation Entities":
        insertTextAtCursor("E#Root.CalculationEntities");
        break;
      case "Confirmation Entities":
        insertTextAtCursor("E#Root.ConfirmationEntities");
        break;
      case "GetDataCell":
        insertTextAtCursor('api.Data.GetDataCell("Cb#Cube:E#Entity:A#Account:S#Scenario").CellAmount');
        break;
      case "Parameter":
        insertTextAtCursor("|!ParamName!|");
        break;
      case "Param Display":
        insertTextAtCursor("|!ParamName.Display!|");
        break;
      default:
        insertTextAtCursor(type);
    }
  };

  const colors = {
    modalBg: isDark ? "#1e1e1e" : "#ffffff",
    headerBg: isDark ? "#23272e" : "#2e3440",
    headerText: "#ffffff",
    sidebarBg: isDark ? "#252526" : "#f9fafb",
    border: isDark ? "#333333" : "#e5e7eb",
    btnBg: isDark ? "#2d3748" : "#ffffff",
    btnHover: isDark ? "#3b82f633" : "#eff6ff",
    btnText: isDark ? "#e2e8f0" : "#1f2937",
    tabActiveBg: isDark ? "#374151" : "#3b82f6",
    tabActiveText: "#ffffff",
    tabInactiveBg: isDark ? "#1e1e1e" : "#f3f4f6",
    tabInactiveText: isDark ? "#9ca3af" : "#4b5563",
    muted: isDark ? "#858585" : "#6b7280",
    text: isDark ? "#e2e8f0" : "#111827",
    textareaBg: isDark ? "#141414" : "#ffffff",
    footerBg: isDark ? "#252526" : "#f3f4f6",
  };

  const modalContent = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "820px",
          maxWidth: "96vw",
          height: "560px",
          maxHeight: "92vh",
          background: colors.modalBg,
          border: `1px solid ${colors.border}`,
          borderRadius: "6px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: colors.text,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          isolation: "isolate",
        }}
      >
        {/* Modal Window Header */}
        <div
          style={{
            background: colors.headerBg,
            color: colors.headerText,
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(0,0,0,0.2)",
            userSelect: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "13px" }}>
            <span style={{ fontSize: "14px" }}>🌀</span>
            <span>Member Filter Builder</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={() => navigator.clipboard.writeText(filterText)}
              title="Copy Filter"
              style={{ background: "transparent", border: "none", color: "#ccc", cursor: "pointer", fontSize: "12px", padding: "2px 4px" }}
            >
              📋
            </button>
            <button
              onClick={onClose}
              title="Close"
              style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", fontSize: "14px", fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Content Body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", background: colors.modalBg }}>
          {/* Left Column: Dimension Prefixes */}
          <div
            style={{
              width: "72px",
              background: colors.sidebarBg,
              borderRight: `1px solid ${colors.border}`,
              display: "flex",
              flexDirection: "column",
              padding: "6px 4px",
              overflowY: "auto",
            }}
          >
            <div style={{ fontSize: "11px", fontWeight: 700, textAlign: "center", color: colors.muted, marginBottom: "4px" }}>
              Select
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {prefixes.map((p) => (
                <button
                  key={p.label}
                  onClick={() => insertTextAtCursor(p.label)}
                  title={p.name}
                  style={{
                    background: colors.btnBg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: "3px",
                    padding: "4px 2px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    color: colors.btnText,
                    textAlign: "center",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = colors.btnHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = colors.btnBg)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Center Main Area */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "10px", minWidth: 0, background: colors.modalBg }}>
            {/* Top Textarea */}
            <div style={{ marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: colors.text }}>Member Filter</span>
                <button
                  onClick={() => setFilterText("")}
                  style={{ background: "transparent", border: "none", color: colors.muted, fontSize: "11px", cursor: "pointer" }}
                >
                  Clear
                </button>
              </div>
              <textarea
                ref={textareaRef}
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Enter member filter expression (e.g. A#Revenue:E#TotalCorp.Descendants)..."
                rows={4}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "8px",
                  fontSize: "12px",
                  fontFamily: "Consolas, Monaco, 'Courier New', monospace",
                  border: `1px solid ${colors.border}`,
                  borderRadius: "4px",
                  background: colors.textareaBg,
                  color: colors.text,
                  resize: "none",
                  outline: "none",
                }}
              />
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: `1px solid ${colors.border}`, marginBottom: "8px", gap: "2px" }}>
              {(["expansion", "time", "variables", "samples"] as const).map((tabKey) => {
                const labelMap = {
                  expansion: "Member Expansion",
                  time: "Time Functions",
                  variables: "Variables",
                  samples: "Samples",
                };
                const isActive = activeTab === tabKey;
                return (
                  <button
                    key={tabKey}
                    onClick={() => setActiveTab(tabKey)}
                    style={{
                      padding: "5px 12px",
                      fontSize: "11px",
                      fontWeight: 600,
                      border: `1px solid ${colors.border}`,
                      borderBottom: "none",
                      borderRadius: "4px 4px 0 0",
                      background: isActive ? colors.tabActiveBg : colors.tabInactiveBg,
                      color: isActive ? colors.tabActiveText : colors.tabInactiveText,
                      cursor: "pointer",
                    }}
                  >
                    {labelMap[tabKey]}
                  </button>
                );
              })}
            </div>

            {/* Tab Body */}
            <div style={{ flex: 1, border: `1px solid ${colors.border}`, borderRadius: "4px", padding: "8px", overflow: "hidden", display: "flex", background: colors.modalBg }}>
              {activeTab === "expansion" && (
                <div style={{ display: "flex", width: "100%", gap: "8px" }}>
                  {/* Left sub-column: Member Expansion Functions */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, marginBottom: "4px", color: colors.muted }}>
                      Member Expansion Functions
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", border: `1px solid ${colors.border}`, borderRadius: "3px", background: colors.modalBg }}>
                      {expansionFunctions.map((fn) => (
                        <div
                          key={fn}
                          onClick={() => insertTextAtCursor(`.${fn}`)}
                          style={{
                            padding: "3px 6px",
                            fontSize: "11px",
                            cursor: "pointer",
                            borderBottom: `1px solid ${colors.border}`,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = colors.btnHover)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          {fn}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right sub-column: Where Clause Properties */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, marginBottom: "4px", color: colors.muted }}>
                      Where Clause Properties
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", border: `1px solid ${colors.border}`, borderRadius: "3px", background: colors.modalBg }}>
                      {whereProperties.map((prop) => (
                        <div
                          key={prop}
                          onClick={() => insertTextAtCursor(`[${prop}]`)}
                          style={{
                            padding: "3px 6px",
                            fontSize: "11px",
                            cursor: "pointer",
                            borderBottom: `1px solid ${colors.border}`,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = colors.btnHover)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          {prop}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "time" && (
                <div style={{ width: "100%", overflowY: "auto" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, marginBottom: "6px", color: colors.muted }}>
                    Time Functions
                  </div>
                  {timeFunctions.map((tf) => (
                    <div
                      key={tf.label}
                      onClick={() => insertTextAtCursor(tf.label)}
                      style={{
                        padding: "5px 8px",
                        fontSize: "11px",
                        cursor: "pointer",
                        borderBottom: `1px solid ${colors.border}`,
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = colors.btnHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span style={{ fontWeight: 600 }}>{tf.label}</span>
                      <span style={{ color: colors.muted, fontSize: "10px" }}>{tf.desc}</span>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "variables" && (
                <div style={{ width: "100%", overflowY: "auto" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, marginBottom: "6px", color: colors.muted }}>
                    Substitution Variables
                  </div>
                  {variables.map((v) => (
                    <div
                      key={v.label}
                      onClick={() => insertTextAtCursor(v.label)}
                      style={{
                        padding: "5px 8px",
                        fontSize: "11px",
                        cursor: "pointer",
                        borderBottom: `1px solid ${colors.border}`,
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = colors.btnHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span style={{ fontWeight: 600 }}>{v.label}</span>
                      <span style={{ color: colors.muted, fontSize: "10px" }}>{v.desc}</span>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "samples" && (
                <div style={{ width: "100%", overflowY: "auto" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, marginBottom: "6px", color: colors.muted }}>
                    Formula & POV Samples (Click to Insert)
                  </div>
                  {samples.map((s) => (
                    <div
                      key={s.label}
                      onClick={() => insertTextAtCursor(s.expr)}
                      style={{
                        padding: "6px 8px",
                        fontSize: "11px",
                        cursor: "pointer",
                        borderBottom: `1px solid ${colors.border}`,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = colors.btnHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ fontWeight: 700, color: "#3b82f6" }}>{s.label}</div>
                      <div style={{ fontFamily: "monospace", fontSize: "11px", color: colors.text }}>{s.expr}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Expansion, Workflow, Other Action Buttons */}
          <div
            style={{
              width: "150px",
              background: colors.sidebarBg,
              borderLeft: `1px solid ${colors.border}`,
              padding: "8px 6px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {/* Expansion */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, textAlign: "center", marginBottom: "4px", color: colors.muted }}>
                Expansion
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                {["Member", "Base", "Children", "Children(I)", "Descendants", "Descendants(I)", "Tree", "Tree Descendants", "Tree Descendants(I)"].map(
                  (btn) => (
                    <button
                      key={btn}
                      onClick={() => handleExpansionButtonClick(btn)}
                      style={{
                        background: colors.btnBg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: "3px",
                        padding: "3px 4px",
                        fontSize: "11px",
                        cursor: "pointer",
                        color: colors.btnText,
                        textAlign: "center",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = colors.btnHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = colors.btnBg)}
                    >
                      {btn}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Workflow */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, textAlign: "center", marginBottom: "4px", color: colors.muted }}>
                Workflow
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                {["Profile Entities", "Calculation Entities", "Confirmation Entities"].map((btn) => (
                  <button
                    key={btn}
                    onClick={() => handleExpansionButtonClick(btn)}
                    style={{
                      background: colors.btnBg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: "3px",
                      padding: "3px 4px",
                      fontSize: "11px",
                      cursor: "pointer",
                      color: colors.btnText,
                      textAlign: "center",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = colors.btnHover)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = colors.btnBg)}
                  >
                    {btn}
                  </button>
                ))}
              </div>
            </div>

            {/* Other */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, textAlign: "center", marginBottom: "4px", color: colors.muted }}>
                Other
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                {["GetDataCell", "Parameter", "Param Display"].map((btn) => (
                  <button
                    key={btn}
                    onClick={() => handleExpansionButtonClick(btn)}
                    style={{
                      background: colors.btnBg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: "3px",
                      padding: "3px 4px",
                      fontSize: "11px",
                      cursor: "pointer",
                      color: colors.btnText,
                      textAlign: "center",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = colors.btnHover)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = colors.btnBg)}
                  >
                    {btn}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "8px 12px",
            background: colors.footerBg,
            borderTop: `1px solid ${colors.border}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
          }}
        >
          <button
            onClick={() => {
              onApply(filterText);
              onClose();
            }}
            style={{
              padding: "4px 16px",
              background: "#10b981",
              color: "#ffffff",
              border: "none",
              borderRadius: "4px",
              fontWeight: 600,
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            OK
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "4px 14px",
              background: colors.btnBg,
              color: colors.btnText,
              border: `1px solid ${colors.border}`,
              borderRadius: "4px",
              fontWeight: 600,
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
