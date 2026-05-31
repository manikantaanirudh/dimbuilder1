# Feature Catalog

## App Identity

The UI, workbook exports, and config identify the app as Spaulding Ridge Onestream Dim Builder.

Source:

- `config/dimbuilder.yaml`
- `src/shared/appConfigDefaults.ts`
- `index.html`

## Blank Project Creation

Users can create a new metadata project without XLSX input.

Source:

- `src/client/components/ImportExportModals.tsx`
- `src/client/api/client.ts`
- `src/server/routes/projects.ts`
- `src/server/projectBlueprints.ts`

## Central Dimension Blueprints

YAML config defines enabled dimensions, display order, dimension names, roots, members, relationships, and relationship defaults.

Source:

- `config/dimbuilder.yaml`
- `src/shared/appConfigTypes.ts`
- `src/shared/appConfigValidation.ts`
- `src/server/projectBlueprints.ts`

## Blueprint Studio

Admins can inspect effective dimension blueprints, validate JSON drafts, generate deterministic YAML fragments, and derive a blueprint draft from an existing project dimension. The Studio is an authoring aid only; it does not write `config/dimbuilder.yaml` automatically.

Source:

- `src/shared/blueprintStudio.ts`
- `src/server/routes/blueprints.ts`
- `src/server/routes/projects.ts`
- `src/client/api/client.ts`
- `src/client/components/BlueprintStudio.tsx`
- `src/client/components/Dashboard.tsx`

## Optional XLSX Seeding

Users can seed a project from an existing OneStream workbook.

Source:

- `src/client/components/ImportExportModals.tsx`
- `src/server/routes/import.ts`
- `src/shared/workbookParser.ts`

## Editable XML Import

Users can import OneStream metadata XML directly as an editable project. Known attributes and property nodes become app records, and unknown attributes, property nodes, and unsupported elements are preserved for round-trip export.

Source:

- `src/client/components/ImportExportModals.tsx`
- `src/client/api/client.ts`
- `src/server/routes/import.ts`
- `src/shared/xmlImport.ts`
- `src/shared/xmlExport.ts`

## Metadata Reference Alignment

Import can align workbook dimensions to existing metadata XML reference data.

Source:

- `src/server/metadataReference.ts`
- `src/shared/workbookParser.ts`

## Workbench Editing

Users can edit dimension metadata, members, and relationships.

Source:

- `src/client/components/DimensionWorkspace.tsx`
- `src/client/components/EditableGrid.tsx`
- `src/client/components/MetadataEditor.tsx`
- `src/server/routes/projects.ts`

## Bulk Property Updates

Users can preview and apply filtered member or relationship property updates from the workspace. Supported operations include set, clear, replace text, append, prepend, copy from property, derive from parent, and regex replace. Apply recomputes the preview server-side, writes all row changes in one repository transaction, records `bulkUpdate.apply`, and stores rollback JSON plus item-level old/new values.

Source:

- `src/shared/bulkUpdate.ts`
- `src/client/components/BulkUpdatePanel.tsx`
- `src/client/components/DimensionWorkspace.tsx`
- `src/client/api/client.ts`
- `src/server/routes/projects.ts`
- `src/server/db/repositories.ts`

## Varying Property Editing

Users can define default or contextual property values by dimension, member, or relationship target. Context axes are cube type, scenario type, and time member. The workspace exposes a Varying tab backed by CRUD endpoints and repository methods.

Source:

- `src/client/components/VaryingPropertiesPanel.tsx`
- `src/client/components/DimensionWorkspace.tsx`
- `src/client/api/client.ts`
- `src/server/routes/projects.ts`
- `src/server/db/repositories.ts`
- `src/shared/varyingProperties.ts`

## Metadata Baselines And Diff

Users can create a baseline from the current project, run a comparison, and review persisted diff items. The diff engine reports member adds/updates/deletes, relationship adds/deletes/moves/copies, property updates, and warning-level high-risk changes.

Source:

- `src/shared/metadataDiff.ts`
- `src/server/db/schema.ts`
- `src/server/db/repositories.ts`
- `src/server/routes/projects.ts`
- `src/client/api/client.ts`
- `src/client/components/MetadataDiffPanel.tsx`
- `src/client/components/DimensionWorkspace.tsx`

