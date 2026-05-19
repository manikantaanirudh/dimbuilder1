---
name: docs-maintainer
description: Use when SR Onestream Dim Builder source, config, API, database, validation, export, workflow, or UI behavior changes and project documentation may need to stay current.
---

# Docs Maintainer

## Overview

Keep `docs/` aligned with the codebase. Treat documentation as part of the change: when behavior changes, update the document that explains that behavior before handoff.

## Required Workflow

1. Identify changed files with `git status --short`.
2. Map changed source areas to the docs below.
3. Update all affected docs in `docs/`.
4. Update this skill if the documentation maintenance rules change.
5. Run `npm.cmd run docs:check`.
6. Mention any docs intentionally left unchanged and why.

## Source To Docs Map

| Changed area | Update these docs |
|---|---|
| `config/dimbuilder.yaml`, `src/shared/appConfig*`, `src/server/config/loadAppConfig.ts` | `configuration-guide.md`, `dimension-blueprints.md`, `current-state-baseline.md` |
| `src/shared/appConfigTypes.ts`, `src/server/projectBlueprints.ts`, `src/shared/relationshipDefaults.ts` | `dimension-blueprints.md`, `architecture.md`, `implementation-map.md`, `feature-catalog.md` |
| `src/server/routes/*.ts`, `src/client/api/client.ts` | `api-reference.md`, relevant feature guide |
| `src/server/db/*`, repository behavior | `database-architecture.md`, `audit-reliability.md`, `production-readiness-checklist.md` |
| `src/shared/workbookParser.ts`, `src/server/metadataReference.ts`, import route | `import-seeding-guide.md`, `configuration-guide.md`, `feature-catalog.md` |
| `src/shared/validationEngine.ts`, `src/shared/hierarchy.ts`, validation route | `validation-rules.md`, `export-modes.md` if blocking behavior changes |
| `src/shared/xmlExport.ts` | `xml-generation-guide.md`, `export-modes.md`, `api-reference.md` if endpoint behavior changes |
| `src/shared/xlsxExport.ts`, `src/shared/csvJsonExport.ts`, export route | `export-modes.md`, `api-reference.md`, `testing-strategy.md` |
| `src/client/components/*`, `src/client/ui/*`, `src/client/styles.css` | `feature-catalog.md`, `application-summary.md`, `current-state-baseline.md` for workflow changes |
| `package.json`, build/test/dev scripts | `developer-quickstart.md`, `deployment-guide.md`, `testing-strategy.md` |
| security, auth, upload, CORS, access control | `security-model.md`, `production-readiness-checklist.md`, `audit-reliability.md` |
| tests under `src/test` | `testing-strategy.md`, affected feature docs when expectations document behavior |

## Documentation Standards

- Use source-file references for every non-obvious behavior.
- Keep docs specific to this repo. Do not copy generic templates or unrelated governance topics.
- Preserve the product narrative: blank project creation from central blueprints is primary; XLSX is optional seeding.
- Update `docs/README.md` when adding, removing, or renaming docs.
- Add a decision entry in `docs/decisions.md` for architecture-level choices.
- Update `docs/current-state-baseline.md` when implemented capabilities or known gaps change.

## Verification

Run:

```powershell
npm.cmd run docs:check
```

If source files changed and no docs changed, either update the relevant docs or explain why the source change is internal and documentation-neutral.
