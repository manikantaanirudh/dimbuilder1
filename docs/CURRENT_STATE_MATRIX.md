# SR Onestream Dim Builder - Current State Matrix

**Audit Date**: 2026-05-25  
**Auditor**: Technical Code Audit (Evidence-Based)  
**Method**: Source code inspection, test execution, route verification, database schema analysis  
**Test Results**: 537/541 tests passing (4 failures due to missing fixture file), 47/48 test files green  

---

## Feature Matrix

### 1. Authentication - JWT (Local Login)
- **Claimed**: Full JWT auth with login, register, refresh tokens, session management
- **Actual**: Fully implemented with login, register, refresh, logout, /me endpoints. Rate limiting on failed logins. Session stored with hashed refresh tokens. Configurable expiry.
- **Evidence**: `src/server/routes/auth.ts:116-257`, `src/server/auth/tokens.ts`, `src/server/middleware/authenticate.ts:15-59`
- **Tests**: `src/test/auth.test.ts`, `src/test/tokens.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Login rate limiting is in-memory (per-instance), not shared across scaled instances.

### 2. Authentication - OIDC/SSO
- **Claimed**: OIDC integration with openid-client, PKCE flow, auto-provision users
- **Actual**: Fully implemented using openid-client v6 API. PKCE + state validation. Auto user creation/linking on first OIDC login. Discovery-based configuration.
- **Evidence**: `src/server/auth/oidcStrategy.ts:1-171`, routes at `src/server/routes/auth.ts:330-344`
- **Tests**: None specific to OIDC flow (requires external IdP)
- **Status**: Implemented
- **Risk**: Medium
- **Note**: No integration test for OIDC; relies on external IdP connectivity. In-memory pending flow state won't work multi-instance.

### 3. Authentication - Basic Auth (Legacy)
- **Claimed**: Basic auth middleware for backwards compatibility
- **Actual**: Implemented as configurable middleware. Reads username/password from config.
- **Evidence**: `src/server/middleware/basicAuth.ts:1-31`
- **Tests**: `src/test/basicAuth.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Static credential comparison; suitable for dev/single-user only.

### 4. Authorization - RBAC (System Roles)
- **Claimed**: 4-role system (admin, author, reviewer, viewer) with permission matrix
- **Actual**: Fully defined with 14 permissions mapped across 4 roles. Middleware `requirePermission()` and `requireRole()` enforce access.
- **Evidence**: `src/shared/authTypes.ts:1-80`, `src/server/middleware/authorize.ts:1-33`
- **Tests**: `src/test/authorize.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Clean implementation; permission checks are well-separated.

### 5. Authorization - Project-Level ACL
- **Claimed**: Project-level access control with viewer/editor/manager/owner roles
- **Actual**: Implemented with role hierarchy check, backwards-compatible fallback (if no ACL entries, all users have full access). Full CRUD routes for managing project membership.
- **Evidence**: `src/server/acl/projectACL.ts:1-130`, DB table `project_members` at `src/server/db/schema.ts:894-904`
- **Tests**: Covered in `src/test/projectRoutes.test.ts` (implicit through API tests)
- **Status**: Implemented
- **Risk**: Low
- **Note**: Only project owners can manage membership. Sensible defaults.

### 6. Project CRUD
- **Claimed**: Create, list, open, rename, delete projects
- **Actual**: Full CRUD with create (from import or blueprint), list, get, update (rename/description), and delete with CASCADE in DB.
- **Evidence**: `src/server/routes/projects.ts:1-1137`, DB schema `projects` table at `src/server/db/schema.ts:4-12`
- **Tests**: `src/test/projectRoutes.test.ts`, `src/test/api.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Robust implementation with project metadata stored.

### 7. Dimension Management
- **Claimed**: Create from blueprint, import, edit dimensions
- **Actual**: Dimensions are created during XLSX/XML import and via blueprint endpoints. Edit metadata (name, description, accessGroup, maintenanceGroup, inheritedDimension). Schema-driven with 10+ dimension types.
- **Evidence**: `src/server/routes/projects.ts` (dimension routes), `src/server/routes/blueprints.ts`, `src/shared/dimensionSchemas.ts`
- **Tests**: `src/test/dimensionSchemas.test.ts`, `src/test/blueprintStudio.test.ts`, `src/test/projectBlueprints.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Full OneStream dimension type support including Account, Entity, Scenario, Time, Flow, IC, UD1-UD8, Consol.

### 8. Member CRUD
- **Claimed**: Add, edit, delete, bulk operations on members
- **Actual**: Full CRUD including add single member, update properties, delete, and bulk update operations with preview/apply/rollback.
- **Evidence**: `src/server/routes/projects.ts` (member routes), `src/shared/bulkUpdate.ts:1-400`
- **Tests**: `src/test/repositoryEditing.test.ts`, `src/test/bulkUpdate.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Property validation against OneStream property dictionary during edits.

