# Blueprint Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins view, validate, generate, and export YAML fragments for dimension blueprints without silently mutating `config/dimbuilder.yaml`.

**Architecture:** Add shared pure helpers in `src/shared/blueprintStudio.ts` that normalize drafts, validate by reusing app config validation, generate YAML fragments, and derive drafts from existing dimensions. Add safe Express endpoints under `/api/blueprints` plus one project-dimension endpoint. The UI exposes a compact Blueprint Studio panel from the project overview and keeps YAML as an authoring aid, not an automatic config writer.

**Tech Stack:** TypeScript, Express, React, YAML package, Vitest, existing app config and repository patterns.

---

### Task 1: Shared Blueprint Studio Helpers

**Files:**
- Create: `src/shared/blueprintStudio.ts`
- Test: `src/test/blueprintStudio.test.ts`

- [x] **Step 1: Write failing shared tests**

Add tests for:
- `validateBlueprintDraft("Account", draft)` returns normalized valid draft.
- unsupported `memberKeyField` returns an error message without throwing.
- `blueprintToYamlFragment("Account", blueprint)` includes `Account:` and deterministic keys.
- `blueprintFromProjectDimension(dimension, members, relationships)` derives member and relationship rows.
- `compareBlueprints(oldBlueprint, newBlueprint)` reports changed fields.

- [x] **Step 2: Run targeted test**

Run: `npm.cmd test -- src/test/blueprintStudio.test.ts`

Expected: fail because `src/shared/blueprintStudio.ts` does not exist.

- [x] **Step 3: Implement helpers**

Implement:
- `normalizeBlueprintDraft(draft)`
- `validateBlueprintDraft(dimensionType, draft)`
- `blueprintToYamlFragment(dimensionType, blueprint)`
- `blueprintFromProjectDimension(dimension, members, relationships)`
- `compareBlueprints(oldBlueprint, newBlueprint)`

Use `mergeAppConfig(defaultAppConfig, { dimensions: { blueprints: { [dimensionType]: normalized }}})` plus `validateAppConfig()` for validation consistency.

- [x] **Step 4: Run targeted test**

Run: `npm.cmd test -- src/test/blueprintStudio.test.ts`

Expected: pass.

### Task 2: API Endpoints

**Files:**
- Create: `src/server/routes/blueprints.ts`
- Modify: `src/server/app.ts`
- Modify: `src/client/api/client.ts`
- Test: `src/test/projectRoutes.test.ts`

- [x] **Step 1: Write failing route tests**

Add tests for:
- `GET /api/blueprints` returns current effective config blueprints.
- `POST /api/blueprints/validate` returns `{ valid: true, blueprint }` for a valid draft.
- `POST /api/blueprints/yaml` returns YAML text for a draft.
- `POST /api/projects/:projectId/dimensions/:dimensionId/blueprint` derives a draft from persisted dimension records.

- [x] **Step 2: Run targeted route tests**

Run: `npm.cmd test -- src/test/projectRoutes.test.ts`

Expected: fail with 404 for blueprint endpoints.

- [x] **Step 3: Implement API and client helpers**

Add routes:
- `GET /api/blueprints`
- `POST /api/blueprints/validate`
- `POST /api/blueprints/yaml`
- `POST /api/projects/:projectId/dimensions/:dimensionId/blueprint`

Add client helpers:
- `fetchBlueprints`
- `validateBlueprintDraft`
- `generateBlueprintYaml`
- `generateBlueprintFromDimension`

- [x] **Step 4: Run targeted route tests**

Run: `npm.cmd test -- src/test/projectRoutes.test.ts`

Expected: pass.

### Task 3: Blueprint Studio UI

**Files:**
- Create: `src/client/components/BlueprintStudio.tsx`
- Modify: `src/client/components/Dashboard.tsx`
- Modify: `src/client/styles.css`
- Test: `src/test/clientComponentsMarkup.test.ts`

- [x] **Step 1: Write failing UI markup test**

Assert the dashboard renders:
- `blueprint-studio`
- `Blueprint Studio`
- `Validate draft`
- `Preview YAML`
- `Generate from current dimension`
- "does not write config automatically"

- [x] **Step 2: Run targeted UI test**

Run: `npm.cmd test -- src/test/clientComponentsMarkup.test.ts`

Expected: fail because the UI does not exist.

- [x] **Step 3: Implement the component**

Create a compact panel with dimension type selector, JSON draft textarea, validation result, YAML preview button, and no automatic config write.

- [x] **Step 4: Run targeted UI test**

Run: `npm.cmd test -- src/test/clientComponentsMarkup.test.ts`

Expected: pass.

### Task 4: Documentation

**Files:**
- Modify: `docs/api-reference.md`
- Modify: `docs/dimension-blueprints.md`
- Modify: `docs/configuration-guide.md`
- Modify: `docs/feature-catalog.md`
- Modify: `docs/implementation-map.md`
- Modify: `docs/decisions.md`
- Modify: `docs/application-summary.md`
- Modify: `docs/current-state-baseline.md`
- Modify: `docs/testing-strategy.md`

- [x] **Step 1: Update docs**

Document safe Blueprint Studio behavior, API endpoints, YAML source-of-truth decision, and tests.

- [x] **Step 2: Run docs check**

Run: `npm.cmd run docs:check`

Expected: pass.

### Task 5: Final Verification

- [x] **Step 1: Run targeted tests**

Run:
- `npm.cmd test -- src/test/blueprintStudio.test.ts`
- `npm.cmd test -- src/test/projectRoutes.test.ts`
- `npm.cmd test -- src/test/clientComponentsMarkup.test.ts`

- [x] **Step 2: Run build**

Run: `npm.cmd run build`

- [x] **Step 3: Run full tests**

Run: `npm.cmd test`

- [x] **Step 4: Run docs check**

Run: `npm.cmd run docs:check`

- [x] **Step 5: Handoff**

Summarize source changes, docs, verification, and the limitation that Studio returns YAML fragments but does not write `config/dimbuilder.yaml`.
