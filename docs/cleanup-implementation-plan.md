# Cleanup And Implementation Plan

> **Historical document.** Written before or during the 2026-06 OneStream workbench P0 cleanup. Findings, gaps, and “current behavior” sections may be outdated.
>
> **Authoritative current docs:**
> - [feature-status.md](feature-status.md) — module defaults and what is mounted
> - [onestream-positioning.md](onestream-positioning.md) — product language and boundaries
> - [configuration-guide.md](configuration-guide.md) — `config/dimbuilder.yaml`, `appMode`, validation profiles
> - [acm-handoff-guide.md](acm-handoff-guide.md) — ACM/manual handoff packages

## Implementation status (2026-06-02)

| Phase | Status |
|-------|--------|
| Phase 0 — Docs & scope | Done — feature tiers, pilot guide, security/architecture/baseline updates |
| Phase 1 — Security hardening | Done — startup guard, Docker pilot defaults, module validation, CSP on shared host |
| Phase 2 — Migrations | Done — upgrade test, `migrate.mjs --pending`, migration-authoring.md, artifact retention |
| Phase 3 — Route organization | Partial — `registerApiRoutes.ts`; large route files not split further |
| Phase 4 — Export scalability | Partial — XML/CSV/XLSX streaming; full snapshot still in memory |
| Phase 5 — DX | Done — pilot guide, vitest worker limits, `.gitignore`, smoke auth |
| Phase 6 — Feature catalog | Done — tiers doc, `moduleNav`, module route tests |
| Full app modules | Conservative module defaults (see [feature-status.md](feature-status.md)) |
| Bulk update rollback | `POST .../bulk-updates/:jobId/rollback` + UI |
| P3 non-goals | Unchanged — Postgres, SaaS, WebSockets, React 19 |

---

## 1. Executive Summary

### Current Architectural Health

SR OneStream Dim Builder is in a healthy shape for its preferred product direction: a strong local-first consultant workbench. The repository keeps the most important OneStream domain logic in `src/shared`, uses TypeScript end-to-end, and keeps persistence simple with SQLite behind a repository layer.

The current branch has already completed several foundational cleanup items that were previously risks:

- `src/server/routes/projects.ts` is now a slim project router that mounts domain sub-routers.
- SQLite now has a `schema_migrations` ledger and a formal `002_relationship_operation_columns` migration.
- The production build compiles server TypeScript with `tsconfig.server.json` and Docker runs compiled JavaScript instead of `tsx`.
- Upload extension/MIME filtering and configurable upload size limits exist in `src/server/routes/import.ts`.
- A startup guard refuses non-localhost binding when authentication is disabled.
- Optional platform modules are behind `config.modules` flags.

The architecture should remain local-first. SQLite, shared TypeScript domain modules, and focused Express routes are appropriate for the product as described. Nothing in the current codebase requires a Postgres or SaaS rewrite.

### Main Risks

The main confirmed risks are now follow-up hardening and scope control rather than foundational rewrites:

- Network deployment still needs sharper operational defaults: Docker binds to `0.0.0.0`, `docker-compose.yml` defaults `AUTH_ENABLED=false`, and the startup guard will intentionally refuse that combination.
- Auth defaults are safe enough for localhost, but shared deployment still needs stronger validation around placeholder JWT secrets and seeded admin passwords.
- Export endpoints build full snapshots and output strings/buffers in memory, which is acceptable for small local projects but risky for large consultant datasets.
- Migration infrastructure exists, but it is still minimal: no useful pending-migration CLI, no migration validation tests beyond the basics, and no down/rollback policy beyond documentation.
- Documentation is stale in several places. Some docs still describe `projects.ts` as the route monolith and still list “no database migrations” and missing upload limits as known gaps.
- The feature catalog mixes core workbench capabilities with experimental/platform features, making it easy to over-prioritize AI, multi-tenancy, API keys, scheduler, and collaboration work before the core workbench is finished.
- Full test runs are currently blocked by missing workbook fixture expectations in `src/test/workbookParser.test.ts`.

### Recommended Product Direction

Keep the product centered on:

