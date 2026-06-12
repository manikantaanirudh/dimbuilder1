# Runtime YAML Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a runtime YAML configuration system so OneStream XF Dimension Builder can control app identity, runtime paths, dimension behavior, validation severities, export defaults, and UI flags from `config/dimbuilder.yaml`.

**Architecture:** The server owns full config loading and validation, then exposes a client-safe subset through `/api/config`. Shared config types/defaults live under `src/shared`, server-only loading lives under `src/server/config`, and React components consume config through one client hook. Existing hardcoded behavior is migrated incrementally behind config inputs without replacing the established dimension field schema system.

**Tech Stack:** TypeScript, Node.js, Express, React, Vite, Vitest, ExcelJS, YAML package, SQLite.

---

## File Structure

Create:

- `config/dimbuilder.yaml`: default Dev application config.
- `src/shared/appConfigTypes.ts`: normalized config interfaces and constants.
- `src/shared/appConfigDefaults.ts`: built-in defaults used when YAML is missing or partial.
- `src/shared/appConfigValidation.ts`: deep merge, normalization, and validation helpers.
- `src/server/config/loadAppConfig.ts`: filesystem/env loader for full server config.
- `src/server/routes/config.ts`: `GET /api/config` route.
- `src/client/config/useAppConfig.ts`: React hook for client-safe config.
- `src/test/appConfig.test.ts`: unit tests for defaults, merge, validation, and client-safe filtering.

Modify:

- `package.json` and `package-lock.json`: add `yaml`.
- `src/server/app.ts`: accept loaded config, create database with configured file, register config route, pass config to routers.
- `src/server/index.ts`: load config and use configured host/port.
- `src/server/routes/import.ts`: use configured metadata paths and metadata-only behavior.
- `src/server/routes/export.ts`: use configured export path and export enablement.
- `src/server/routes/validation.ts`: use configured validation severities.
- `src/server/metadataReference.ts`: use configured metadata directory/default file.
- `src/shared/workbookParser.ts`: accept config-driven import/dimension options.
- `src/shared/xmlExport.ts`: accept config-driven XML options/version fallback.
- `src/shared/xlsxExport.ts`: accept configured workbook creator.
- `src/shared/validationEngine.ts`: accept rule-specific severities.
- `src/shared/dimensionSchemas.ts`: support configured enabled dimension types, display order, and sheet aliases.
- `src/client/api/client.ts`: add `fetchAppConfig`.
- `src/client/components/AppShell.tsx`: consume app title, toolbar flags, validation blocking severities.
- `src/client/components/Dashboard.tsx`: consume dashboard title/copy/card visibility.
- `src/client/components/ImportExportModals.tsx`: consume modal labels and export format enablement.
- `src/client/components/EditableGrid.tsx`: consume configured grid page size.
- `src/client/components/XmlPreview.tsx`: consume XML preview flags.

---

### Task 1: Add YAML Dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install dependency**

Run:

```powershell
npm.cmd install yaml
```

Expected:

```text
added 1 package
found 0 vulnerabilities
```

- [ ] **Step 2: Confirm package is present**

Run:

```powershell
node -e "const yaml = require('yaml'); console.log(typeof yaml.parse)"
```

Expected:

```text
function
```

- [ ] **Step 3: Commit**

```powershell
git add package.json package-lock.json
git commit -m "chore: add yaml config dependency"
```

---

### Task 2: Define Config Types, Defaults, and Validation

**Files:**
- Create: `src/shared/appConfigTypes.ts`
- Create: `src/shared/appConfigDefaults.ts`
- Create: `src/shared/appConfigValidation.ts`
- Test: `src/test/appConfig.test.ts`

- [ ] **Step 1: Write failing config tests**

Create `src/test/appConfig.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import {
  buildClientAppConfig,
  mergeAppConfig,
  validateAppConfig
} from "../shared/appConfigValidation";

describe("app config", () => {
  it("deep merges partial yaml config onto defaults", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      application: { title: "Custom Builder" },
      ui: { gridPageSize: 250 }
    });

    expect(config.application.title).toBe("Custom Builder");
    expect(config.application.productName).toBe("OneStream XF Dimension Builder");
    expect(config.ui.gridPageSize).toBe(250);
    expect(config.features.enableXmlPreview).toBe(true);
  });

  it("rejects unknown dimension types", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: { enabledTypes: ["Scenario", "BadDim"] }
    });

    expect(() => validateAppConfig(config)).toThrow("Unknown dimension type 'BadDim'");
  });

  it("rejects invalid severities", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      validation: { duplicateMemberSeverity: "fatal" }
    });

    expect(() => validateAppConfig(config)).toThrow("Invalid severity 'fatal'");
  });

  it("rejects invalid metadata-only exclusion regex", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        metadataOnly: {
          ...defaultAppConfig.dimensions.metadataOnly,
          excludeNamePatterns: ["["]
        }
      }
    });

    expect(() => validateAppConfig(config)).toThrow("Invalid excludeNamePatterns regex");
  });

  it("removes server-only paths from client-safe config", () => {
    const clientConfig = buildClientAppConfig(defaultAppConfig);

    expect(clientConfig.application.title).toBe(defaultAppConfig.application.title);
    expect("paths" in clientConfig).toBe(false);
    expect("server" in clientConfig).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and verify red**

Run:

```powershell
npm.cmd test -- src/test/appConfig.test.ts
```

Expected:

```text
FAIL src/test/appConfig.test.ts
Cannot find module '../shared/appConfigDefaults'
```

- [ ] **Step 3: Add config types**

Create `src/shared/appConfigTypes.ts`:

```ts
import type { DimensionType, Severity } from "./types";

export const supportedConfigSeverities: Severity[] = ["error", "warning", "info"];

export interface ApplicationConfig {
  productName: string;
  applicationName: string;
  title: string;
  description: string;
  environmentName: string;
  oneStreamVersionFallback: string;
  supportText: string;
}

export interface PathsConfig {
  metadataDirectory: string;
  defaultMetadataFile: string;
  uploadsDirectory: string;
  exportsDirectory: string;
  databaseFile: string;
}

export interface ServerConfig {
  host: string;
  port: number;
  clientDevPort: number;
}