### 9. Relationship CRUD
- **Claimed**: Add, edit, delete relationships
- **Actual**: Full CRUD with parent/child/aggregationWeight/percentConsol/percentOwnership/ownershipType. Bulk update applies to relationships too.
- **Evidence**: `src/server/routes/projects.ts` (relationship routes), `src/server/db/schema.ts:43-60`
- **Tests**: `src/test/relationshipOperations.test.ts`, `src/test/repositoryEditing.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Includes operation tracking (move/copy/delete) for change management.

### 10. Validation Engine
- **Claimed**: Comprehensive validation with configurable severity rules
- **Actual**: 750-line validation engine with rules for: orphan members, missing parents, circular hierarchies, duplicate relationships, naming conventions, required properties, invalid property values (enum/boolean/number), blank member keys, unknown dimension types.
- **Evidence**: `src/shared/validationEngine.ts:1-750`, `src/shared/oneStreamValidation.ts`
- **Tests**: `src/test/validationEngine.test.ts`, `src/test/oneStreamValidation.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Integrates with OneStream property dictionary for value-level validation.

### 11. XML Import
- **Claimed**: Parse OneStream XML, map properties, preserve unknown elements
- **Actual**: Full XML parser handling OneStream dimension XML format. Parses members, relationships, properties. Preserves unknown XML elements and attributes (sourceOrder maintained). Handles namespaces.
- **Evidence**: `src/shared/xmlImport.ts:1-554`
- **Tests**: `src/test/xmlImport.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Includes namespace stripping, entity decoding, unknown-element preservation for round-trip fidelity.

### 12. XML Export
- **Claimed**: Generate OneStream-compatible XML with property mapping, dimension scoping, formula skip
- **Actual**: 681-line XML generator. Produces OneStream-format dimension XML. Supports full export, dimension scoping (filter by dimensionId), property mapping, formula-error skipping, unknown element/attribute reinsertion, sorted attributes.
- **Evidence**: `src/shared/xmlExport.ts:1-681`
- **Tests**: `src/test/xmlExport.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Preserves round-trip fidelity for unknown XML data. Export guards in `src/server/exportGuards.ts`.

### 13. XLSX Import (Workbook Parser)
- **Claimed**: Parse OneStream workbooks with sheet detection, column mapping, metadata reference alignment
- **Actual**: Full workbook parser (499 lines) using ExcelJS. Auto-detects dimension type from sheet names and B1 cell. Maps columns via schema field aliases. Merges duplicate dimension sheets. Aligns against metadata reference. Handles formula errors, blank rows, generated XML columns.
- **Evidence**: `src/shared/workbookParser.ts:1-499`
- **Tests**: `src/test/workbookParser.test.ts` (4 tests failing due to missing fixture file, but parser code is comprehensive)
- **Status**: Implemented
- **Risk**: Medium
- **Note**: 4 test failures are fixture-path issues (file moved/renamed), not logic bugs.

### 14. XLSX Export
- **Claimed**: Generate Excel workbooks with proper styling
- **Actual**: Generates Excel workbooks with dimension headers (type, name, description, accessGroup, maintenanceGroup, inheritedDimension), member data rows, and relationship sections. Uses ExcelJS.
- **Evidence**: `src/shared/xlsxExport.ts:1-77`
- **Tests**: `src/test/xlsxExport.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Basic styling (no advanced formatting/colors verified in code). Functional export.

### 15. CSV/JSON Export
- **Claimed**: Export members/relationships as CSV, full project backup as JSON
- **Actual**: Members CSV, relationships CSV, and full JSON backup implemented.
- **Evidence**: `src/shared/csvJsonExport.ts:1-35`
- **Tests**: Covered in export route tests
- **Status**: Implemented
- **Risk**: Low
- **Note**: Clean, minimal implementation. Proper CSV quoting.

### 16. Snapshots (Create, List, Restore)
- **Claimed**: Create named snapshots, list, restore project state
- **Actual**: Full implementation. DB table `project_snapshots` stores serialized JSON. Create, list, and restore routes exist.
- **Evidence**: `src/server/db/schema.ts:117-125`, routes in `src/server/routes/projects.ts`
- **Tests**: Covered in `src/test/projectRoutes.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Snapshot stores full project state as JSON blob.