## Relationship Operation Planning

Users can select an XML relationship load mode, request a pre-export impact plan, and export XML with a deterministic operation block for review. Supported modes include full, additive, property update, relationship delete, move/copy, and break/build. Planning detects moves, copies, deletes, potential orphans, and blueprint single-parent conflicts.

Source:

- `src/shared/relationshipOperations.ts`
- `src/shared/xmlExport.ts`
- `src/server/routes/projects.ts`
- `src/server/routes/export.ts`
- `src/client/api/client.ts`
- `src/client/components/ImportExportModals.tsx`

## Change Sets And Release Packages

Users can create a named change set from the latest or selected metadata diff run, validate it, approve or reject it with comments, and generate a release package directory containing release notes, JSON, CSV reports, full XML, rollback notes, and a manifest.

Source:

- `src/shared/releasePackage.ts`
- `src/server/db/schema.ts`
- `src/server/db/repositories.ts`
- `src/server/routes/projects.ts`
- `src/client/api/client.ts`
- `src/client/components/ChangeSetsPanel.tsx`
- `src/client/components/DimensionWorkspace.tsx`

## OneStream Property Dictionary

The app exposes a versioned OneStream-aware property dictionary for dimension, member, and relationship metadata. It powers API schema responses, grid header help text, property validation, and XML property-name mapping.

Source:

- `src/shared/oneStreamPropertyDictionary.ts`
- `src/server/routes/schema.ts`
- `src/client/api/client.ts`
- `src/client/components/EditableGrid.tsx`

## Hierarchy Visualization

Relationships can be inspected as a hierarchy tree. The Hierarchy tab also shows analytics for max depth, members, relationships, leaves, parents, orphan members, and shared members, plus CSV exports for levelized rows, paths, parent-child rows, shared members, and orphans.

Source:

- `src/client/components/HierarchyTree.tsx`
- `src/client/components/HierarchyAnalyticsPanel.tsx`
- `src/shared/hierarchy.ts`
- `src/shared/hierarchyAnalytics.ts`
- `src/server/routes/projects.ts`
- `src/client/api/client.ts`

## Validation

Users can run validation and see issue counts. Validation includes generic metadata integrity checks plus the configurable OneStream validation profile for naming conventions, aliases, Root/None casing, sort order, shared members, parent input risks, missing dimension-specific properties, relationship weight gaps, and Entity ownership range checks.

Source:

- `src/client/components/IssuePanel.tsx`
- `src/client/ui/viewModel.ts`
- `src/server/routes/validation.ts`
- `src/shared/validationEngine.ts`
- `src/shared/oneStreamValidation.ts`

## XML Preview

Users can preview XML for the current dimension or all dimensions when enabled. The Download XML button is located exclusively in the XML tab (`src/client/components/XmlPreview.tsx:113`) and respects per-dimension export blocking.

Source:

- `src/client/components/XmlPreview.tsx`
- `src/shared/xmlExport.ts`

## Export

Users can export XML, XLSX, CSV, JSON, and snapshots when enabled.
Server routes enforce validation-based export blocking across every export format. Optional validation bypass is disabled by default and records an audit entry when enabled and used with a reason.

Source:

- `src/client/components/ImportExportModals.tsx`
- `src/server/exportGuards.ts`
- `src/server/routes/export.ts`
- `src/shared/xmlExport.ts`
- `src/shared/xlsxExport.ts`
- `src/shared/csvJsonExport.ts`

## Snapshot Restore And Branching

Users can list saved project snapshots from the dashboard, restore one into the current project, or create a new project branch from a snapshot. Restore creates a safety snapshot first and runs transactionally. Branching remaps dimension, member, relationship, and varying-property IDs into the new project.

Source:

- `src/client/components/SnapshotManager.tsx`
- `src/client/components/Dashboard.tsx`
- `src/client/api/client.ts`
- `src/server/routes/projects.ts`
- `src/server/db/repositories.ts`

## Project Rename

Users can rename a project and update its description from the dashboard via inline click-to-edit on the project name. Backed by `PATCH /api/projects/:projectId`.

Source:

- `src/client/components/Dashboard.tsx`
- `src/client/api/client.ts`
- `src/server/routes/projects.ts`

## Admin Panel