- Local consultant productivity.
- OneStream metadata correctness.
- Safe import/edit/validate/diff/export/package workflows.
- SQLite-backed project state.
- Explicit configuration and filesystem artifacts.

Treat SaaS/platform capabilities as optional modules and documentation-only future scope unless a concrete customer deployment requires them.

## 2. Confirmed Strengths

- Shared domain logic is strong. Core behavior lives in `src/shared`, including validation, XML import/export, metadata diffing, relationship operation planning, bulk update previewing, release artifacts, readiness scoring, and property dictionary logic.
- The server is mostly a thin orchestration layer. Express routes call repositories and shared domain functions rather than embedding most domain rules directly in HTTP handlers.
- SQLite is a good fit for the current product. `src/server/db/database.ts`, `schema.ts`, and `repositories.ts` provide a simple local persistence model without external operational dependencies.
- The route monolith has been decomposed. `src/server/routes/projects.ts` now handles only project CRUD/summary and mounts sub-routers.
- Validation and export guard behavior is meaningful. `src/server/exportGuards.ts` blocks export when stored validation issues match configured blocking severities, with audited bypass disabled by default.
- Upload hardening has started. `src/server/routes/import.ts` checks extension, MIME signal, and configured file size limits, and removes temp uploads after import.
- Production runtime is moving in the right direction. `package.json`, `tsconfig.server.json`, `vite.config.ts`, and `Dockerfile` now produce separate compiled server and client outputs.
- Test coverage is broad. The repo has unit and route coverage for validation, repositories, export guards, release artifacts, project routes, route modules, E2E workflow, and pilot hardening.
- The app remains local-first by default. `server.host` defaults to `127.0.0.1`, auth is optional for local use, uploads/exports are filesystem-backed, and no external queue, database, or WebSocket service is required.

## 3. Confirmed Issues

### Security

- `docker-compose.yml` defaults to `AUTH_ENABLED=false` while Docker sets `HOST=0.0.0.0`. The startup guard prevents unsafe startup, but the default compose path may surprise users until documented or changed.
- `config/dimbuilder.yaml` contains a placeholder JWT secret. `src/server/index.ts` warns on placeholder secrets, but shared/network deployment should fail fast when auth is enabled and the secret is still a placeholder.
- `src/server/index.ts` seeds a default admin with `ChangeMe123!` if auth is enabled and no real users exist. This is convenient for demos but risky for shared deployment unless guarded by explicit environment variables or localhost-only behavior.
- `helmet` is enabled with `contentSecurityPolicy: false` in `src/server/app.ts`. That may be acceptable during local development, but shared deployment should have an explicit CSP decision.
- `docs/security-model.md` is stale. It still says CORS is open when no origins are configured and lists missing upload policy and migration framework as gaps, which is no longer accurate.
- CSRF is documented as a gap. If the app stays bearer-token based with tokens in client memory, this is less urgent; if cookies are introduced, it becomes P0 for shared deployment.

### Database/Migrations

- Migration infrastructure exists but is still minimal. `scripts/migrate.mjs --pending` currently prints guidance instead of checking pending migrations.
- The baseline schema is still applied via `CREATE TABLE IF NOT EXISTS` on startup, then migrations run. That is pragmatic for a local app, but future non-additive changes need clear rules.
- `schema.ts` already includes columns added by migration 002. That is acceptable for new databases, but old database upgrades depend on the migration ledger being correct.
- There is no migration test for upgrading an old schema missing relationship operation columns.
- Retention/cleanup policies exist for exports, but not yet for baselines, diff runs, change sets, release packages, bulk update jobs, or old audit records.

### Routing/Code Organization

- `src/server/routes/projects.ts` is fixed, but several other route files are now large enough to deserve follow-up review: `tier3.ts`, `environments.ts`, `connectors.ts`, `changeSets.ts`, `auth.ts`, and `dimensions.ts`.
- `src/server/app.ts` is becoming a large mount table with many imports and feature gates. It is still understandable, but a small route-registration helper would keep module gating clearer.
- Some docs still point feature ownership at `src/server/routes/projects.ts`, creating maintenance confusion after the route split.
- `src/server/db/repositories.ts` is very large and mixes many domains in one factory. This is acceptable for SQLite simplicity today, but extraction by repository domain would improve maintainability later.

