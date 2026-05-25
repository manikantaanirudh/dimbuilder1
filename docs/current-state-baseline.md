# Current State Baseline

This baseline describes the application state as of 2026-05-25.

## Implemented

### Core Platform (Tier 1 — Features 1-6)

- Product identity is SR Onestream Dim Builder.
- Central YAML config drives app identity, feature flags, paths, validation severities, export modes, UI controls, and dimension blueprints.
- Blank metadata projects can be created from blueprints.
- Blueprint-created projects seed dimensions, root members, optional members, optional relationships, and relationship defaults.
- Blueprint Studio can validate blueprint drafts, generate YAML fragments, and derive drafts from existing project dimensions without automatically writing config files.
- XLSX import is an optional seed workflow.
- OneStream metadata XML can be imported directly as an editable project.
- Metadata reference XML can align imported dimensions and add metadata-only dimensions.
- Members and relationships can be edited in the workbench.
- A versioned OneStream property dictionary describes supported dimension, member, and relationship properties for UI labels, validation, API schema output, and XML property mapping.
- Varying property values can be stored for dimensions, members, and relationships with cube type, scenario type, and time member context.
- Metadata baselines can be created from the current project snapshot and compared against the current project.
- Diff runs persist structured member, relationship, property, move/copy, and warning items.
- Change sets can be created from diff runs, validated, approved or rejected, and exported as release package directories with notes, reports, XML, rollback notes, and a manifest.
- Member and relationship properties can be bulk-updated through a preview-first workflow with filters, dictionary/type warnings, transactional apply, audit logs, and rollback JSON.
- Hierarchies can be analyzed per dimension with cycle-safe paths, levelized rows, leaf/parent classification, shared member detection, orphan detection, depth stats, and deterministic CSV exports.
- Saved project snapshots can be listed, restored into the current project with an automatic safety snapshot, or branched into a new project.
- Validation detects common metadata and hierarchy issues.
- Validation warns on unknown dictionary properties and errors on invalid dictionary enum or typed values.
- Validation detects duplicate varying property contexts, missing varying targets, unknown varying properties, non-varying overrides, and invalid varying values.
- XML preview and export work from persisted records.
- XLSX, CSV, JSON, and snapshots are available when enabled.
- Export routes block server-side when stored validation issues match `validation.exportBlockedBySeverities`, with optional audited bypass disabled by default.
- Workflow system with multi-step approval, role-based reviewers, notifications, and auto-advance rules (`src/server/workflow/autoAdvanceEngine.ts`).
- JWT authentication with local strategy, OIDC SSO support, role-based access control (admin/author/reviewer/viewer).
- ERP connectors with configurable extraction, field mapping, hierarchy building, conflict detection.
- Multi-environment management with promotion pipelines, sync status, and environment overrides.
- Impact analysis engine with cross-dimension reference detection and hierarchy orphan warnings.

### Intelligence Layer (Tier 2 — Features 7-12)

- AI-powered metadata intelligence: duplicate detection (Levenshtein + soundex + prefix), naming anomaly detection, hierarchy optimization suggestions, property inference, natural language query with 8 intents (find, count, children, missing_property, property_filter, orphans, check_exists, dimensions_count) (`src/server/ai/`).
- Cross-dimension relationship mapping with where-used lookup, inheritance chain builder, and cross-dim validation (`src/server/crossDimension/crossDimensionEngine.ts`).
- Template and pattern library: extract templates from projects, apply to new projects, built-in templates (`src/server/templates/templateEngine.ts`).
- Reporting and analytics: health reports, velocity reports, coverage reports, compliance reports with HTML/CSV/JSON export (`src/server/reporting/`).
- Version control system: branches, commits, tags, three-way merge with conflict detection (`src/server/vcs/vcsEngine.ts`).
- Extensibility modeler: inheritance analysis, anti-pattern detection, what-if extension planning (`src/server/extensibility/extensibilityEngine.ts`).

### Power Features (Tier 3 — Features 13-20)

- Excel Add-In API: dimension download and member upsert with validation (`POST /api/projects/:id/excel/publish`).
- Conflict resolution: edit locks with expiry, conflict detection between concurrent edits.
- Scheduled jobs: cron expression parsing, in-process scheduler, manual trigger, execution history (`src/server/scheduler/`).
- Data quality scoring: per-member and per-dimension scoring, quality rules, quality gates (`GET /api/projects/:id/quality/scores`).
- Migration assistant: parsers for Hyperion HFM, Hyperion EPMA, SAP BPC, and generic CSV with optional auto-import (`src/server/migration/migrationParsers.ts`).
- API & extensibility platform: API key generation, webhook subscriptions, event delivery.
- Offline sync: sync queue with pending/synced status, push/pull endpoints.
- Documentation auto-generation: generates Markdown design documents from project data.

