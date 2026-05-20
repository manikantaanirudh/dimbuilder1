import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/client/styles.css", "utf8").replace(/\r\n/g, "\n");
const html = readFileSync("index.html", "utf8");

describe("Notion-inspired design system CSS", () => {
  it("uses SR Onestream Dim Builder as the browser-facing app identity", () => {
    expect(html).toContain("<title>Spaulding Ridge Onestream Dim Builder</title>");
  });

  it("uses the Notion-inspired core tokens", () => {
    expect(css).toContain("--bg: #f8f9fb;");
    expect(css).toContain("--surface: #ffffff;");
    expect(css).toContain("--surface-subtle: #f4f6f9;");
    expect(css).toContain("--text: #00204A;");
    expect(css).toContain("--primary: #00204A;");
    expect(css).toContain("--radius: 16px;");
    expect(css).toContain("--radius-sm: 10px;");
  });

  it("defines the global toolbar and Notion rail selectors", () => {
    expect(css).toContain(".global-toolbar");
    expect(css).toContain(".brand-wordmark");
    expect(css).toContain(".project-context");
    expect(css).toContain(".sidebar-heading");
  });

  it("keeps the metadata workspace dense without card-like detail rows", () => {
    expect(css).toContain(".overview-page");
    expect(css).toContain(".overview-page-icon");
    expect(css).toContain(".overview-document");
    expect(css).toContain(".workspace-page");
    expect(css).toContain(".workspace-page-icon");
    expect(css).toContain(".workspace-document");
    expect(css).toContain(".workspace-tablist");
    expect(css).toContain(".details-rail-page");
    expect(css).toContain(".rail-issue-summary");
    expect(css).toContain(".rail-property-section");
    expect(css).toContain(".rail-issues-section");
    expect(css).toContain(".metadata-document");
    expect(css).toContain(".metadata-property-grid");
    expect(css).toContain(".metadata-property-row");
    expect(css).toContain(".metadata-save-bar");
    expect(css).toContain(".rail-facts .fact-item");
    expect(css).toContain(".rail-facts .fact-item:last-child");
    expect(css).toContain(".details-rail .empty-state-block");
    expect(css).toContain(".grid-toolbar-title");
    expect(css).toContain(".grid-toolbar-tools");
    expect(css).toContain(".grid-icon-button");
    expect(css).toContain(".grid-selection-summary");
    expect(css).toContain(".grid-column-menu-title");
    expect(css).toContain(".hierarchy-document");
    expect(css).toContain(".hierarchy-empty");
    expect(css).toContain(".tree-row");
    expect(css).toContain(".tree-member-label");
    expect(css).toContain(".xml-document");
    expect(css).toContain(".xml-toolbar-title");
    expect(css).toContain(".xml-actions");
    expect(css).toContain(".xml-scope-control");
    expect(css).toContain(".xml-code-frame");
    expect(css).toContain(".workbench-grid-toolbar");
    expect(css).toContain(".workbench-data-grid");
  });

  it("keeps workspace tabs horizontally scrollable on narrow screens", () => {
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain(".workspace-tablist {\n    padding: 0;\n    overflow-x: auto;\n    flex-wrap: nowrap;\n    scrollbar-width: thin;\n  }");
    expect(css).toContain(".workspace-tablist button {\n    flex: 0 0 auto;\n    min-width: 76px;\n  }");
  });

  it("keeps phone command bars focused on available lifecycle actions", () => {
    expect(css).toContain("@media (max-width: 480px)");
    expect(css).toContain(".global-toolbar .toolbar-actions .action-button:disabled {\n    display: none;\n  }");
  });
});