### Export Scalability

- `src/server/routes/export.ts` loads full project snapshots through `repos.members.listByProject()` and `repos.relationships.listByProject()`.
- `src/shared/xmlExport.ts` builds XML as a large `string[]` and returns one joined string.
- CSV/JSON exports similarly materialize complete output in memory.
- XLSX export writes a file and then reads it fully into memory with `readFileSync()` before sending.
- This is fine for typical local consultant projects, but large dimensions can cause high memory usage and slow responses.

### Production Runtime

- The server build is now compiled, and Docker no longer uses runtime `tsx`. This should be preserved.
- `docker-compose.yml` needs alignment with the startup guard. Either default to localhost binding or require auth in the compose example.
- The smoke test script only supports unauthenticated deployments today. It will fail once shared deployment requires auth unless it accepts a bearer token or login credentials.
- `scripts/migrate.mjs` depends directly on `node:sqlite`, which is aligned with the app, but it does not import the migration registry or report pending migrations.

### Developer Experience

- Workbook parser tests now generate representative XLSX fixtures in temp directories instead of depending on an uncommitted local workbook file.
- The repo has many docs that are now stale relative to the route split, upload policy, migration framework, module flags, and production build.
- `docs/feature-catalog.md` still maps many features to `src/server/routes/projects.ts`.
- `.env.example`, `docker-compose.yml`, backup/cleanup scripts, and smoke tests exist or are being added, but the deployment story needs one clean “local dev / shared pilot / Docker” path.
- There are generated/runtime artifacts in the working tree (`data/app.db-*`, `dist`, `docs.zip`, logs). The repo should ensure these are ignored or intentionally excluded from commits.

### Feature Scope

- Core workbench functionality is strong, but platform features blur the product direction: tier3, tier4, AI suggestions, multi-environment deployment, API keys, webhooks, scheduler, multi-tenancy, and collaboration.
- `config.modules` helps, but documentation and navigation should make clear which features are core, experimental, and future.
- AI and SaaS-style capabilities should not consume implementation priority until the local workbench workflow is stable, tested, and pilot-ready.

## 4. Recommended Priority Plan

### Phase 0: Safety And Scope Alignment

Focus: make the current branch coherent and avoid accidental SaaS/platform expansion.

- Freeze the product direction in docs: local-first consultant workbench first.
- Mark optional modules as experimental/future unless actively needed.
- Update stale architecture/security/feature docs so they match the current route split, migration state, upload policy, module flags, and production build.

### Phase 1: Security And Configuration Hardening

Focus: make localhost easy and network deployment explicit.

- Align Docker/compose defaults with the startup guard.
- Fail fast on placeholder JWT secrets when auth is enabled and host is non-local.
- Require explicit admin credentials for non-local auth-enabled startup.
- Add tests for non-local startup safety and module-gated route exposure.

### Phase 2: Migration Framework

Focus: make SQLite evolution safe without changing databases.

- Add migration tests that simulate older schemas.
- Make `scripts/migrate.mjs --pending` useful.
- Document the rule: `schema.ts` defines new DB shape, migrations upgrade old DBs.
- Add a migration authoring checklist.

### Phase 3: Route Decomposition

Focus: preserve the completed `projects.ts` split and avoid new monoliths.

- Keep `projects.ts` as the slim router.
- Review the largest remaining route files and split only where it removes real complexity.
- Extract route registration/gating from `app.ts` only if it improves clarity.

### Phase 4: Export Scalability

Focus: reduce memory spikes while preserving exact export behavior.

- Add streaming or file-backed responses for XML/CSV/XLSX.
- Start with XLSX `res.download()`/`createReadStream()` instead of `readFileSync()`.
- Add large-project tests around export memory behavior and response integrity.

### Phase 5: Production Build And DX Cleanup

Focus: make the new compiled runtime easy to use and verify.

- Keep `tsx` in devDependencies only.
- Ensure Docker, `npm run build`, `npm start`, and `npm run smoke-test` are documented.
- Fix missing workbook test fixtures or generate representative fixtures in tests.
- Add a short pilot deployment guide that matches current config and safety defaults.