A dedicated Admin Panel page is accessible from the sidebar. It displays all validation rules, their severities, categories, and whether they block export. This gives administrators a single-pane view of the validation configuration in effect. The panel also includes per-project validation rule toggle switches with a severity dropdown. Rules can be set to "off" to disable them for the current project.

Source:

- `src/client/components/AdminPanel.tsx`
- `src/client/components/AppShell.tsx`
- `src/server/routes/validation.ts`
- `src/server/db/schema.ts` (`project_validation_overrides` table)

## Save As

Users can create a named snapshot with a description from a "Save As" toolbar button. This opens a modal that persists the current project state as a reusable snapshot without navigating away from the workspace.

Source:

- `src/client/components/DimensionWorkspace.tsx`
- `src/client/components/ImportExportModals.tsx`
- `src/client/api/client.ts`
- `src/server/routes/export.ts`

## Per-Dimension XML Export

Individual dimensions can be exported to XML even when the project has validation errors on other dimensions. The export uses `?dimensionId=` query param with a dimension-scoped validation guard that only checks issues for the targeted dimension. A "Download XML" button appears on each dimension workspace.

Source:

- `src/client/components/DimensionWorkspace.tsx`
- `src/server/routes/export.ts`
- `src/server/exportGuards.ts`

## Issue-Filtered Grid

Clicking error or warning counts in the dimension workspace filters the grid to show only rows with matching validation issues. Filtering uses server-side ID-based lookups (sends `?ids=` param to members/relationships endpoints) so all matching records appear regardless of pagination. An "All" state restores the full unfiltered view.

Source:

- `src/client/components/DimensionWorkspace.tsx`
- `src/client/components/EditableGrid.tsx`
- `src/client/ui/viewModel.ts`

## Validation Dashboard

A project-wide validation summary page accessible from the sidebar. Displays total error, warning, and info count cards, issues grouped by dimension, and a table of most frequent rule codes. Clickable rows navigate to the corresponding dimension workspace.

Source:

- `src/client/components/ValidationDashboard.tsx`
- `src/client/components/AppShell.tsx`
- `src/server/routes/validation.ts`

## Frontend Config Editor

A "Config" section in the sidebar displays the current application config as JSON in a textarea. Users can edit and save changes, which writes the updated config to the YAML file and applies it live without a server restart. Uses `PUT /api/config`.

Source:

- `src/client/components/ConfigEditor.tsx`
- `src/client/components/AppShell.tsx`
- `src/client/api/client.ts`
- `src/server/routes/config.ts`

## Spaulding Ridge Branding

