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

### `import`

Controls XLSX parser behavior and metadata reference alignment.

### `validation`

Controls severities and which severities block export.

### `export`

Controls XML, XLSX, CSV, and JSON export availability and options.

### `ui`

Controls default workspace tab, grid page size, toolbar visibility, and XML preview defaults.

## Validation Rules

`validateAppConfig()` rejects:

- unknown dimension types in enabled types, display order, sheet aliases, preferred metadata names, or blueprints
- missing or invalid blueprint objects
- unsupported blueprint member key fields
- invalid blueprint member or relationship fields
- invalid relationship default types
- invalid severities
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

