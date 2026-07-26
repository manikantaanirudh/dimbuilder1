# Decisions

This file records current architecture decisions. Add new entries when changing core behavior.

## 2026-05-19: Generic Builder Over Workbook-Centered Narrative

Decision:

SR Onestream Dim Builder is a generic metadata builder. XLSX import is an optional seed workflow, not the core app identity.

Rationale:

The app must support building XML from information entered directly in the workbench. Central blueprints allow the app to start from a known OneStream dimension structure without relying on a workbook.

Impacted files:

- `config/dimbuilder.yaml`
- `src/server/projectBlueprints.ts`
- `src/server/routes/projects.ts`
- `src/client/components/AppShell.tsx`
- `src/client/components/ImportExportModals.tsx`

## 2026-05-19: Central YAML As Dimension Blueprint Source

Decision:

Dimension hierarchy starting points and defaults belong in `config/dimbuilder.yaml`.

Rationale:

The app should be configurable without code changes for dimension inventory, names, root members, seeded members, seeded relationships, and relationship defaults.

Tradeoffs:

- Easier app setup for new dimension models.
- Requires strong config validation.
- Large blueprint files may eventually need authoring tools.

## 2026-05-19: Blueprint Studio Does Not Mutate Config

Decision:

Blueprint Studio validates drafts, derives blueprints from existing dimensions, and returns YAML fragments, but it does not write `config/dimbuilder.yaml` automatically.

Rationale:

The YAML file is the reviewed source of truth for blank project creation and is likely to be source-controlled in shared deployments. Silent server-side config writes would bypass normal review. Returning deterministic fragments gives admins an easier authoring workflow while keeping configuration changes explicit.

Tradeoffs:

- Users must still apply generated YAML through their normal config-change process.
- The first Studio UI edits a JSON draft rather than a fully visual nested editor.
- The shared helper layer gives future richer UI editors one validation and YAML-rendering contract.

Impacted files:

- `src/shared/blueprintStudio.ts`
- `src/server/routes/blueprints.ts`
- `src/server/routes/projects.ts`
- `src/client/components/BlueprintStudio.tsx`
- `src/client/api/client.ts`

## 2026-05-19: Shared Export Logic

Decision:

Export renderers live in `src/shared`, not inside route handlers.

Rationale:

Export behavior is domain logic and needs unit tests independent of HTTP.

Impacted files:

- `src/shared/xmlExport.ts`
- `src/shared/xlsxExport.ts`
- `src/shared/csvJsonExport.ts`
- `src/server/routes/export.ts`

## 2026-05-19: SQLite Repository Layer

Decision:

Database access goes through `src/server/db/repositories.ts`.

Rationale:

Routes stay focused on HTTP behavior. The repository layer centralizes mapping between database rows and app records.

Important rule:

Repository methods and transactions are async for both SQLite and PostgreSQL.

## 2026-06-12: PostgreSQL for Production OLTP; SQLite for Dev and Tests

Decision:

PostgreSQL is the production and shared-deployment OLTP backend. SQLite remains the default for local development and the primary Vitest suite.

Rationale:

Shared pilots and Azure-hosted deployments need a managed, concurrent-safe database. SQLite stays fast and zero-ops for day-to-day consultant work and unit tests. Backend selection is environment-driven: `DATABASE_URL` selects PostgreSQL; `DATABASE_FILE` applies when `DATABASE_URL` is unset.

Tradeoffs:

- Two schema/migration paths must stay in sync (`schema.ts` / `postgres.sql` and dialect-specific migration folders).
- Operators need backup, pooling, and SSL configuration for PostgreSQL.
- One-time `scripts/sqlite-to-postgres.mjs` may be required when promoting a pilot SQLite database.

Impacted files:

- `src/server/db/createDbClient.ts`
- `src/server/db/postgresClient.ts`
- `src/server/db/schema/postgres.sql`
- `scripts/migrate-pg.mjs`
- `docker-compose.yml`
- `docs/database-architecture.md`
- `docs/deployment-guide.md`

## 2026-05-19: Docs As Code With Lightweight Check

Decision:

Documentation is maintained in `docs/`, guided by `.codex/skills/docs-maintainer/SKILL.md`, and checked with `npm.cmd run docs:check`.

Rationale:

The app is still evolving. A strict pre-commit hook would add friction. A skill plus checker gives future Codex sessions clear guidance and a repeatable verification step.

## 2026-05-19: OneStream Property Dictionary Is Shared Domain Logic

Decision:

Supported OneStream metadata properties are represented in `src/shared/oneStreamPropertyDictionary.ts`, not in route handlers, UI-only code, or exporter-only mappings.

Rationale:

