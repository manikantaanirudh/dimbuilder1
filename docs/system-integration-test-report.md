# System Integration Test Report

Execution date: 2026-05-19

Product under test: SR Onestream Dim Builder

Environment:

- Client URL: `http://127.0.0.1:5173`
- API URL: `http://127.0.0.1:8787/api`
- Browser validation path: Playwright with Microsoft Edge, because the Browser plugin was not available in this session.
- Database: running local development database from the active dev server.
- Test data created:
  - `SIT API Project 20260519051255`
  - `SIT Browser Project 20260519051414`

## Summary

| Area | Total | Pass | Fail |
|---|---:|---:|---:|
| API and persistence SIT | 23 | 23 | 0 |
| Rendered UI SIT | 8 | 8 | 0 |
| Verification commands | 5 | 5 | 0 |
| Overall | 36 | 36 | 0 |

Product SIT result: PASS

No product failures were found in this SIT pass.

## Scope

This SIT pass covered:

- server health
- runtime configuration
- project listing
- blank project creation from YAML blueprints
- seeded dimensions and root members
- dimension metadata editing
- member create/update/delete behavior
- relationship create behavior with default relationship values
- validation run and issue persistence
- XML export
- JSON backup export
- members CSV export
- relationships CSV export
- XLSX export
- snapshot creation
- 404 handling
- malformed JSON handling
- desktop UI load and command visibility
- UI project creation flow
- dimension navigation
- export modal
- mobile New Project modal layout
- desktop and mobile console health

Not covered in this pass:

- Real XLSX upload through the browser file picker.
- Authentication or authorization, because the current product is local-first and does not implement those flows.
- Multi-user concurrency.
- Production deployment smoke testing.
- Snapshot restore, because restore is not currently implemented.

## API And Persistence SIT

| ID | Test case | Expected result | Actual result | Status |
|---|---|---|---|---|
| SIT-API-001 | Health endpoint returns ok | `GET /api/health` returns success JSON. | Returned `{"ok":true}`. | PASS |
| SIT-API-002 | Config exposes SR identity and blueprints | `GET /api/config` returns SR identity and Account blueprint config. | Product name was `SR Onestream Dim Builder`; Account blueprint was present. | PASS |
| SIT-API-003 | Projects list endpoint responds | `GET /api/projects` returns an array. | Returned an array; count before the run was 8. | PASS |
| SIT-API-004 | Create blank blueprint project | `POST /api/projects` creates a project with empty `sourceFileName`. | Created project `Et9xNFQZIdWH2UBMkIlWH` with empty source file name. | PASS |
| SIT-API-005 | Project summary returns seeded counts | Summary shows configured dimensions and seeded root members. | Summary returned 12 dimensions, 12 members, 0 relationships. | PASS |
| SIT-API-006 | Dimensions seeded from configured display order | Dimensions follow configured display order. | Returned `Scenario, Entity, Account, Flow, UD1, UD2, UD3, UD4, UD5, UD6, UD7, UD8`. | PASS |
| SIT-API-007 | Account root member exists | Account dimension includes `Root`. | Account members contained `Root`; total was 1. | PASS |
| SIT-API-008 | Patch dimension metadata | Dimension patch endpoint returns ok. | Returned `{"ok":true}`. | PASS |
| SIT-API-009 | Dimension metadata persisted | Patched description and access group are returned by dimension list. | Description was `SIT account dimension`; access group was `SIT_Read`. | PASS |
| SIT-API-010 | Create Account member | Member create returns a persisted Account member. | Created `Revenue_SIT_20260519051255`. | PASS |
| SIT-API-011 | Patch Account member | Member patch endpoint returns ok. | Returned `{"ok":true}`. | PASS |
| SIT-API-012 | Create Account relationship with defaults | Relationship create applies Account aggregation default. | Created `Root -> Revenue_SIT_20260519051255` with aggregation weight `1`. | PASS |
| SIT-API-013 | Run project validation | Validation endpoint returns an issues array. | Returned `issues=0`. | PASS |
| SIT-API-014 | Persist validation issues | Project issues endpoint returns persisted issues. | Returned `issues=0`. | PASS |
| SIT-API-015 | XML export contains created member and relationship | XML export contains the created member and relationship. | XML included the created member and relationship markup. | PASS |
| SIT-API-016 | JSON backup export returns project data | JSON export includes project and member data. | JSON backup contained project name and created member; 13,532 bytes. | PASS |
| SIT-API-017 | Members CSV export contains created member | Members CSV includes created member. | CSV contained `Revenue_SIT_20260519051255`; 377 bytes. | PASS |
| SIT-API-018 | Relationships CSV export contains parent-child row | Relationships CSV includes created relationship. | CSV contained the created relationship child; 116 bytes. | PASS |
| SIT-API-019 | XLSX export returns workbook bytes | XLSX endpoint streams a workbook. | Returned 19,905 bytes with Office workbook content type. | PASS |
| SIT-API-020 | Create project snapshot | Snapshot endpoint returns a snapshot id. | Returned snapshot id `V4xMJmYxq_oHhM-2h3HKc`. | PASS |
| SIT-API-021 | Delete member soft-removes it from active list | Deleted member no longer appears in active member list. | Deleted temporary member was absent from active rows; active count was 2. | PASS |
| SIT-API-022 | Unknown project summary returns 404 | Missing project returns a client error. | Returned status `404`. | PASS |
| SIT-API-023 | Malformed project JSON returns client error | Malformed JSON returns a 4xx response. | Returned status `400`. | PASS |

