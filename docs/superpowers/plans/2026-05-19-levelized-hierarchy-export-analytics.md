# Levelized Hierarchy Export And Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cycle-safe hierarchy analytics plus business-friendly levelized, path, and parent-child CSV exports for each dimension.

**Architecture:** Keep hierarchy analysis in a pure shared module, expose it through project routes, and render a compact analytics panel in the existing Hierarchy workspace tab. CSV exports use deterministic headers generated from the shared analytics rows so API output and tests stay stable.

**Tech Stack:** TypeScript, React, Express, Vitest, existing SQLite repositories, existing CSV/export helpers.

---

### Task 1: Shared Hierarchy Analytics

**Files:**
- Create: `src/shared/hierarchyAnalytics.ts`
- Test: `src/test/hierarchyAnalytics.test.ts`

- [x] **Step 1: Write failing tests**

Add tests for:
- `buildHierarchyPaths` returns Root-to-leaf paths.
- `buildLevelizedRows` emits dynamic `level0`, `level1`, `level2` columns and leaf metadata.
- `findSharedMembers` detects children with multiple parents.
- `findOrphanMembers` detects active members not reachable from roots.
- cycle-safe traversal returns warnings instead of recursing forever.

- [x] **Step 2: Run targeted test**

Run: `npm.cmd test -- src/test/hierarchyAnalytics.test.ts`

Expected: FAIL because `src/shared/hierarchyAnalytics.ts` does not exist yet.

- [x] **Step 3: Implement shared module**

Create pure functions:
- `buildHierarchyPaths(dimension, members, relationships)`
- `buildLevelizedRows(dimension, members, relationships)`
- `classifyMembersAsLeafOrParent(members, relationships)`
- `findSharedMembers(members, relationships)`
- `findOrphanMembers(members, relationships)`
- `calculateHierarchyDepthStats(dimension, members, relationships)`
- `buildParentChildRows(dimension, members, relationships)`
- `summarizeHierarchyHealth(dimension, members, relationships)`
- CSV helpers for deterministic levelized, paths, parent-child, shared, and orphan report output.

- [x] **Step 4: Run targeted test**

Run: `npm.cmd test -- src/test/hierarchyAnalytics.test.ts`

Expected: PASS.

### Task 2: API Endpoints

**Files:**
- Modify: `src/server/routes/projects.ts`
- Modify: `src/client/api/client.ts`
- Test: `src/test/projectRoutes.test.ts`

- [x] **Step 1: Write failing route tests**

Add an API test that creates an Account project, inserts a small hierarchy, and verifies:
- `GET /api/projects/:projectId/dimensions/:dimensionId/hierarchy/analytics`
- `GET /api/projects/:projectId/dimensions/:dimensionId/hierarchy/levelized.csv`
- `GET /api/projects/:projectId/dimensions/:dimensionId/hierarchy/paths.csv`
- `GET /api/projects/:projectId/dimensions/:dimensionId/hierarchy/parent-child.csv`

- [x] **Step 2: Run targeted test**

Run: `npm.cmd test -- src/test/projectRoutes.test.ts`

Expected: FAIL with 404 responses for new endpoints.

- [x] **Step 3: Implement endpoints and client helpers**

Add route handlers under the existing dimension route group. Each handler validates project and dimension ownership, loads dimension members/relationships from repositories, and returns JSON or `text/csv`.

Add client helpers:
- `fetchHierarchyAnalytics(projectId, dimensionId)`
- `hierarchyLevelizedCsvUrl(projectId, dimensionId)`
- `hierarchyPathsCsvUrl(projectId, dimensionId)`
- `hierarchyParentChildCsvUrl(projectId, dimensionId)`

- [x] **Step 4: Run targeted test**

Run: `npm.cmd test -- src/test/projectRoutes.test.ts`

Expected: PASS.

### Task 3: UI Analytics Panel

**Files:**
- Create: `src/client/components/HierarchyAnalyticsPanel.tsx`
- Modify: `src/client/components/HierarchyTree.tsx`
- Modify: `src/client/styles.css`
- Test: `src/test/clientComponentsMarkup.test.ts`

- [x] **Step 1: Write failing UI markup test**

Add a static markup test that renders `HierarchyTree` and expects:
- `hierarchy-analytics-panel`
- `Max depth`
- `Orphans`
- `Shared`
- `Export levelized CSV`
- `Export paths CSV`
- `Export parent-child CSV`

- [x] **Step 2: Run targeted test**

Run: `npm.cmd test -- src/test/clientComponentsMarkup.test.ts`

Expected: FAIL because the panel is not rendered.

- [x] **Step 3: Implement panel**

The panel fetches analytics with the new client helper, shows counts, warning badges, and download links. It does not replace the current tree and remains functional if the analytics request fails.

- [x] **Step 4: Run targeted test**

Run: `npm.cmd test -- src/test/clientComponentsMarkup.test.ts`

Expected: PASS.

### Task 4: Documentation

**Files:**
- Modify: `docs/api-reference.md`
- Modify: `docs/export-modes.md`
- Modify: `docs/feature-catalog.md`
- Modify: `docs/implementation-map.md`
- Modify: `docs/validation-rules.md` only if the implementation adds new validation issue behavior.

- [x] **Step 1: Update docs**

Document the analytics endpoint, CSV endpoints, deterministic CSV columns, cycle-safe behavior, and UI workflow.

- [x] **Step 2: Run docs check**

Run: `npm.cmd run docs:check`

Expected: PASS.

### Task 5: Final Verification

**Files:**
- No new files beyond feature/docs/tests.

- [x] **Step 1: Run full tests**

Run: `npm.cmd test`

Expected: PASS.

- [x] **Step 2: Run production build**

Run: `npm.cmd run build`

Expected: PASS.

- [x] **Step 3: Run docs check**

Run: `npm.cmd run docs:check`

Expected: PASS.

- [x] **Step 4: Handoff**

Summarize changed files, verification results, and limitations. The intentional limitation is that optional project-wide hierarchy analytics XLSX is deferred; per-dimension CSV exports are implemented first.
