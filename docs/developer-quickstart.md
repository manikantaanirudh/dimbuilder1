# Developer Quickstart

## Requirements

- Node.js compatible with the project dependencies.
- npm.
- Windows PowerShell commands are used in this repo's current workflow.

## Install

```powershell
npm.cmd install
```

## Run In Development

```powershell
npm.cmd run dev
```

The server defaults to `127.0.0.1:8787` and Vite defaults to `127.0.0.1:5173`, both configured in `config/dimbuilder.yaml`.

## Test

```powershell
npm.cmd test
```

Run focused tests by passing paths:

```powershell
npm.cmd test -- src/test/appConfig.test.ts
```

## Build

```powershell
npm.cmd run build
```

The build command runs TypeScript and then Vite.

## Documentation Check

```powershell
npm.cmd run docs:check
```

Run this after source changes. If a source change affects behavior, APIs, configuration, persistence, exports, validation, or the UI workflow, update the relevant docs in `docs/` and the docs-maintainer skill if the maintenance rule itself changes.

## Runtime Configuration

Default configuration file:

```text
config/dimbuilder.yaml
```

Supported environment overrides:

- `DIMBUILDER_CONFIG_FILE`: alternate YAML configuration file.
- `METADATA_DIRECTORY`: overrides `paths.metadataDirectory`.
- `DATABASE_FILE`: overrides `paths.databaseFile`.
- `PORT`: overrides `server.port`.

## Useful Paths

- `src/client`: React app.
- `src/server`: Express API and database access.
- `src/shared`: shared domain logic.
- `src/test`: Vitest tests.
- `config/dimbuilder.yaml`: central app and dimension configuration.
- `metadata`: optional metadata XML reference files.
- `data/uploads`: uploaded workbook storage.
- `data/exports`: generated export files.