### Platform & Scale (Tier 4 — Features 21-24)

- Multi-tenant: tenant CRUD, slug-based lookup, usage metrics.
- Real-time collaboration: in-memory presence store with heartbeat/leave/get, collaboration comments with mentions and threading (`src/server/collaboration/presenceStore.ts`).
- Audit & compliance: audit log with project/user/entity tracking, retention policies, compliance report.
- Performance & scale: paginated member listing, performance metrics endpoint, background jobs listing.

### Infrastructure (Gap Fills)

- Report export in HTML/CSV/JSON formats with styled HTML templates (`src/server/reporting/reportExporter.ts`).
- Project-level access control: `project_members` table, `requireProjectRole` middleware, role hierarchy (viewer/editor/manager/owner) (`src/server/acl/projectACL.ts`).
- Auto-advance rules engine for workflow: evaluates quality score, validation errors, time elapsed, and property completeness conditions (`src/server/workflow/autoAdvanceEngine.ts`).

### Frontend UI

- 9 navigation tabs: Project Overview, Validation, Reports, AI Insights, Quality, Audit Log, Chat, Admin, Config.
- **Chat page** with natural language project queries: find members, count dimensions, check existence, show children, find orphans. Hybrid AI — local pattern matching with optional LLM fallback (`src/client/components/ChatPanel.tsx`, `src/server/ai/naturalLanguage/queryParser.ts`).
- Reporting Dashboard with animated SVG score rings, per-dimension quality/completeness/naming bars, coverage grid, and HTML/CSV/JSON export buttons.
- AI Insights panel with tabbed view: duplicate detection, naming anomalies, hierarchy optimizations.
- Quality Scores panel with overall score gauge, quality gate pass/fail status, per-dimension breakdown.
- Audit Log viewer with filterable table (who, what, when, entity type).
- KPI cards on Project Overview (Quality Score, Total Members, Issues, Coverage).
- **Validation Dashboard drill-down**: clickable severity cards filter issue list by type; issue code rows navigate to source dimension.
- **Mark as Safe**: per-issue dismiss button on validation issues. Dismissed issues hidden with toggle to restore.
- **Admin Export Rules**: download all validation rules as CSV for business team review.
- **Hierarchy tree filter**: search now hides non-matching branches (recursive ancestor-path filtering).
- **Row error tooltips**: grid rows with validation issues show full error message on hover (title attribute).
- **Logo click navigation**: brand/logo click returns to Project Overview.
- Skeleton loading placeholders for all async panels.
- Toast notification system with auto-dismiss.
- Confirmation dialogs for destructive actions.
- Focus trap for modal accessibility.
- Card hover elevation with reduced-motion support.
- Skip-to-content link, WCAG AA contrast compliance, 44px touch targets on mobile.
- Design system persisted at `design-system/onestream-dim-builder/MASTER.md`.

## Intentionally Local-First

- The app uses SQLite (via Node.js built-in `node:sqlite` DatabaseSync).
- The server defaults to localhost.
- Uploads and exports are local directories.
- Presence is in-memory (no WebSocket dependency).
- Scheduled jobs run in-process (no external job runner).

## Known Gaps

- No database migrations (schema is applied fresh on startup).
- Blueprint Studio returns YAML fragments only; visual nested editing and automatic config writes are intentionally not implemented.
- XML import supports the current app export shape and common property nodes, not every possible OneStream XML variant.
- Varying property XML uses a conservative explicit context shape pending exact OneStream-specific confirmation for every property.
- Bulk update rollback data is stored, but the rollback endpoint is not yet exposed.
- CSV-driven bulk update mapping is not yet implemented.
- Release package XML is currently full current metadata for every package mode; mode-specific XML subsets and rollback XML are not yet generated.
- No dark mode support.
- No keyboard shortcuts system.
- Workbook parser tests require a fixture Excel file not in the repository.

## Documentation Baseline

The maintained docs pack lives in `docs/`. The maintenance mechanism is:

- `.cortex/skills/docs-maintainer/SKILL.md`
- `npm.cmd run docs:check`

Use both whenever source changes affect behavior or project operation.