### Phase 6: Feature Catalog Pruning

Focus: separate core, experimental, and future features.

- Rewrite feature catalog around product tiers:
  - Core local workbench.
  - Optional pilot/admin features.
  - Experimental platform modules.
  - Future/deferred SaaS features.
- Hide or disable incomplete platform features by default.
- Add tests that disabled modules do not expose routes or nav entries.

## 5. Detailed Implementation Plan

### 5.1 Safety And Scope Alignment

Objective: Keep the repo aligned to “local-first consultant workbench first.”

Current behavior: The code mostly supports this direction, but docs and feature catalog still present tier3/tier4/platform features as if they are equally central.

Proposed change: Update docs to distinguish core workbench features from optional/experimental modules.

Files/modules affected:

- `docs/architecture.md`
- `docs/current-state-baseline.md`
- `docs/feature-catalog.md`
- `docs/security-model.md`
- `docs/production-readiness-checklist.md`
- `docs/api-reference.md`

Implementation steps:

1. Update architecture docs to reflect route split and `node:sqlite`.
2. Update known gaps to remove items that are already implemented.
3. Add a “Feature Scope” section with core/optional/experimental/future classifications.
4. Run `npm run docs:check`.

Tests to add/update:

- Docs checker should pass.
- Add no runtime tests unless docs checker enforces links/references.

Acceptance criteria:

- No doc says `projects.ts` owns all domain routes.
- No doc says there is no migration framework or no upload limits.
- Feature catalog clearly marks AI/multi-tenancy/scheduler/API-key/webhook features as optional or experimental.

Recommendation metadata:

- Why it matters: Prevents future work from drifting toward SaaS/platform architecture prematurely.
- Estimated effort: M.
- Risk level: Low.
- Priority: must do now.

### 5.2 Network Deployment Safety Defaults

Objective: Make unsafe network deployment difficult and obvious.

Current behavior: `src/server/index.ts` refuses non-localhost host without auth, while Docker sets `HOST=0.0.0.0` and compose defaults `AUTH_ENABLED=false`.

Proposed change: Align Docker examples with the guard by either defaulting compose to authenticated pilot mode or binding to localhost for unauthenticated local Docker use.

Files/modules affected:

- `docker-compose.yml`
- `.env.example`
- `docs/pilot-deployment-guide.md`
- `src/test/startupGuard.test.ts`

Implementation steps:

1. Decide on one compose default:
   - local Docker: bind to `127.0.0.1` and `AUTH_ENABLED=false`, or
   - shared pilot: bind to `0.0.0.0` and require `AUTH_ENABLED=true`.
2. Document both examples explicitly.
3. Add a startup guard unit test for `0.0.0.0 + auth false`.
4. Add a smoke-test note for authenticated deployments.

Tests to add/update:

- Unit test for startup guard helper logic.
- Optional integration test that config validation rejects unsafe shared defaults if introduced.

Acceptance criteria:

- `docker compose up` either starts safely for localhost or clearly requires auth variables.
- Non-localhost unauthenticated startup remains blocked.

Recommendation metadata:

- Why it matters: This is the boundary between safe local workbench and risky shared service.
- Estimated effort: S.
- Risk level: Low.
- Priority: P0 must fix before network/shared deployment.

### 5.3 Auth Secret And Admin Bootstrap Hardening

Objective: Prevent accidental shared deployments with placeholder credentials.

Current behavior: Placeholder JWT secrets trigger a warning, and a default admin password is used if auth is enabled and no users exist.

Proposed change: Fail startup for non-localhost auth-enabled deployments when `JWT_SECRET`, `ADMIN_EMAIL`, or `ADMIN_PASSWORD` are missing or placeholder/default.

Files/modules affected:

- `src/server/index.ts`
- `src/server/config/loadAppConfig.ts`
- `.env.example`
- `src/test/startupGuard.test.ts`
- `docs/security-model.md`

Implementation steps:

