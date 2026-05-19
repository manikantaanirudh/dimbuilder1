# Import And Seeding Guide

XLSX import is an optional seed workflow. It no longer defines the application narrative. Blank projects can be created directly from central blueprints, XLSX can seed a project from a workbook, and XML import can create an editable project from OneStream metadata XML.

## Entry Point

Client:

- `src/client/components/ImportExportModals.tsx`
- `src/client/api/client.ts`

Server:

- `POST /api/import/workbook`
- `POST /api/import/xml`
- `src/server/routes/import.ts`

Parser:

- `src/shared/workbookParser.ts`
- `src/shared/xmlImport.ts`

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

### XLSX Seeding

1. Upload file to `paths.uploadsDirectory`.
2. Parse metadata reference XML if enabled and found.
3. Parse workbook into a `ParsedProject`.
4. Create a persisted project record.
5. Insert dimensions, members, and relationships.
6. Run validation.
7. Replace project issues.
8. Record `project.import` audit entry.
9. Return project and import summary.

### XML Import

1. Upload the XML file to `paths.uploadsDirectory`.
2. Parse OneStream metadata XML in `src/shared/xmlImport.ts`.
3. Create a project record using the optional `projectName` or uploaded file name.
4. Insert parsed dimensions, members, and relationships inside a repository transaction.
5. Store unknown XML attributes and elements in existing `metadata_json` or `properties_json` under `__unknownXml`.
6. Run validation and replace project issues.
7. Record `project.importXml` audit entry.
8. Return project and an import summary with unknown field counts.

## XML Import Behavior

The XML parser supports the app's current OneStream XML export shape:

- project metadata through the uploaded file and root OneStream version
- dimensions and dimension attributes
- dimension property elements
- members and member attributes
- member property elements
- relationships and relationship attributes
- relationship property elements

Known properties are normalized through the shared OneStream property dictionary where possible. Unknown attributes, unknown property elements, and unsupported child elements are preserved so users can round-trip files through the app without silently dropping metadata.

Unknown XML fields produce validation notes such as `XML_UNKNOWN_MEMBER_ATTRIBUTE` and `XML_UNSUPPORTED_ELEMENT_PRESERVED`; these are informational and do not block export by default.

## Tests

Primary coverage:

- `src/test/workbookParser.test.ts`
- `src/test/xmlImport.test.ts`
- `src/test/api.test.ts`
- `src/test/projectRoutes.test.ts`
