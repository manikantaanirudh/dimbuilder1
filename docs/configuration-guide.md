# Configuration Guide

The central configuration file is `config/dimbuilder.yaml`. It is merged with `defaultAppConfig` from `src/shared/appConfigDefaults.ts`, validated by `src/shared/appConfigValidation.ts`, and loaded at server startup by `src/server/config/loadAppConfig.ts`.

## Load Order

1. Start with `defaultAppConfig`.
2. Read YAML from `DIMBUILDER_CONFIG_FILE` or `config/dimbuilder.yaml`.
3. Deep-merge YAML over defaults.
4. Apply supported environment overrides.
5. Validate the final `AppConfig`.

## Main Sections

### `application`

Controls product identity and user-facing app text.

Important fields:

- `productName`
- `applicationName`
- `title`
- `description`
- `environmentName`
- `oneStreamVersionFallback`
- `supportText`

### `paths`

Controls local storage locations.

- `metadataDirectory`: XML reference directory.
- `defaultMetadataFile`: preferred XML reference file.
- `uploadsDirectory`: uploaded workbook directory.
- `exportsDirectory`: generated exports directory.
- `databaseFile`: SQLite database path.

### `server`

Controls host and ports.

- `host`
- `port`
- `clientDevPort`

### `features`

Enables or disables app capabilities:

- metadata reference alignment
- metadata-only dimensions
- XML preview
- XLSX export
- CSV export
- JSON backup
- audit log
- snapshots

### `dimensions`

Defines supported dimension types, display order, display labels, metadata-only behavior, sheet aliases, preferred metadata names, and blueprints.

The supported dimension types are defined in `src/shared/types.ts` and `src/shared/dimensionSchemas.ts`:

- `Scenario`
- `Entity`
- `Account`
- `Flow`
- `UD1` through `UD8`

Blueprint drafts can be authored with Blueprint Studio from the dashboard. The Studio validates drafts through `src/shared/blueprintStudio.ts` and returns YAML fragments, but it does not automatically mutate `config/dimbuilder.yaml`.

### `import`

Controls XLSX parser behavior and metadata reference alignment.

### `validation`

Controls generic validation severities, the OneStream-specific design-quality profile, and which severities block export.

OneStream profile defaults:

```yaml
validation:
  oneStreamProfile:
    enabled: true
    memberNameMaxLength: 250
    warnOnMemberNameSpaces: true
    warnOnMemberNamePeriods: true
    reservedWords:
      - Root
      - None
    restrictedCharacters:
      - "<"
      - ">"
      - "\""
      - "'"
      - "&"
      - "|"
      - "["
      - "]"
    duplicateAliasSeverity: warning
    invalidSortOrderSeverity: warning
    sharedMemberSeverity: info
    parentInputWarningSeverity: warning
    unknownPropertySeverity: warning
    invalidEnumSeverity: error
    invalidPropertyTypeSeverity: error
```

The profile adds OneStream-aware warnings for naming conventions, aliases, Root/None casing, sort order, shared members, parent input, missing Account Type, missing Entity Currency, missing relationship weights, and invalid Entity ownership percentages.

### `export`

Controls XML, XLSX, CSV, and JSON export availability and options.

Validation gate fields:

- `allowValidationBypass`: optional boolean, default `false`; allows explicit server-side export bypass when blocking validation issues exist.
- `validationBypassRequiresReason`: optional boolean, default `true`; requires a bypass reason when bypass is enabled.
- `requireValidationBeforeExport`: optional boolean, default `false`; when true, exports are blocked until validation has run at least once.

### `ui`

Controls default workspace tab, grid page size, toolbar visibility, and XML preview defaults.

## Validation Rules

`validateAppConfig()` rejects:

- unknown dimension types in enabled types, display order, sheet aliases, preferred metadata names, or blueprints
- missing or invalid blueprint objects
- unsupported blueprint member key fields
- invalid blueprint member or relationship fields
- invalid relationship default types
- invalid Blueprint Studio drafts, because they are normalized and checked with the same blueprint validation rules before YAML is generated
- invalid severities
- invalid `validation.oneStreamProfile` booleans, positive integer limits, string arrays, or severities
- non-boolean export validation gate fields
- invalid TCP ports
- non-positive grid page size
- invalid metadata-only exclude regex patterns

## Environment Overrides

The loader currently supports these environment overrides:

```text
DIMBUILDER_CONFIG_FILE
METADATA_DIRECTORY
DATABASE_FILE
PORT
```

Environment overrides should remain small and operational. Functional behavior should stay in YAML so it can be reviewed and documented.