1. Extract startup safety checks into a pure helper that can be tested without starting the server.
2. Keep localhost defaults convenient.
3. Fail non-local auth-enabled startup when JWT secret is placeholder.
4. Fail non-local first-admin bootstrap if admin credentials are defaults or missing.
5. Document required environment variables.

Tests to add/update:

- Unit tests for local unauthenticated allowed.
- Unit tests for non-local unauthenticated blocked.
- Unit tests for non-local auth-enabled with placeholder secret blocked.
- Unit tests for non-local admin bootstrap with default password blocked.

Acceptance criteria:

- Shared deployment cannot start with placeholder secrets or default admin password.
- Local unauthenticated workflow remains unchanged.

Recommendation metadata:

- Why it matters: Prevents the most likely deployment security mistakes without hurting local use.
- Estimated effort: M.
- Risk level: Medium.
- Priority: P0.

### 5.4 Upload Policy Finish

Objective: Keep import convenient while reducing file handling risk.

Current behavior: Import uses `multer` with configured size limits, extension filtering, MIME checks, and upload cleanup.

Proposed change: Add tests and docs for allowed/blocked extensions, MIME mismatch behavior, size limit behavior, and cleanup after parse failures.

Files/modules affected:

- `src/server/routes/import.ts`
- `src/test/pilotHardening.test.ts`
- `src/test/importRoutes.test.ts` or similar
- `docs/security-model.md`
- `docs/import-seeding-guide.md`

Implementation steps:

1. Add route tests for `.xlsx`, `.xml`, `.csv` acceptance.
2. Add route tests for blocked extensions.
3. Add route tests for file-size limit.
4. Add cleanup assertion after parser failure.
5. Document `operations.uploadMaxMb`.

Tests to add/update:

- Multipart upload tests with small synthetic files.
- Negative tests for `.exe`/unknown extension and oversized file.

Acceptance criteria:

- Upload policy is tested and documented.
- Temporary uploads are removed on success and failure.

Recommendation metadata:

- Why it matters: Upload is a direct filesystem boundary, especially in pilot/shared use.
- Estimated effort: M.
- Risk level: Medium.
- Priority: P0 for shared deployment, P1 for local-only.

### 5.5 Migration Framework Completion

Objective: Make SQLite schema changes safe for existing local databases.

Current behavior: `schemaSql` creates the desired current schema and `runMigrations()` records named migrations. Migration 002 adds relationship operation columns for older databases.

Proposed change: Add upgrade tests and improve migration CLI pending checks.

Files/modules affected:

- `src/server/db/migrations.ts`
- `src/server/db/database.ts`
- `scripts/migrate.mjs`
- `src/test/database.test.ts`
- `src/test/pilotHardening.test.ts`
- `docs/database-architecture.md` if present, or `docs/architecture.md`

Implementation steps:

1. Add a test database with a legacy `dimension_relationships` table missing operation columns.
2. Run migrations and assert columns are added and migration recorded.
3. Make `scripts/migrate.mjs --pending` compare applied IDs against the migration registry. If direct TS import is too much, create a small generated/static registry or run via `tsx` in dev.
4. Document migration authoring rules.
5. Add a “never edit old migrations after release” convention.

Tests to add/update:

- Migration upgrade test for 002.
- Migration idempotency test.
- CLI smoke test for `--list`.

Acceptance criteria:

- Old local DBs upgrade without relying on ad hoc schema evolution.
- Operators can list applied migrations and see pending migrations.

Recommendation metadata:

- Why it matters: Local-first apps still need safe upgrades across consultants' machines.
- Estimated effort: M.
- Risk level: Medium.
- Priority: P1.

### 5.6 Route Organization Follow-Up

Objective: Keep route modules maintainable without over-abstracting.

Current behavior: `projects.ts` is decomposed; several optional/platform route files remain large.

Proposed change: Only split large files when they represent separate resource domains or feature modules.

Files/modules affected:

- `src/server/routes/tier3.ts`
- `src/server/routes/environments.ts`
- `src/server/routes/connectors.ts`
- `src/server/routes/changeSets.ts`
- `src/server/routes/auth.ts`
- `src/server/app.ts`

Implementation steps:

