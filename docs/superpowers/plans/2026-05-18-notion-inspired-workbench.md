# DimBuilder Notion-Inspired Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Notion-inspired metadata workspace design system from `DESIGN.md` and `docs/superpowers/specs/2026-05-18-notion-inspired-workbench-design.md`.

**Architecture:** Keep the existing Clean Workbench React component structure and improve it with a top-spanning command bar, a dimensions-first left rail, Notion-derived CSS tokens, and focused markup/style tests. Most of the change is CSS plus a narrow `AppShell` markup adjustment.

**Tech Stack:** React 18, Vite, TypeScript, CSS, Vitest, Playwright for browser QA.

---

## File Map

- `docs/superpowers/assets/2026-05-18-notion-workbench-concept.png`: approved concept reference.
- `docs/superpowers/specs/2026-05-18-notion-inspired-workbench-design.md`: design requirements.
- `src/client/components/AppShell.tsx`: top-spanning toolbar and dimensions-first rail markup.
- `src/client/styles.css`: Notion-inspired tokens, shell, controls, grid, rail, and responsive rules.
- `src/test/clientComponentsMarkup.test.ts`: visible structure and accessibility contract.
- `src/test/notionDesignSystem.test.ts`: CSS token and selector contract.

---

### Task 1: Lock The Notion Workbench Contract

**Files:**
- Modify: `src/test/clientComponentsMarkup.test.ts`
- Create: `src/test/notionDesignSystem.test.ts`

- [ ] **Step 1: Add markup tests**

Add tests that verify:

```ts
it("renders the Notion-inspired global workbench toolbar", () => {
  const markup = render(createElement(AppShell, { appConfig: defaultAppConfig }));

  expect(markup).toContain("global-toolbar");
  expect(markup).toContain("brand-wordmark");
  expect(markup).toContain(">DimBuilder<");
  expect(markup).toContain("project-context");
  expect(markup).not.toContain("nav-project");
});
```

And:

```ts
it("keeps the left rail focused on searchable dimensions", () => {
  const markup = render(createElement(AppShell, { appConfig: defaultAppConfig }));

  expect(markup).toContain("sidebar-heading");
  expect(markup).toContain("Search dimensions");
  expect(markup).not.toContain("OneStream XF Dimension Builder</span></div><div class=\"nav-project\"");
});
```

- [ ] **Step 2: Add CSS token tests**

Create `src/test/notionDesignSystem.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests to verify red**

Run:

```powershell
npm.cmd test -- src/test/clientComponentsMarkup.test.ts src/test/notionDesignSystem.test.ts
```

Expected: FAIL until AppShell/CSS changes are implemented.

---

### Task 2: Restructure The App Shell For A Top-Spanning Toolbar

**Files:**
- Modify: `src/client/components/AppShell.tsx`

- [ ] **Step 1: Move the toolbar before the sidebar**

Change `AppShell` so the rendered order is:

```tsx
<div className="app-shell notion-workbench">
  <header className="toolbar global-toolbar">...</header>
  <aside className="sidebar workbench-nav">...</aside>
  <main className="main">...</main>
  ...
</div>
```

- [ ] **Step 2: Add DimBuilder brand and project context**

Use:

```tsx
<div className="brand global-brand">
  <span className="brand-mark"><Database size={17} /></span>
  <span className="brand-wordmark">DimBuilder</span>
</div>
<div className="project-context">
  <strong>{store.projects[0]?.name ?? "No project imported"}</strong>
  <span>{store.loading ? "Loading..." : store.projects[0]?.sourceFileName ?? appConfig.application.supportText}</span>
</div>
```

- [ ] **Step 3: Remove sidebar project block**

Delete the sidebar brand and `nav-project` markup. Add:

```tsx
<div className="sidebar-heading">
  <strong>Dimensions</strong>
  <span>{dimensionNavItems.length} dimensions</span>
</div>
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npm.cmd test -- src/test/clientComponentsMarkup.test.ts
```

Expected: AppShell structural tests pass after CSS-independent markup work.

---

### Task 3: Apply Notion-Inspired CSS Tokens And Surfaces

**Files:**
- Modify: `src/client/styles.css`

- [ ] **Step 1: Replace core tokens**

Set root tokens to the Notion-inspired values:

```css
--bg: #f6f5f4;
--surface: #ffffff;
--surface-subtle: #fafaf9;
--surface-muted: #f0eeec;
--text: #1a1a1a;
--muted: #787671;
--muted-strong: #5d5b54;
--border: #e5e3df;
--border-strong: #c8c4be;
--primary: #5645d4;
--primary-strong: #4534b3;
--primary-soft: #e6e0f5;
--warning: #dd5b00;
--warning-soft: #ffe8d4;
--danger: #e03131;
--danger-soft: #fde0ec;
--success: #1aae39;
--success-soft: #d9f3e1;
--info: #0075de;
--info-soft: #dcecfa;
--radius: 12px;
--radius-sm: 8px;
--shadow: 0 12px 32px rgba(15, 15, 15, 0.08);
```

- [ ] **Step 2: Update app shell grid**

Use rows and columns:

```css
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 268px minmax(0, 1fr);
  grid-template-rows: 62px minmax(0, 1fr);
  background: var(--bg);
}

.global-toolbar {
  grid-column: 1 / -1;
  grid-row: 1;
}

.sidebar {
  grid-column: 1;
  grid-row: 2;
}

.main {
  grid-column: 2;
  grid-row: 2;
}
```

- [ ] **Step 3: Update controls and panels**

Tune buttons, panels, tabs, facts, rail, and grid with warm hairline borders, purple active states, pastel status chips, and 12px panels.

- [ ] **Step 4: Run CSS token tests**

Run:

```powershell
npm.cmd test -- src/test/notionDesignSystem.test.ts
```

Expected: PASS.

---

### Task 4: Browser QA And Final Verification

**Files:**
- Modify: `src/client/styles.css` or component files only if QA reveals defects.

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 2: Capture screenshots**

Use Playwright fallback if Browser plugin is unavailable. Capture:

```text
C:/tmp/dimbuilder-notion-workbench-desktop.png
C:/tmp/dimbuilder-notion-workbench-tablet.png
C:/tmp/dimbuilder-notion-workbench-mobile.png
```

- [ ] **Step 3: Inspect concept and screenshots**

Use `view_image` on:

```text
docs/superpowers/assets/2026-05-18-notion-workbench-concept.png
C:/tmp/dimbuilder-notion-workbench-desktop.png
C:/tmp/dimbuilder-notion-workbench-tablet.png
C:/tmp/dimbuilder-notion-workbench-mobile.png
```

- [ ] **Step 4: Fix visual defects and commit**

If QA finds issues, fix and rerun:

```powershell
npm.cmd test
npm.cmd run build
```

Commit:

```powershell
git add -- docs/superpowers src/client src/test
git commit -m "feat: apply notion-inspired workbench ui"
```