export interface FeatureConfig {
  enableMetadataReferenceAlignment: boolean;
  includeMetadataOnlyDimensions: boolean;
  enableXmlPreview: boolean;
  enableXlsxExport: boolean;
  enableCsvExport: boolean;
  enableJsonBackup: boolean;
  enableAuditLog: boolean;
  enableSnapshots: boolean;
}

export interface DashboardConfig {
  cards: {
    totalDimensions: boolean;
    totalMembers: boolean;
    totalRelationships: boolean;
    validationErrors: boolean;
    validationWarnings: boolean;
    recentDimensions: boolean;
    importStatus: boolean;
    exportStatus: boolean;
  };
}

export interface DimensionsConfig {
  expectedDimensionCount: number;
  enabledTypes: DimensionType[];
  displayOrder: DimensionType[];
  display: {
    labelFormat: string;
    showInheritedDimensionSubtitle: boolean;
    showMetadataOnlyBadge: boolean;
  };
  metadataOnly: {
    includeWhenWorkbookSheetMissing: boolean;
    excludeNamePatterns: string[];
  };
  sheetAliases: Partial<Record<DimensionType, string[]>>;
  preferredMetadataNames: Partial<Record<DimensionType, string>>;
}

export interface ImportConfig {
  workbook: {
    mergeDuplicateDimensionSheets: boolean;
    ignoreGeneratedXmlColumns: boolean;
    ignoreFormulaErrors: boolean;
    preserveOriginalColumnNames: boolean;
    skippedDefaultRowSeverity: Severity;
  };
  metadataReference: {
    enabled: boolean;
    preferExactDimensionNameMatch: boolean;
    fallbackToLargestPopulatedDimension: boolean;
    includeMetadataOnlyDimensions: boolean;
  };
}

export interface ValidationConfig {
  duplicateMemberSeverity: Severity;
  duplicateRelationshipSeverity: Severity;
  unknownRelationshipMemberSeverity: Severity;
  missingRequiredFieldSeverity: Severity;
  circularHierarchySeverity: Severity;
  relationshipsWithNoLocalMembersSeverity: Severity;
  exportBlockedBySeverities: Severity[];
}

export interface ExportConfig {
  xml: {
    enabled: boolean;
    prettyPrint: boolean;
    skipBlankMemberRows: boolean;
    skipFormulaErrors: boolean;
    includeDimensionSourceAttributes: boolean;
  };
  xlsx: {
    enabled: boolean;
    creator: string;
  };
  csv: {
    enabled: boolean;
  };
  json: {
    enabled: boolean;
  };
}

export interface UiConfig {
  defaultWorkspaceTab: string;
  gridPageSize: number;
  toolbar: {
    showImport: boolean;
    showValidate: boolean;
    showExport: boolean;
    showSave: boolean;
    showUndoRedo: boolean;
  };
  xmlPreview: {
    defaultScope: "currentDimension" | "allDimensions";
    allowAllDimensions: boolean;
  };
}

export interface AppConfig {
  application: ApplicationConfig;
  paths: PathsConfig;
  server: ServerConfig;
  features: FeatureConfig;
  dashboard: DashboardConfig;
  dimensions: DimensionsConfig;
  import: ImportConfig;
  validation: ValidationConfig;
  export: ExportConfig;
  ui: UiConfig;
}

export type ClientAppConfig = Omit<AppConfig, "paths" | "server">;
```

- [ ] **Step 4: Add defaults**

Create `src/shared/appConfigDefaults.ts`:

```ts
import type { AppConfig } from "./appConfigTypes";

export const defaultAppConfig: AppConfig = {
  application: {
    productName: "OneStream XF Dimension Builder",
    applicationName: "Dev",
    title: "OneStream XF Dimension Builder",
    description: "Import the metadata template, manage dimensions in controlled grids, validate hierarchy issues, and export OneStream-compatible files.",
    environmentName: "Local",
    oneStreamVersionFallback: "9.2.0.18004",
    supportText: "Local metadata workspace"
  },
  paths: {
    metadataDirectory: "metadata",
    defaultMetadataFile: "Dev_Metadata_20260516_202239Z.xml",
    uploadsDirectory: "data/uploads",
    exportsDirectory: "data/exports",
    databaseFile: "data/app.db"
  },
  server: {
    host: "127.0.0.1",
    port: 8787,
    clientDevPort: 5173
  },
  features: {
    enableMetadataReferenceAlignment: true,
    includeMetadataOnlyDimensions: true,
    enableXmlPreview: true,
    enableXlsxExport: true,
    enableCsvExport: true,
    enableJsonBackup: true,
    enableAuditLog: true,
    enableSnapshots: true
  },
  dashboard: {
    cards: {
      totalDimensions: true,
      totalMembers: true,
      totalRelationships: true,
      validationErrors: true,
      validationWarnings: true,
      recentDimensions: true,
      importStatus: true,
      exportStatus: true
    }
  },
  dimensions: {
    expectedDimensionCount: 18,
    enabledTypes: ["Scenario", "Entity", "Account", "Flow", "UD1", "UD2", "UD3", "UD4", "UD5", "UD6", "UD7", "UD8"],
    displayOrder: ["Scenario", "Entity", "Account", "Flow", "UD1", "UD2", "UD3", "UD4", "UD5", "UD6", "UD7", "UD8"],
    display: {
      labelFormat: "{type} - {name}",
      showInheritedDimensionSubtitle: true,
      showMetadataOnlyBadge: true
    },
    metadataOnly: {
      includeWhenWorkbookSheetMissing: true,
      excludeNamePatterns: ["^FVA_", "^Root"]
    },
    sheetAliases: {
      UD3: ["UD3", "UD3 OUC", "UD3 OUC (2)"]
    },
    preferredMetadataNames: {
      Scenario: "Scenarios",
      Account: "GLAccounts",
      UD4: "ChannelPartner",
      UD5: "CustomerType",
      UD8: "Reporting"
    }
  },
  import: {
    workbook: {
      mergeDuplicateDimensionSheets: true,
      ignoreGeneratedXmlColumns: true,
      ignoreFormulaErrors: true,
      preserveOriginalColumnNames: true,
      skippedDefaultRowSeverity: "warning"
    },
    metadataReference: {
      enabled: true,
      preferExactDimensionNameMatch: true,
      fallbackToLargestPopulatedDimension: true,
      includeMetadataOnlyDimensions: true
    }
  },
  validation: {
    duplicateMemberSeverity: "warning",
    duplicateRelationshipSeverity: "warning",
    unknownRelationshipMemberSeverity: "warning",
    missingRequiredFieldSeverity: "error",
    circularHierarchySeverity: "error",
    relationshipsWithNoLocalMembersSeverity: "warning",
    exportBlockedBySeverities: ["error"]
  },
  export: {
    xml: {
      enabled: true,
      prettyPrint: true,
      skipBlankMemberRows: true,
      skipFormulaErrors: true,
      includeDimensionSourceAttributes: true
    },
    xlsx: {
      enabled: true,
      creator: "OneStream XF Dimension Builder"
    },
    csv: {
      enabled: true
    },
    json: {
      enabled: true
    }
  },
  ui: {
    defaultWorkspaceTab: "Overview",
    gridPageSize: 600,
    toolbar: {
      showImport: true,
      showValidate: true,
      showExport: true,
      showSave: true,
      showUndoRedo: true
    },
    xmlPreview: {
      defaultScope: "currentDimension",
      allowAllDimensions: true
    }
  }
};
```

- [ ] **Step 5: Add validation helpers**

Create `src/shared/appConfigValidation.ts`:

```ts
import type { AppConfig, ClientAppConfig } from "./appConfigTypes";
import { supportedConfigSeverities } from "./appConfigTypes";
import { supportedDimensionTypes } from "./dimensionSchemas";