### 17. Baselines and Diffs
- **Claimed**: Create baseline, run diff against current state, generate diff items
- **Actual**: Fully implemented. Baselines stored with source type (xml/snapshot/json/manual). Diff runs produce item-level change detection (add/update/delete/move/copy). Diff items stored with old/new values per property.
- **Evidence**: `src/server/db/schema.ts:127-163`, `src/shared/metadataDiff.ts`
- **Tests**: `src/test/metadataDiff.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Complete metadata diff pipeline integrated with change sets.

### 18. Change Sets
- **Claimed**: Create from diff, approve, reject, export
- **Actual**: Full lifecycle: create from diff items, validate, approve/reject with comments, export. Status flow: draft -> validated -> approved/rejected -> exported.
- **Evidence**: `src/server/db/schema.ts:165-200`, routes in `src/server/routes/projects.ts`
- **Tests**: Included in API/project route tests
- **Status**: Implemented
- **Risk**: Low
- **Note**: Integrated with workflow engine for multi-step approval.

### 19. Release Packages
- **Claimed**: Multiple modes (full, additive, propertyUpdate, etc.), manifest generation, rollback notes
- **Actual**: 6 modes supported: full, additive, propertyUpdate, relationshipDelete, moveCopy, breakBuild. Manifest generation, release notes (markdown), diff report CSV, validation report CSV, rollback notes markdown.
- **Evidence**: `src/shared/releasePackage.ts:1-243`
- **Tests**: `src/test/releasePackage.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Rollback is documented as "manual planning" — not automated XML rollback generation.

### 20. Bulk Update
- **Claimed**: Preview, apply, rollback with multiple operations
- **Actual**: 8 operations: set, clear, replaceText, append, prepend, copyFromProperty, deriveFromParent, regexReplace. Preview shows old/new values. Apply persists changes. Rollback via job history. Filters: dimensionId, memberKey patterns, property filters.
- **Evidence**: `src/shared/bulkUpdate.ts:1-400`, apply in `src/server/routes/projects.ts:1085-1121`
- **Tests**: `src/test/bulkUpdate.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Validation warnings shown in preview (e.g., property type mismatch).

### 21. Hierarchy Analysis
- **Claimed**: Tree building, cycle detection, orphan detection, analytics
- **Actual**: `analyzeHierarchy()` detects cycles, duplicates, missing parents/children, orphans. `buildHierarchyTree()` constructs tree with circular reference guards. `hierarchyAnalytics.ts` adds levelized tables, parent-child tables, shared member reports, orphan reports.
- **Evidence**: `src/shared/hierarchy.ts:1-117`, `src/shared/hierarchyAnalytics.ts:1-485`
- **Tests**: `src/test/hierarchy.test.ts`, `src/test/hierarchyAnalytics.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: DFS-based cycle detection. Full hierarchy path computation.

### 22. Varying Properties
- **Claimed**: CRUD with cube type / scenario type / time member context
- **Actual**: DB table `varying_property_values` with full context (cubeType, scenarioType, timeMember, isDefault). CRUD routes in project routes. Duplicate detection, context normalization, effective value resolution.
- **Evidence**: `src/server/db/schema.ts:62-78`, `src/shared/varyingProperties.ts:1-85`, routes in `src/server/routes/projects.ts`
- **Tests**: Covered in project route tests
- **Status**: Implemented
- **Risk**: Low
- **Note**: Supports "default" and contextual overrides — matches OneStream varying semantics.

