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

Routes stay focused on HTTP behavior. The repository layer centralizes mapping between SQLite rows and app records.

Important rule:

Repository transactions are synchronous only.

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