type UnknownRecord = Record<string, unknown>;

export function mergeAppConfig(defaults: AppConfig, override: unknown): AppConfig {
  return deepMerge(defaults, override) as AppConfig;
}

export function validateAppConfig(config: AppConfig): AppConfig {
  for (const type of [...config.dimensions.enabledTypes, ...config.dimensions.displayOrder]) {
    if (!supportedDimensionTypes.includes(type)) throw new Error(`Unknown dimension type '${type}' in configuration.`);
  }

  for (const severity of [
    config.import.workbook.skippedDefaultRowSeverity,
    config.validation.duplicateMemberSeverity,
    config.validation.duplicateRelationshipSeverity,
    config.validation.unknownRelationshipMemberSeverity,
    config.validation.missingRequiredFieldSeverity,
    config.validation.circularHierarchySeverity,
    config.validation.relationshipsWithNoLocalMembersSeverity,
    ...config.validation.exportBlockedBySeverities
  ]) {
    if (!supportedConfigSeverities.includes(severity)) throw new Error(`Invalid severity '${severity}' in configuration.`);
  }

  if (!Number.isInteger(config.server.port) || config.server.port <= 0) throw new Error("server.port must be a positive integer.");
  if (!Number.isInteger(config.server.clientDevPort) || config.server.clientDevPort <= 0) throw new Error("server.clientDevPort must be a positive integer.");
  if (!Number.isInteger(config.ui.gridPageSize) || config.ui.gridPageSize <= 0) throw new Error("ui.gridPageSize must be a positive integer.");

  for (const pattern of config.dimensions.metadataOnly.excludeNamePatterns) {
    try {
      new RegExp(pattern);
    } catch {
      throw new Error(`Invalid excludeNamePatterns regex '${pattern}'.`);
    }
  }

  return config;
}

export function buildClientAppConfig(config: AppConfig): ClientAppConfig {
  const { paths: _paths, server: _server, ...clientConfig } = config;
  return clientConfig;
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isRecord(base) || !isRecord(override)) return override === undefined ? base : override as T;
  const result: UnknownRecord = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in result ? deepMerge(result[key], value) : value;
  }
  return result as T;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
```

- [ ] **Step 6: Run test and verify green**

Run:

```powershell
npm.cmd test -- src/test/appConfig.test.ts
```

Expected:

```text
Test Files  1 passed
Tests  5 passed
```

- [ ] **Step 7: Commit**

```powershell
git add src/shared/appConfigTypes.ts src/shared/appConfigDefaults.ts src/shared/appConfigValidation.ts src/test/appConfig.test.ts
git commit -m "feat: add app config defaults and validation"
```

---

### Task 3: Add YAML File and Server Config Loader

**Files:**
- Create: `config/dimbuilder.yaml`
- Create: `src/server/config/loadAppConfig.ts`
- Test: `src/test/appConfig.test.ts`

- [ ] **Step 1: Extend failing tests for YAML/env loading**

Append to `src/test/appConfig.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadAppConfig } from "../server/config/loadAppConfig";

