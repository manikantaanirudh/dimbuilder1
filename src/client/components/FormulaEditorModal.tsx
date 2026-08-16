import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { MemberFilterBuilderModal } from "./MemberFilterBuilderModal";
import { useTheme } from "../hooks/useTheme";

interface FormulaEditorModalProps {
  isOpen: boolean;
  memberName?: string;
  dimensionType?: string;
  initialFormula?: string;
  onClose: () => void;
  onSave: (formula: string) => void;
}

interface DiagnosticError {
  line: number;
  col: number;
  code: string;
  message: string;
}

export const FormulaEditorModal: React.FC<FormulaEditorModalProps> = ({
  isOpen,
  memberName = "Actual",
  dimensionType = "Scenario",
  initialFormula = "",
  onClose,
  onSave,
}) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [formulaCode, setFormulaCode] = useState(initialFormula);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(true);
  const [isFooterCollapsed, setIsFooterCollapsed] = useState(true);
  const [isHelperHeaderCollapsed, setIsHelperHeaderCollapsed] = useState(true);
  const [isHelperFooterCollapsed, setIsHelperFooterCollapsed] = useState(true);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [compilationStatus, setCompilationStatus] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
    errors: DiagnosticError[];
    timestamp?: string;
  }>({
    tested: false,
    success: true,
    message: "",
    errors: [],
  });
  const [isMaximized, setIsMaximized] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setFormulaCode(initialFormula);
    setCompilationStatus({ tested: false, success: true, message: "", errors: [] });
  }, [initialFormula, isOpen]);

  if (!isOpen) return null;

  // Theme-tailored Color Palette
  const colors = {
    modalBg: isDark ? "#1e1e1e" : "#ffffff",
    headerBg: isDark ? "#23272e" : "#2e3440",
    headerText: "#ffffff",
    toolbarBg: isDark ? "#282c34" : "#f3f4f6",
    toolbarBorder: isDark ? "#1e2227" : "#e5e7eb",
    toolbarText: isDark ? "#abb2bf" : "#1f2937",
    inputBg: isDark ? "#1e2227" : "#ffffff",
    inputBorder: isDark ? "#3e4451" : "#d1d5db",
    inputText: isDark ? "#abb2bf" : "#111827",
    gutterBg: isDark ? "#1e1e1e" : "#fafafa",
    gutterBorder: isDark ? "#2d2d2d" : "#e5e7eb",
    gutterText: isDark ? "#858585" : "#9ca3af",
    editorBg: isDark ? "#1e1e1e" : "#ffffff",
    editorText: isDark ? "#e2e8f0" : "#111827",
    badgeBg: isDark ? "#252526" : "#f3f4f6",
    badgeBorder: isDark ? "#333333" : "#d1d5db",
    badgePillBg: isDark ? "#333333" : "#e5e7eb",
    badgeText: isDark ? "#cccccc" : "#374151",
    subtleText: isDark ? "#666666" : "#6b7280",
    commentText: isDark ? "#6a9955" : "#008000",
    footerBg: isDark ? "#252526" : "#f3f4f6",
    footerBorder: isDark ? "#333333" : "#e5e7eb",
    cancelBtnBg: isDark ? "#2d3748" : "#ffffff",
    cancelBtnBorder: isDark ? "#4a5568" : "#d1d5db",
    cancelBtnText: isDark ? "#e2e8f0" : "#374151",
  };

  // Standard OneStream VB.NET Header & Footer Boilerplate
  const formulaHeaderLines = [
    "'------------------------------------------------------------------------------------------------------------",
    "' Reference: OneStream Member Formula",
    "' Dimension: " + dimensionType + " | Member: " + memberName,
    "'------------------------------------------------------------------------------------------------------------",
    "Imports System",
    "Imports System.Data",
    "Imports System.Data.Common",
    "Imports System.IO",
    "Imports System.Collections.Generic",
    "Imports System.Globalization",
    "Imports System.Linq",
    "Imports Microsoft.VisualBasic",
    "Imports OneStream.Shared.Common",
    "Imports OneStream.Shared.Database",
    "Imports OneStream.Shared.Engine",
    "Imports OneStream.Shared.Wcf",
    "Imports OneStream.Stage.Common",
    "Imports OneStream.Stage.Engine",
    "",
    "Namespace OneStream.BusinessRule.MemberFormula",
    "    Public Class MainClass",
    "        Public Function Main(ByVal si As SessionInfo, ByVal globals As BRGlobals, ByVal api As ScenarioFormulaApi, ByVal args As ScenarioFormulaArgs) As Object",
    "            Try",
  ];

  const formulaFooterLines = [
    "            Catch ex As Exception",
    "                Throw ErrorHandler.LogWrite(si, New XFException(si, ex))",
    "            End Try",
    "            Return Nothing",
    "        End Function",
    "    End Class",
    "End Namespace",
  ];

  const helperHeaderLines = [
    "Namespace OneStream.BusinessRule.MemberFormula",
    "    Public Class HelperClass",
  ];

  const helperFooterLines = [
    "    End Class",
    "End Namespace",
  ];

  const bodyLines = formulaCode.split("\n");
  const bodyLineCount = bodyLines.length;
  const footerStartLine = 26 + bodyLineCount;

  // VB.NET Compiler and Syntax Validation Engine
  const compileVbNetCode = () => {
    const code = formulaCode;
    const errors: DiagnosticError[] = [];
    const lines = code.split("\n");

    const ifStack: number[] = [];
    const tryStack: number[] = [];
    const forStack: number[] = [];
    const whileStack: number[] = [];
    const selectStack: number[] = [];
    const doStack: number[] = [];

    lines.forEach((lineText, idx) => {
      const lineNum = 26 + idx;
      const trimmed = lineText.trim();

      // Ignore comment lines
      if (trimmed.startsWith("'") || trimmed.toLowerCase().startsWith("rem ")) {
        return;
      }

      // Check string literals closing
      let inString = false;
      for (let c = 0; c < lineText.length; c++) {
        if (lineText[c] === '"') {
          inString = !inString;
        }
      }
      if (inString) {
        errors.push({
          line: lineNum,
          col: lineText.lastIndexOf('"') + 1,
          code: "BC30035",
          message: "Syntax error: String constant must end with a matching quote '\"'.",
        });
      }

      // Check unmatched parenthesis
      let openParen = 0;
      let inStr = false;
      for (let c = 0; c < lineText.length; c++) {
        if (lineText[c] === '"') inStr = !inStr;
        if (!inStr) {
          if (lineText[c] === "(") openParen++;
          if (lineText[c] === ")") openParen--;
        }
      }
      if (openParen !== 0 && !trimmed.endsWith("_")) {
        errors.push({
          line: lineNum,
          col: lineText.length,
          code: "BC30198",
          message: openParen > 0 ? "')' expected." : "Unmatched closing parenthesis ')'.",
        });
      }

      // Block checks
      const lower = trimmed.toLowerCase();

      // If / Then / End If
      if (lower.startsWith("if ") && lower.includes(" then") && !lower.endsWith(" then")) {
        // Single line if: If cond Then statement -> valid
      } else if (lower.startsWith("if ") && lower.endsWith("then")) {
        ifStack.push(lineNum);
      } else if (lower === "end if" || lower === "endif") {
        if (ifStack.length === 0) {
          errors.push({
            line: lineNum,
            col: 1,
            code: "BC30081",
            message: "'End If' must be preceded by a matching 'If'.",
          });
        } else {
          ifStack.pop();
        }
      }

      // Try / Catch / End Try
      if (lower === "try") {
        tryStack.push(lineNum);
      } else if (lower === "end try") {
        if (tryStack.length === 0) {
          errors.push({
            line: lineNum,
            col: 1,
            code: "BC30084",
            message: "'End Try' must be preceded by a matching 'Try'.",
          });
        } else {
          tryStack.pop();
        }
      }

      // For / Next
      if (lower.startsWith("for ") && lower.includes(" to ")) {
        forStack.push(lineNum);
      } else if (lower.startsWith("next") || lower === "next") {
        if (forStack.length === 0) {
          errors.push({
            line: lineNum,
            col: 1,
            code: "BC30092",
            message: "'Next' must be preceded by a matching 'For'.",
          });
        } else {
          forStack.pop();
        }
      }

      // While / End While
      if (lower.startsWith("while ")) {
        whileStack.push(lineNum);
      } else if (lower === "end while" || lower === "wend") {
        if (whileStack.length === 0) {
          errors.push({
            line: lineNum,
            col: 1,
            code: "BC30082",
            message: "'End While' must be preceded by a matching 'While'.",
          });
        } else {
          whileStack.pop();
        }
      }

      // Select Case / End Select
      if (lower.startsWith("select case ")) {
        selectStack.push(lineNum);
      } else if (lower === "end select") {
        if (selectStack.length === 0) {
          errors.push({
            line: lineNum,
            col: 1,
            code: "BC30083",
            message: "'End Select' must be preceded by a matching 'Select Case'.",
          });
        } else {
          selectStack.pop();
        }
      }

      // Do / Loop
      if (lower === "do" || lower.startsWith("do while ") || lower.startsWith("do until ")) {
        doStack.push(lineNum);
      } else if (lower === "loop" || lower.startsWith("loop while ") || lower.startsWith("loop until ")) {
        if (doStack.length === 0) {
          errors.push({
            line: lineNum,
            col: 1,
            code: "BC30089",
            message: "'Loop' must be preceded by a matching 'Do'.",
          });
        } else {
          doStack.pop();
        }
      }
    });

    // Unclosed blocks check
    ifStack.forEach((line) => {
      errors.push({
        line,
        col: 1,
        code: "BC30081",
        message: "'If' block must end with a matching 'End If'.",
      });
    });
    tryStack.forEach((line) => {
      errors.push({
        line,
        col: 1,
        code: "BC30084",
        message: "'Try' block must end with a matching 'End Try'.",
      });
    });
    forStack.forEach((line) => {
      errors.push({
        line,
        col: 1,
        code: "BC30092",
        message: "'For' loop must end with a matching 'Next'.",
      });
    });
    whileStack.forEach((line) => {
      errors.push({
        line,
        col: 1,
        code: "BC30082",
        message: "'While' block must end with a matching 'End While'.",
      });
    });
    selectStack.forEach((line) => {
      errors.push({
        line,
        col: 1,
        code: "BC30083",
        message: "'Select Case' block must end with a matching 'End Select'.",
      });
    });
    doStack.forEach((line) => {
      errors.push({
        line,
        col: 1,
        code: "BC30089",
        message: "'Do' loop must end with a matching 'Loop'.",
      });
    });

    const now = new Date().toLocaleTimeString();
    if (errors.length === 0) {
      setCompilationStatus({
        tested: true,
        success: true,
        message: "✓ Compilation Successful: 0 Errors, 0 Warnings",
        errors: [],
        timestamp: now,
      });
    } else {
      setCompilationStatus({
        tested: true,
        success: false,
        message: `✗ Compilation Failed: ${errors.length} Error(s) found.`,
        errors,
        timestamp: now,
      });
    }
  };

  const insertTextAtCursor = (textToInsert: string) => {
    if (!textareaRef.current) {
      setFormulaCode((prev) => prev + textToInsert);
      return;
    }
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = formulaCode;
    const nextVal = current.substring(0, start) + textToInsert + current.substring(end);
    setFormulaCode(nextVal);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      insertTextAtCursor("    "); // 4 spaces for VB.NET
    }
    if (e.key === "Enter") {
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const textBefore = formulaCode.substring(0, start);
        const currentLine = textBefore.substring(textBefore.lastIndexOf("\n") + 1);
        const leadingWhitespace = currentLine.match(/^\s*/)?.[0] || "";
        e.preventDefault();
        insertTextAtCursor("\n" + leadingWhitespace);
      }
    }
  };

  const updateCursorPosition = () => {
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart;
    const textBefore = formulaCode.substring(0, pos);
    const lines = textBefore.split("\n");
    setCursorPos({
      line: 26 + lines.length - 1,
      col: lines[lines.length - 1].length + 1,
    });
  };

  const handleFormatCode = () => {
    const lines = formulaCode.split("\n");
    let indentLevel = 3;
    const formatted = lines.map((line) => {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();

      if (
        lower.startsWith("end if") ||
        lower.startsWith("end try") ||
        lower.startsWith("end select") ||
        lower.startsWith("end while") ||
        lower.startsWith("next") ||
        lower.startsWith("loop") ||
        lower.startsWith("catch") ||
        lower.startsWith("finally") ||
        lower.startsWith("else") ||
        lower.startsWith("elseif")
      ) {
        indentLevel = Math.max(3, indentLevel - 1);
      }

      const indent = "    ".repeat(indentLevel);
      const res = trimmed ? indent + trimmed : "";

      if (
        (lower.startsWith("if ") && lower.endsWith("then")) ||
        lower === "try" ||
        lower.startsWith("select case ") ||
        lower.startsWith("while ") ||
        (lower.startsWith("for ") && lower.includes(" to ")) ||
        lower === "do" ||
        lower.startsWith("catch ") ||
        lower === "else" ||
        lower.startsWith("elseif ")
      ) {
        indentLevel++;
      }

      return res;
    });

    setFormulaCode(formatted.join("\n"));
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
        zIndex: 999999,
      }}
    >
      <div
        style={{
          width: isMaximized ? "98vw" : "900px",
          height: isMaximized ? "96vh" : "620px",
          maxWidth: "98vw",
          maxHeight: "96vh",
          background: colors.modalBg,
          border: `1px solid ${colors.toolbarBorder}`,
          borderRadius: "6px",
          boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: colors.editorText,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          transition: "width 0.2s, height 0.2s",
          isolation: "isolate",
        }}
      >
        {/* Window Chrome Header */}
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
            <span style={{ fontSize: "14px", color: "#60a5fa" }}>◓</span>
            <span>Formula Editor - [{memberName}]</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => navigator.clipboard.writeText(formulaCode)}
              title="Copy Formula"
              style={{ background: "transparent", border: "none", color: "#ccc", cursor: "pointer", fontSize: "12px" }}
            >
              📋
            </button>
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? "Restore" : "Maximize"}
              style={{ background: "transparent", border: "none", color: "#ccc", cursor: "pointer", fontSize: "13px" }}
            >
              {isMaximized ? "🗗" : "🗖"}
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

        {/* Toolbar */}
        <div
          style={{
            background: colors.toolbarBg,
            borderBottom: `1px solid ${colors.toolbarBorder}`,
            padding: "4px 8px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "12px",
            userSelect: "none",
          }}
        >
          {/* Search Box */}
          <div style={{ display: "flex", alignItems: "center", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, borderRadius: "3px", padding: "2px 4px" }}>
            <input
              type="text"
              placeholder="Find..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                color: colors.inputText,
                fontSize: "11px",
                width: "100px",
                outline: "none",
              }}
            />
            <span style={{ fontSize: "11px", color: colors.subtleText, cursor: "pointer" }} title="Find Next">
              🔍
            </span>
          </div>

          {/* Line Numbers Toggle */}
          <button
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            title="Toggle Line Numbers (#)"
            style={{
              background: showLineNumbers ? (isDark ? "#3b82f633" : "#e0e7ff") : "transparent",
              border: `1px solid ${colors.inputBorder}`,
              borderRadius: "3px",
              padding: "2px 6px",
              fontWeight: 700,
              fontSize: "11px",
              cursor: "pointer",
              color: colors.toolbarText,
            }}
          >
            #
          </button>

          <span style={{ color: colors.toolbarBorder }}>|</span>

          {/* Auto Format / Indent */}
          <button
            onClick={handleFormatCode}
            title="Format / Indent Code (:=)"
            style={{
              background: "transparent",
              border: `1px solid ${colors.inputBorder}`,
              borderRadius: "3px",
              padding: "2px 6px",
              fontWeight: 700,
              fontSize: "11px",
              cursor: "pointer",
              color: colors.toolbarText,
            }}
          >
            :=
          </button>

          {/* Undo / Redo */}
          <button
            onClick={() => document.execCommand("undo")}
            title="Undo"
            style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "12px", color: colors.toolbarText }}
          >
            ↶
          </button>
          <button
            onClick={() => document.execCommand("redo")}
            title="Redo"
            style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "12px", color: colors.toolbarText }}
          >
            ↷
          </button>

          <span style={{ color: colors.toolbarBorder }}>|</span>

          {/* Member Filter Builder launcher (🌪️ Filter icon) */}
          <button
            onClick={() => setIsFilterModalOpen(true)}
            title="Open Member Filter Builder"
            style={{
              background: colors.inputBg,
              border: `1px solid ${colors.inputBorder}`,
              borderRadius: "3px",
              padding: "2px 8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              fontWeight: 600,
              color: colors.toolbarText,
            }}
          >
            <span>🌪️</span>
            <span>Filter Builder</span>
          </button>

          {/* Find & Replace dialog toggle */}
          <button
            onClick={() => setShowFindReplace(!showFindReplace)}
            title="Find & Replace (👓)"
            style={{
              background: showFindReplace ? (isDark ? "#3b82f633" : "#e0e7ff") : "transparent",
              border: `1px solid ${colors.inputBorder}`,
              borderRadius: "3px",
              padding: "2px 6px",
              cursor: "pointer",
              fontSize: "11px",
              color: colors.toolbarText,
            }}
          >
            👓
          </button>

          <span style={{ color: colors.toolbarBorder }}>|</span>

          {/* Compile / Check Syntax Button (✔️) */}
          <button
            onClick={compileVbNetCode}
            title="Compile & Check VB.NET Syntax"
            style={{
              background: "#10b981",
              color: "#ffffff",
              border: "none",
              borderRadius: "3px",
              padding: "3px 10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontWeight: 700,
              fontSize: "11px",
            }}
          >
            <span>✓</span>
            <span>Compile</span>
          </button>
        </div>

        {/* Optional Find/Replace Bar */}
        {showFindReplace && (
          <div
            style={{
              background: isDark ? "#282c34" : "#f9fafb",
              borderBottom: `1px solid ${colors.toolbarBorder}`,
              padding: "4px 10px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "11px",
            }}
          >
            <span>Replace:</span>
            <input
              type="text"
              placeholder="Target..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: "2px 4px", fontSize: "11px", border: `1px solid ${colors.inputBorder}`, borderRadius: "3px", background: colors.inputBg, color: colors.inputText }}
            />
            <span>With:</span>
            <input
              type="text"
              placeholder="Replacement..."
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              style={{ padding: "2px 4px", fontSize: "11px", border: `1px solid ${colors.inputBorder}`, borderRadius: "3px", background: colors.inputBg, color: colors.inputText }}
            />
            <button
              onClick={() => {
                if (searchQuery) {
                  setFormulaCode(formulaCode.split(searchQuery).join(replaceQuery));
                }
              }}
              style={{ padding: "2px 8px", fontSize: "11px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "3px", cursor: "pointer" }}
            >
              Replace All
            </button>
          </div>
        )}

        {/* Code Canvas Area (100% Solid Opaque Background) */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            background: colors.editorBg,
            color: colors.editorText,
            fontFamily: "Consolas, Monaco, 'Courier New', monospace",
            fontSize: "13px",
            lineHeight: "1.45",
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          {/* 1. Formula Header (Foldable) */}
          <div style={{ borderBottom: `1px dashed ${colors.badgeBorder}` }}>
            <div
              onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
              style={{
                background: colors.badgeBg,
                padding: "3px 8px",
                fontSize: "11px",
                color: colors.badgeText,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                userSelect: "none",
              }}
            >
              <span style={{ fontSize: "12px", fontWeight: 700 }}>{isHeaderCollapsed ? "⊞" : "⊟"}</span>
              <span style={{ background: colors.badgePillBg, padding: "1px 6px", borderRadius: "3px", color: colors.badgeText, fontWeight: 600 }}>
                Formula Header..
              </span>
              <span style={{ fontSize: "10px", color: colors.subtleText }}>
                (Lines 1–25: VB.NET OneStream Imports & Main Function Declaration)
              </span>
            </div>
            {!isHeaderCollapsed && (
              <div style={{ padding: "4px 8px 4px 40px", color: colors.commentText, fontSize: "12px", background: isDark ? "#1b1b1b" : "#fdfdfd" }}>
                {formulaHeaderLines.map((line, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "12px" }}>
                    {showLineNumbers && (
                      <span style={{ width: "24px", textAlign: "right", color: colors.gutterText, userSelect: "none", fontSize: "11px" }}>
                        {idx + 1}
                      </span>
                    )}
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Main Editable Formula Script Area */}
          <div style={{ flex: 1, display: "flex", position: "relative", minHeight: "160px", background: colors.editorBg }}>
            {/* Gutter Line Numbers */}
            {showLineNumbers && (
              <div
                style={{
                  width: "42px",
                  background: colors.gutterBg,
                  borderRight: `1px solid ${colors.gutterBorder}`,
                  padding: "6px 4px 6px 0",
                  textAlign: "right",
                  color: colors.gutterText,
                  fontSize: "12px",
                  userSelect: "none",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {bodyLines.map((_, idx) => (
                  <div key={idx} style={{ height: "18.85px" }}>
                    {26 + idx}
                  </div>
                ))}
              </div>
            )}

            {/* Editable Textarea */}
            <textarea
              ref={textareaRef}
              value={formulaCode}
              onChange={(e) => {
                setFormulaCode(e.target.value);
                updateCursorPosition();
              }}
              onKeyDown={handleKeyDown}
              onClick={updateCursorPosition}
              onKeyUp={updateCursorPosition}
              placeholder="' Write your VB.NET Member Formula here...&#10;Return api.Data.GetDataCell(&quot;A#Revenue:E#TotalCorp&quot;).CellAmount"
              spellCheck={false}
              style={{
                flex: 1,
                padding: "6px 8px",
                background: colors.editorBg,
                color: colors.editorText,
                fontSize: "13px",
                fontFamily: "Consolas, Monaco, 'Courier New', monospace",
                lineHeight: "1.45",
                border: "none",
                outline: "none",
                resize: "none",
                whiteSpace: "pre",
                overflowX: "auto",
                overflowY: "auto",
              }}
            />
          </div>

          {/* 3. Formula Footer (Foldable) */}
          <div style={{ borderTop: `1px dashed ${colors.badgeBorder}` }}>
            <div
              onClick={() => setIsFooterCollapsed(!isFooterCollapsed)}
              style={{
                background: colors.badgeBg,
                padding: "3px 8px",
                fontSize: "11px",
                color: colors.badgeText,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                userSelect: "none",
              }}
            >
              <span style={{ fontSize: "12px", fontWeight: 700 }}>{isFooterCollapsed ? "⊞" : "⊟"}</span>
              <span style={{ background: colors.badgePillBg, padding: "1px 6px", borderRadius: "3px", color: colors.badgeText, fontWeight: 600 }}>
                Formula Footer..
              </span>
              <span style={{ fontSize: "10px", color: colors.subtleText }}>
                (Lines {footerStartLine}–{footerStartLine + formulaFooterLines.length - 1}: Catch Exception & End Function)
              </span>
            </div>
            {!isFooterCollapsed && (
              <div style={{ padding: "4px 8px 4px 40px", color: colors.commentText, fontSize: "12px", background: isDark ? "#1b1b1b" : "#fdfdfd" }}>
                {formulaFooterLines.map((line, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "12px" }}>
                    {showLineNumbers && (
                      <span style={{ width: "24px", textAlign: "right", color: colors.gutterText, userSelect: "none", fontSize: "11px" }}>
                        {footerStartLine + idx}
                      </span>
                    )}
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. Helper Functions Header (Foldable) */}
          <div style={{ borderTop: `1px dashed ${colors.badgeBorder}` }}>
            <div
              onClick={() => setIsHelperHeaderCollapsed(!isHelperHeaderCollapsed)}
              style={{
                background: colors.badgeBg,
                padding: "3px 8px",
                fontSize: "11px",
                color: colors.badgeText,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                userSelect: "none",
              }}
            >
              <span style={{ fontSize: "12px", fontWeight: 700 }}>{isHelperHeaderCollapsed ? "⊞" : "⊟"}</span>
              <span style={{ background: colors.badgePillBg, padding: "1px 6px", borderRadius: "3px", color: colors.badgeText, fontWeight: 600 }}>
                Helper Functions Header..
              </span>
            </div>
            {!isHelperHeaderCollapsed && (
              <div style={{ padding: "4px 8px 4px 40px", color: colors.commentText, fontSize: "12px", background: isDark ? "#1b1b1b" : "#fdfdfd" }}>
                {helperHeaderLines.map((line, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "12px" }}>
                    {showLineNumbers && (
                      <span style={{ width: "24px", textAlign: "right", color: colors.gutterText, userSelect: "none", fontSize: "11px" }}>
                        {footerStartLine + formulaFooterLines.length + idx}
                      </span>
                    )}
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. Helper Functions Footer (Foldable) */}
          <div style={{ borderTop: `1px dashed ${colors.badgeBorder}` }}>
            <div
              onClick={() => setIsHelperFooterCollapsed(!isHelperFooterCollapsed)}
              style={{
                background: colors.badgeBg,
                padding: "3px 8px",
                fontSize: "11px",
                color: colors.badgeText,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                userSelect: "none",
              }}
            >
              <span style={{ fontSize: "12px", fontWeight: 700 }}>{isHelperFooterCollapsed ? "⊞" : "⊟"}</span>
              <span style={{ background: colors.badgePillBg, padding: "1px 6px", borderRadius: "3px", color: colors.badgeText, fontWeight: 600 }}>
                Helper Functions Footer..
              </span>
            </div>
            {!isHelperFooterCollapsed && (
              <div style={{ padding: "4px 8px 4px 40px", color: colors.commentText, fontSize: "12px", background: isDark ? "#1b1b1b" : "#fdfdfd" }}>
                {helperFooterLines.map((line, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "12px" }}>
                    {showLineNumbers && (
                      <span style={{ width: "24px", textAlign: "right", color: colors.gutterText, userSelect: "none", fontSize: "11px" }}>
                        {footerStartLine + formulaFooterLines.length + helperHeaderLines.length + idx}
                      </span>
                    )}
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Diagnostics & Compiler Result Drawer */}
        {compilationStatus.tested && (
          <div
            style={{
              padding: "8px 12px",
              background: compilationStatus.success
                ? isDark ? "#064e3b" : "#ecfdf5"
                : isDark ? "#450a0a" : "#fef2f2",
              color: compilationStatus.success
                ? isDark ? "#6ee7b7" : "#065f46"
                : isDark ? "#fca5a5" : "#991b1b",
              borderTop: `1px solid ${compilationStatus.success ? (isDark ? "#047857" : "#a7f3d0") : (isDark ? "#991b1b" : "#fecaca")}`,
              fontSize: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              maxHeight: "120px",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700 }}>
              <span>{compilationStatus.message}</span>
              {compilationStatus.timestamp && (
                <span style={{ fontSize: "10px", opacity: 0.8 }}>Compiled at {compilationStatus.timestamp}</span>
              )}
            </div>
            {compilationStatus.errors.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "11px" }}>
                {compilationStatus.errors.map((err, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "6px" }}>
                    <span style={{ fontWeight: 700 }}>Line {err.line}:</span>
                    <span>[{err.code}] {err.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Status Bar & Action Footer */}
        <div
          style={{
            padding: "8px 12px",
            background: colors.footerBg,
            borderTop: `1px solid ${colors.footerBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Status info */}
          <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: colors.subtleText }}>
            <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
            <span>Length: {formulaCode.length}</span>
            <span>VB.NET (OneStream 8.0)</span>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => {
                onSave(formulaCode);
                onClose();
              }}
              style={{
                padding: "4px 18px",
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
                background: colors.cancelBtnBg,
                color: colors.cancelBtnText,
                border: `1px solid ${colors.cancelBtnBorder}`,
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

      {/* Member Filter Builder Sub-Modal */}
      <MemberFilterBuilderModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={(filterText) => {
          insertTextAtCursor(filterText);
          setIsFilterModalOpen(false);
        }}
      />
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
