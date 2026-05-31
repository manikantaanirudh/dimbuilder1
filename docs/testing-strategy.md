# Testing Strategy

The project uses Vitest for unit, integration, and rendered markup tests. Browser-level visual checks have also been used with Playwright during UI work.

## Test Command

```powershell
npm.cmd test
```

## Watch Mode

```powershell
npm.cmd run test:watch
```

## Coverage

```powershell
npm.cmd run test:coverage
```

Coverage is provided by `@vitest/coverage-v8` and configured in `vitest.config.ts`:

- Provider: V8
- Included: `src/shared/**/*.ts`, `src/server/**/*.ts`
- Excluded: `src/server/index.ts`
- Thresholds: 60% lines, 50% branches

## Test Environment Setup

Tests run under the Vitest `node` environment. Rendered markup tests use `renderToStaticMarkup`, where browser globals (`localStorage`, `matchMedia`, `window`) are absent. `vitest.config.ts` registers `setupFiles: ["src/test/setup.ts"]`, which installs minimal in-memory shims for those globals so components that read them during render (for example the theme hook) do not throw.

## Build Verification

```powershell
npm.cmd run build
```

## Documentation Verification

```powershell
npm.cmd run docs:check
```

## Test Areas

### Configuration

- `src/test/appConfig.test.ts`
- `src/test/blueprintStudio.test.ts`

Covers config merging, YAML loading, blueprint validation, Blueprint Studio draft normalization/YAML generation/derivation helpers, severities, regex validation, and environment-sensitive loader behavior.
Also covers auth config validation and client config exclusion of server-only fields.

### Schema And Parsing

- `src/test/dimensionSchemas.test.ts`
- `src/test/oneStreamPropertyDictionary.test.ts`
- `src/test/workbookParser.test.ts`
- `src/test/xmlImport.test.ts`

Covers dimension schema behavior, OneStream property dictionary lookup and aliases, XLSX parsing, and OneStream XML parsing with unknown field preservation.

### Validation And Hierarchy

- `src/test/validationEngine.test.ts`
- `src/test/oneStreamValidation.test.ts`
- `src/test/hierarchy.test.ts`
- `src/test/hierarchyAnalytics.test.ts`
- `src/test/metadataDiff.test.ts`
- `src/test/bulkUpdate.test.ts`

Covers validation issues, dictionary enum/type/unknown-property findings, duplicates, hierarchy cycles, and orphan detection.
Hierarchy analytics coverage includes root-to-leaf paths, dynamic levelized columns, shared-member reports, orphan reports, cycle-safe traversal, parent-child rows, and deterministic CSV headers.
OneStream profile coverage includes member naming rules, aliases, sort order, shared-member policy, parent input warnings, Account Type, Entity Currency, relationship weight, Entity ownership range, and duplicate varying-context findings.
It also covers varying property duplicates, missing targets, unknown properties, non-varying override warnings, and invalid varying values.
XML-import validation coverage includes informational notes for preserved unknown XML attributes and unsupported elements.
Metadata diff coverage includes member add/update/delete detection, relationship add/delete/move/copy classification, property updates, preserved XML property comparison, and high-risk warning severity.
Bulk update coverage includes preview-only set, clear, replace, copy-from-property, relationship updates, skipped rows, and dictionary-backed type warnings.

### Exports

- `src/test/xmlExport.test.ts`
- `src/test/xlsxExport.test.ts`
- `src/test/releasePackage.test.ts`
- `src/test/exportGuards.test.ts`

Covers XML and XLSX export behavior.
XML coverage includes dictionary-based property mapping, deterministic varying-property context output, and round-trip preservation of XML-import unknown attributes/properties/elements.
Release package coverage includes change set summaries, release notes, manifests, package modes, diff CSV, and validation-report rendering.
Export guard coverage verifies server-side blocking for XML, JSON, CSV, XLSX, and snapshot exports, warning-only pass-through, default bypass rejection, enabled bypass reason enforcement, and optional validation-before-export enforcement.

### Server And Persistence

- `src/test/database.test.ts`
- `src/test/repositoryEditing.test.ts`
- `src/test/api.test.ts`
- `src/test/projectRoutes.test.ts`
- `src/test/projectBlueprints.test.ts`
- `src/test/basicAuth.test.ts`
- `src/test/cors.test.ts`
- `src/test/gracefulShutdown.test.ts`
- `src/test/logger.test.ts`
- `src/test/rateLimiter.test.ts`
- `src/test/validateMiddleware.test.ts`

Covers repositories, route behavior, project creation, API workflows, and the OneStream schema dictionary endpoint.
Production-readiness coverage includes Basic Auth middleware (enabled/disabled, valid/invalid credentials), CORS origin restriction, graceful shutdown signal handling, structured Pino logging, rate limiter enforcement, and Zod request body validation middleware.
Repository and route coverage includes varying-property CRUD, duplicate-context upsert behavior, `POST /api/import/xml`, and project baseline/diff run persistence.
It also covers change set persistence, lifecycle routes, validation-gated approval, and directory-based release package file creation.
Bulk update route coverage verifies preview/apply/list/detail behavior. Repository coverage verifies job/item persistence and transaction rollback when an apply workflow fails partway through.
Hierarchy analytics route coverage verifies analytics JSON plus levelized, paths, and parent-child CSV endpoints.
Snapshot coverage verifies repository list/read, transactional restore with safety snapshot creation, branch creation with remapped IDs, and project route list/read/restore/branch behavior.
Blueprint Studio route coverage verifies effective blueprint listing, draft validation, YAML fragment generation, and derivation from an existing persisted dimension.

### Client UI Logic

- `src/test/clientUiViewModel.test.ts`
- `src/test/clientComponentsMarkup.test.ts`
- `src/test/dimensionDisplay.test.ts`

Covers testable UI derivation, rendered copy, and dimension display formatting.
Rendered markup coverage includes the Varying and Compare workspace tabs plus the compact varying-property editor surface.
It also covers the Change Sets workspace tab and compact change set lifecycle surface.
It covers the Bulk Update workspace tab and compact preview/apply wizard surface.
It covers the Hierarchy analytics panel and CSV export controls.
It covers the dashboard Snapshot Manager restore and branch affordances.
It covers the dashboard Blueprint Studio authoring aid, validation/YAML actions, and no automatic config-write copy.
Import modal coverage checks that XLSX seeding remains available and XML import is presented as editable OneStream metadata import.

### Design System

- `src/test/notionDesignSystem.test.ts`

Covers browser-facing identity and design-system expectations.

## Browser Verification

Use Playwright when changing layout, modals, responsive behavior, or key workflows.

Recommended checks:

- desktop app shell
- mobile app shell
- New Project modal
- Import metadata modal for Seed from XLSX and Import XML
- members grid
- relationships grid
- XML preview tab

When browser automation is blocked by sandboxing, request permission to launch the browser rather than replacing the check with guesswork.