describe("server app config loader", () => {
  it("loads config from yaml and applies environment overrides", () => {
    const directory = mkdtempSync(join(tmpdir(), "dimbuilder-config-"));
    const filePath = join(directory, "dimbuilder.yaml");
    writeFileSync(filePath, "application:\n  title: YAML Title\nserver:\n  port: 9001\n", "utf8");
    const previousPort = process.env.PORT;
    process.env.PORT = "9002";

    try {
      const config = loadAppConfig({ configFilePath: filePath });
      expect(config.application.title).toBe("YAML Title");
      expect(config.server.port).toBe(9002);
    } finally {
      if (previousPort === undefined) delete process.env.PORT;
      else process.env.PORT = previousPort;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses defaults when config file is missing", () => {
    const config = loadAppConfig({ configFilePath: "missing-config-file.yaml" });
    expect(config.application.title).toBe(defaultAppConfig.application.title);
  });
});
```

- [ ] **Step 2: Run tests and verify red**

Run:

```powershell
npm.cmd test -- src/test/appConfig.test.ts
```

Expected:

```text
FAIL src/test/appConfig.test.ts
Cannot find module '../server/config/loadAppConfig'
```

- [ ] **Step 3: Add default YAML**

Create `config/dimbuilder.yaml`:

```yaml
application:
  productName: OneStream XF Dimension Builder
  applicationName: Dev
  title: OneStream XF Dimension Builder
  description: Import the metadata template, manage dimensions in controlled grids, validate hierarchy issues, and export OneStream-compatible files.
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

- [ ] **Step 4: Add server loader**

Create `src/server/config/loadAppConfig.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { defaultAppConfig } from "../../shared/appConfigDefaults";
import type { AppConfig } from "../../shared/appConfigTypes";
import { mergeAppConfig, validateAppConfig } from "../../shared/appConfigValidation";

interface LoadAppConfigOptions {
  configFilePath?: string;
}

export function loadAppConfig(options: LoadAppConfigOptions = {}): AppConfig {
  const configFilePath = options.configFilePath ?? process.env.DIMBUILDER_CONFIG_FILE ?? "config/dimbuilder.yaml";
  const yamlConfig = existsSync(configFilePath)
    ? parse(readFileSync(configFilePath, "utf8")) ?? {}
    : {};
  const merged = mergeAppConfig(defaultAppConfig, yamlConfig);
  return validateAppConfig(applyEnvironmentOverrides(merged));
}

function applyEnvironmentOverrides(config: AppConfig): AppConfig {
  return {
    ...config,
    paths: {
      ...config.paths,
      metadataDirectory: process.env.METADATA_DIRECTORY ?? config.paths.metadataDirectory,
      databaseFile: process.env.DATABASE_FILE ?? config.paths.databaseFile
    },
    server: {
      ...config.server,
      port: process.env.PORT ? Number(process.env.PORT) : config.server.port
    }
  };
}
```

- [ ] **Step 5: Run config tests**

Run:

```powershell
npm.cmd test -- src/test/appConfig.test.ts
```

Expected:

```text
Test Files  1 passed
Tests  7 passed
```

- [ ] **Step 6: Commit**

```powershell
git add config/dimbuilder.yaml src/server/config/loadAppConfig.ts src/test/appConfig.test.ts
git commit -m "feat: load app config from yaml"
```

---

### Task 4: Expose Client-Safe Config Through API

**Files:**
- Create: `src/server/routes/config.ts`
- Modify: `src/server/app.ts`
- Modify: `src/test/api.test.ts`

- [ ] **Step 1: Add failing API test**

Extend `src/test/api.test.ts` with:

```ts
it("returns client-safe app config", async () => {
  const app = createApp(undefined, {
    ...defaultAppConfig,
    application: { ...defaultAppConfig.application, title: "Configured Title" }
  });
  const server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not start");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/config`);
    const body = await response.json();

    expect(body.application.title).toBe("Configured Title");
    expect(body.paths).toBeUndefined();
    expect(body.server).toBeUndefined();
  } finally {
    server.close();
  }
});
```

Also import defaults:

```ts
import { defaultAppConfig } from "../shared/appConfigDefaults";
```

- [ ] **Step 2: Run test and verify red**

Run:

```powershell
npm.cmd test -- src/test/api.test.ts
```

Expected:

```text
FAIL src/test/api.test.ts
Expected status 200 but received 404
```

- [ ] **Step 3: Add config route**

Create `src/server/routes/config.ts`:

```ts
import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import { buildClientAppConfig } from "../../shared/appConfigValidation";