Navy (#00204A), Brass Gold (#C5A961), and tinted neutral color scheme applied throughout the UI. The palette is defined as OKLCH CSS custom properties in `src/client/styles.css`, with a full `[data-theme="dark"]` token set powering the light/dark theme toggle. The global toolbar uses the navy primary with a brass-gold accent on hover. SR logo favicon (navy rectangle with gold "SR" text). Updated `index.html` title.

Source:

- `src/client/styles.css`
- `src/client/hooks/useTheme.ts`
- `index.html`

## Audit Logging

Major actions are written to `audit_logs`.

Source:

- `src/server/db/repositories.ts`
- route modules under `src/server/routes`

## Authentication & RBAC

Multi-user authentication supporting local credentials (email/password with bcrypt) and OIDC SSO (Azure AD, Okta). JWT-based session management with access/refresh token rotation. Role-based access control with four system roles (admin, author, reviewer, viewer) and project-level permissions.

Key capabilities:
- Local auth with bcrypt password hashing and JWT tokens
- OIDC integration for enterprise SSO (Azure AD, Okta, any OpenID Connect provider)
- Role-based permission system (14 distinct permissions across 4 roles)
- Project-level permission grants (owner, editor, reviewer, viewer)
- Automatic token refresh on 401 with retry
- Default admin user seeding on first startup
- Backward compatible: auth.enabled=false preserves unauthenticated access

Source:

- `src/shared/authTypes.ts`
- `src/server/auth/passwords.ts`
- `src/server/auth/tokens.ts`
- `src/server/auth/oidcStrategy.ts`
- `src/server/middleware/authenticate.ts`
- `src/server/middleware/authorize.ts`
- `src/server/routes/auth.ts`
- `src/server/routes/users.ts`
- `src/client/auth/AuthProvider.tsx`
- `src/client/auth/LoginPage.tsx`
- `src/client/auth/ProtectedRoute.tsx`
- `src/client/auth/useAuth.ts`
- `src/client/api/client.ts`

## AI-Powered Metadata Intelligence (Feature 7)

Heuristic-based AI analysis: duplicate detection (Levenshtein, soundex, prefix similarity), naming anomaly detection (case, separator, prefix, length), hierarchy optimization suggestions, property inference from siblings, and natural language query parsing.

Source:

- `src/server/ai/aiEngine.ts`
- `src/server/ai/suggestions/duplicateDetection.ts`
- `src/server/ai/suggestions/namingAnomaly.ts`
- `src/server/ai/suggestions/hierarchyOptimization.ts`
- `src/server/ai/suggestions/propertySuggestion.ts`
- `src/server/ai/naturalLanguage/queryParser.ts`
- `src/server/routes/ai.ts`
- `src/client/components/AIInsightsPanel.tsx`

## Cross-Dimension Relationship Mapping (Feature 8)

Maps relationships across dimensions with where-used lookup, inheritance chain building, and cross-dimension validation.

Source:

- `src/server/crossDimension/crossDimensionEngine.ts`
- `src/server/routes/crossDimension.ts`

## Template & Pattern Library (Feature 9)

Extract reusable templates from projects and apply them to new projects. Includes built-in templates for common OneStream patterns.

Source:

- `src/server/templates/templateEngine.ts`
- `src/server/routes/templates.ts`

## Reporting & Analytics (Feature 10)

Health, velocity, coverage, and compliance reports with per-dimension scoring. Export to HTML (styled), CSV, and JSON.

Source:

- `src/server/reporting/reportingEngine.ts`
- `src/server/reporting/reportExporter.ts`
- `src/server/routes/reporting.ts`
- `src/client/components/ReportingDashboard.tsx`

## Version Control System (Feature 11)

Git-like branching, commits, tags, three-way merge with conflict detection. Full project snapshot serialization.

Source:

- `src/server/vcs/vcsEngine.ts`
- `src/server/routes/vcs.ts`

## Extensibility Modeler (Feature 12)

Analyzes dimension inheritance patterns, detects anti-patterns, and supports what-if extension planning.

Source:

- `src/server/extensibility/extensibilityEngine.ts`
- `src/server/routes/extensibility.ts`

## Excel Add-In API (Feature 13)

Download dimension data as structured JSON for Excel consumption. Publish members back with upsert logic (create new, update existing, validate relationships).

Source:

- `src/server/routes/tier3.ts` (excel/download, excel/publish endpoints)

## Scheduled Jobs (Feature 15)

Pure-TypeScript cron expression parser with in-process job scheduler. Supports manual trigger and execution history.

Source:

- `src/server/scheduler/cronParser.ts`
- `src/server/scheduler/jobScheduler.ts`
- `src/server/routes/tier3.ts` (jobs endpoints)

## Data Quality Scoring (Feature 16)

Per-member and per-dimension quality scoring with configurable rules and gates. Gates can block deployments.

Source:

- `src/server/tier3/tier3Engine.ts`
- `src/server/routes/tier3.ts` (quality endpoints)
- `src/client/components/QualityScoresPanel.tsx`

## Migration Assistant (Feature 17)

CSV-based parsers for Hyperion HFM, Hyperion EPMA, SAP BPC, and generic CSV formats. Parsed data can be auto-imported into the project.

Source:

- `src/server/migration/migrationParsers.ts`
- `src/server/routes/tier3.ts` (migrations/parse endpoint)

## Real-Time Collaboration (Feature 22)

In-memory presence store with 30-second TTL. Heartbeat/leave/get endpoints for polling-based presence. Collaboration comments with mentions and threading.

Source:

- `src/server/collaboration/presenceStore.ts`
- `src/server/routes/tier4.ts` (presence endpoints)

## Audit & Compliance (Feature 23)

Audit log with project/user/entity/action tracking. Retention policies. Compliance report.

Source:

- `src/server/routes/tier4.ts` (audit-log endpoints)
- `src/client/components/AuditLogViewer.tsx`

## Project-Level Access Control

Role-based project membership with hierarchy: viewer < editor < manager < owner. Middleware enforces minimum role. Backwards-compatible (no ACL entries = full access).

Source:

- `src/server/acl/projectACL.ts`
- `src/server/db/schema.ts` (project_members table)
- `src/server/db/repositories.ts` (projectMembers repo)

## Auto-Advance Workflow Rules

Rule engine that evaluates conditions (quality score threshold, no validation errors, time elapsed, all properties filled) and auto-approves workflow steps when criteria are met.

Source:

- `src/server/workflow/autoAdvanceEngine.ts`
- `src/server/routes/workflows.ts` (auto-advance endpoints)

## Frontend UX Polish

Skeleton loading states, animated SVG score rings, KPI dashboard cards, toast notification system, confirmation dialogs, focus trap for modals, card hover elevation, skip-to-content link, WCAG AA contrast compliance.

Source:

- `src/client/components/Skeleton.tsx`
- `src/client/components/ScoreRing.tsx`
- `src/client/components/KPICards.tsx`
- `src/client/components/Toast.tsx`
- `src/client/components/ConfirmDialog.tsx`
- `src/client/hooks/useFocusTrap.ts`
- `src/client/styles.css`

## Chat Page (Natural Language Query)

Conversational chatbot interface for querying project metadata in plain English. Supports 11 query intents: project summary, project issues/health, export readiness, find member, count members, count dimensions, show children, find orphans, check member existence, missing property, property filter. The summary, issues, and export-readiness intents are answered from injected project context (dimension/member/relationship counts, validation summary, top issue codes, export-blocking status) computed server-side by `buildProjectAIContext`, so the assistant reports on the actual project state rather than falling back to keyword search. Hybrid AI: local pattern matching first, optional LLM fallback if configured.

Source:

- `src/client/components/ChatPanel.tsx`
- `src/server/ai/naturalLanguage/queryParser.ts`
- `src/server/ai/naturalLanguage/responseGenerator.ts`
- `src/server/ai/projectContext.ts` (project context builder)
- `src/server/routes/ai.ts` (`POST /projects/:id/ai/query`, `POST /projects/:id/ai/chat`)

## Validation Dashboard Drill-Down

Clickable severity summary cards (Errors, Warnings, Info) that filter the issues-by-dimension table. Issue code rows in "Most Frequent Issues" table navigate to the source dimension. Active filter state highlighted with accent outline.

Source:

- `src/client/components/ValidationDashboard.tsx`

## Mark as Safe (Issue Dismissal)

Per-issue dismiss button on validation issue cards. Dismissed issues are hidden from the list with a "Show N dismissed issues" checkbox to restore. Uses Shield icon for dismiss action. Supports restore (toggle back).

Source:

- `src/client/components/IssuePanel.tsx`
- `src/client/styles.css` (`.issue-dismiss-btn`, `.issue.dismissed`)

## Admin: Export Validation Rules

"Export Rules" button in the Admin panel that downloads all validation rules as a CSV file with columns: Rule Code, Description, Category, Severity, Active, Blocks Export. Allows business teams to review and validate rules offline.

Source:

- `src/client/components/AdminPanel.tsx` (`exportRulesAsCsv()`)

## Row Error Tooltips

Grid rows with associated validation issues display a native tooltip (title attribute) on hover showing the full error message text. Rows with issues also get a gold left-border highlight (`.grid-row.has-issues`).

Source:

- `src/client/components/EditableGrid.tsx`
- `src/client/styles.css`

## Hierarchy Tree Filter

Search input in the hierarchy tree now actually filters/hides non-matching branches. Uses recursive `childrenContainMatch` check — only branches containing at least one matching node (or descendant) remain visible.

Source:

- `src/client/components/HierarchyTree.tsx`

## Autoresearch Benchmark (Extended)

Benchmark measures 7 engine phases against real metadata (7,048 members, 18 dimensions): validation, AI duplicate detection, AI naming anomalies, AI hierarchy optimizations, quality scoring, migration parsers. Used for iterative engine tuning.

Source:

- `scripts/autoresearch/benchmark.ts`
- `scripts/autoresearch/program.md`
- `scripts/autoresearch/sample-data/`