The app needs one property contract for UI labels/help text, validation, API schema output, XML mapping, import compatibility, and future diff or bulk-update tools. Keeping the dictionary in shared domain logic lets server routes expose it without duplicating rules, lets the XML exporter resolve aliases consistently, and lets validation flag unknown or invalid values without blocking unknown properties by default.

Tradeoffs:

- The initial dictionary is practical rather than exhaustive.
- Schema-backed fallback definitions keep current app fields from being treated as unknown while richer OneStream property metadata can be added over time.
- Versioned API responses are in place, but only the current `9.2.0` dictionary is implemented today.

Impacted files:

- `src/shared/oneStreamPropertyDictionary.ts`
- `src/shared/xmlExport.ts`
- `src/shared/validationEngine.ts`
- `src/server/routes/schema.ts`
- `src/client/api/client.ts`
- `src/client/components/EditableGrid.tsx`

## 2026-05-19: Varying Properties Are Durable Domain Records

Decision:

Varying OneStream property values are stored as first-class records in `varying_property_values`, with shared types and helper logic in `src/shared`.

Rationale:

Cube type, scenario type, and time member overrides need to survive editing, validation, XML export, API use, and future bulk tools. Keeping the model durable avoids hiding these values inside arbitrary member JSON and lets the dictionary decide which properties are known, typed, or marked as varying-capable.

Tradeoffs:

- The first XML shape is conservative and explicit rather than claiming exhaustive OneStream-specific coverage.
- UI editing is intentionally basic, but the API and repository model can support richer bulk-edit experiences later.
- The schema now needs migration coverage before shared production use.

Impacted files:

- `src/shared/types.ts`
- `src/shared/varyingProperties.ts`
- `src/server/db/schema.ts`
- `src/server/db/repositories.ts`
- `src/server/routes/projects.ts`
- `src/server/routes/validation.ts`
- `src/shared/validationEngine.ts`
- `src/shared/xmlExport.ts`
- `src/client/components/VaryingPropertiesPanel.tsx`

## 2026-05-19: XML Import Preserves Unknown Fields In Existing JSON

Decision:

OneStream XML import uses shared parser logic in `src/shared/xmlImport.ts` and stores unmapped XML attributes/elements under `__unknownXml` inside existing dimension `metadata_json` and member/relationship `properties_json`.

Rationale:

Round-trip trust is more important than forcing every OneStream XML field into the first typed model. Existing JSON columns already support metadata that is not part of the core typed schema, so preserving unknown XML there avoids a schema migration while keeping routes and repositories simple.

Tradeoffs:

- Unknown fields are preserved and summarized, but not yet presented as fully editable typed grid columns.
- The parser targets the app's current OneStream XML shape and common property nodes, not every possible OneStream export variant.
- Future typed support can promote specific preserved fields into the property dictionary without changing route handlers.

Impacted files:

- `src/shared/xmlImport.ts`
- `src/shared/xmlExport.ts`
- `src/shared/validationEngine.ts`
- `src/server/routes/import.ts`
- `src/client/components/ImportExportModals.tsx`

## 2026-05-19: Metadata Diff Is Shared Domain Logic

Decision:

Baseline comparison lives in `src/shared/metadataDiff.ts`, with persistence limited to normalized baseline JSON, diff run summaries, and diff item rows.

Rationale:

Diff behavior will be reused by future change sets, release packages, break/build exports, rollback workflows, and UI review tools. Keeping comparison rules in a pure shared module makes member matching, relationship move/copy classification, property normalization, and high-risk warning rules testable without HTTP or SQLite.

Tradeoffs:

- The first UI is a pragmatic Compare tab rather than a full release-management module.
- Baselines are normalized snapshots, so they are stable for future comparisons but are not currently editable in-place.
- XML baseline support is available through XML text input on the baseline endpoint; multipart XML baseline upload can be added later if needed.

Impacted files:

- `src/shared/metadataDiff.ts`
- `src/shared/types.ts`
- `src/server/db/schema.ts`
- `src/server/db/repositories.ts`
- `src/server/routes/projects.ts`
- `src/client/components/MetadataDiffPanel.tsx`
- `src/client/api/client.ts`

## 2026-05-19: Change Sets Package Full XML First

Decision:

Change sets are first-class persisted records, and release packages are generated as directories under the configured exports directory. The initial package includes full current XML plus human-readable release notes, JSON, CSV reports, rollback notes, and a machine-readable manifest.

Rationale:

Implementation teams need an auditable change-control workflow now, but exact mode-specific OneStream XML subsets for additive, property-update, relationship-delete, and break/build packages need further domain confirmation. Recording the selected mode in the manifest preserves the user intent while full XML keeps package output safe and predictable in the first pass.

Tradeoffs:

