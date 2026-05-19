# Import Seeding Guide

XLSX import is an optional seed workflow. It no longer defines the application narrative. Blank projects can be created directly from central blueprints, and XLSX is used when a workbook is available as a starting point.

## Entry Point

Client:

- `src/client/components/ImportExportModals.tsx`
- `src/client/api/client.ts`

Server:

- `POST /api/import/workbook`
- `src/server/routes/import.ts`

Parser:

- `src/shared/workbookParser.ts`

## Supported Workbook Detection

The parser maps worksheets to dimension schemas by:

1. Sheet name through `getSchemaBySheetName()`.
2. Configured `dimensions.sheetAliases`.
3. Cell `B1` dimension type through `getSchemaByDimensionTypeText()`.

Unsupported sheets are skipped with warnings.

## Sheet Layout Assumptions

For each supported sheet:

- `B1` contains dimension type text.
- `B2` contains dimension name.
- `B3` contains description.
- `B4` contains access group.
- `B5` contains maintenance group.
- `B6` contains inherited dimension.
- Member headers appear within the first 30 rows.
- Relationship headers are detected by `Parent` and `Child` in columns A and B.

## Parser Behavior

The parser:

- ignores unsupported sheets
- skips disabled dimension types
- can merge duplicate dimension sheets
- can ignore generated XML columns
- can preserve original column names when configured
- can ignore formula error values
- skips blank/default-only rows
- records warnings and errors in `importSummary`
- applies canonical dimension sort order from config

## Metadata Reference Alignment

When enabled, import can align workbook dimensions with metadata XML reference data.

Source:

- `src/server/metadataReference.ts`
- configured `paths.metadataDirectory`
- configured `paths.defaultMetadataFile`

Alignment logic can:

- prefer exact dimension-name matches
- use configured preferred metadata names
- fall back to the largest populated application metadata dimension
- add metadata-only dimensions when a workbook sheet is missing

## Persistence Flow

1. Upload file to `paths.uploadsDirectory`.
2. Parse metadata reference XML if enabled and found.
3. Parse workbook into a `ParsedProject`.
4. Create a persisted project record.
5. Insert dimensions, members, and relationships.
6. Run validation.
7. Replace project issues.
8. Record `project.import` audit entry.
9. Return project and import summary.

## Tests

Primary coverage:

- `src/test/workbookParser.test.ts`
- `src/test/api.test.ts`
- `src/test/projectRoutes.test.ts`