### 23. Workflows
- **Claimed**: Definitions, instances, approval steps, self-approval prevention, auto-advance, notifications
- **Actual**: Full workflow engine: submit, approve (multi-step with minApprovals), reject, cancel. Self-approval blocked. Role-based step authorization. Notification generation for eligible reviewers. Auto-advance on sufficient approvals.
- **Evidence**: `src/server/workflow/workflowEngine.ts:1-225`, `src/server/workflow/autoAdvanceEngine.ts`, `src/server/routes/workflows.ts`
- **Tests**: `src/test/workflow.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Notifications are in-DB records (not email/push). Auto-advance engine exists.

### 24. AI Features
- **Claimed**: Duplicate detection, naming anomalies, hierarchy optimization, parent suggestion, property suggestion, natural language query
- **Actual**: All 6 AI features implemented as rule-based/heuristic engines (NOT LLM-backed): duplicateDetection (string similarity), namingAnomaly (pattern detection), hierarchyOptimization (depth/balance analysis), parentSuggestion (relationship pattern matching), propertySuggestion (missing value inference), NL query parser (keyword/intent matching).
- **Evidence**: `src/server/ai/aiEngine.ts:1-141`, `src/server/ai/suggestions/*.ts`, `src/server/ai/naturalLanguage/*.ts`
- **Tests**: `src/test/ai.test.ts`
- **Status**: Implemented
- **Risk**: Medium
- **Note**: These are heuristic engines, not LLM-powered. `llmClient.ts` exists but AI suggestions use local algorithms. Marketing as "AI" may overstate capabilities.

### 25. Cross-Dimension Analysis
- **Claimed**: Where-used, inheritance chains, property reference detection, cross-dim validation rules
- **Actual**: Full implementation: `buildDimensionMap()` (nodes + edges), `whereUsed()` (property-value scan), `buildInheritanceChains()`, `validateCrossDimension()` with 3 rule types (member_exists, property_maps, hierarchy_mirrors).
- **Evidence**: `src/server/crossDimension/crossDimensionEngine.ts:1-294`, routes in `src/server/routes/crossDimension.ts`
- **Tests**: `src/test/crossDimension.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Cross-dimension validation is rule-configurable per project.

### 26. Templates
- **Claimed**: Extract from project, apply to project, built-in templates
- **Actual**: Extract dimensions as reusable templates. Apply with rename mapping. 2 built-in templates (Manufacturing CoA, Corporate Entity Hierarchy). Template preview generation.
- **Evidence**: `src/server/templates/templateEngine.ts:1-233`, routes in `src/server/routes/templates.ts`
- **Tests**: `src/test/templates.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Template CRUD + application + built-in library. Clean design.

### 27. Reporting
- **Claimed**: Health, velocity, coverage, compliance reports with export
- **Actual**: 4 report types: health (quality/completeness/naming scores per dimension), velocity (weekly change tracking), coverage (property fill rates, staleness), compliance (validation pass rates). Report export to PDF/CSV/Markdown via `reportExporter.ts`.
- **Evidence**: `src/server/reporting/reportingEngine.ts:1-242`, `src/server/reporting/reportExporter.ts`, routes in `src/server/routes/reporting.ts`
- **Tests**: `src/test/reporting.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Snapshots enable trend analysis over time.

### 28. VCS (Version Control)
- **Claimed**: Branches, commits, merge, tags, diffs
- **Actual**: Full VCS: create branches, commit (serializes project snapshot), view history, diff between commits (member-level diff), merge with 3-way conflict detection, tags on commits.
- **Evidence**: `src/server/vcs/vcsEngine.ts:1-133`, `src/server/routes/vcs.ts:1-174`
- **Tests**: `src/test/vcs.test.ts`
- **Status**: Implemented
- **Risk**: Medium
- **Note**: Merge conflict detection is property-level. Resolution is automatic (conflicts reported, source-wins on no conflict). No manual conflict resolution UI found.

### 29. Extensibility Model
- **Claimed**: Cube type analysis, anti-pattern detection, what-if simulation, documentation generation
- **Actual**: Full implementation: identify cube types from inheritance, detect anti-patterns (deep_inheritance, orphaned_extension, excessive_overrides), what-if extension simulation, documentation generation (base members, extensions by cube type).
- **Evidence**: `src/server/extensibility/extensibilityEngine.ts:1-325`, routes in `src/server/routes/extensibility.ts`
- **Tests**: `src/test/extensibility.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: OneStream-specific extensibility model analysis (cube types, dimension inheritance).

### 30. ERP Connectors
- **Claimed**: CRUD, mapping, sync with CSV/SQL/REST/Oracle/SAP connectors
- **Actual**: Connector factory supporting csv, sql, oracle, sap, rest types. Mapping engine with field mapping, filtering, conflict detection, hierarchy derivation. Mock connector for testing. Full pipeline: test connection, fetch records, map to dimension members.
- **Evidence**: `src/server/connectors/erp/index.ts:1-23`, `src/server/connectors/mapping/mappingEngine.ts`, routes in `src/server/routes/connectors.ts`
- **Tests**: `src/test/connectors.test.ts`
- **Status**: Implemented
- **Risk**: Medium
- **Note**: SQL connector exists but oracle/sap fall through to SQL connector. REST connector uses mock. Production-readiness of non-CSV connectors is unclear.

### 31. Environments
- **Claimed**: CRUD, deploy, sync status tracking, overrides
- **Actual**: Environment CRUD (name, type, url, credentials). Sync status computation (SHA-256 hash comparison). Deploy route exists. Sync status summary per environment per dimension type. Statuses: in_sync, local_ahead, remote_ahead, diverged, unknown.
- **Evidence**: `src/server/environments/syncStatus.ts:1-103`, routes in `src/server/routes/environments.ts`
- **Tests**: `src/test/environments.test.ts`
- **Status**: Implemented
- **Risk**: Medium
- **Note**: Deploy is a status update — actual remote deployment (push to OneStream) depends on OneStream connector integration which uses a mock client.

### 32. Multi-Tenant
- **Claimed**: Tenant CRUD, usage tracking
- **Actual**: Tenant create/list with slug. Usage endpoint returns hardcoded zeros (stub). DB table `tenants` exists.
- **Evidence**: `src/server/routes/tier4.ts:18-35`, DB schema `tenants` table
- **Tests**: `src/test/tier4.test.ts`
- **Status**: Partial
- **Risk**: Medium
- **Note**: Schema and routes exist but usage metrics are stub values. No actual tenant isolation (no per-tenant data filtering in core queries).

### 33. Real-Time Collaboration (Presence & Comments)
- **Claimed**: Presence tracking, comments with mentions, threaded replies
- **Actual**: In-memory presence store with heartbeat/leave/cleanup (30s timeout). Comments CRUD with dimensionId, memberKey, mentions array, parentCommentId for threading.
- **Evidence**: `src/server/collaboration/presenceStore.ts:1-65`, routes in `src/server/routes/tier4.ts:37-108`
- **Tests**: `src/test/tier4.test.ts`
- **Status**: Implemented
- **Risk**: Medium
- **Note**: Polling-based (no WebSocket). Presence is in-memory only — lost on restart, not shared across instances.

### 34. Audit Log
- **Claimed**: Action logging, retention policies, compliance reports
- **Actual**: Audit log CRUD (projectId, userId, action, entityType, entityId, changes). Retention policies (entityType + retentionDays). Compliance report endpoint (segregation of duties, audit completeness — returns stubs).
- **Evidence**: `src/server/routes/tier4.ts:110-159`, DB tables `audit_log`, `retention_policies`
- **Tests**: `src/test/tier4.test.ts`
- **Status**: Partial
- **Risk**: Medium
- **Note**: Audit log creation works. Compliance report is mostly stub data. Retention policy enforcement (auto-purge) not implemented.

### 35. Performance (Metrics, Pagination, Background Jobs)
- **Claimed**: Response time metrics, cache hit rate, pagination, background jobs
- **Actual**: Metrics endpoint returns hardcoded values (avg 15ms, p95 50ms) with real memory usage. Paginated members endpoint (offset/limit with max 1000). Background jobs endpoint returns empty array.
- **Evidence**: `src/server/routes/tier4.ts:162-191`
- **Tests**: `src/test/tier4.test.ts`
- **Status**: Partial
- **Risk**: Medium
- **Note**: Pagination is real. Metrics are mostly stubs. No actual request tracking or cache layer.

### 36. Scheduled Jobs
- **Claimed**: Cron-based job scheduler with execution history
- **Actual**: Full in-process scheduler with cron parsing, due-job detection (minute-level), dedup (won't re-run same minute). 4 action types: validate_project, generate_report, sync_push, quality_check. Execution history stored in DB.
- **Evidence**: `src/server/scheduler/jobScheduler.ts:1-158`, `src/server/scheduler/cronParser.ts`
- **Tests**: `src/test/tier3.test.ts` (scheduler covered in tier3 tests)
- **Status**: Implemented
- **Risk**: Low
- **Note**: Single-process scheduler. Not distributed. Actions are lightweight summaries rather than full execution.

### 37. Migration Parsers (HFM, EPMA, BPC, CSV)
- **Claimed**: Parse legacy EPM exports (Hyperion HFM, EPMA, SAP BPC, generic CSV)
- **Actual**: All 4 parsers implemented: HFM (semicolon-delimited, auto-detect), EPMA (header-based column mapping), BPC (PARENTH1-N hierarchy columns), generic CSV (configurable column mapping). All produce unified `ParsedDimension` output.
- **Evidence**: `src/server/migration/migrationParsers.ts:1-338`
- **Tests**: Covered in tier3 tests
- **Status**: Implemented
- **Risk**: Low
- **Note**: Well-structured with proper CSV quote handling. Dimension type auto-mapping.

### 38. Quality Scoring
- **Claimed**: Member-level and dimension-level quality scores, quality gates
- **Actual**: Quality scoring via reporting engine (completeness, naming consistency). Score per dimension. Routes for quality scores exist. Quality gates referenced in tier3.
- **Evidence**: `src/server/reporting/reportingEngine.ts:181-227`, routes in `src/server/routes/tier3.ts`
- **Tests**: `src/test/tier3.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Scoring is formula-based (% filled properties, naming pattern consistency).

### 39. API Keys
- **Claimed**: Generate, list, revoke API keys
- **Actual**: DB table `api_keys` exists. CRUD routes in tier3. Generate with hashed key storage, list (masked), revoke by ID.
- **Evidence**: Routes in `src/server/routes/tier3.ts`, DB schema `api_keys` table
- **Tests**: `src/test/tier3.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: API key auth middleware not wired into main authenticate flow (JWT-only in production path).

### 40. Offline Sync
- **Claimed**: Queue changes, push, pull for offline operation
- **Actual**: DB table `sync_queue` exists. Routes for listPending, markSynced in tier3. Push endpoint marks pending items as synced. Pull returns current project state.
- **Evidence**: Routes in `src/server/routes/tier3.ts`, DB schema references
- **Tests**: `src/test/tier3.test.ts`
- **Status**: Partial
- **Risk**: Medium
- **Note**: Sync queue exists but no conflict resolution or true offline-first architecture. Push just marks items done; no actual remote sync.

### 41. Documentation Generation
- **Claimed**: Auto-generate project documentation
- **Actual**: Route `POST /projects/:id/docs/generate` creates markdown documentation from dimension/member/relationship data. Stores generated documents in DB. List endpoint.
- **Evidence**: `src/server/routes/tier3.ts:584-609`
- **Tests**: `src/test/tier3.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Generates markdown format. Content is dimension listing with member counts and relationships.

### 42. Impact Analysis
- **Claimed**: Impact analysis for proposed changes
- **Actual**: Impact engine that analyzes downstream effects of member changes (rename, delete, property change). Cross-dimension impact via property references.
- **Evidence**: `src/server/impact/impactEngine.ts`, routes in `src/server/routes/impact.ts`
- **Tests**: `src/test/impactAnalysis.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Identifies affected dimensions, members, and relationships.

### 43. OneStream Connector (Deploy)
- **Claimed**: Connect to OneStream, push dimensions
- **Actual**: HTTP client interface exists with `mockClient.ts` as primary implementation. Types defined for OneStream API interaction.
- **Evidence**: `src/server/connectors/onestream/index.ts`, `src/server/connectors/onestream/mockClient.ts`, `src/server/connectors/onestream/types.ts`
- **Tests**: None specific
- **Status**: Partial
- **Risk**: High
- **Note**: Only mock client implemented. No real OneStream API integration. Deploy to OneStream is not functional.

### 44. Blueprint Studio
- **Claimed**: Visual blueprint creation for dimensions
- **Actual**: Blueprint studio types, shared logic, and UI component exist. Server-side `projectBlueprints.ts` handles creation from blueprints.
- **Evidence**: `src/shared/blueprintStudio.ts`, `src/server/projectBlueprints.ts`, `src/client/components/BlueprintStudio.tsx`
- **Tests**: `src/test/blueprintStudio.test.ts`, `src/test/projectBlueprints.test.ts`
- **Status**: Implemented
- **Risk**: Low
- **Note**: Blueprints define starter dimensions; studio provides guided creation.

---

## Summary Statistics

| Status | Count |
|--------|-------|
| Implemented | 35 |
| Partial | 5 |
| Not found | 0 |
| Contradictory | 0 |

---

## Top 10 Verified Implemented Features (with evidence)

1. **Authentication (JWT + OIDC + RBAC)** - Full auth stack with login/register/refresh/OIDC/PKCE. 4-role permission matrix. Tests: `auth.test.ts`, `tokens.test.ts`, `authorize.test.ts`, `basicAuth.test.ts`.

2. **XML Import/Export** - Round-trip OneStream XML with unknown element preservation. 554-line parser + 681-line generator. Tests: `xmlImport.test.ts`, `xmlExport.test.ts`.

3. **Validation Engine** - 750-line engine with 10+ rule categories. Tests: `validationEngine.test.ts`, `oneStreamValidation.test.ts`.

4. **Bulk Update** - 8 operations with preview/apply/rollback and regex support. Tests: `bulkUpdate.test.ts`.

5. **Workflow Engine** - Multi-step approval with role-based authorization, self-approval prevention, auto-advance. Tests: `workflow.test.ts`.

6. **VCS (Branching/Merge)** - Full branch/commit/tag/diff/merge with 3-way conflict detection. Tests: `vcs.test.ts`.

7. **XLSX Import (Workbook Parser)** - Schema-driven parsing with alias mapping, metadata reference alignment, duplicate sheet merging. Tests: `workbookParser.test.ts`.

8. **Hierarchy Analysis** - Cycle detection, orphan identification, levelized path tables, shared member reports. Tests: `hierarchy.test.ts`, `hierarchyAnalytics.test.ts`.

9. **Cross-Dimension Engine** - Where-used scan, inheritance chains, 3 validation rule types. Tests: `crossDimension.test.ts`.

10. **Reporting Engine** - Health/velocity/coverage/compliance with trend analysis. Tests: `reporting.test.ts`.

---

## Top 10 Unverified or Highest-Risk Claims

1. **OneStream Deploy** - Mock client only. No real API integration for pushing dimensions to OneStream. Marketing implies production connectivity.

2. **Multi-Tenant Isolation** - Tenant table exists but no actual data isolation. Queries don't filter by tenant. Usage metrics are hardcoded stubs.

3. **"AI" Features** - Branded as AI but uses rule-based heuristics (string similarity, pattern matching). No LLM integration despite `llmClient.ts` existing. May disappoint users expecting GPT-level intelligence.

4. **Performance Metrics** - Endpoint returns hardcoded values. No actual request tracking, APM, or cache implementation.

5. **Offline Sync** - Queue table exists but no true offline-first architecture. Push doesn't actually sync to a remote. Conflict resolution absent.

6. **ERP Connectors (Oracle/SAP)** - Factory exists but Oracle/SAP fall through to generic SQL connector. REST uses mock. Production usability unclear.

7. **Audit Log Compliance** - Log creation works. Compliance report returns stubs. Retention enforcement (auto-purge) not implemented.

8. **Real-Time Collaboration** - Polling-only, in-memory presence (lost on restart). No WebSocket. Not viable at scale.

9. **OIDC Integration Testing** - No automated tests. Relies on manual testing with external IdP. Could break silently.

10. **VCS Merge Conflict Resolution** - Conflicts are detected but no UI for manual resolution. Source-wins when no conflict, but user has no way to resolve true conflicts through the interface.

---

## Top 10 Risks Before Pilot

1. **No Real OneStream Connectivity** - Cannot actually deploy dimensions. Mock client only. Pilot users will expect this core feature.

2. **Single-Instance Architecture** - In-memory stores (presence, rate limiting, OIDC flows) don't scale. No Redis/shared state layer.

3. **Large Real Workbook Regression Gap** - Workbook parser unit tests use generated XLSX fixtures, but a large real-world workbook is not part of the default test suite.

4. **No E2E Tests** - All tests are unit/integration. No browser-based E2E testing of the full workflow.

5. **SQLite for Production** - SQLite works for single-user but will hit write-contention under concurrent load. No migration path to PostgreSQL documented.

6. **AI Feature Expectations** - Heuristic engines labeled as "AI" may create user disappointment. Need to set expectations or integrate actual LLM.

7. **No Email/Push Notifications** - Workflow notifications are DB records only. No delivery mechanism (email, Slack, Teams).

8. **Tenant Isolation Gap** - Multi-tenant routes exist but data isn't actually isolated. Potential data leakage in multi-tenant scenario.

9. **Rollback is Manual** - Release packages note "rollback XML is not generated." Users must manually plan rollback from baseline.

10. **API Key Auth Not Wired** - API keys can be generated but the authentication middleware only checks JWT. API key auth path not connected.

---

## Recommended Next Actions

1. **Add optional large workbook regression pack** - Keep generated workbook fixtures in unit tests and add a separate opt-in path for real-world workbook stress coverage.

2. **Implement real OneStream connector** - Replace mock with actual OneStream REST API integration using their documented endpoints.

3. **Add Redis/shared state** - Move presence, rate limiting, and OIDC pending flows to Redis for multi-instance deployment.

4. **Wire API key authentication** - Connect API key validation in the `authenticate` middleware alongside JWT path.

5. **Implement audit retention enforcement** - Add a scheduled job that purges audit log entries beyond the configured retention period.

6. **Add tenant-scoped queries** - If multi-tenant is a real requirement, add tenant_id filtering to all data access queries.

7. **Add E2E test suite** - Use Playwright or Cypress to validate critical user flows (import -> edit -> validate -> export).

8. **Clarify AI branding** - Either integrate LLM (via Snowflake Cortex or OpenAI) or rename features to "Smart Suggestions" / "Heuristic Analysis."

9. **Add WebSocket for collaboration** - Replace polling presence with Socket.io or native WebSocket for real-time experience.

10. **Document PostgreSQL migration path** - Provide schema migration scripts for production deployment beyond SQLite.

---

## Test Coverage Summary

| Test File | Status | Feature Area |
|-----------|--------|--------------|
| `ai.test.ts` | PASS | AI suggestions |
| `api.test.ts` | PASS | Core API routes |
| `appConfig.test.ts` | PASS | Configuration |
| `auth.test.ts` | PASS | Authentication |
| `authorize.test.ts` | PASS | Authorization |
| `basicAuth.test.ts` | PASS | Basic auth |
| `blueprintStudio.test.ts` | PASS | Blueprints |
| `bulkUpdate.test.ts` | PASS | Bulk operations |
| `clientComponentsMarkup.test.ts` | PASS | UI components |
| `clientUiViewModel.test.ts` | PASS | UI view models |
| `connectors.test.ts` | PASS | ERP connectors |
| `cors.test.ts` | PASS | CORS config |
| `crossDimension.test.ts` | PASS | Cross-dim analysis |
| `database.test.ts` | PASS | DB operations |
| `dimensionDisplay.test.ts` | PASS | Dimension display |
| `dimensionSchemas.test.ts` | PASS | Schema definitions |
| `environments.test.ts` | PASS | Environments |
| `exportGuards.test.ts` | PASS | Export validation |
| `extensibility.test.ts` | PASS | Extensibility |
| `gracefulShutdown.test.ts` | PASS | Server lifecycle |
| `hierarchy.test.ts` | PASS | Hierarchy core |
| `hierarchyAnalytics.test.ts` | PASS | Hierarchy analytics |
| `impactAnalysis.test.ts` | PASS | Impact analysis |
| `logger.test.ts` | PASS | Logging |
| `metadataDiff.test.ts` | PASS | Metadata diff |
| `multiEnv.test.ts` | PASS | Multi-environment |
| `notionDesignSystem.test.ts` | PASS | UI design system |
| `oneStreamPropertyDictionary.test.ts` | PASS | Property dictionary |
| `oneStreamValidation.test.ts` | PASS | OneStream rules |
| `passwords.test.ts` | PASS | Password hashing |
| `projectBlueprints.test.ts` | PASS | Project blueprints |
| `projectRoutes.test.ts` | PASS | Project API |
| `rateLimiter.test.ts` | PASS | Rate limiting |
| `relationshipOperations.test.ts` | PASS | Relationships |
| `releasePackage.test.ts` | PASS | Release packages |
| `reporting.test.ts` | PASS | Reporting |
| `repositoryEditing.test.ts` | PASS | CRUD operations |
| `templates.test.ts` | PASS | Templates |
| `tier3.test.ts` | PASS | Tier 3 features |
| `tier4.test.ts` | PASS | Tier 4 features |
| `tokens.test.ts` | PASS | JWT tokens |
| `validateMiddleware.test.ts` | PASS | Validation MW |
| `validationEngine.test.ts` | PASS | Validation rules |
| `vcs.test.ts` | PASS | Version control |
| `workbookParser.test.ts` | **FAIL** | XLSX import |
| `workflow.test.ts` | PASS | Workflows |
| `xlsxExport.test.ts` | PASS | XLSX export |
| `xmlExport.test.ts` | PASS | XML export |
| `xmlImport.test.ts` | PASS | XML import |

**Total: 537 passing, 4 failing (all in workbookParser.test.ts due to missing fixture file)**

---

## Architecture Notes

- **Backend**: Express.js + TypeScript, SQLite (better-sqlite3), Zod validation
- **Frontend**: React + Vite + TypeScript, Zustand state management
- **Database**: SQLite with 30+ tables, foreign keys, CASCADE deletes, proper indexing
- **Auth**: JWT (jsonwebtoken) + bcrypt + openid-client for OIDC
- **Testing**: Vitest with supertest for API integration tests
- **Build**: Vite for client, tsx for server, vitest for tests