## Rendered UI SIT

Screenshots:

- Desktop load: `C:/tmp/sit-desktop-20260519051414.png`
- Project created: `C:/tmp/sit-project-20260519051414.png`
- Mobile New Project modal: `C:/tmp/sit-mobile-modal-20260519051414.png`

| ID | Test case | Expected result | Actual result | Status |
|---|---|---|---|---|
| SIT-UI-001 | Desktop page identity and brand render | Page title and brand show SR Onestream Dim Builder. | Title and brand both matched. | PASS |
| SIT-UI-002 | Desktop first screen exposes lifecycle controls | New Project, Seed from XLSX, Validate, and Export controls are visible. | All lifecycle controls were present. | PASS |
| SIT-UI-003 | No console warnings/errors on initial desktop load | No relevant console warnings or errors. | Console issue list was empty. | PASS |
| SIT-UI-004 | Create project through UI and refresh workbench | UI creates a project and shows seeded dimension navigation. | Created `SIT Browser Project 20260519051414`; nav count was 12; first nav was `Scenario - Scenarios`. | PASS |
| SIT-UI-005 | Dimension navigation opens Account workspace | Clicking Account opens workspace with expected tabs. | Account workspace text included Account, Members, and Relationships. | PASS |
| SIT-UI-006 | Export modal opens with export choices | Export modal shows available export formats. | Modal showed OneStream XML, Workbook XLSX, Members CSV, Relationships CSV, and JSON Backup. | PASS |
| SIT-UI-007 | Mobile New Project modal fields are stacked without overlap | Project name and description fields stack cleanly on mobile. | Bounding boxes confirmed label, input, and textarea are vertically separated inside a 354px modal. | PASS |
| SIT-UI-008 | No console warnings/errors on mobile modal flow | No relevant console warnings or errors. | Console issue list was empty. | PASS |

## Verification Commands

| ID | Command | Expected result | Actual result | Status |
|---|---|---|---|---|
| SIT-CMD-001 | `python ... quick_validate.py .codex\skills\docs-maintainer` | Skill structure is valid. | `Skill is valid!` | PASS |
| SIT-CMD-002 | `npm.cmd run docs:check` | Documentation pack and maintenance mechanism pass checks. | Documentation check passed for 23 required docs. | PASS |
| SIT-CMD-003 | `npm.cmd test -- src/test/notionDesignSystem.test.ts` | Focused design-system test passes after stale expectation update. | 6 tests passed. | PASS |
| SIT-CMD-004 | `npm.cmd test` | Full Vitest suite passes. | 16 files passed; 129 tests passed. | PASS |
| SIT-CMD-005 | `npm.cmd run build` | TypeScript and Vite production build pass. | Build completed successfully. | PASS |

## Failure Register

No product failures were found.

Two execution notes were observed and resolved during the SIT process:

- The first API runner used the wrong validation route path, `/projects/:id/validation/run`. The actual product route is `/validation/:projectId/run`. The test harness was corrected and the product validation route passed.
- The first Playwright attempt was blocked by Windows sandbox permissions when launching Microsoft Edge. The same browser SIT was rerun with approved elevated permission and passed.

## Failure Remediation Plan

No remediation plan is required for this SIT pass because there are no product failures.

Recommended follow-up hardening items:

1. Add a dedicated automated SIT script so the API and UI checks can be rerun without pasting ad hoc Node commands.
2. Add a project cleanup or archive endpoint for test data management, or run SIT against an isolated database and Vite proxy.
3. Add a browser-based XLSX upload test using a known small fixture workbook.
4. Add server-side export blocking for projects with blocking validation issues.
5. Add production deployment smoke testing once deployment topology is decided.

## Evidence Commands

API SIT was executed against:

```powershell
http://127.0.0.1:8787/api
```

Rendered UI SIT was executed against:

```powershell
http://127.0.0.1:5173
```

Final verification commands:

```powershell
npm.cmd run docs:check
npm.cmd test
npm.cmd run build
```