export function createConfigRouter(config: AppConfig): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(buildClientAppConfig(config));
  });

  return router;
}
```

- [ ] **Step 4: Wire app route and config injection**

Modify `src/server/app.ts`:

```ts
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import { createConfigRouter } from "./routes/config";
```

Change signature:

```ts
export function createApp(db: AppDatabase = createDatabase(), config: AppConfig = defaultAppConfig) {
```

Register route after health:

```ts
app.use("/api/config", createConfigRouter(config));
```

- [ ] **Step 5: Run API test**

Run:

```powershell
npm.cmd test -- src/test/api.test.ts
```

Expected:

```text
Test Files  1 passed
```

- [ ] **Step 6: Commit**

```powershell
git add src/server/routes/config.ts src/server/app.ts src/test/api.test.ts
git commit -m "feat: expose client-safe app config"
```

---

### Task 5: Wire Server Startup, Database, Upload, Export, and Metadata Paths

**Files:**
- Modify: `src/server/app.ts`
- Modify: `src/server/index.ts`
- Modify: `src/server/routes/import.ts`
- Modify: `src/server/routes/export.ts`
- Modify: `src/server/metadataReference.ts`
- Test: `src/test/appConfig.test.ts`

- [ ] **Step 1: Add failing metadata path test**

Append to `src/test/appConfig.test.ts`:

```ts
import { findDefaultMetadataReferencePath } from "../server/metadataReference";

it("uses configured metadata directory and default file", () => {
  const directory = mkdtempSync(join(tmpdir(), "dimbuilder-metadata-"));
  writeFileSync(join(directory, "first.xml"), "<OneStreamXF />", "utf8");
  writeFileSync(join(directory, "preferred.xml"), "<OneStreamXF />", "utf8");

  try {
    expect(findDefaultMetadataReferencePath({ directory, defaultFile: "preferred.xml" })).toBe(join(directory, "preferred.xml"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test and verify red**

Run:

```powershell
npm.cmd test -- src/test/appConfig.test.ts
```

Expected:

```text
FAIL ... Expected 1 arguments, but got 0/shape mismatch
```

- [ ] **Step 3: Update metadata reference path helper**

Modify `src/server/metadataReference.ts`:

```ts
interface MetadataReferencePathOptions {
  directory?: string;
  defaultFile?: string;
}

export function findDefaultMetadataReferencePath(options: MetadataReferencePathOptions = {}): string | null {
  const directory = options.directory ?? "metadata";
  if (!existsSync(directory)) return null;
  if (options.defaultFile) {
    const preferredPath = join(directory, options.defaultFile);
    if (existsSync(preferredPath)) return preferredPath;
  }
  const files = readdirSync(directory)
    .filter((fileName) => fileName.toLowerCase().endsWith(".xml"))
    .sort()
    .reverse();
  return files[0] ? join(directory, files[0]) : null;
}
```

- [ ] **Step 4: Wire `src/server/index.ts`**

Replace the file with:

```ts
import { createApp } from "./app";
import { createDatabase } from "./db/database";
import { loadAppConfig } from "./config/loadAppConfig";

const config = loadAppConfig();
const db = createDatabase(config.paths.databaseFile);

createApp(db, config).listen(config.server.port, config.server.host, () => {
  console.log(`${config.application.productName} API listening on http://${config.server.host}:${config.server.port}`);
});
```

- [ ] **Step 5: Wire import route**

Change `createImportRouter(repos: Repositories)` to:

```ts
export function createImportRouter(repos: Repositories, config: AppConfig): Router {
```

Import `AppConfig`.

Use configured uploads directory:

```ts
mkdirSync(config.paths.uploadsDirectory, { recursive: true });
```

Use configured metadata reference:

```ts
const metadataReferencePath = config.import.metadataReference.enabled
  ? findDefaultMetadataReferencePath({
      directory: config.paths.metadataDirectory,
      defaultFile: config.paths.defaultMetadataFile
    })
  : null;
```

Pass config to `parseWorkbook`:

```ts
metadataReference,
config
```

- [ ] **Step 6: Wire export route**

Change `createExportRouter(repos: Repositories)` to:

```ts
export function createExportRouter(repos: Repositories, config: AppConfig): Router {
```

Use `config.paths.exportsDirectory` instead of `data/exports`, and return `404` or `403` JSON when a disabled format is requested:

```ts
if (!config.export.xml.enabled) return res.status(404).json({ error: "XML export is disabled" });
```

Pass XML/XLSX options:

```ts
const xml = exportProjectXml(snapshot, { oneStreamVersionFallback: config.application.oneStreamVersionFallback });
await exportWorkbook(filePath, snapshot.dimensions, snapshot.members, snapshot.relationships, { creator: config.export.xlsx.creator });
```

- [ ] **Step 7: Wire app router construction**

Modify `src/server/app.ts` router setup:

```ts
app.use("/api/import", createImportRouter(repos, config));
app.use("/api/export", createExportRouter(repos, config));
```

- [ ] **Step 8: Run tests**

Run:

```powershell
npm.cmd test -- src/test/appConfig.test.ts src/test/api.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 9: Commit**

```powershell
git add src/server/app.ts src/server/index.ts src/server/routes/import.ts src/server/routes/export.ts src/server/metadataReference.ts src/test/appConfig.test.ts
git commit -m "feat: wire server runtime paths to config"
```

---

### Task 6: Wire Workbook Parser Dimension Config

**Files:**
- Modify: `src/shared/workbookParser.ts`
- Modify: `src/shared/dimensionSchemas.ts`
- Test: `src/test/workbookParser.test.ts`

- [ ] **Step 1: Add failing parser config tests**

Add to `src/test/workbookParser.test.ts`:

```ts
import { defaultAppConfig } from "../shared/appConfigDefaults";

it("does not add metadata-only dimensions when config disables them", async () => {
  const parsed = await parseWorkbook(workbookPath, {
    projectName: "XF Dimensions Template",
    createdBy: "local-admin",
    config: {
      ...defaultAppConfig,
      import: {
        ...defaultAppConfig.import,
        metadataReference: {
          ...defaultAppConfig.import.metadataReference,
          includeMetadataOnlyDimensions: false
        }
      }
    },
    metadataReference: {
      version: "9.2.0.18004",
      dimensions: [
        { type: "UD1", name: "Region", inheritedDim: "RootUD1Dim", memberCount: 6, relationshipCount: 7 }
      ]
    }
  });

  expect(parsed.dimensions.some((dimension) => dimension.dimensionType === "UD1")).toBe(false);
});

it("uses configured preferred metadata names before largest populated fallback", async () => {
  const parsed = await parseWorkbook(workbookPath, {
    projectName: "XF Dimensions Template",
    createdBy: "local-admin",
    config: {
      ...defaultAppConfig,
      dimensions: {
        ...defaultAppConfig.dimensions,
        preferredMetadataNames: { Account: "PlanAccounts_L2" }
      }
    },
    metadataReference: {
      dimensions: [
        { type: "Account", name: "GLAccounts", memberCount: 578, relationshipCount: 578 },
        { type: "Account", name: "PlanAccounts_L2", memberCount: 10, relationshipCount: 10 }
      ]
    }
  });

  expect(parsed.dimensions.find((dimension) => dimension.sheetName === "Accounts")?.dimensionName).toBe("PlanAccounts_L2");
});
```

- [ ] **Step 2: Run test and verify red**

Run:

```powershell
npm.cmd test -- src/test/workbookParser.test.ts
```

Expected:

```text
FAIL because ParseOptions does not accept config / preferred names ignored
```

- [ ] **Step 3: Extend parser options**

Modify `src/shared/workbookParser.ts`:

```ts
import { defaultAppConfig } from "./appConfigDefaults";
import type { AppConfig } from "./appConfigTypes";

interface ParseOptions {
  projectName: string;
  createdBy: string;
  metadataReference?: MetadataReference;
  config?: AppConfig;
}
```

At the start of `parseWorkbook`:

```ts
const config = options.config ?? defaultAppConfig;
```

Use `config` instead of hardcoded behavior:

```ts
const metadataReference = config.features.enableMetadataReferenceAlignment
  ? findMetadataReference(config, options.metadataReference, schema.dimensionType, workbookDimensionName)
  : undefined;
```

Call metadata-only append only when configured:

```ts
if (config.import.metadataReference.includeMetadataOnlyDimensions && config.features.includeMetadataOnlyDimensions) {
  appendMetadataOnlyDimensions({ projectId: project.id, metadataReference: options.metadataReference, dimensions, dimensionsByLogicalKey, warnings, createdAt, config });
}
```

- [ ] **Step 4: Update reference matching helper**

Change signature:

```ts
function findMetadataReference(
  config: AppConfig,
  metadataReference: MetadataReference | undefined,
  dimensionType: DimensionType,
  dimensionName: string
): MetadataDimensionReference | undefined {
```

Inside, before largest fallback:

```ts
const preferredName = config.dimensions.preferredMetadataNames[dimensionType];
const preferred = preferredName
  ? candidates.find((dimension) => dimension.name.toLowerCase() === preferredName.toLowerCase())
  : undefined;
if (preferred) return preferred;
```

Use config fallback:

```ts
if (!config.import.metadataReference.fallbackToLargestPopulatedDimension) return undefined;
```

- [ ] **Step 5: Update metadata-only exclusion**

Pass config into `appendMetadataOnlyDimensions`, then replace `isApplicationMetadataDimension(reference)` with:

```ts
function isApplicationMetadataDimension(config: AppConfig, reference: MetadataDimensionReference): boolean {
  if (!reference.name) return false;
  return !config.dimensions.metadataOnly.excludeNamePatterns.some((pattern) => new RegExp(pattern, "i").test(reference.name));
}
```

- [ ] **Step 6: Update dimension sort**

Pass config into `applyCanonicalSortOrder(dimensions, config)` and implement:

```ts
function getDimensionTypeRank(dimensionType: string, config: AppConfig): number {
  const index = config.dimensions.displayOrder.indexOf(dimensionType as DimensionType);
  return index === -1 ? config.dimensions.displayOrder.length + 1 : index + 1;
}
```

- [ ] **Step 7: Run parser tests**

Run:

```powershell
npm.cmd test -- src/test/workbookParser.test.ts
```

Expected:

```text
Test Files  1 passed
Tests  6 passed
```

- [ ] **Step 8: Commit**

```powershell
git add src/shared/workbookParser.ts src/test/workbookParser.test.ts
git commit -m "feat: apply config to workbook dimension import"
```

---

### Task 7: Wire Validation Severities

**Files:**
- Modify: `src/shared/validationEngine.ts`
- Modify: `src/server/routes/validation.ts`
- Test: `src/test/validationEngine.test.ts`

- [ ] **Step 1: Add failing validation severity test**

Add to `src/test/validationEngine.test.ts`:

```ts
it("uses rule-specific configured severities", () => {
  const issues = validateDimension({
    project: sampleProject,
    dimension: sampleScenarioDimension,
    members: [
      memberFixture({ id: "m1", memberKey: "Actual" }),
      memberFixture({ id: "m2", memberKey: "Actual", sourceRowNumber: 10 })
    ],
    relationships: [
      relationshipFixture({ id: "r1", parentKey: "Root", childKey: "Actual" }),
      relationshipFixture({ id: "r2", parentKey: "Root", childKey: "Actual" })
    ],
    severities: {
      duplicateMemberSeverity: "error",
      duplicateRelationshipSeverity: "info",
      unknownRelationshipMemberSeverity: "warning",
      missingRequiredFieldSeverity: "error",
      circularHierarchySeverity: "error",
      relationshipsWithNoLocalMembersSeverity: "warning"
    }
  });

  expect(issues.find((issue) => issue.code === "DUPLICATE_MEMBER")?.severity).toBe("error");
  expect(issues.find((issue) => issue.code === "DUPLICATE_RELATIONSHIP")?.severity).toBe("info");
});
```

- [ ] **Step 2: Run test and verify red**

Run:

```powershell
npm.cmd test -- src/test/validationEngine.test.ts
```

Expected:

```text
FAIL because ValidateDimensionInput does not include severities
```

- [ ] **Step 3: Add validation severity input type**

Modify `src/shared/validationEngine.ts`:

```ts
interface ValidationSeverityOptions {
  duplicateMemberSeverity: Severity;
  duplicateRelationshipSeverity: Severity;
  unknownRelationshipMemberSeverity: Severity;
  missingRequiredFieldSeverity: Severity;
  circularHierarchySeverity: Severity;
  relationshipsWithNoLocalMembersSeverity: Severity;
}

interface ValidateDimensionInput {
  project: ProjectRecord;
  dimension: DimensionRecord;
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
  duplicateSeverity?: Severity;
  severities?: ValidationSeverityOptions;
}
```

At the top of `validateDimension`:

```ts
const severities = input.severities ?? {
  duplicateMemberSeverity: input.duplicateSeverity ?? schema.duplicateSeverity,
  duplicateRelationshipSeverity: "warning",
  unknownRelationshipMemberSeverity: "warning",
  missingRequiredFieldSeverity: "error",
  circularHierarchySeverity: "error",
  relationshipsWithNoLocalMembersSeverity: "warning"
};
const duplicateSeverity = severities.duplicateMemberSeverity;
```

Replace hardcoded severities:

```ts
severity: severities.missingRequiredFieldSeverity
severity: severities.circularHierarchySeverity
severity: severities.duplicateRelationshipSeverity
severity: severities.relationshipsWithNoLocalMembersSeverity
```

Pass unknown severity into `validateRelationships`:

```ts
validateRelationships(..., severities.unknownRelationshipMemberSeverity, addIssue);
```

- [ ] **Step 4: Wire validation route**

Modify `src/server/routes/validation.ts` so `createValidationRouter(repos, config)` passes:

```ts
severities: config.validation
```

Update `src/server/app.ts`:

```ts
app.use("/api/validation", createValidationRouter(repos, config));
```

- [ ] **Step 5: Run validation tests**

Run:

```powershell
npm.cmd test -- src/test/validationEngine.test.ts src/test/api.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 6: Commit**

```powershell
git add src/shared/validationEngine.ts src/server/routes/validation.ts src/server/app.ts src/test/validationEngine.test.ts
git commit -m "feat: configure validation severities"
```

---

### Task 8: Wire XML and XLSX Export Options

**Files:**
- Modify: `src/shared/xmlExport.ts`
- Modify: `src/shared/xlsxExport.ts`
- Modify: `src/server/routes/export.ts`
- Test: `src/test/xmlExport.test.ts`

- [ ] **Step 1: Add failing XML option test**

Add to `src/test/xmlExport.test.ts`:

```ts
it("uses configured OneStream version fallback when metadata version is absent", () => {
  const xml = exportProjectXml({
    project: sampleProject,
    dimensions: [sampleScenarioDimension],
    members: [],
    relationships: []
  }, { oneStreamVersionFallback: "10.0.0.1" });

  expect(xml).toContain('<OneStreamXF version="10.0.0.1">');
});
```

- [ ] **Step 2: Run test and verify red**

Run:

```powershell
npm.cmd test -- src/test/xmlExport.test.ts
```

Expected:

```text
FAIL because exportProjectXml expects 1 argument
```

- [ ] **Step 3: Extend XML export options**

Modify `src/shared/xmlExport.ts`:

```ts
interface ExportProjectXmlOptions {
  oneStreamVersionFallback?: string;
}

export function exportProjectXml(input: ExportProjectXmlInput, options: ExportProjectXmlOptions = {}): string {
  const oneStreamVersion = getOneStreamVersion(input.dimensions, options.oneStreamVersionFallback ?? DEFAULT_ONESTREAM_VERSION);
```

Change helper:

```ts
function getOneStreamVersion(dimensions: DimensionRecord[], fallback: string): string {
  return dimensions
    .map((dimension) => normalizeCellValue(dimension.metadata.oneStreamVersion))
    .find(Boolean) ?? fallback;
}
```

- [ ] **Step 4: Extend XLSX export options**

Modify `src/shared/xlsxExport.ts`:

```ts
interface ExportWorkbookOptions {
  creator?: string;
}

export async function exportWorkbook(
  filePath: string,
  dimensions: DimensionRecord[],
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[],
  options: ExportWorkbookOptions = {}
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = options.creator ?? "OneStream XF Dimension Builder";
```

- [ ] **Step 5: Confirm route passes options**

Ensure `src/server/routes/export.ts` calls:

```ts
exportProjectXml(snapshot, { oneStreamVersionFallback: config.application.oneStreamVersionFallback });
exportWorkbook(filePath, snapshot.dimensions, snapshot.members, snapshot.relationships, { creator: config.export.xlsx.creator });
```

- [ ] **Step 6: Run export tests**

Run:

```powershell
npm.cmd test -- src/test/xmlExport.test.ts
```

Expected:

```text
Test Files  1 passed
Tests  4 passed
```

- [ ] **Step 7: Commit**

```powershell
git add src/shared/xmlExport.ts src/shared/xlsxExport.ts src/server/routes/export.ts src/test/xmlExport.test.ts
git commit -m "feat: configure export defaults"
```

---

### Task 9: Add Client Config Hook and API Client

**Files:**
- Modify: `src/client/api/client.ts`
- Create: `src/client/config/useAppConfig.ts`

- [ ] **Step 1: Add API client function**

Modify `src/client/api/client.ts` imports:

```ts
import type { ClientAppConfig } from "../../shared/appConfigTypes";
```

Add:

```ts
export function fetchAppConfig() {
  return apiGet<ClientAppConfig>("/config");
}
```

- [ ] **Step 2: Add React hook**

Create `src/client/config/useAppConfig.ts`:

```ts
import { useEffect, useState } from "react";
import { defaultAppConfig } from "../../shared/appConfigDefaults";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { buildClientAppConfig } from "../../shared/appConfigValidation";
import { fetchAppConfig } from "../api/client";

const fallbackClientConfig = buildClientAppConfig(defaultAppConfig);

export function useAppConfig() {
  const [config, setConfig] = useState<ClientAppConfig>(fallbackClientConfig);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAppConfig()
      .then((result) => {
        if (!cancelled) setConfig(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to load app config");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { config, loading, error };
}
```

- [ ] **Step 3: Typecheck**

Run:

```powershell
npm.cmd run build
```

Expected:

```text
✓ built
```

- [ ] **Step 4: Commit**

```powershell
git add src/client/api/client.ts src/client/config/useAppConfig.ts
git commit -m "feat: add client app config hook"
```

---

### Task 10: Wire UI Labels, Dashboard Cards, Toolbar Flags, and Grid Page Size

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `src/client/components/AppShell.tsx`
- Modify: `src/client/components/Dashboard.tsx`
- Modify: `src/client/components/EditableGrid.tsx`
- Modify: `src/client/components/ImportExportModals.tsx`
- Modify: `src/client/components/XmlPreview.tsx`

- [ ] **Step 1: Wire document title**

Modify `src/client/App.tsx`:

```tsx
import { useEffect } from "react";
import { useAppConfig } from "./config/useAppConfig";
import { AppShell } from "./components/AppShell";

export function App() {
  const { config } = useAppConfig();

  useEffect(() => {
    document.title = config.application.title;
  }, [config.application.title]);

  return <AppShell appConfig={config} />;
}
```

- [ ] **Step 2: Wire `AppShell` props**

Modify `AppShell` signature:

```tsx
import type { ClientAppConfig } from "../../shared/appConfigTypes";

export function AppShell({ appConfig }: { appConfig: ClientAppConfig }) {
```

Replace hardcoded labels:

```tsx
<span>{appConfig.application.productName}</span>
<strong>{appConfig.application.title}</strong>
```

Toolbar buttons:

```tsx
{appConfig.ui.toolbar.showImport && <button onClick={() => setImportOpen(true)}><FileUp size={16} /> Import</button>}
{appConfig.ui.toolbar.showValidate && <button disabled={!store.selectedProjectId} onClick={runValidation}><ShieldCheck size={16} /> Validate</button>}
{appConfig.ui.toolbar.showExport && <button disabled={!store.selectedProjectId} onClick={() => setExportOpen(true)}><Download size={16} /> Export</button>}
{appConfig.ui.toolbar.showSave && <button disabled><Save size={16} /> Save</button>}
{appConfig.ui.toolbar.showUndoRedo && <button disabled title="Undo"><Undo2 size={16} /></button>}
{appConfig.ui.toolbar.showUndoRedo && <button disabled title="Redo"><RotateCcw size={16} /></button>}
```

Pass config:

```tsx
<Dashboard appConfig={appConfig} ... />
<ExportModal appConfig={appConfig} ... />
```

- [ ] **Step 3: Wire `Dashboard` props**

Modify signature:

```tsx
import type { ClientAppConfig } from "../../shared/appConfigTypes";

export function Dashboard({ appConfig, projects, dimensions, summary, onImport }: { appConfig: ClientAppConfig; ... }) {
```

Build metrics based on config:

```tsx
const possibleMetrics = [
  ["totalDimensions", "Dimensions", summary?.totalDimensions ?? dimensions.length],
  ["totalMembers", "Members", summary?.totalMembers ?? 0],
  ["totalRelationships", "Relationships", summary?.totalRelationships ?? 0],
  ["validationErrors", "Blocking errors", summary?.validationErrors ?? 0],
  ["validationWarnings", "Warnings", summary?.validationWarnings ?? 0]
] as const;
const metrics = possibleMetrics.filter(([key]) => appConfig.dashboard.cards[key]);
```

Replace hero:

```tsx
<h1>{appConfig.application.title}</h1>
<p>{appConfig.application.description}</p>
```

- [ ] **Step 4: Wire grid page size**

Modify `EditableGrid` props:

```tsx
export function EditableGrid({ projectId, kind, dimension, pageSize = 600 }: { ...; pageSize?: number }) {
```

Replace `600` with `pageSize` in `loadPage`, `Previous`, and `Next`.

Pass from `DimensionWorkspace`:

```tsx
<EditableGrid pageSize={appConfig.ui.gridPageSize} ... />
```

If `DimensionWorkspace` does not receive `appConfig`, add it to props from `AppShell`.

- [ ] **Step 5: Wire export modal enablement**

Modify `ExportModal` props:

```tsx
appConfig: ClientAppConfig;
```

Only render enabled export links:

```tsx
{appConfig.export.xml.enabled && <a href={`/api/export/${projectId}/xml`}>XML</a>}
{appConfig.export.xlsx.enabled && <a href={`/api/export/${projectId}/xlsx`}>XLSX</a>}
{appConfig.export.csv.enabled && <a href={`/api/export/${projectId}/members.csv`}>Members CSV</a>}
{appConfig.export.csv.enabled && <a href={`/api/export/${projectId}/relationships.csv`}>Relationships CSV</a>}
{appConfig.export.json.enabled && <a href={`/api/export/${projectId}/json`}>JSON Backup</a>}
```

- [ ] **Step 6: Wire XML preview visibility**

If `appConfig.features.enableXmlPreview` is false, hide or disable the XML Preview tab in `DimensionWorkspace`.

Use:

```tsx
const tabs = ["Overview", "Members", "Relationships", "Hierarchy", ...(appConfig.features.enableXmlPreview ? ["XML Preview"] : []), "Issues"];
```

- [ ] **Step 7: Build**

Run:

```powershell
npm.cmd run build
```

Expected:

```text
✓ built
```

- [ ] **Step 8: Commit**

```powershell
git add src/client/App.tsx src/client/components/AppShell.tsx src/client/components/Dashboard.tsx src/client/components/DimensionWorkspace.tsx src/client/components/EditableGrid.tsx src/client/components/ImportExportModals.tsx src/client/components/XmlPreview.tsx
git commit -m "feat: apply runtime config to client UI"
```

---

### Task 11: End-to-End Verification

**Files:**
- No source files expected.

- [ ] **Step 1: Run full tests**

Run:

```powershell
npm.cmd test
```

Expected:

```text
Test Files  10 passed
Tests  all passed
```

- [ ] **Step 2: Run production build**

Run:

```powershell
npm.cmd run build
```

Expected:

```text
✓ built
```

- [ ] **Step 3: Run metadata parse smoke script**

Run:

```powershell
.\node_modules\.bin\tsx.cmd -e "import { loadAppConfig } from './src/server/config/loadAppConfig.ts'; import { parseMetadataReference } from './src/server/metadataReference.ts'; import { parseWorkbook } from './src/shared/workbookParser.ts'; import { join } from 'node:path'; (async()=>{ const config=loadAppConfig(); const metadata=await parseMetadataReference(join(config.paths.metadataDirectory, config.paths.defaultMetadataFile)); const parsed=await parseWorkbook('synthetic-workbook.xlsx',{projectName:'config smoke',createdBy:'local-admin',metadataReference:metadata,config}); console.log(JSON.stringify({title:config.application.title,dimensions:parsed.dimensions.length,ud1:parsed.dimensions.filter(d=>d.dimensionType==='UD1').map(d=>d.dimensionName)},null,2)); })().catch(e=>{ console.error(e); process.exit(1); });"
```

Expected includes:

```json
{
  "title": "OneStream XF Dimension Builder",
  "dimensions": 18,
  "ud1": ["Region", "BU", "Sub Region", "District", "Territory", "T_UC", "T_OUC"]
}
```

- [ ] **Step 4: Browser smoke test**

Start dev server if needed:

```powershell
npm.cmd run dev
```

Run Playwright smoke test against the active Vite URL:

```powershell
node -e "const { chromium } = require('playwright'); (async () => { const browser = await chromium.launch({ channel: 'msedge', headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const logs = []; page.on('console', msg => { if (['error','warning'].includes(msg.type())) logs.push(msg.type()+': '+msg.text()); }); await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' }); const title = await page.title(); const heading = await page.locator('.toolbar-title strong').textContent(); const navItems = await page.locator('.nav-item span').allTextContents(); console.log(JSON.stringify({ title, heading, hasUd1: navItems.includes('UD1 - T_OUC'), logs }, null, 2)); await browser.close(); })().catch(e => { console.error(e); process.exit(1); });"
```

Expected:

```json
{
  "title": "OneStream XF Dimension Builder",
  "heading": "OneStream XF Dimension Builder",
  "hasUd1": true,
  "logs": []
}
```

- [ ] **Step 5: Commit verification-only cleanup if needed**

If verification required any code fixes, commit those fixes with:

```powershell
git add <changed-files>
git commit -m "fix: complete runtime config verification"
```

If no files changed, do not create a commit.

---

## Self-Review Notes

Spec coverage:

- Config file, defaults, validation, client-safe API, runtime paths, metadata reference behavior, dimension order, metadata-only UD1, validation severities, export options, and UI labels are covered by tasks.
- Full YAML-driven field schema overrides are intentionally not implemented in this plan; the approved spec marks them as a later preparation phase after the loader is stable.

Plan execution guidance:

- Use TDD for each behavior task.
- Keep commits at task boundaries.
- Do not rewrite the existing field schema system.
- Do not commit user-provided `metadata/` or `pdfs/` folders unless the user explicitly asks.
