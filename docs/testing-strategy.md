# Testing Strategy

The project uses Vitest for unit, integration, and rendered markup tests. Browser-level visual checks have also been used with Playwright during UI work.

## Test Command

```powershell
npm.cmd test
```

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

Covers config merging, YAML loading, blueprint validation, severities, regex validation, and environment-sensitive loader behavior.

### Schema And Parsing

- `src/test/dimensionSchemas.test.ts`
- `src/test/oneStreamPropertyDictionary.test.ts`
- `src/test/workbookParser.test.ts`

Covers dimension schema behavior, OneStream property dictionary lookup and aliases, and XLSX parsing.

### Validation And Hierarchy

- `src/test/validationEngine.test.ts`
- `src/test/hierarchy.test.ts`

Covers validation issues, dictionary enum/type/unknown-property findings, duplicates, hierarchy cycles, and orphan detection.

### Exports

- `src/test/xmlExport.test.ts`
- `src/test/xlsxExport.test.ts`

Covers XML and XLSX export behavior.

### Server And Persistence

- `src/test/database.test.ts`
- `src/test/repositoryEditing.test.ts`
- `src/test/api.test.ts`
- `src/test/projectRoutes.test.ts`
- `src/test/projectBlueprints.test.ts`

Covers repositories, route behavior, project creation, API workflows, and the OneStream schema dictionary endpoint.

### Client UI Logic

- `src/test/clientUiViewModel.test.ts`
- `src/test/clientComponentsMarkup.test.ts`
- `src/test/dimensionDisplay.test.ts`

Covers testable UI derivation, rendered copy, and dimension display formatting.

### Design System

- `src/test/notionDesignSystem.test.ts`

Covers browser-facing identity and design-system expectations.

## Browser Verification

Use Playwright when changing layout, modals, responsive behavior, or key workflows.

Recommended checks:

- desktop app shell
- mobile app shell
- New Project modal
- Seed from XLSX modal
- members grid
- relationships grid
- XML preview tab

When browser automation is blocked by sandboxing, request permission to launch the browser rather than replacing the check with guesswork.
