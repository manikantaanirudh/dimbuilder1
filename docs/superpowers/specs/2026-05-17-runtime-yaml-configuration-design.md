# Runtime YAML Configuration Design

## Purpose

Add a runtime YAML configuration system for OneStream XF Dimension Builder so deployment-specific and application-specific behavior can be controlled without editing source code.

The config must let an admin or implementation lead control product identity, application labels, runtime paths, metadata reference behavior, enabled dimensions, dimension order, validation severities, export defaults, toolbar visibility, dashboard cards, grid behavior, and feature flags. The first implementation will be file-based and loaded from `config/dimbuilder.yaml`.

## Goals

- Provide one clear configuration file for common application controls.
- Keep safe defaults in code so the app can run if the YAML file is missing or partial.
- Validate config at startup and return actionable errors for invalid values.
- Expose only client-safe config values through an API endpoint.
- Move current hardcoded labels and behavior behind config helpers.
- Keep dimension schemas configurable enough for OneStream variations without making every field definition dependent on YAML from day one.

## Non-Goals

- No admin UI for editing config in this phase.
- No database-backed config in this phase.
- No hot-reload requirement in the browser; config changes take effect after server restart.
- No full rewrite of dimension schema definitions into YAML in the first implementation.
- No secrets in YAML. Credentials and sensitive values must remain environment-driven or outside this feature.

## Configuration File

Default location:

```text
config/dimbuilder.yaml
```

Optional environment override:

```text
DIMBUILDER_CONFIG_FILE=C:\path\to\dimbuilder.yaml
```

The app loads config in this precedence order:

1. Built-in defaults.
2. `config/dimbuilder.yaml` or `DIMBUILDER_CONFIG_FILE`.
3. Environment variables for deployment-level overrides such as `PORT`, `DATABASE_FILE`, and `METADATA_DIRECTORY`.

## YAML Shape

The initial YAML file should use this structure:

```yaml
application:
  productName: OneStream XF Dimension Builder
  applicationName: Dev
  title: Dev Metadata Dimension Builder
  description: Manage Dev OneStream XF dimension metadata.
  environmentName: Local
  oneStreamVersionFallback: 9.2.0.18004
  supportText: Local metadata workspace

paths:
  metadataDirectory: metadata
  defaultMetadataFile: Dev_Metadata_20260516_202239Z.xml
  uploadsDirectory: data/uploads
  exportsDirectory: data/exports
  databaseFile: data/app.db

server:
  host: 127.0.0.1
  port: 8787
  clientDevPort: 5173

features:
  enableMetadataReferenceAlignment: true
  includeMetadataOnlyDimensions: true
  enableXmlPreview: true
  enableXlsxExport: true
  enableCsvExport: true
  enableJsonBackup: true
  enableAuditLog: true
  enableSnapshots: true

dashboard:
  cards:
    totalDimensions: true
    totalMembers: true
    totalRelationships: true
    validationErrors: true
    validationWarnings: true
    recentDimensions: true
    importStatus: true
    exportStatus: true

dimensions:
  expectedDimensionCount: 18
  enabledTypes:
    - Scenario
    - Entity
    - Account
    - Flow
    - UD1
    - UD2
    - UD3
    - UD4
    - UD5
    - UD6
    - UD7
    - UD8
  displayOrder:
    - Scenario
    - Entity
    - Account
    - Flow
    - UD1
    - UD2
    - UD3
    - UD4
    - UD5
    - UD6
    - UD7
    - UD8
  display:
    labelFormat: "{type} - {name}"
    showInheritedDimensionSubtitle: true
    showMetadataOnlyBadge: true
  metadataOnly:
    includeWhenWorkbookSheetMissing: true
    excludeNamePatterns:
      - "^FVA_"
      - "^Root"
  sheetAliases:
    UD3:
      - UD3
      - UD3 OUC
      - UD3 OUC (2)
  preferredMetadataNames:
    Scenario: Scenarios
    Account: GLAccounts
    UD4: ChannelPartner
    UD5: CustomerType
    UD8: Reporting

import:
  workbook:
    mergeDuplicateDimensionSheets: true
    ignoreGeneratedXmlColumns: true
    ignoreFormulaErrors: true
    preserveOriginalColumnNames: true
    skippedDefaultRowSeverity: warning
  metadataReference:
    enabled: true
    preferExactDimensionNameMatch: true
    fallbackToLargestPopulatedDimension: true
    includeMetadataOnlyDimensions: true

validation:
  duplicateMemberSeverity: warning
  duplicateRelationshipSeverity: warning
  unknownRelationshipMemberSeverity: warning
  missingRequiredFieldSeverity: error
  circularHierarchySeverity: error
  relationshipsWithNoLocalMembersSeverity: warning
  exportBlockedBySeverities:
    - error

export:
  xml:
    enabled: true
    prettyPrint: true
    skipBlankMemberRows: true
    skipFormulaErrors: true
    includeDimensionSourceAttributes: true
  xlsx:
    enabled: true
    creator: OneStream XF Dimension Builder
  csv:
    enabled: true
  json:
    enabled: true

ui:
  defaultWorkspaceTab: Overview
  gridPageSize: 600
  toolbar:
    showImport: true
    showValidate: true
    showExport: true
    showSave: true
    showUndoRedo: true
  xmlPreview:
    defaultScope: currentDimension
    allowAllDimensions: true
```

## Config Ownership

### Shared Types and Defaults

Create shared config modules:

