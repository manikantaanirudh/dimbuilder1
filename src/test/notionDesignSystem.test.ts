import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/client/styles.css", "utf8");

describe("Notion-inspired design system CSS", () => {
  it("uses the Notion-inspired core tokens", () => {
    expect(css).toContain("--bg: #f6f5f4;");
    expect(css).toContain("--surface: #ffffff;");
    expect(css).toContain("--surface-subtle: #fafaf9;");
    expect(css).toContain("--text: #1a1a1a;");
    expect(css).toContain("--primary: #5645d4;");
    expect(css).toContain("--radius: 12px;");
    expect(css).toContain("--radius-sm: 8px;");
  });

  it("defines the global toolbar and Notion rail selectors", () => {
    expect(css).toContain(".global-toolbar");
    expect(css).toContain(".brand-wordmark");
    expect(css).toContain(".project-context");
    expect(css).toContain(".sidebar-heading");
  });
});