1. Leave `projects.ts` as-is.
2. Audit large route files for mixed domains.
3. For `tier3.ts`, split by experimental feature area if the module remains enabled.
4. For `app.ts`, consider a `registerRoutes(app, repos, config)` helper only after module gates settle.
5. Update docs and tests per route split.

Tests to add/update:

- Existing route tests should pass unchanged.
- Add module-gating route tests where optional routers move.

Acceptance criteria:

- No route file grows into a new monolith.
- Endpoint paths remain backward-compatible.

Recommendation metadata:

- Why it matters: Maintains the readability gained by the `projects.ts` split.
- Estimated effort: M.
- Risk level: Medium.
- Priority: P1 for `tier3.ts`, P2 for others.

### 5.7 Export Streaming And Memory Reduction

Objective: Handle larger projects without materializing every export artifact in memory.

Current behavior: Export routes load all dimensions, members, relationships, and varying properties before rendering. XML/CSV/JSON return full strings; XLSX is read into a full buffer before sending.

Proposed change: Introduce streaming/file-backed export paths incrementally.

Files/modules affected:

- `src/server/routes/export.ts`
- `src/shared/xmlExport.ts`
- `src/shared/csvJsonExport.ts`
- `src/shared/xlsxExport.ts`
- `src/server/db/repositories.ts`
- `src/test/exportGuards.test.ts`
- `src/test/xmlExport.test.ts`
- `src/test/e2eCoreWorkflow.test.ts`

Implementation steps:

1. Replace XLSX `readFileSync()` response with `res.download()` or `createReadStream()`.
2. Add repository iterators or paginated read helpers for members/relationships by dimension.
3. Add `writeProjectXml()` or generator-based XML rendering alongside current `exportProjectXml()` to preserve unit tests.
4. Stream CSV rows for members and relationships.
5. Keep small-string exporters for unit tests and preview UI.

Tests to add/update:

- Verify XLSX endpoint response headers and content after stream change.
- Add large synthetic project export test.
- Keep XML golden-output tests for current string API.
- Add streaming XML equivalence test against string output for a small fixture.

Acceptance criteria:

- Small project exports are byte-for-byte equivalent where expected.
- Large export no longer requires building XLSX buffers or XML/CSV strings in route handlers.

Recommendation metadata:

- Why it matters: Large OneStream dimensions are plausible, and export is a core workflow.
- Estimated effort: L.
- Risk level: High.
- Priority: P1.

### 5.8 Production Build And Runtime Cleanup

Objective: Preserve compiled runtime and make deployment commands boring.

Current behavior: `npm run build` emits `dist/server` and `dist/client`; Docker runs `node dist/server/server/index.js`; `tsx` is dev-only.

Proposed change: Add verification docs and keep scripts aligned.

Files/modules affected:

- `package.json`
- `Dockerfile`
- `docker-compose.yml`
- `vite.config.ts`
- `tsconfig.server.json`
- `docs/pilot-deployment-guide.md`
- `scripts/smoke-test.mjs`

Implementation steps:

1. Document `npm run build`, `npm start`, Docker build, and compose modes.
2. Add CI check that `dist/server/server/index.js` exists after build if CI does not already cover it.
3. Make smoke test support authenticated deployments via `SMOKE_TEST_TOKEN` or login credentials.
4. Ensure client static path remains `dist/client`.

Tests to add/update:

- Build in CI.
- Smoke test script dry-run or documented manual verification.

Acceptance criteria:

- Production runtime does not depend on `tsx`.
- Docker and local start commands use the same compiled entry.
- Smoke test works for local unauthenticated and authenticated pilot modes.

Recommendation metadata:

- Why it matters: Prevents regressions to runtime transpilation and clarifies pilot deployment.
- Estimated effort: S to M.
- Risk level: Low.
- Priority: P1.

### 5.9 Test Fixture Cleanup

Objective: Restore reliable full test runs.

Current behavior: `src/test/workbookParser.test.ts` uses generated workbook fixtures for normal parser coverage, including supported sheet detection, generated-column filtering, metadata-reference alignment, duplicate sheet merging, and metadata-only dimensions.

