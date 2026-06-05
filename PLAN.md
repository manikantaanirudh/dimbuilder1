# Simple Parent-Child CSV Metadata Import — Revised Spec + Plan

## Summary
Add a first-class **Simple CSV Metadata Import** flow for parent-child/member files. It supports **new project import** and **existing project append/update**. Existing-project mode creates missing dimensions, members, and relationships, updates provided member fields/properties, and never deletes or replaces existing metadata.

This is separate from Migration Cockpit: it is for straightforward metadata CSVs, not legacy-system migration mapping.

## Key Changes
- Add a shared parser/preview engine around existing `parseCsvDocument`:
  - Required input: `member`; `parent` is optional.
  - Optional columns: `dimensionType`, `dimensionName`, `description`, `alias`, `sortOrder`.
  - Optional properties: columns named `property.<Property Name>`.
  - API/UI defaults provide `dimensionType` and `dimensionName` when the CSV omits them.
- Add import API endpoints in the existing import router:
  - `POST /api/import/csv/preview`
  - `POST /api/import/csv/commit`
  - Multipart fields: `file`, optional `projectId`, `projectName`, `dimensionType`, `dimensionName`.
- Add client/UI support in the import modal:
  - Third mode: **Import CSV**.
  - Target selector: **New project** or **Existing project**.
  - Preview-before-commit summary with counts, updates, warnings, and blocking errors.
  - Commit disabled until preview succeeds with no errors.

## Import Behavior
- New project mode:
  - Creates a project named from `projectName` or the CSV filename.
  - Creates dimensions found in CSV or from provided defaults.
  - Inserts parsed members and relationships transactionally.
- Existing project mode:
  - Finds matching dimensions by `dimensionType + dimensionName`; creates missing dimensions.
  - Finds matching members by `dimensionId + memberKey`; updates description/provided properties only.
  - Finds matching relationships by `dimensionId + parentKey + childKey`; skips existing relationships.
  - Creates missing members and relationships.
  - Records audit action `project.importCsvAppend`.
- Commit always runs shared project validation through `runProjectValidation` and stores issues.
- Upload size must respect `operations.uploadMaxMb`, not a hard-coded CSV limit.

## Error Handling
- Preview errors block commit:
  - empty CSV or missing header
  - missing `member`
  - unsupported `dimensionType`
  - missing dimension type/name after CSV + form defaults
  - self-reference where `parent === member`
- Preview warnings do not block commit:
  - duplicate member rows collapsed
  - duplicate relationship rows collapsed
  - unknown `property.*` columns kept as member properties
  - blank parent row treated as standalone/root-level member
- If commit fails, no partial writes remain because all database changes happen in a repository transaction.

## Tests
- Parser tests:
  - minimal `parent,member` CSV with form dimension defaults
  - multi-dimension CSV with `dimensionType` and `dimensionName`
  - quoted commas and blank lines
  - `property.*`, `alias`, `description`, and `sortOrder`
  - duplicate rows warning
  - blocking errors for missing member, unsupported dimension type, missing dimension metadata, and self-reference
- API tests:
  - preview does not write records
  - new project commit creates dimensions/members/relationships
  - existing project commit appends missing records
  - existing project commit updates only provided member fields/properties
  - commit blocks when preview has errors
  - upload size and extension policy still apply
  - audit and validation issues are recorded
- UI/client tests:
  - CSV mode appears in import modal
  - preview summary renders counts/warnings/errors
  - commit is disabled before valid preview
  - target mode and dimension defaults are sent as `FormData`
- Final checks:
  - `npm.cmd test`
  - `npm.cmd run build`
  - `npm.cmd run docs:check`

## Documentation
- Update `docs/import-seeding-guide.md` to cover XLSX, XML, and Simple CSV import.
- Update `docs/feature-catalog.md` to distinguish Simple CSV import from Migration Cockpit generic CSV migration.
- Include this example:

```csv
dimensionType,dimensionName,parent,member,description,alias,sortOrder,property.Text1
Account,Accounts,Root,Revenue,Revenue accounts,Revenue,10,P&L
Account,Accounts,Revenue,ProductRevenue,Product revenue,Product Revenue,20,P&L
```

## Assumptions
- Existing-project mode is append/update only; no replace, delete, or relationship cleanup in v1.
- `parent` may be blank; `member` may not.
- CSV import creates normal editable app records, not preserved raw CSV artifacts.
- Unknown `property.*` columns are intentionally retained as generic member properties and later surfaced by existing validation as warnings if applicable.