- Package output is a directory rather than a zip archive to avoid adding a dependency.
- Approval is server-gated by validation errors unless a bypass is explicitly recorded.
- Rollback notes are generated, but rollback XML is not yet automated.

Impacted files:

- `src/shared/releasePackage.ts`
- `src/shared/types.ts`
- `src/server/db/schema.ts`
- `src/server/db/repositories.ts`
- `src/server/routes/projects.ts`
- `src/client/components/ChangeSetsPanel.tsx`
- `src/client/api/client.ts`

## 2026-05-19: Export Blocking Is Server-Enforced

Decision:

All export endpoints call a shared server guard before rendering files or writing snapshots. The guard reads stored validation issues through repository helpers and blocks severities listed in `validation.exportBlockedBySeverities`.

Rationale:

Client-side disabled buttons are useful guidance, but they are not a security or data-quality boundary. Export blocking must live on the server so direct HTTP calls, scripted exports, and future package workflows cannot bypass stored validation findings accidentally.

Tradeoffs:

- Exports still use stored validation results rather than re-running validation for every download, so users should run validation after edits.
- `export.requireValidationBeforeExport` remains false by default for backward compatibility.
- Audited bypass exists as an explicit configuration option, but it is disabled by default and can require a reason.

Impacted files:

- `src/server/exportGuards.ts`
- `src/server/routes/export.ts`
- `src/server/db/repositories.ts`
- `src/shared/appConfigTypes.ts`
- `src/shared/appConfigDefaults.ts`
- `src/shared/appConfigValidation.ts`
- `src/client/components/ImportExportModals.tsx`

## 2026-05-19: OneStream Validation Profile Is Shared Domain Logic

Decision:

OneStream-specific design-quality validation lives in `src/shared/oneStreamValidation.ts` and is invoked by `src/shared/validationEngine.ts`, with severities and rule toggles controlled by `validation.oneStreamProfile`.

Rationale:

The app needs generic metadata integrity checks and OneStream-aware quality checks, but route handlers should not own domain rules. Keeping the profile in shared logic lets API validation, import validation, change set validation, and future workflow tools reuse the same naming, alias, sort order, shared-member, and dimension-specific checks.

Tradeoffs:

- The profile is configurable and enabled by default, but users can run a generic-only validation pass with `profile: "default"` for compatibility checks.
- The first profile focuses on high-signal design rules rather than attempting to encode every OneStream implementation preference.
- Some findings are warnings by default so teams can tune their own export-blocking policy through `validation.exportBlockedBySeverities`.

Impacted files:

- `config/dimbuilder.yaml`
- `src/shared/appConfigTypes.ts`
- `src/shared/appConfigDefaults.ts`
- `src/shared/appConfigValidation.ts`
- `src/shared/oneStreamValidation.ts`
- `src/shared/validationEngine.ts`
- `src/server/routes/validation.ts`
- `src/client/components/IssuePanel.tsx`

## 2026-05-19: Bulk Updates Are Previewed Shared Domain Logic

Decision:

Bulk member and relationship property updates use a shared preview engine in `src/shared/bulkUpdate.ts`, with server-side apply recomputing the preview before writing changes in one repository transaction.

Rationale:

Bulk edits can affect thousands of metadata rows, so the app needs one reusable contract for filters, operations, old/new value calculation, and dictionary-backed warnings. Keeping preview logic in shared code lets the UI, tests, and API reason about the same changes before persistence. Server-side recomputation prevents stale or client-mutated preview data from being applied blindly.

Tradeoffs:

- Rollback JSON is stored immediately, but rollback execution is left for a future endpoint.
- CSV mapping is intentionally not claimed in this pass because it needs a dedicated parser, key matching, and preview path.
- Warnings do not block apply by default; users should run full validation after large bulk updates.

Impacted files:

- `src/shared/bulkUpdate.ts`
- `src/server/db/schema.ts`
- `src/server/db/repositories.ts`
- `src/server/routes/projects.ts`
- `src/client/api/client.ts`
- `src/client/components/BulkUpdatePanel.tsx`
- `src/client/components/DimensionWorkspace.tsx`

## 2026-07-26: Preserve A Client API Compatibility Barrel During Domain Refactor

Decision:

Organize browser API implementations into domain modules while retaining `src/client/api/client.ts` as a compatibility barrel.

Rationale:

The overview branch contains newer query, assistant, quality, audit, and dimension-metrics behavior. Keeping the existing import surface avoids a broad consumer migration while allowing new code to depend on focused modules. No HTTP routes or response contracts change.

Impacted files:

- `src/client/api/client.ts`
- `src/client/api/*.ts`
- `tsconfig.json`
- `vite.config.ts`
- `vitest.config.ts`