- `src/shared/appConfigTypes.ts`
- `src/shared/appConfigDefaults.ts`
- `src/shared/appConfigValidation.ts`

These modules define the normalized `AppConfig` type, default values, and validation rules. They must be importable from server and client-safe shared code.

### Server Loader

Create:

- `src/server/config/loadAppConfig.ts`

Responsibilities:

- Resolve config file path.
- Load YAML.
- Deep-merge YAML onto defaults.
- Apply environment overrides.
- Validate the normalized result.
- Split full server config from client-safe config.

### Config API

Create:

- `src/server/routes/config.ts`

Endpoint:

```text
GET /api/config
```

The endpoint returns only client-safe settings:

- `application`
- `features`
- `dashboard`
- `dimensions.display`
- `ui`
- enabled export/UI flags

It must not return server-only paths such as `databaseFile` unless explicitly marked safe.

### Client Hook

Create:

- `src/client/config/useAppConfig.ts`

The hook loads `/api/config`, exposes default config while loading, and lets UI components use config values without duplicating fallback logic.

## Behavior By Area

### Application Identity

Config values replace hardcoded strings in:

- Browser document title.
- Sidebar brand text.
- Toolbar title.
- Dashboard title and description.
- Import/export modal copy where appropriate.
- XLSX workbook creator string.
- Server startup log.

### Runtime Paths

Config values control:

- Metadata XML directory.
- Default metadata XML file.
- Upload directory.
- Export directory.
- SQLite database file.

Environment variables can override path values for deployment without editing YAML.

### Dimension Control

Config values control:

- Which dimension types are enabled.
- Dimension type ordering in navigation and exports.
- Expected dimension count for dashboard/validation visibility.
- Sheet aliases such as `UD3 OUC (2)`.
- Metadata-only dimension behavior for missing workbook dimension types such as UD1.
- Exclusion of technical dimensions such as names starting with `FVA_` or `Root`.
- Preferred metadata names when workbook sample names differ from the real application names.

The existing TypeScript field schema remains the source of truth for member and relationship columns in the first implementation. Later phases can allow YAML field overrides after the loader is stable.

### Import Behavior

Config values control:

- Whether metadata XML alignment runs.
- Whether duplicate workbook sheets are merged.
- Whether generated XML/formula columns are ignored.
- Whether formula errors such as `#NAME?` are skipped.
- Whether metadata-only dimensions are added when the workbook does not have a matching sheet.
- Whether fallback matching chooses the largest populated metadata dimension.

### Validation Behavior

Config values control default severities for validation rules. The validation engine uses the configured severities unless a caller explicitly overrides them.

Exports are blocked only by severities listed in `validation.exportBlockedBySeverities`.

### Export Behavior

Config values control:

- XML enablement.
- XML pretty-printing.
- XML version fallback.
- Blank member row skipping.
- Formula error skipping.
- Inclusion of dimension source attributes.
- XLSX creator string.
- CSV and JSON backup availability.

### UI Behavior

Config values control:

- Default workspace tab.
- Grid page size.
- Dashboard card visibility.
- Toolbar button visibility.
- Metadata-only dimension badge visibility.
- XML preview default scope.

## Error Handling

Config loading must fail fast for invalid structural config:

- Invalid YAML syntax.
- Unknown dimension type in `enabledTypes` or `displayOrder`.
- Invalid severity value.
- Non-number where a numeric port/page size is required.
- Invalid regular expression in `excludeNamePatterns`.

For missing optional values, the loader uses defaults and does not fail.

For missing config file, the app uses defaults and logs a warning.

## Testing Strategy

Add unit tests for:

- Loading defaults when no YAML file exists.
- Deep-merging partial YAML onto defaults.
- Rejecting invalid severity values.
- Rejecting unknown dimension types.
- Environment override precedence.
- Client-safe config excludes server-only values.
- Workbook parser respects config-driven metadata-only dimension behavior.
- Dimension ordering follows config display order.
- UI labels consume config values.

Add one browser smoke test after implementation:

- App loads.
- Configured title appears.
- Configured dimension order appears.
- Metadata-only UD1 dimensions can be hidden or shown by config.

## Implementation Phases

### Phase 1: Config Foundation

- Add YAML dependency.
- Add default config, types, validation, and loader.
- Add `/api/config`.
- Add client config hook.
- Wire app title, toolbar title, sidebar brand, dashboard copy, and XLSX creator.

### Phase 2: Runtime Behavior

- Wire metadata directory and default metadata file.
- Wire database/upload/export paths.
- Wire OneStream version fallback.
- Wire enabled dimension types and display order.
- Wire metadata-only dimension include/exclude behavior.

### Phase 3: Validation and Export Controls

- Wire validation severities.
- Wire export format enablement.
- Wire XML export options.
- Disable blocked export buttons based on configured blocking severities.

### Phase 4: Schema Override Preparation

- Add YAML structure for future field overrides.
- Validate the shape but do not let YAML replace all field definitions yet.
- Document supported override points.

## Acceptance Criteria

- `config/dimbuilder.yaml` exists with practical defaults for the current Dev application.
- App runs when the YAML file is missing by using built-in defaults.
- Invalid config fails with a clear message.
- Product name, app name, descriptions, toolbar labels, dashboard text, metadata paths, dimension order, metadata-only dimension inclusion, validation severities, and export enablement can be controlled from YAML.
- `/api/config` returns only client-safe values.
- Existing imports still parse the workbook and metadata XML correctly.
- UD1 metadata-only dimensions can be shown or hidden through config.
- Tests and production build pass.
