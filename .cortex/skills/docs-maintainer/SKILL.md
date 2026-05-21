---
name: docs-maintainer
description: "Keep docs/ aligned with codebase changes. Use when: source, config, API, database, validation, export, workflow, or UI behavior changes and project documentation may need updating. Triggers: docs update, update documentation, docs check, documentation sync."
---

# Docs Maintainer

## Overview

Keep `docs/` aligned with the codebase. Treat documentation as part of the change: when behavior changes, update the document that explains that behavior before handoff.

## Workflow

### Step 1: Identify Changes

Run:

```powershell
git status --short
```

Collect the list of changed files. If no source files changed, stop — nothing to do.

### Step 2: Map Changes to Docs

Use the source-to-docs map below to determine which documentation files are affected.

| Changed area | Update these docs |
|---|---|
| `config/dimbuilder.yaml`, `src/shared/appConfig*`, `src/server/config/loadAppConfig.ts` | `configuration-guide.md`, `dimension-blueprints.md`, `current-state-baseline.md`, root `README.md` |
| `src/shared/appConfigTypes.ts`, `src/server/projectBlueprints.ts`, `src/shared/relationshipDefaults.ts` | `dimension-blueprints.md`, `architecture.md`, `implementation-map.md`, `feature-catalog.md` |
| `src/server/routes/*.ts`, `src/client/api/client.ts` | `api-reference.md`, relevant feature guide |
| `src/server/db/*`, repository behavior | `database-architecture.md`, `audit-reliability.md`, `production-readiness-checklist.md` |
| `src/shared/workbookParser.ts`, `src/server/metadataReference.ts`, import route | `import-seeding-guide.md`, `configuration-guide.md`, `feature-catalog.md` |
| `src/shared/validationEngine.ts`, `src/shared/hierarchy.ts`, validation route | `validation-rules.md`, `export-modes.md` if blocking behavior changes |
| `src/shared/xmlExport.ts` | `xml-generation-guide.md`, `export-modes.md`, `api-reference.md` if endpoint behavior changes |
| `src/shared/xlsxExport.ts`, `src/shared/csvJsonExport.ts`, export route | `export-modes.md`, `api-reference.md`, `testing-strategy.md` |
| `src/client/components/*`, `src/client/ui/*`, `src/client/styles.css` | `feature-catalog.md`, `application-summary.md`, `current-state-baseline.md` for workflow changes |
| `package.json`, build/test/dev scripts | `developer-quickstart.md`, `deployment-guide.md`, `testing-strategy.md`, root `README.md` |
| security, auth, upload, CORS, access control, middleware | `security-model.md`, `production-readiness-checklist.md`, `audit-reliability.md`, root `README.md` |
| tests under `src/test` | `testing-strategy.md`, affected feature docs when expectations document behavior |
| `Dockerfile`, `.github/workflows/*`, CI/CD | `deployment-guide.md`, `production-readiness-checklist.md`, root `README.md` |
| new user-facing features or capabilities | `current-state-baseline.md`, `feature-catalog.md`, root `README.md` |

**If no docs are affected**, explain why the change is internal/documentation-neutral and skip to Step 5.

**⚠️ STOP**: Present the mapping (changed files -> affected docs) for user confirmation before editing.

### Step 3: Update Docs

For each affected doc:

1. Read the current doc.
2. Read the changed source to understand the new behavior.
3. Update the doc to reflect the new behavior accurately.

**Rules:**
- Use source-file references (e.g., `src/shared/validationEngine.ts:142`) for every non-obvious behavior.
- Keep docs specific to this repo. Do not copy generic templates or unrelated governance topics.
- Preserve the product narrative: blank project creation from central blueprints is primary; XLSX is optional seeding.
- Update `docs/README.md` when adding, removing, or renaming docs.
- Update the root `README.md` when user-facing features, architecture, production-readiness capabilities, configuration options, or quick-start instructions change.
- Add a decision entry in `docs/decisions.md` for architecture-level choices.
- Update `docs/current-state-baseline.md` when implemented capabilities or known gaps change.

### Step 4: Verify

Run:

```powershell
npm.cmd run docs:check
```

**If the check fails:**
- Review the output for missing or stale references.
- Fix and re-run until clean.

**If the check passes:**
- Proceed to output.

### Step 5: Report

Present:
- List of docs updated with a one-line summary of each change.
- Any docs intentionally left unchanged and why.

## Stopping Points

- ✋ After Step 2: Confirm change-to-docs mapping before editing.

## Output

Updated documentation files in `docs/` that accurately reflect the current codebase behavior, verified by `npm.cmd run docs:check`.
