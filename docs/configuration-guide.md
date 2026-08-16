# Configuration Guide

The central configuration file is `config/dimbuilder.yaml`. It is merged with `defaultAppConfig` from `src/shared/appConfigDefaults.ts`, validated by `src/shared/appConfigValidation.ts`, and loaded at server startup by `src/server/config/loadAppConfig.ts`.

The committed configuration is a conservative local workbench profile: optional platform modules are disabled by default. Their code remains in the repository, but the server and client mount or display module-specific routes only when the corresponding flag is enabled.

## Load Order

1. Start with `defaultAppConfig`.
2. Read YAML from `DIMBUILDER_CONFIG_FILE` or `config/dimbuilder.yaml`.
3. Deep-merge YAML over defaults.
4. Apply supported environment overrides.
5. Validate the final `AppConfig`.

## Main Sections

### `application`

Controls product identity and user-facing app text. The default product name is "Spaulding Ridge Onestream Dim Builder".

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

Controls host, ports, and CORS.

- `host`
- `port`
- `clientDevPort`
- `corsOrigins`: optional string array of allowed CORS origins. When set, the server restricts `Access-Control-Allow-Origin` to these values. When absent, CORS is open (see `src/server/app.ts:25`).

### `auth`

Controls the authentication strategy applied to API routes.

- `enabled`: boolean, default `false`.
- `strategy`: `none`, `local`, or `oidc`.
- `jwt.secret`, `jwt.accessTokenExpiry`, `jwt.refreshTokenExpiry`: JWT configuration. Prefer the `JWT_SECRET` environment override for the secret.
- `oidc.issuerUrl`, `oidc.clientId`, `oidc.clientSecret`, `oidc.callbackUrl`, `oidc.scopes`: OIDC provider configuration when `strategy` is `oidc`.
- `defaultRole`: role assigned to users after the first user.
- `allowSelfRegistration`: whether users after the first account may register themselves.
- `username` and `password`: legacy Basic Auth credentials used only when `enabled` is true, `strategy` is `none`, and a username is configured.

When authentication is disabled or `strategy` is `none`, API requests receive the synthetic system/admin identity. With `local` or `oidc`, API routes below `/api` require a Bearer access token. The auth section is server-only and excluded from the client config payload (`src/shared/appConfigValidation.ts`, `buildClientAppConfig`). See [security-model.md](security-model.md) for route and role behavior.

### `modules`

Optional platform modules are disabled in the committed local profile:

| Flag | Mounted or displayed capability when enabled |
|---|---|
| `environmentManagement` | Environments, connectors, mappings, sync jobs/runs, and source registries. |
| `chatAssistant` | Legacy assistant compatibility routes and related optional navigation. Core Project Query is not gated by this flag. |
| `platformExtras` | Migration, cross-dimension, templates, VCS, extensibility, risk heatmap, pattern profiler, and config-editor navigation. |
| `offlineSync` or `apiPlatform` | Tier-3 Excel/add-in, scheduler, quality, migration, and API-platform routes. |
| `multiTenancy` | Tier-4 tenant/platform routes. |
| `scheduler` | Reserved configuration flag; scheduler code exists, but route mounting is controlled by the Tier-3 module condition. |

The mapping is implemented in `src/server/registerApiRoutes.ts` and `src/client/ui/moduleNav.ts`. In non-local `shared` or `production` app modes, `src/server/startupSafety.ts` forces experimental modules off unless `UNSAFE_ALLOW_EXPERIMENTAL=true` is explicitly set.

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

The profile adds OneStream-aware advisories and informational findings for naming conventions, aliases, reserved Root/None casing, sort order, shared members, parent input, missing Account Type, missing Entity Currency, missing relationship weights, and invalid Entity ownership percentages. Spaces, periods, alternate hierarchies, shared members, orphan members, and the configured hierarchy-depth threshold are not platform errors. Currency references are checked only when `validCurrencyCodes` is explicitly configured.

### `export`

Controls XML, XLSX, CSV, and JSON export availability and options.

Validation gate fields:

- `allowValidationBypass`: optional boolean, default `false`; allows explicit server-side export bypass when blocking validation issues exist.
- `validationBypassRequiresReason`: optional boolean, default `true`; requires a bypass reason when bypass is enabled.
- `requireValidationBeforeExport`: optional boolean, default `false`; when true, exports are blocked until validation has run at least once.

### `ui`

Controls default workspace tab, grid page size, toolbar visibility, and XML preview defaults.

### `operations`

Controls runtime posture and operational limits:

- `appMode`: `local`, `shared`, or `production`.
- `uploadMaxMb`: upload limit used by import handling.
- `exportRetentionDays` and `artifactRetentionDays`: retention settings exposed to the operational model.
- `exportMaxMembers`: export size guard.
- `corsAllowLocalhostByDefault`: local CORS behavior.

`APP_MODE` overrides `operations.appMode`. Shared and production modes require authentication and reject placeholder JWT secrets; first-admin bootstrap also requires non-default credentials.

### `ai`

Controls optional AI features such as insights and suggestions. Core Project Query is deterministic, uses stored project data, and does not require `ai.enabled`, a provider, an API key, or `modules.chatAssistant`. Secret values should be supplied through environment or deployment secret management rather than committed YAML.

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
- invalid database pool sizes and operational limits
- non-boolean export validation gate fields
- invalid TCP ports
- non-positive grid page size
- invalid metadata-only exclude regex patterns

Project validation rules are configured through the versioned catalog API, not by changing the global export-blocking severity list. See [Validation Rules](validation-rules.md) for classifications and OneStream evidence.

## Environment Overrides

The loader currently supports these environment overrides:

```text
DIMBUILDER_CONFIG_FILE
METADATA_DIRECTORY
DATABASE_FILE
DATABASE_URL
DATABASE_POOL_MAX
PORT
HOST
AUTH_ENABLED
AUTH_USERNAME
AUTH_PASSWORD
JWT_SECRET
EXPORT_MAX_MEMBERS
APP_MODE
```

Environment overrides should remain small and operational. Functional behavior should stay in YAML so it can be reviewed and documented.

## Frontend Config Editor

The app includes a browser-based config editor accessible from the "Config" section when the `platformExtras` module is enabled. It displays the current client-safe merged configuration as JSON in an editable textarea. Clicking "Save" sends a `PUT /api/config` request that validates and writes the submitted values to the YAML file, updates the in-memory config, and reloads the client view. Server-only paths, ports, and authentication settings are excluded from the client payload.

This is useful for making quick configuration tweaks (e.g., toggling features, adjusting validation severities, or changing export options) without SSH access or manual YAML editing. The editor respects the same validation rules as the YAML loader — invalid configurations are rejected with a descriptive error.