Remaining change: Decide whether a large real-world workbook belongs in a separate optional/manual regression pack outside the default unit test suite.

Files/modules affected:

- `src/test/workbookParser.test.ts`
- `src/test/fixtures/` or test helper module
- `docs/testing-strategy.md`

Implementation steps:

1. Decide whether large real workbook coverage belongs in normal unit tests.
2. For normal CI, generate representative workbooks with `ExcelJS`.
3. Move real-client workbook coverage to optional/manual fixture tests if needed.
4. Document how to run tests with a private workbook fixture.

Tests to add/update:

- Convert the four failing workbook tests to generated fixtures, or skip only when an explicit fixture env var is missing.
- Keep at least one import/export round-trip test with generated workbook data.

Acceptance criteria:

- `npm test` passes on a clean clone without private files.
- Optional real workbook regression testing remains possible.

Recommendation metadata:

- Why it matters: Reliable tests are required before cleanup PRs can be trusted.
- Estimated effort: M.
- Risk level: Low.
- Priority: P0 for merge readiness, P1 for local experimentation.

### 5.10 Feature Catalog Pruning

Objective: Keep implementation focus on core workbench behavior.

Current behavior: Docs and code include tier3/tier4/platform features that are not central to the local-first product direction.

Proposed change: Classify features and keep optional modules disabled by default.

Files/modules affected:

- `docs/feature-catalog.md`
- `docs/current-state-baseline.md`
- `src/shared/appConfigDefaults.ts`
- `config/dimbuilder.yaml`
- `src/server/app.ts`
- `src/client/components/AppShell.tsx`
- `src/test/modulesConfig.test.ts`

Implementation steps:

1. Define feature tiers in docs:
   - Core: project creation, import, edit, validate, diff, change set, release package, export, snapshots.
   - Optional pilot/admin: auth, users, config, readiness, handoff, reports.
   - Experimental: AI insights, scheduler, API keys, webhooks, offline sync, multi-env deployment.
   - Future: multi-tenancy, real-time collaboration, SaaS operations.
2. Ensure default `modules` values keep experimental/platform features off.
3. Hide nav entries for disabled modules.
4. Add route tests proving disabled modules return 404.

Tests to add/update:

- Module default test.
- Route exposure tests for `chatAssistant`, `environmentManagement`, `multiTenancy`, `offlineSync`, and `apiPlatform`.
- UI markup test for disabled nav entries.

Acceptance criteria:

- Users can understand what is production-ready core vs experimental.
- Disabled modules do not expose routes or nav affordances.

Recommendation metadata:

- Why it matters: Prevents premature platform work and reduces support burden.
- Estimated effort: M.
- Risk level: Medium.
- Priority: P1.

## 6. Suggested Backlog

### P0: Must Fix Before Network/Shared Deployment

| Item | Why it matters | Likely files | Effort | Risk | Suggested coverage |
|---|---|---|---:|---|---|
| Align Docker/compose auth and host defaults | Avoid unsafe or confusing shared startup | `Dockerfile`, `docker-compose.yml`, `.env.example`, deployment docs | S | Low | Startup guard tests; Docker smoke checklist |
| Fail fast on placeholder JWT/default admin credentials for non-local auth | Prevent credential mistakes in pilots | `src/server/index.ts`, `loadAppConfig.ts`, `.env.example` | M | Medium | Pure startup safety unit tests |
| Fix missing workbook fixture tests | Clean clone should pass tests | `src/test/workbookParser.test.ts`, fixtures/helpers | M | Low | Full `npm test` on clean clone |
| Update stale security docs | Operators need accurate current posture | `docs/security-model.md`, readiness docs | S | Low | `npm run docs:check` |

### P1: Important For Maintainability And Safe Growth

| Item | Why it matters | Likely files | Effort | Risk | Suggested coverage |
|---|---|---|---:|---|---|
| Add old-schema migration test and real pending CLI | Makes SQLite upgrades trustworthy | `migrations.ts`, `scripts/migrate.mjs`, DB tests | M | Medium | Legacy schema migration test |
| Stream/file-back XLSX export first | Removes obvious memory spike | `routes/export.ts`, `xlsxExport.ts` | S | Medium | Endpoint response test |
| Add XML/CSV streaming path | Handles large OneStream projects | `xmlExport.ts`, `csvJsonExport.ts`, repositories | L | High | Equivalence and large-project tests |
| Feature catalog pruning | Keeps roadmap local-first | `docs/feature-catalog.md`, module tests | M | Medium | Docs check; module route tests |
| Module config validation | Prevent invalid module values from slipping through config | `appConfigValidation.ts`, app config tests | S | Low | Config validation tests |
| Route/app registration cleanup | Avoid new route monoliths | `app.ts`, large route files | M | Medium | Existing route tests |

### P2: Useful But Not Urgent

| Item | Why it matters | Likely files | Effort | Risk | Suggested coverage |
|---|---|---|---:|---|---|
| Repository domain extraction | Improves maintainability of large `repositories.ts` | `src/server/db/repositories.ts` | L | High | Repository tests |
| Retention policies for baselines/diffs/change sets | Prevents long-running local DB bloat | repositories, cleanup scripts | M | Medium | Retention unit tests |
| Smoke test auth support | Useful for pilots | `scripts/smoke-test.mjs` | S | Low | Manual/CI smoke run |
| CSP decision for shared deployments | Hardens browser surface | `src/server/app.ts`, docs | M | Medium | Browser smoke test |

### P3: Defer Unless Product Direction Changes

| Item | Why it matters | Likely files | Effort | Risk | Suggested coverage |
|---|---|---|---:|---|---|
| Postgres migration | Only needed for true multi-user SaaS | DB/repositories/migrations | L | High | Full persistence suite |
| Multi-tenant architecture | Not needed for local consultant workbench | tier4, ACL, auth, DB | L | High | Tenant isolation suite |
| WebSocket collaboration | Only needed for committed real-time product | collaboration/server/client | L | High | Browser E2E |
| React 19 migration | No clear current benefit | client/package/tests | M | Medium | Full client tests |
| AI expansion | Not central to core metadata correctness | `src/server/ai`, Chat/UI | M/L | Medium | AI route/unit tests |
| Full SaaS deployment architecture | Premature operational complexity | infra/auth/db/observability | L | High | End-to-end deployment suite |

## 7. Explicit Non-Goals

- Do not migrate from SQLite to Postgres now. SQLite fits the local-first workbench and keeps setup simple.
- Do not redesign the app as a multi-tenant SaaS platform.
- Do not prioritize WebSocket collaboration unless real-time collaboration becomes a committed product requirement.
- Do not migrate to React 19 just for novelty.
- Do not expand AI functionality until the core workbench is stable and the AI features have a clear user workflow.
- Do not build full SaaS deployment architecture, tenant isolation, external queues, or distributed schedulers yet.
- Do not introduce Redux or a new state framework unless `AppShell`, `useProjectStore`, and component state show concrete pain that cannot be solved locally.
- Do not replace the shared TypeScript domain model with server-only logic.
- Do not make XLSX import the center of the product; it should remain an optional seed workflow.

## 8. First Implementation PR Recommendation

The smallest, safest first PR should be: **“Make shared deployment defaults explicit and restore test reliability.”**

Scope:

1. Fix or gate `src/test/workbookParser.test.ts` so `npm test` passes on a clean clone without private workbook files.
2. Align `docker-compose.yml`, `.env.example`, and docs with the startup guard:
   - local Docker mode binds safely to localhost without auth, or
   - pilot mode requires `AUTH_ENABLED=true`, strong `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
3. Add pure startup safety tests for placeholder JWT and default admin credentials in non-local deployments.
4. Update `docs/security-model.md` to reflect current CORS defaults, upload limits, and migration framework.

Why this PR first:

- It creates immediate safety value.
- It does not change core domain behavior.
- It keeps the local-first workflow intact.
- It makes future cleanup easier because the test suite becomes reliable.

Acceptance criteria for the PR:

- `npm test` passes on a clean clone.
- `npm run build` passes.
- Non-local unauthenticated startup remains blocked.
- Non-local auth-enabled startup with placeholder/default credentials is blocked.
- Security docs match the actual code.
