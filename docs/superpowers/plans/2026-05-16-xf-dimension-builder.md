# OneStream XF Dimension Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first web application that imports, edits, validates, visualizes, and exports OneStream XF dimension metadata from the supplied workbook.

**Architecture:** React/Vite/TypeScript frontend talks to a Node/Express/TypeScript backend. The backend owns workbook parsing, SQLite persistence, validation, hierarchy analysis, and XML/XLSX/CSV/JSON export through schema-driven OneStream dimension definitions.

**Tech Stack:** React, Vite, TypeScript, Express, SQLite via `better-sqlite3`, `exceljs`, Vitest, Playwright, `@tanstack/react-virtual`, `lucide-react`, CSS modules/global CSS.

---

## File Structure

Create this structure:

```text
.
├── .gitignore
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── index.html
├── src/
│   ├── client/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── styles.css
│   │   ├── api/client.ts
│   │   ├── components/AppShell.tsx
│   │   ├── components/Dashboard.tsx
│   │   ├── components/DimensionWorkspace.tsx
│   │   ├── components/EditableGrid.tsx
│   │   ├── components/HierarchyTree.tsx
│   │   ├── components/ImportExportModals.tsx
│   │   ├── components/IssuePanel.tsx
│   │   ├── components/MetadataEditor.tsx
│   │   ├── components/XmlPreview.tsx
│   │   └── state/useProjectStore.ts
│   ├── server/
│   │   ├── index.ts
│   │   ├── app.ts
│   │   ├── db/schema.ts
│   │   ├── db/database.ts
│   │   ├── db/repositories.ts
│   │   ├── routes/projects.ts
│   │   ├── routes/import.ts
│   │   ├── routes/export.ts
│   │   └── routes/validation.ts
│   ├── shared/
│   │   ├── types.ts
│   │   ├── dimensionSchemas.ts
│   │   ├── workbookParser.ts
│   │   ├── validationEngine.ts
│   │   ├── hierarchy.ts
│   │   ├── xmlExport.ts
│   │   ├── xlsxExport.ts
│   │   ├── csvJsonExport.ts
│   │   └── text.ts
│   └── test/
│       ├── fixtures.ts
│       ├── workbookParser.test.ts
│       ├── validationEngine.test.ts
│       ├── hierarchy.test.ts
│       └── xmlExport.test.ts
└── data/
    ├── exports/
    └── uploads/
```

Responsibilities:

- `src/shared/dimensionSchemas.ts`: canonical field definitions and OneStream mapper metadata.
- `src/shared/workbookParser.ts`: XLSX-to-project parser, independent of Express.
- `src/shared/validationEngine.ts`: pure validation rules over project data.
- `src/shared/hierarchy.ts`: pure graph construction and issue detection helpers.
- `src/shared/xmlExport.ts`: XML generation and XML escaping.
- `src/shared/xlsxExport.ts`: workbook-compatible XLSX writer.
- `src/server/db/*`: SQLite initialization and data access.
- `src/server/routes/*`: HTTP endpoints.
- `src/client/components/*`: UI surfaces.

---

### Task 1: Bootstrap Repository and Project Tooling

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`

- [ ] **Step 1: Initialize git repository**

Run:

```powershell
git init
```

Expected: `.git` directory exists and `git status --short` works.

- [ ] **Step 2: Create `.gitignore`**

Write:

```gitignore
node_modules/
dist/
data/app.db
data/uploads/*
data/exports/*
!.gitkeep
.env
.superpowers/
coverage/
playwright-report/
test-results/
```

- [ ] **Step 3: Create `package.json`**

Write:

```json
{
  "name": "onestream-xf-dimension-builder",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently \"tsx watch src/server/index.ts\" \"vite --host 127.0.0.1\"",
    "server": "tsx watch src/server/index.ts",
    "build": "tsc -p tsconfig.json && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "preview": "vite preview --host 127.0.0.1"
  },
  "dependencies": {
    "@tanstack/react-virtual": "^3.13.12",
    "better-sqlite3": "^11.10.0",
    "cors": "^2.8.5",
    "exceljs": "^4.4.0",
    "express": "^4.21.2",
    "lucide-react": "^0.468.0",
    "multer": "^1.4.5-lts.1",
    "nanoid": "^5.0.9",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tsx": "^4.19.2",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/multer": "^1.4.12",
    "@types/node": "^22.10.2",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "concurrently": "^9.1.2",
    "typescript": "^5.7.2",
    "vite": "^6.0.7",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 4: Create TypeScript and Vite config**

Write `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

Write `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

Write `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  }
});
```

Write `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/test/**/*.test.ts"]
  }
});
```

Write `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OneStream XF Dimension Builder</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Install dependencies**

Run:

```powershell
npm install
```

Expected: `node_modules` and `package-lock.json` are created.

- [ ] **Step 6: Verify tooling**

Run:

```powershell
npm test
```

Expected: Vitest reports no test files or passing tests after test files exist.

- [ ] **Step 7: Commit**

Run:

```powershell
git add .gitignore package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts vitest.config.ts index.html
git commit -m "chore: bootstrap dimension builder app"
```

---

### Task 2: Define Shared Types and Dimension Schemas

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/dimensionSchemas.ts`
- Create: `src/shared/text.ts`
- Create: `src/test/fixtures.ts`

- [ ] **Step 1: Write failing schema tests**

Add `src/test/fixtures.ts`:

```ts
import type { DimensionRecord, ProjectRecord } from "../shared/types";

export const sampleProject: ProjectRecord = {
  id: "project-1",
  name: "XF Dimensions Template",
  description: "Sample import",
  sourceFileName: "XF Dimensions Template - 29.04.2026.xlsx",
  createdBy: "local-admin",
  createdAt: "2026-05-16T00:00:00.000Z",
  updatedAt: "2026-05-16T00:00:00.000Z"
};

export const sampleScenarioDimension: DimensionRecord = {
  id: "dim-scenario",
  projectId: sampleProject.id,
  sheetName: "Scenarios",
  dimensionType: "Scenario",
  dimensionName: "SampleScenario",
  description: "Corporate Standard Scenarios",
  accessGroup: "Everyone",
  maintenanceGroup: "Everyone",
  inheritedDimension: "",
  sortOrder: 1,
  metadata: {},
  createdAt: sampleProject.createdAt,
  updatedAt: sampleProject.updatedAt
};
```

Create `src/test/dimensionSchemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getDimensionSchema, supportedDimensionTypes } from "../shared/dimensionSchemas";

describe("dimension schemas", () => {
  it("defines all supported workbook dimensions", () => {
    expect(supportedDimensionTypes).toEqual([
      "Scenario",
      "Entity",
      "Account",
      "Flow",
      "UD2",
      "UD3",
      "UD4",
      "UD5",
      "UD6",
      "UD7",
      "UD8"
    ]);
  });

  it("maps scenario member keys from the Entity column", () => {
    const schema = getDimensionSchema("Scenario");
    expect(schema.memberKeyField).toBe("Entity");
    expect(schema.relationshipFields.map((field) => field.name)).toEqual(["Parent", "Child"]);
  });

  it("maps entity relationship ownership fields", () => {
    const schema = getDimensionSchema("Entity");
    expect(schema.relationshipFields.map((field) => field.name)).toContain("Percent Ownership");
    expect(schema.numericFields).toContain("Parent Sort Order");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm test -- src/test/dimensionSchemas.test.ts
```

Expected: FAIL because `types.ts` and `dimensionSchemas.ts` do not exist.

- [ ] **Step 3: Implement shared types**

Write `src/shared/types.ts`:

```ts
export type DimensionType =
  | "Scenario"
  | "Entity"
  | "Account"
  | "Flow"
  | "UD2"
  | "UD3"
  | "UD4"
  | "UD5"
  | "UD6"
  | "UD7"
  | "UD8";

export type Severity = "error" | "warning" | "info";
export type FieldKind = "text" | "boolean" | "number" | "dropdown" | "formula";

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  sourceFileName: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DimensionRecord {
  id: string;
  projectId: string;
  sheetName: string;
  dimensionType: DimensionType;
  dimensionName: string;
  description: string;
  accessGroup: string;
  maintenanceGroup: string;
  inheritedDimension: string;
  sortOrder: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DimensionMemberRecord {
  id: string;
  dimensionId: string;
  memberKey: string;
  description: string;
  properties: Record<string, unknown>;
  rowOrder: number;
  sourceRowNumber: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DimensionRelationshipRecord {
  id: string;
  dimensionId: string;
  parentKey: string;
  childKey: string;
  aggregationWeight: number | null;
  percentConsol: number | null;
  percentOwnership: number | null;
  ownershipType: string;
  properties: Record<string, unknown>;
  rowOrder: number;
  sourceRowNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface FieldDefinition {
  name: string;
  kind: FieldKind;
  required?: boolean;
  generated?: boolean;
}

export interface DimensionSchema {
  dimensionType: DimensionType;
  sheetNames: string[];
  memberKeyField: string;
  memberFields: FieldDefinition[];
  relationshipFields: FieldDefinition[];
  booleanFields: string[];
  numericFields: string[];
  requiredFields: string[];
  duplicateSeverity: Severity;
}

export interface ParsedProject {
  project: ProjectRecord;
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
  importSummary: ImportSummary;
}

export interface ImportSummary {
  sheetsDetected: number;
  dimensionsImported: number;
  membersImported: number;
  relationshipsImported: number;
  skippedBlankRows: number;
  warnings: string[];
  errors: string[];
}

export interface ValidationIssue {
  id: string;
  projectId: string;
  dimensionId: string;
  entityType: "dimension" | "member" | "relationship";
  entityId: string;
  severity: Severity;
  code: string;
  message: string;
  fieldName: string;
  rowNumber: number | null;
  createdAt: string;
}
```

- [ ] **Step 4: Implement text helpers**

Write `src/shared/text.ts`:

```ts
export function normalizeHeader(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value && typeof value.text === "string") return value.text.trim();
  return String(value).trim();
}

export function isBlankValue(value: unknown): boolean {
  return normalizeCellValue(value) === "";
}

export function isFormulaError(value: unknown): boolean {
  return /^#(NAME|VALUE|REF|DIV\/0|N\/A|NULL|NUM)\??$/i.test(normalizeCellValue(value));
}

export function escapeXml(value: unknown): string {
  return normalizeCellValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
```

- [ ] **Step 5: Implement schemas**

Write `src/shared/dimensionSchemas.ts` with the field arrays from the approved spec. Use this pattern:

```ts
import type { DimensionSchema, DimensionType, FieldDefinition } from "./types";

const text = (name: string, required = false): FieldDefinition => ({ name, kind: "text", required });
const bool = (name: string): FieldDefinition => ({ name, kind: "boolean" });
const num = (name: string): FieldDefinition => ({ name, kind: "number" });
const formula = (name: string): FieldDefinition => ({ name, kind: "formula" });

const generatedColumns = new Set(["Begin Members", "Begin Relationships"]);

function withoutGenerated(fields: FieldDefinition[]): FieldDefinition[] {
  return fields.filter((field) => !generatedColumns.has(field.name) && !field.name.startsWith("="));
}

const udMemberFields = [
  text("Member", true),
  text("Description"),
  text("Formula Type"),
  bool("Allow Input"),
  text("Is Consolidated"),
  text("Alternate Currency For Display"),
  bool("Is Attribute Member"),
  text("Source Member For Data"),
  text("Expression Type"),
  text("Related Dimension Type 1"),
  text("Related Property 1"),
  text("Comparison Text 1"),
  text("Comparison Operator 1"),
  text("Related Dimension Type 2"),
  text("Related Property 2"),
  text("Comparison Text 2"),
  text("Comparison Operator 2"),
  text("Workflow Channel"),
  bool("In Use"),
  formula("Formula"),
  formula("Formula For Calc Drill Down"),
  text("Text1"),
  text("Text2"),
  text("Text3"),
  text("Text4"),
  text("Text5"),
  text("Text6"),
  text("Text7"),
  text("Text8"),
  text("Display Group")
];

const weightedRelationshipFields = [text("Parent", true), text("Child", true), num("Aggregation Weight")];

function createUdSchema(dimensionType: DimensionType): DimensionSchema {
  return {
    dimensionType,
    sheetNames: [dimensionType],
    memberKeyField: "Member",
    memberFields: withoutGenerated(udMemberFields),
    relationshipFields: weightedRelationshipFields,
    booleanFields: ["Allow Input", "Is Attribute Member", "In Use"],
    numericFields: ["Aggregation Weight"],
    requiredFields: ["Dimension Type", "Dimension Name", "Member", "Parent", "Child"],
    duplicateSeverity: "warning"
  };
}

export const dimensionSchemas: Record<DimensionType, DimensionSchema> = {
  Scenario: {
    dimensionType: "Scenario",
    sheetNames: ["Scenarios"],
    memberKeyField: "Entity",
    memberFields: withoutGenerated([
      text("Entity", true),
      text("Description"),
      text("Scenario Type"),
      text("Read Data Group"),
      text("Read and Write Data Group"),
      text("Calculate from Grids Group"),
      text("Manage Data Group"),
      bool("Use In Workflow"),
      text("Workflow Tracking Frequency"),
      text("Workflow Time"),
      text("Workflow Start Time"),
      text("Workflow End Time"),
      num("# of No Input Periods"),
      text("Input Frequency"),
      text("Default View"),
      bool("Retain Next Period Data Using DefaultView"),
      text("Input View For Adj"),
      bool("Use Input View For Adj In Calcs"),
      text("No Data Zero View For Adj"),
      text("No Data Zero View For Non Adj"),
      text("Consolidation View"),
      formula("Formula"),
      formula("Formula For Calc Drill Down"),
      bool("Clear Calculated Data During Calc"),
      bool("Use Cube FX Settings"),
      text("FX Rate Type Revenue Expense"),
      text("FX Rule Type Revenue Expense"),
      text("FX Rate Type Asset Liability"),
      text("FX Rule Type Asset Liability"),
      text("FX Rates Constant Year"),
      text("Text1"),
      text("Text2"),
      text("Text3"),
      text("Text4"),
      text("Text5"),
      text("Text6"),
      text("Text7"),
      text("Text8")
    ]),
    relationshipFields: [text("Parent", true), text("Child", true)],
    booleanFields: [
      "Use In Workflow",
      "Retain Next Period Data Using DefaultView",
      "Use Input View For Adj In Calcs",
      "Clear Calculated Data During Calc",
      "Use Cube FX Settings"
    ],
    numericFields: ["# of No Input Periods"],
    requiredFields: ["Dimension Type", "Dimension Name", "Entity", "Parent", "Child"],
    duplicateSeverity: "warning"
  },
  Entity: {
    dimensionType: "Entity",
    sheetNames: ["Entities"],
    memberKeyField: "Entity",
    memberFields: withoutGenerated([
      text("Entity", true),
      text("Description"),
      text("Currency"),
      bool("Is IC"),
      bool("IsConsolidated"),
      text("Flow Constraint"),
      text("IC Constraint"),
      text("IC Member Filter"),
      text("UD1 Constraint"),
      text("UD2 Constraint"),
      text("UD3 Constraint"),
      text("UD4 Constraint"),
      text("UD5 Constraint"),
      text("UD6 Constraint"),
      text("UD7 Constraint"),
      text("UD8 Constraint"),
      text("UD1 Default"),
      text("UD2 Default"),
      text("UD3 Default"),
      text("UD4 Default"),
      text("UD5 Default"),
      text("UD6 Default"),
      text("UD7 Default"),
      text("UD8 Default"),
      bool("In Use"),
      bool("Allow Adj"),
      bool("Allow Adj From Child"),
      text("Display Group"),
      num("Sibling Consol Pass"),
      num("Sibling Repeat Calc Pass"),
      text("Auto Translate Currencies"),
      text("Text1"),
      text("Text2"),
      text("Text3"),
      text("Text4"),
      text("Text5"),
      text("Text6"),
      text("Text7"),
      text("Text8"),
      text("Read Group"),
      text("Read Group2"),
      text("Read Write Group"),
      text("Read Write Group2"),
      bool("Use Cube Data Access Security"),
      text("Cube Data Cell Access Categories"),
      text("Cube Conditional Input Categories"),
      text("Cube Data Mgmt Access Categories")
    ]),
    relationshipFields: [
      text("Parent", true),
      text("Child", true),
      num("Parent Sort Order"),
      num("Percent Consol"),
      num("Percent Ownership"),
      text("Ownership Type"),
      text("Text1"),
      text("Text2"),
      text("Text3"),
      text("Text4"),
      text("Text5"),
      text("Text6"),
      text("Text7"),
      text("Text8")
    ],
    booleanFields: ["Is IC", "IsConsolidated", "In Use", "Allow Adj", "Allow Adj From Child", "Use Cube Data Access Security"],
    numericFields: ["Sibling Consol Pass", "Sibling Repeat Calc Pass", "Parent Sort Order", "Percent Consol", "Percent Ownership"],
    requiredFields: ["Dimension Type", "Dimension Name", "Entity", "Parent", "Child"],
    duplicateSeverity: "warning"
  },
  Account: {
    dimensionType: "Account",
    sheetNames: ["Accounts"],
    memberKeyField: "Account",
    memberFields: withoutGenerated([
      text("Account", true),
      text("Description"),
      text("Account Type"),
      text("Formula Type"),
      bool("Allow Input"),
      bool("Is Consolidated"),
      bool("Is IC"),
      bool("Use Alt Input Cur In Flow"),
      text("Plug Account"),
      text("Input View For Adj"),
      text("No Data Zero View For Adj"),
      text("No Data Zero View For Non-Adj"),
      text("Used On Entity Dim"),
      text("Used On Cons Dim"),
      text("Flow Aggregation"),
      text("Origin Aggregation"),
      text("IC Aggregation"),
      text("UD1 Aggregation"),
      text("UD2 Aggregation"),
      text("UD3 Aggregation"),
      text("UD4 Aggregation"),
      text("UD5 Aggregation"),
      text("UD6 Aggregation"),
      text("UD7 Aggregation"),
      text("UD8 Aggregation"),
      text("Flow Constraint"),
      text("IC Constraint"),
      text("IC Member Filter"),
      text("UD1 Constraint"),
      text("UD2 Constraint"),
      text("UD3 Constraint"),
      text("UD4 Constraint"),
      text("UD5 Constraint"),
      text("UD6 Constraint"),
      text("UD7 Constraint"),
      text("UD8 Constraint"),
      text("Workflow Channel"),
      bool("InUse"),
      formula("Formula"),
      formula("Formula For Calc Drill Down"),
      text("Adjustment Type"),
      text("Text1"),
      text("Text2"),
      text("Text3"),
      text("Text4"),
      text("Text5"),
      text("Text6"),
      text("Text7"),
      text("Text8"),
      text("Display Group")
    ]),
    relationshipFields: weightedRelationshipFields,
    booleanFields: ["Allow Input", "Is Consolidated", "Is IC", "Use Alt Input Cur In Flow", "InUse"],
    numericFields: ["Aggregation Weight"],
    requiredFields: ["Dimension Type", "Dimension Name", "Account", "Parent", "Child"],
    duplicateSeverity: "warning"
  },
  Flow: {
    dimensionType: "Flow",
    sheetNames: ["Flow"],
    memberKeyField: "Flow Member",
    memberFields: withoutGenerated([
      text("Flow Member", true),
      text("Description"),
      text("Formula Type"),
      bool("Allow Input"),
      text("Is Consolidated"),
      bool("Switch Sign"),
      text("Switch Type"),
      text("Flow Processing Type"),
      text("Alternate Input Currency"),
      text("Source Member For Alternate Input Currency"),
      bool("In Use"),
      formula("Formula"),
      formula("Formula For Calc Drill Down"),
      text("Text1"),
      text("Text2"),
      text("Text3"),
      text("Text4"),
      text("Text5"),
      text("Text6"),
      text("Text7"),
      text("Text8"),
      text("Display Group")
    ]),
    relationshipFields: weightedRelationshipFields,
    booleanFields: ["Allow Input", "Switch Sign", "In Use"],
    numericFields: ["Aggregation Weight"],
    requiredFields: ["Dimension Type", "Dimension Name", "Flow Member", "Parent", "Child"],
    duplicateSeverity: "warning"
  },
  UD2: createUdSchema("UD2"),
  UD3: { ...createUdSchema("UD3"), sheetNames: ["UD3", "UD3 OUC", "UD3 OUC (2)"] },
  UD4: createUdSchema("UD4"),
  UD5: createUdSchema("UD5"),
  UD6: createUdSchema("UD6"),
  UD7: createUdSchema("UD7"),
  UD8: createUdSchema("UD8")
};

export const supportedDimensionTypes = Object.keys(dimensionSchemas) as DimensionType[];

export function getDimensionSchema(type: DimensionType): DimensionSchema {
  return dimensionSchemas[type];
}

export function getSchemaBySheetName(sheetName: string): DimensionSchema | undefined {
  return supportedDimensionTypes.map(getDimensionSchema).find((schema) => schema.sheetNames.includes(sheetName));
}
```

- [ ] **Step 6: Run test to verify pass**

Run:

```powershell
npm test -- src/test/dimensionSchemas.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/shared src/test
git commit -m "feat: add dimension schema definitions"
```

---

### Task 3: Add SQLite Schema and Repositories

**Files:**
- Create: `src/server/db/schema.ts`
- Create: `src/server/db/database.ts`
- Create: `src/server/db/repositories.ts`
- Modify: `src/test/fixtures.ts`

- [ ] **Step 1: Write database initialization test**

Create `src/test/database.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../server/db/database";
import { createRepositories } from "../server/db/repositories";

describe("database", () => {
  it("creates a project and stores dimensions", () => {
    const db = createDatabase(":memory:");
    const repos = createRepositories(db);
    const project = repos.projects.create({
      name: "Test",
      description: "Import test",
      sourceFileName: "template.xlsx",
      createdBy: "local-admin"
    });

    const dimension = repos.dimensions.create({
      projectId: project.id,
      sheetName: "Scenarios",
      dimensionType: "Scenario",
      dimensionName: "SampleScenario",
      description: "",
      accessGroup: "Everyone",
      maintenanceGroup: "Everyone",
      inheritedDimension: "",
      sortOrder: 1,
      metadata: {}
    });

    expect(repos.dimensions.listByProject(project.id)).toEqual([dimension]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm test -- src/test/database.test.ts
```

Expected: FAIL because database modules do not exist.

- [ ] **Step 3: Implement schema DDL**

Write `src/server/db/schema.ts`:

```ts
export const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_file_name TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dimensions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sheet_name TEXT NOT NULL,
  dimension_type TEXT NOT NULL,
  dimension_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  access_group TEXT NOT NULL DEFAULT '',
  maintenance_group TEXT NOT NULL DEFAULT '',
  inherited_dimension TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dimension_members (
  id TEXT PRIMARY KEY,
  dimension_id TEXT NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
  member_key TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  properties_json TEXT NOT NULL DEFAULT '{}',
  row_order INTEGER NOT NULL,
  source_row_number INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dimension_relationships (
  id TEXT PRIMARY KEY,
  dimension_id TEXT NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
  parent_key TEXT NOT NULL DEFAULT '',
  child_key TEXT NOT NULL DEFAULT '',
  aggregation_weight REAL,
  percent_consol REAL,
  percent_ownership REAL,
  ownership_type TEXT NOT NULL DEFAULT '',
  properties_json TEXT NOT NULL DEFAULT '{}',
  row_order INTEGER NOT NULL,
  source_row_number INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS validation_issues (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dimension_id TEXT NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  field_name TEXT NOT NULL DEFAULT '',
  row_number INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL,
  status TEXT NOT NULL,
  file_url TEXT NOT NULL DEFAULT '',
  validation_summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  snapshot_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_dimensions_project ON dimensions(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_members_dimension ON dimension_members(dimension_id, row_order);
CREATE INDEX IF NOT EXISTS idx_members_key ON dimension_members(dimension_id, member_key);
CREATE INDEX IF NOT EXISTS idx_relationships_dimension ON dimension_relationships(dimension_id, row_order);
CREATE INDEX IF NOT EXISTS idx_relationships_parent_child ON dimension_relationships(dimension_id, parent_key, child_key);
`;
```

- [ ] **Step 4: Implement database connection**

Write `src/server/db/database.ts`:

```ts
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { schemaSql } from "./schema";

export type AppDatabase = Database.Database;

export function createDatabase(filename = "data/app.db"): AppDatabase {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.exec(schemaSql);
  seedSecurity(db);
  return db;
}

function seedSecurity(db: AppDatabase): void {
  const now = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO users (id, display_name, email, created_at) VALUES (?, ?, ?, ?)")
    .run("local-admin", "Local Admin", "local-admin@example.local", now);
  for (const role of ["Viewer", "Editor", "Admin"]) {
    db.prepare("INSERT OR IGNORE INTO roles (id, name) VALUES (?, ?)").run(role.toLowerCase(), role);
  }
  db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)").run("local-admin", "admin");
}
```

- [ ] **Step 5: Implement repositories**

Write `src/server/db/repositories.ts`:

```ts
import { nanoid } from "nanoid";
import type { AppDatabase } from "./database";
import type { DimensionRecord, DimensionType, ProjectRecord } from "../../shared/types";

function now(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function createRepositories(db: AppDatabase) {
  return {
    projects: {
      create(input: { name: string; description: string; sourceFileName: string; createdBy: string }): ProjectRecord {
        const createdAt = now();
        const project: ProjectRecord = {
          id: nanoid(),
          name: input.name,
          description: input.description,
          sourceFileName: input.sourceFileName,
          createdBy: input.createdBy,
          createdAt,
          updatedAt: createdAt
        };
        db.prepare(`
          INSERT INTO projects (id, name, description, source_file_name, created_by, created_at, updated_at)
          VALUES (@id, @name, @description, @sourceFileName, @createdBy, @createdAt, @updatedAt)
        `).run(project);
        return project;
      },
      list(): ProjectRecord[] {
        return db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all().map(mapProject);
      }
    },
    dimensions: {
      create(input: Omit<DimensionRecord, "id" | "createdAt" | "updatedAt">): DimensionRecord {
        const createdAt = now();
        const dimension: DimensionRecord = { id: nanoid(), ...input, createdAt, updatedAt: createdAt };
        db.prepare(`
          INSERT INTO dimensions (
            id, project_id, sheet_name, dimension_type, dimension_name, description, access_group,
            maintenance_group, inherited_dimension, sort_order, metadata_json, created_at, updated_at
          ) VALUES (
            @id, @projectId, @sheetName, @dimensionType, @dimensionName, @description, @accessGroup,
            @maintenanceGroup, @inheritedDimension, @sortOrder, @metadataJson, @createdAt, @updatedAt
          )
        `).run({ ...dimension, metadataJson: JSON.stringify(dimension.metadata) });
        return dimension;
      },
      listByProject(projectId: string): DimensionRecord[] {
        return db.prepare("SELECT * FROM dimensions WHERE project_id = ? ORDER BY sort_order").all(projectId).map(mapDimension);
      }
    }
  };
}

function mapProject(row: any): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sourceFileName: row.source_file_name,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDimension(row: any): DimensionRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    sheetName: row.sheet_name,
    dimensionType: row.dimension_type as DimensionType,
    dimensionName: row.dimension_name,
    description: row.description,
    accessGroup: row.access_group,
    maintenanceGroup: row.maintenance_group,
    inheritedDimension: row.inherited_dimension,
    sortOrder: row.sort_order,
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
```

- [ ] **Step 6: Run database test**

Run:

```powershell
npm test -- src/test/database.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/server/db src/test/database.test.ts
git commit -m "feat: add sqlite persistence"
```

---

### Task 4: Implement Workbook Import Parser

**Files:**
- Create: `src/shared/workbookParser.ts`
- Create: `src/test/workbookParser.test.ts`

- [ ] **Step 1: Write parser tests**

Write `src/test/workbookParser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseWorkbook } from "../shared/workbookParser";

describe("workbook parser", () => {
  it("imports all supported sheets from the supplied template", async () => {
    const parsed = await parseWorkbook("XF Dimensions Template - 29.04.2026.xlsx", {
      projectName: "XF Dimensions Template",
      createdBy: "local-admin"
    });

    expect(parsed.importSummary.dimensionsImported).toBe(12);
    expect(parsed.dimensions.map((dimension) => dimension.sheetName)).toContain("UD3 OUC");
    expect(parsed.members.length).toBeGreaterThan(32000);
    expect(parsed.relationships.some((relationship) => relationship.parentKey === "Root")).toBe(true);
    expect(parsed.importSummary.errors).toEqual([]);
  }, 120000);

  it("ignores generated XML columns", async () => {
    const parsed = await parseWorkbook("XF Dimensions Template - 29.04.2026.xlsx", {
      projectName: "XF Dimensions Template",
      createdBy: "local-admin"
    });
    const scenarioMember = parsed.members.find((member) => member.dimensionId === parsed.dimensions[0].id);
    expect(Object.keys(scenarioMember?.properties ?? {})).not.toContain("Begin Members");
  }, 120000);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm test -- src/test/workbookParser.test.ts
```

Expected: FAIL because `workbookParser.ts` does not exist.

- [ ] **Step 3: Implement parser**

Write `src/shared/workbookParser.ts`:

```ts
import ExcelJS from "exceljs";
import { nanoid } from "nanoid";
import { getDimensionSchema, getSchemaBySheetName } from "./dimensionSchemas";
import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  DimensionSchema,
  ParsedProject,
  ProjectRecord
} from "./types";
import { isBlankValue, isFormulaError, normalizeCellValue, normalizeHeader } from "./text";

interface ParseOptions {
  projectName: string;
  createdBy: string;
}

export async function parseWorkbook(filePath: string, options: ParseOptions): Promise<ParsedProject> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const createdAt = new Date().toISOString();
  const project: ProjectRecord = {
    id: nanoid(),
    name: options.projectName,
    description: "",
    sourceFileName: filePath.split(/[\\/]/).pop() ?? filePath,
    createdBy: options.createdBy,
    createdAt,
    updatedAt: createdAt
  };
  const dimensions: DimensionRecord[] = [];
  const members: DimensionMemberRecord[] = [];
  const relationships: DimensionRelationshipRecord[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  let skippedBlankRows = 0;

  workbook.worksheets.forEach((sheet, index) => {
    const dimensionType = normalizeCellValue(sheet.getCell("B1").value);
    const schema = getSchemaBySheetName(sheet.name) ?? getSchemaByTypeText(dimensionType);
    if (!schema) {
      warnings.push(`Skipped unsupported sheet ${sheet.name}`);
      return;
    }

    const dimension: DimensionRecord = {
      id: nanoid(),
      projectId: project.id,
      sheetName: sheet.name,
      dimensionType: schema.dimensionType,
      dimensionName: normalizeCellValue(sheet.getCell("B2").value),
      description: normalizeCellValue(sheet.getCell("B3").value),
      accessGroup: normalizeCellValue(sheet.getCell("B4").value),
      maintenanceGroup: normalizeCellValue(sheet.getCell("B5").value),
      inheritedDimension: normalizeCellValue(sheet.getCell("B6").value),
      sortOrder: index + 1,
      metadata: {},
      createdAt,
      updatedAt: createdAt
    };
    dimensions.push(dimension);

    const memberHeaderRow = findMemberHeaderRow(sheet, schema);
    const relationshipHeaderRow = findRelationshipHeaderRow(sheet);
    if (!memberHeaderRow) {
      errors.push(`Sheet ${sheet.name} has no member header row`);
      return;
    }

    const memberHeaders = readHeaders(sheet, memberHeaderRow, schema.memberFields.map((field) => field.name));
    const memberEndRow = relationshipHeaderRow ? relationshipHeaderRow - 1 : sheet.rowCount;
    for (let rowNumber = memberHeaderRow + 1; rowNumber <= memberEndRow; rowNumber += 1) {
      const rowValues = readRow(sheet, rowNumber, memberHeaders);
      if (isGeneratedOnly(rowValues)) {
        skippedBlankRows += 1;
        continue;
      }
      const memberKey = normalizeCellValue(rowValues[schema.memberKeyField]);
      const meaningful = hasMeaningfulValues(rowValues);
      if (!memberKey && !meaningful) {
        skippedBlankRows += 1;
        continue;
      }
      if (!memberKey && meaningful) {
        warnings.push(`Sheet ${sheet.name} row ${rowNumber} has values but no member key`);
        continue;
      }
      members.push({
        id: nanoid(),
        dimensionId: dimension.id,
        memberKey,
        description: normalizeCellValue(rowValues.Description),
        properties: rowValues,
        rowOrder: members.filter((member) => member.dimensionId === dimension.id).length + 1,
        sourceRowNumber: rowNumber,
        isActive: true,
        createdAt,
        updatedAt: createdAt
      });
    }

    if (relationshipHeaderRow) {
      const relationshipHeaders = readHeaders(sheet, relationshipHeaderRow, schema.relationshipFields.map((field) => field.name));
      for (let rowNumber = relationshipHeaderRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const rowValues = readRow(sheet, rowNumber, relationshipHeaders);
        const parentKey = normalizeCellValue(rowValues.Parent);
        const childKey = normalizeCellValue(rowValues.Child);
        if (!parentKey && !childKey && !hasMeaningfulValues(rowValues)) {
          skippedBlankRows += 1;
          continue;
        }
        if (!parentKey || !childKey) {
          warnings.push(`Sheet ${sheet.name} relationship row ${rowNumber} is missing Parent or Child`);
          continue;
        }
        relationships.push({
          id: nanoid(),
          dimensionId: dimension.id,
          parentKey,
          childKey,
          aggregationWeight: parseOptionalNumber(rowValues["Aggregation Weight"]),
          percentConsol: parseOptionalNumber(rowValues["Percent Consol"]),
          percentOwnership: parseOptionalNumber(rowValues["Percent Ownership"]),
          ownershipType: normalizeCellValue(rowValues["Ownership Type"]),
          properties: rowValues,
          rowOrder: relationships.filter((relationship) => relationship.dimensionId === dimension.id).length + 1,
          sourceRowNumber: rowNumber,
          createdAt,
          updatedAt: createdAt
        });
      }
    }
  });

  return {
    project,
    dimensions,
    members,
    relationships,
    importSummary: {
      sheetsDetected: workbook.worksheets.length,
      dimensionsImported: dimensions.length,
      membersImported: members.length,
      relationshipsImported: relationships.length,
      skippedBlankRows,
      warnings,
      errors
    }
  };
}

function getSchemaByTypeText(value: string): DimensionSchema | undefined {
  if (!value) return undefined;
  try {
    return getDimensionSchema(value as any);
  } catch {
    return undefined;
  }
}

function findMemberHeaderRow(sheet: ExcelJS.Worksheet, schema: DimensionSchema): number | null {
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 20); rowNumber += 1) {
    if (normalizeHeader(sheet.getRow(rowNumber).getCell(1).value) === schema.memberKeyField) return rowNumber;
  }
  return null;
}

function findRelationshipHeaderRow(sheet: ExcelJS.Worksheet): number | null {
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (normalizeHeader(row.getCell(1).value) === "Parent" && normalizeHeader(row.getCell(2).value) === "Child") return rowNumber;
  }
  return null;
}

function readHeaders(sheet: ExcelJS.Worksheet, rowNumber: number, allowedHeaders: string[]): string[] {
  const allowed = new Set(allowedHeaders);
  const headers: string[] = [];
  const row = sheet.getRow(rowNumber);
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    const header = normalizeHeader(row.getCell(column).value);
    if (!header || header.startsWith("=") || header === "Begin Members" || header === "Begin Relationships") continue;
    if (allowed.has(header)) headers[column - 1] = header;
  }
  return headers;
}

function readRow(sheet: ExcelJS.Worksheet, rowNumber: number, headers: string[]): Record<string, string> {
  const row = sheet.getRow(rowNumber);
  const values: Record<string, string> = {};
  headers.forEach((header, zeroIndex) => {
    if (!header) return;
    const value = normalizeCellValue(row.getCell(zeroIndex + 1).value);
    values[header] = isFormulaError(value) ? "" : value;
  });
  return values;
}

function hasMeaningfulValues(values: Record<string, string>): boolean {
  return Object.values(values).some((value) => !isBlankValue(value) && !isFormulaError(value));
}

function isGeneratedOnly(values: Record<string, string>): boolean {
  return Object.keys(values).length === 0;
}

function parseOptionalNumber(value: unknown): number | null {
  const normalized = normalizeCellValue(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
```

- [ ] **Step 4: Run parser tests**

Run:

```powershell
npm test -- src/test/workbookParser.test.ts
```

Expected: PASS within 120 seconds.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/shared/workbookParser.ts src/test/workbookParser.test.ts
git commit -m "feat: parse OneStream dimension workbook"
```

---

### Task 5: Implement Validation and Hierarchy Engines

**Files:**
- Create: `src/shared/validationEngine.ts`
- Create: `src/shared/hierarchy.ts`
- Create: `src/test/validationEngine.test.ts`
- Create: `src/test/hierarchy.test.ts`

- [ ] **Step 1: Write validation tests**

Write `src/test/validationEngine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateDimension } from "../shared/validationEngine";
import { sampleProject, sampleScenarioDimension } from "./fixtures";

describe("validation engine", () => {
  it("detects duplicate members and missing relationship children", () => {
    const issues = validateDimension({
      project: sampleProject,
      dimension: sampleScenarioDimension,
      members: [
        { id: "m1", dimensionId: "dim-scenario", memberKey: "Actual", description: "", properties: { Entity: "Actual" }, rowOrder: 1, sourceRowNumber: 9, isActive: true, createdAt: "", updatedAt: "" },
        { id: "m2", dimensionId: "dim-scenario", memberKey: "Actual", description: "", properties: { Entity: "Actual" }, rowOrder: 2, sourceRowNumber: 10, isActive: true, createdAt: "", updatedAt: "" }
      ],
      relationships: [
        { id: "r1", dimensionId: "dim-scenario", parentKey: "Root", childKey: "Forecast", aggregationWeight: null, percentConsol: null, percentOwnership: null, ownershipType: "", properties: {}, rowOrder: 1, sourceRowNumber: 16, createdAt: "", updatedAt: "" }
      ],
      duplicateSeverity: "warning"
    });

    expect(issues.map((issue) => issue.code)).toContain("DUPLICATE_MEMBER");
    expect(issues.map((issue) => issue.code)).toContain("UNKNOWN_RELATIONSHIP_CHILD");
  });
});
```

Write `src/test/hierarchy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { analyzeHierarchy } from "../shared/hierarchy";

describe("hierarchy", () => {
  it("detects cycles and duplicate parent-child relationships", () => {
    const result = analyzeHierarchy([
      { parentKey: "A", childKey: "B", id: "r1" },
      { parentKey: "B", childKey: "A", id: "r2" },
      { parentKey: "A", childKey: "B", id: "r3" }
    ]);

    expect(result.hasCycle).toBe(true);
    expect(result.duplicateRelationshipIds).toEqual(["r3"]);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm test -- src/test/validationEngine.test.ts src/test/hierarchy.test.ts
```

Expected: FAIL because validation and hierarchy modules do not exist.

- [ ] **Step 3: Implement hierarchy analysis**

Write `src/shared/hierarchy.ts`:

```ts
export interface HierarchyRelationshipInput {
  id: string;
  parentKey: string;
  childKey: string;
}

export interface HierarchyAnalysis {
  hasCycle: boolean;
  duplicateRelationshipIds: string[];
  missingParentKeys: string[];
  missingChildKeys: string[];
  orphanMemberKeys: string[];
}

export function analyzeHierarchy(
  relationships: HierarchyRelationshipInput[],
  memberKeys: string[] = []
): HierarchyAnalysis {
  const seen = new Set<string>();
  const duplicateRelationshipIds: string[] = [];
  const childrenByParent = new Map<string, string[]>();
  const incoming = new Set<string>();
  const knownMembers = new Set(memberKeys);

  for (const relationship of relationships) {
    const pair = `${relationship.parentKey}\u0000${relationship.childKey}`;
    if (seen.has(pair)) duplicateRelationshipIds.push(relationship.id);
    seen.add(pair);
    if (!childrenByParent.has(relationship.parentKey)) childrenByParent.set(relationship.parentKey, []);
    childrenByParent.get(relationship.parentKey)?.push(relationship.childKey);
    incoming.add(relationship.childKey);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  let hasCycle = false;

  function visit(node: string): void {
    if (visiting.has(node)) {
      hasCycle = true;
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const child of childrenByParent.get(node) ?? []) visit(child);
    visiting.delete(node);
    visited.add(node);
  }

  for (const parent of childrenByParent.keys()) visit(parent);

  const referencedParents = new Set(relationships.map((relationship) => relationship.parentKey));
  const referencedChildren = new Set(relationships.map((relationship) => relationship.childKey));
  const missingParentKeys = [...referencedParents].filter((key) => key !== "Root" && knownMembers.size > 0 && !knownMembers.has(key));
  const missingChildKeys = [...referencedChildren].filter((key) => knownMembers.size > 0 && !knownMembers.has(key));
  const reachable = new Set<string>();
  const roots = [...referencedParents].filter((key) => !incoming.has(key));
  roots.forEach((root) => collectReachable(root, childrenByParent, reachable));
  const orphanMemberKeys = [...knownMembers].filter((key) => relationships.length > 0 && !reachable.has(key));

  return { hasCycle, duplicateRelationshipIds, missingParentKeys, missingChildKeys, orphanMemberKeys };
}

function collectReachable(node: string, childrenByParent: Map<string, string[]>, reachable: Set<string>): void {
  if (reachable.has(node)) return;
  reachable.add(node);
  for (const child of childrenByParent.get(node) ?? []) collectReachable(child, childrenByParent, reachable);
}
```

- [ ] **Step 4: Implement validation engine**

Write `src/shared/validationEngine.ts`:

```ts
import { nanoid } from "nanoid";
import { getDimensionSchema } from "./dimensionSchemas";
import { analyzeHierarchy } from "./hierarchy";
import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  ProjectRecord,
  Severity,
  ValidationIssue
} from "./types";
import { normalizeCellValue } from "./text";

interface ValidateDimensionInput {
  project: ProjectRecord;
  dimension: DimensionRecord;
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
  duplicateSeverity?: Severity;
}

export function validateDimension(input: ValidateDimensionInput): ValidationIssue[] {
  const schema = getDimensionSchema(input.dimension.dimensionType);
  const issues: ValidationIssue[] = [];
  const createdAt = new Date().toISOString();
  const duplicateSeverity = input.duplicateSeverity ?? schema.duplicateSeverity;

  function issue(params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">): void {
    issues.push({
      id: nanoid(),
      projectId: input.project.id,
      dimensionId: input.dimension.id,
      createdAt,
      ...params
    });
  }

  if (!input.dimension.dimensionType) {
    issue({ entityType: "dimension", entityId: input.dimension.id, severity: "error", code: "DIMENSION_TYPE_REQUIRED", message: "Dimension Type is required.", fieldName: "Dimension Type", rowNumber: 1 });
  }
  if (!input.dimension.dimensionName) {
    issue({ entityType: "dimension", entityId: input.dimension.id, severity: "error", code: "DIMENSION_NAME_REQUIRED", message: "Dimension Name is required.", fieldName: "Dimension Name", rowNumber: 2 });
  }

  const memberCounts = new Map<string, DimensionMemberRecord[]>();
  for (const member of input.members) {
    if (!member.memberKey) {
      issue({ entityType: "member", entityId: member.id, severity: "error", code: "MEMBER_KEY_REQUIRED", message: "Member key is required.", fieldName: schema.memberKeyField, rowNumber: member.sourceRowNumber });
    }
    memberCounts.set(member.memberKey, [...(memberCounts.get(member.memberKey) ?? []), member]);
    for (const fieldName of schema.booleanFields) validateBooleanField(member, fieldName, issue);
    for (const fieldName of schema.numericFields) validateNumericField(member, fieldName, issue);
  }

  for (const [memberKey, duplicates] of memberCounts) {
    if (memberKey && duplicates.length > 1) {
      duplicates.forEach((member) => {
        issue({ entityType: "member", entityId: member.id, severity: duplicateSeverity, code: "DUPLICATE_MEMBER", message: `Member '${memberKey}' appears more than once in this dimension.`, fieldName: schema.memberKeyField, rowNumber: member.sourceRowNumber });
      });
    }
  }

  const localMembers = new Set(input.members.map((member) => member.memberKey).filter(Boolean));
  for (const relationship of input.relationships) {
    if (!relationship.parentKey) {
      issue({ entityType: "relationship", entityId: relationship.id, severity: "error", code: "RELATIONSHIP_PARENT_REQUIRED", message: "Relationship Parent is required.", fieldName: "Parent", rowNumber: relationship.sourceRowNumber });
    }
    if (!relationship.childKey) {
      issue({ entityType: "relationship", entityId: relationship.id, severity: "error", code: "RELATIONSHIP_CHILD_REQUIRED", message: "Relationship Child is required.", fieldName: "Child", rowNumber: relationship.sourceRowNumber });
    }
    if (relationship.childKey && !localMembers.has(relationship.childKey) && !input.dimension.inheritedDimension) {
      issue({ entityType: "relationship", entityId: relationship.id, severity: "warning", code: "UNKNOWN_RELATIONSHIP_CHILD", message: `Relationship child '${relationship.childKey}' does not exist in local members.`, fieldName: "Child", rowNumber: relationship.sourceRowNumber });
    }
  }

  const hierarchy = analyzeHierarchy(input.relationships, [...localMembers]);
  if (hierarchy.hasCycle) {
    issue({ entityType: "dimension", entityId: input.dimension.id, severity: "error", code: "CIRCULAR_HIERARCHY", message: "Hierarchy contains a circular parent-child reference.", fieldName: "Relationships", rowNumber: null });
  }
  for (const duplicateId of hierarchy.duplicateRelationshipIds) {
    issue({ entityType: "relationship", entityId: duplicateId, severity: "warning", code: "DUPLICATE_RELATIONSHIP", message: "Duplicate parent-child relationship.", fieldName: "Parent/Child", rowNumber: null });
  }

  return issues;
}

function validateBooleanField(
  member: DimensionMemberRecord,
  fieldName: string,
  issue: (params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">) => void
): void {
  const value = normalizeCellValue(member.properties[fieldName]);
  if (!value) return;
  if (!["true", "false"].includes(value.toLowerCase())) {
    issue({ entityType: "member", entityId: member.id, severity: "error", code: "INVALID_BOOLEAN", message: `${fieldName} must be TRUE or FALSE.`, fieldName, rowNumber: member.sourceRowNumber });
  }
}

function validateNumericField(
  member: DimensionMemberRecord,
  fieldName: string,
  issue: (params: Omit<ValidationIssue, "id" | "projectId" | "dimensionId" | "createdAt">) => void
): void {
  const value = normalizeCellValue(member.properties[fieldName]);
  if (!value) return;
  if (!Number.isFinite(Number(value))) {
    issue({ entityType: "member", entityId: member.id, severity: "error", code: "INVALID_NUMBER", message: `${fieldName} must be numeric.`, fieldName, rowNumber: member.sourceRowNumber });
  }
}
```

- [ ] **Step 5: Run validation and hierarchy tests**

Run:

```powershell
npm test -- src/test/validationEngine.test.ts src/test/hierarchy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/shared/validationEngine.ts src/shared/hierarchy.ts src/test/validationEngine.test.ts src/test/hierarchy.test.ts
git commit -m "feat: validate dimensions and hierarchies"
```

---

### Task 6: Implement XML, CSV, JSON, and XLSX Exporters

**Files:**
- Create: `src/shared/xmlExport.ts`
- Create: `src/shared/csvJsonExport.ts`
- Create: `src/shared/xlsxExport.ts`
- Create: `src/test/xmlExport.test.ts`

- [ ] **Step 1: Write XML export tests**

Write `src/test/xmlExport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { exportProjectXml } from "../shared/xmlExport";
import { sampleProject, sampleScenarioDimension } from "./fixtures";

describe("xml export", () => {
  it("generates OneStream wrapper and escapes XML values", () => {
    const xml = exportProjectXml({
      project: sampleProject,
      dimensions: [sampleScenarioDimension],
      members: [{
        id: "m1",
        dimensionId: sampleScenarioDimension.id,
        memberKey: "Actual",
        description: "A&B <Actual>",
        properties: { Entity: "Actual", Description: "A&B <Actual>", Text1: "quoted \"text\"" },
        rowOrder: 1,
        sourceRowNumber: 9,
        isActive: true,
        createdAt: "",
        updatedAt: ""
      }],
      relationships: [{ id: "r1", dimensionId: sampleScenarioDimension.id, parentKey: "Root", childKey: "Actual", aggregationWeight: null, percentConsol: null, percentOwnership: null, ownershipType: "", properties: {}, rowOrder: 1, sourceRowNumber: 16, createdAt: "", updatedAt: "" }]
    });

    expect(xml).toContain('<OneStreamXF version="5.0.0.9826">');
    expect(xml).toContain('type="Scenario"');
    expect(xml).toContain('A&amp;B &lt;Actual&gt;');
    expect(xml).not.toContain("#NAME?");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm test -- src/test/xmlExport.test.ts
```

Expected: FAIL because exporter modules do not exist.

- [ ] **Step 3: Implement XML exporter**

Write `src/shared/xmlExport.ts`:

```ts
import { getDimensionSchema } from "./dimensionSchemas";
import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord, ProjectRecord } from "./types";
import { escapeXml, isFormulaError, normalizeCellValue } from "./text";

interface ExportProjectXmlInput {
  project: ProjectRecord;
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}

export function exportProjectXml(input: ExportProjectXmlInput): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<OneStreamXF version="5.0.0.9826">',
    "  <metadataRoot>",
    "    <dimensions>"
  ];

  for (const dimension of input.dimensions) {
    lines.push(`      <dimension type="${escapeXml(dimension.dimensionType)}" name="${escapeXml(dimension.dimensionName)}" description="${escapeXml(dimension.description)}" accessGroup="${escapeXml(dimension.accessGroup)}" maintenanceGroup="${escapeXml(dimension.maintenanceGroup)}" inheritedDim="${escapeXml(dimension.inheritedDimension)}">`);
    lines.push("        <members>");
    for (const member of input.members.filter((candidate) => candidate.dimensionId === dimension.id && candidate.memberKey)) {
      lines.push(renderMember(dimension, member));
    }
    lines.push("        </members>");
    lines.push("        <relationships>");
    for (const relationship of input.relationships.filter((candidate) => candidate.dimensionId === dimension.id && candidate.parentKey && candidate.childKey)) {
      lines.push(renderRelationship(dimension, relationship));
    }
    lines.push("        </relationships>");
    lines.push("      </dimension>");
  }

  lines.push("    </dimensions>", "  </metadataRoot>", "</OneStreamXF>");
  return lines.join("\n");
}

function renderMember(dimension: DimensionRecord, member: DimensionMemberRecord): string {
  const schema = getDimensionSchema(dimension.dimensionType);
  const attrs = schema.memberFields
    .map((field) => [field.name, normalizeCellValue(member.properties[field.name])] as const)
    .filter(([, value]) => value && !isFormulaError(value))
    .map(([name, value]) => `${toXmlAttributeName(name)}="${escapeXml(value)}"`)
    .join(" ");
  return `          <member ${attrs} />`;
}

function renderRelationship(dimension: DimensionRecord, relationship: DimensionRelationshipRecord): string {
  const schema = getDimensionSchema(dimension.dimensionType);
  const properties = { ...relationship.properties, Parent: relationship.parentKey, Child: relationship.childKey };
  const attrs = schema.relationshipFields
    .map((field) => [field.name, normalizeCellValue(properties[field.name])] as const)
    .filter(([, value]) => value && !isFormulaError(value))
    .map(([name, value]) => `${toXmlAttributeName(name)}="${escapeXml(value)}"`)
    .join(" ");
  return `          <relationship ${attrs} />`;
}

function toXmlAttributeName(fieldName: string): string {
  return fieldName
    .replace(/#/g, "Number")
    .replace(/&/g, "And")
    .replace(/[^A-Za-z0-9]+(.)/g, (_, character: string) => character.toUpperCase())
    .replace(/[^A-Za-z0-9]/g, "")
    .replace(/^([A-Z])/, (character) => character.toLowerCase());
}
```

- [ ] **Step 4: Implement CSV and JSON exporters**

Write `src/shared/csvJsonExport.ts`:

```ts
import type { DimensionMemberRecord, DimensionRelationshipRecord, ParsedProject } from "./types";
import { normalizeCellValue } from "./text";

export function exportJsonBackup(parsed: ParsedProject): string {
  return JSON.stringify(parsed, null, 2);
}

export function exportMembersCsv(members: DimensionMemberRecord[]): string {
  return toCsv(members.map((member) => ({ memberKey: member.memberKey, description: member.description, ...member.properties })));
}

export function exportRelationshipsCsv(relationships: DimensionRelationshipRecord[]): string {
  return toCsv(relationships.map((relationship) => ({ parentKey: relationship.parentKey, childKey: relationship.childKey, ...relationship.properties })));
}

function toCsv(rows: Record<string, unknown>[]): string {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => quoteCsv(normalizeCellValue(row[header]))).join(","));
  }
  return lines.join("\n");
}

function quoteCsv(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
```

- [ ] **Step 5: Implement XLSX exporter**

Write `src/shared/xlsxExport.ts`:

```ts
import ExcelJS from "exceljs";
import { getDimensionSchema } from "./dimensionSchemas";
import type { DimensionMemberRecord, DimensionRecord, DimensionRelationshipRecord } from "./types";

export async function exportWorkbook(
  filePath: string,
  dimensions: DimensionRecord[],
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  for (const dimension of dimensions) {
    const schema = getDimensionSchema(dimension.dimensionType);
    const sheet = workbook.addWorksheet(dimension.sheetName);
    sheet.getCell("A1").value = "Dimension Type:";
    sheet.getCell("B1").value = dimension.dimensionType;
    sheet.getCell("A2").value = "Dimension Name:";
    sheet.getCell("B2").value = dimension.dimensionName;
    sheet.getCell("A3").value = "Description";
    sheet.getCell("B3").value = dimension.description;
    sheet.getCell("A4").value = "Access Group";
    sheet.getCell("B4").value = dimension.accessGroup;
    sheet.getCell("A5").value = "Maintenance Group";
    sheet.getCell("B5").value = dimension.maintenanceGroup;
    sheet.getCell("A6").value = "Inherited Dimension";
    sheet.getCell("B6").value = dimension.inheritedDimension;

    schema.memberFields.forEach((field, index) => {
      sheet.getRow(8).getCell(index + 1).value = field.name;
    });
    const localMembers = members.filter((member) => member.dimensionId === dimension.id && member.memberKey);
    localMembers.forEach((member, memberIndex) => {
      const row = sheet.getRow(9 + memberIndex);
      schema.memberFields.forEach((field, fieldIndex) => {
        row.getCell(fieldIndex + 1).value = String(member.properties[field.name] ?? "");
      });
    });

    const relationshipHeaderRow = 10 + localMembers.length;
    schema.relationshipFields.forEach((field, index) => {
      sheet.getRow(relationshipHeaderRow).getCell(index + 1).value = field.name;
    });
    relationships.filter((relationship) => relationship.dimensionId === dimension.id).forEach((relationship, relationshipIndex) => {
      const row = sheet.getRow(relationshipHeaderRow + 1 + relationshipIndex);
      const values = { ...relationship.properties, Parent: relationship.parentKey, Child: relationship.childKey };
      schema.relationshipFields.forEach((field, fieldIndex) => {
        row.getCell(fieldIndex + 1).value = String(values[field.name] ?? "");
      });
    });
  }
  await workbook.xlsx.writeFile(filePath);
}
```

- [ ] **Step 6: Run exporter tests**

Run:

```powershell
npm test -- src/test/xmlExport.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/shared/xmlExport.ts src/shared/csvJsonExport.ts src/shared/xlsxExport.ts src/test/xmlExport.test.ts
git commit -m "feat: export metadata formats"
```

---

### Task 7: Implement Backend API

**Files:**
- Create: `src/server/app.ts`
- Create: `src/server/index.ts`
- Create: `src/server/routes/projects.ts`
- Create: `src/server/routes/import.ts`
- Create: `src/server/routes/export.ts`
- Create: `src/server/routes/validation.ts`
- Modify: `src/server/db/repositories.ts`

- [ ] **Step 1: Extend repositories for members, relationships, issues, audit, and snapshots**

Add repository methods in `src/server/db/repositories.ts`:

```ts
// Add inside createRepositories return object.
members: {
  bulkInsert(records) {
    const stmt = db.prepare(`
      INSERT INTO dimension_members (
        id, dimension_id, member_key, description, properties_json, row_order,
        source_row_number, is_active, created_at, updated_at
      ) VALUES (
        @id, @dimensionId, @memberKey, @description, @propertiesJson, @rowOrder,
        @sourceRowNumber, @isActive, @createdAt, @updatedAt
      )
    `);
    const insert = db.transaction((items) => {
      for (const item of items) stmt.run({ ...item, propertiesJson: JSON.stringify(item.properties), isActive: item.isActive ? 1 : 0 });
    });
    insert(records);
  }
},
relationships: {
  bulkInsert(records) {
    const stmt = db.prepare(`
      INSERT INTO dimension_relationships (
        id, dimension_id, parent_key, child_key, aggregation_weight, percent_consol,
        percent_ownership, ownership_type, properties_json, row_order, source_row_number,
        created_at, updated_at
      ) VALUES (
        @id, @dimensionId, @parentKey, @childKey, @aggregationWeight, @percentConsol,
        @percentOwnership, @ownershipType, @propertiesJson, @rowOrder, @sourceRowNumber,
        @createdAt, @updatedAt
      )
    `);
    const insert = db.transaction((items) => {
      for (const item of items) stmt.run({ ...item, propertiesJson: JSON.stringify(item.properties) });
    });
    insert(records);
  }
}
```

- [ ] **Step 2: Implement Express app**

Write `src/server/app.ts`:

```ts
import cors from "cors";
import express from "express";
import { createDatabase } from "./db/database";
import { createRepositories } from "./db/repositories";
import { createProjectRouter } from "./routes/projects";
import { createImportRouter } from "./routes/import";
import { createExportRouter } from "./routes/export";
import { createValidationRouter } from "./routes/validation";

export function createApp() {
  const app = express();
  const db = createDatabase();
  const repos = createRepositories(db);
  app.use(cors());
  app.use(express.json({ limit: "25mb" }));
  app.use("/api/projects", createProjectRouter(repos));
  app.use("/api/import", createImportRouter(repos));
  app.use("/api/export", createExportRouter(repos));
  app.use("/api/validation", createValidationRouter(repos));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  return app;
}
```

Write `src/server/index.ts`:

```ts
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 8787);
createApp().listen(port, "127.0.0.1", () => {
  console.log(`OneStream XF Dimension Builder API listening on http://127.0.0.1:${port}`);
});
```

- [ ] **Step 3: Implement routes**

Write `src/server/routes/projects.ts`:

```ts
import { Router } from "express";

export function createProjectRouter(repos: any): Router {
  const router = Router();
  router.get("/", (_req, res) => res.json(repos.projects.list()));
  router.get("/:projectId/dimensions", (req, res) => res.json(repos.dimensions.listByProject(req.params.projectId)));
  return router;
}
```

Write `src/server/routes/import.ts`:

```ts
import { Router } from "express";
import multer from "multer";
import { mkdirSync } from "node:fs";
import { parseWorkbook } from "../../shared/workbookParser";

mkdirSync("data/uploads", { recursive: true });
const upload = multer({ dest: "data/uploads" });

export function createImportRouter(repos: any): Router {
  const router = Router();
  router.post("/workbook", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "file is required" });
      const parsed = await parseWorkbook(req.file.path, { projectName: req.body.projectName || req.file.originalname, createdBy: "local-admin" });
      const project = repos.projects.create({
        name: parsed.project.name,
        description: parsed.project.description,
        sourceFileName: req.file.originalname,
        createdBy: "local-admin"
      });
      const idMap = new Map<string, string>();
      for (const dimension of parsed.dimensions) {
        const saved = repos.dimensions.create({ ...dimension, projectId: project.id });
        idMap.set(dimension.id, saved.id);
      }
repos.members.bulkInsert(parsed.members.map((member: any) => ({ ...member, dimensionId: idMap.get(member.dimensionId) })));
repos.relationships.bulkInsert(parsed.relationships.map((relationship: any) => ({ ...relationship, dimensionId: idMap.get(relationship.dimensionId) })));
      res.json({ project, importSummary: parsed.importSummary });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
```

Write `src/server/routes/export.ts`:

```ts
import { Router } from "express";
import { mkdirSync, writeFileSync } from "node:fs";
import { exportProjectXml } from "../../shared/xmlExport";

mkdirSync("data/exports", { recursive: true });

export function createExportRouter(repos: any): Router {
  const router = Router();
  router.post("/:projectId/xml", (req, res) => {
    const project = repos.projects.list().find((candidate: any) => candidate.id === req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const relationships = repos.relationships.listByProject(project.id);
    const xml = exportProjectXml({ project, dimensions, members, relationships });
    const filePath = `data/exports/${project.id}.xml`;
    writeFileSync(filePath, xml, "utf-8");
    res.type("application/xml").send(xml);
  });
  return router;
}
```

Write `src/server/routes/validation.ts`:

```ts
import { Router } from "express";
import { validateDimension } from "../../shared/validationEngine";

export function createValidationRouter(repos: any): Router {
  const router = Router();
  router.post("/:projectId/run", (req, res) => {
    const project = repos.projects.list().find((candidate: any) => candidate.id === req.params.projectId);
    if (!project) return res.status(404).json({ error: "project not found" });
    const dimensions = repos.dimensions.listByProject(project.id);
    const members = repos.members.listByProject(project.id);
    const relationships = repos.relationships.listByProject(project.id);
    const issues = dimensions.flatMap((dimension: any) => validateDimension({
      project,
      dimension,
      members: members.filter((member: any) => member.dimensionId === dimension.id),
      relationships: relationships.filter((relationship: any) => relationship.dimensionId === dimension.id)
    }));
    res.json({ issues });
  });
  return router;
}
```

- [ ] **Step 4: Verify server starts**

Run:

```powershell
npm run server
```

Expected: API logs `http://127.0.0.1:8787`. In another terminal run:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8787/api/health
```

Expected: JSON contains `"ok":true`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/server
git commit -m "feat: add metadata api"
```

---

### Task 8: Add Grid Data APIs and Edit Persistence

**Files:**
- Modify: `src/server/db/repositories.ts`
- Modify: `src/server/routes/projects.ts`
- Create: `src/test/repositoryEditing.test.ts`

- [ ] **Step 1: Write repository editing test**

Write `src/test/repositoryEditing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../server/db/database";
import { createRepositories } from "../server/db/repositories";

describe("grid editing repositories", () => {
  it("lists and updates member rows by dimension", () => {
    const db = createDatabase(":memory:");
    const repos = createRepositories(db);
    const project = repos.projects.create({ name: "Test", description: "", sourceFileName: "template.xlsx", createdBy: "local-admin" });
    const dimension = repos.dimensions.create({
      projectId: project.id,
      sheetName: "Scenarios",
      dimensionType: "Scenario",
      dimensionName: "SampleScenario",
      description: "",
      accessGroup: "Everyone",
      maintenanceGroup: "Everyone",
      inheritedDimension: "",
      sortOrder: 1,
      metadata: {}
    });
    repos.members.bulkInsert([{
      id: "member-1",
      dimensionId: dimension.id,
      memberKey: "Actual",
      description: "Actual scenario",
      properties: { Entity: "Actual", Description: "Actual scenario" },
      rowOrder: 1,
      sourceRowNumber: 9,
      isActive: true,
      createdAt: "2026-05-16T00:00:00.000Z",
      updatedAt: "2026-05-16T00:00:00.000Z"
    }]);

    repos.members.update("member-1", { memberKey: "Actuals", properties: { Entity: "Actuals", Description: "Actual scenario" } });

    expect(repos.members.listByDimension(dimension.id, { offset: 0, limit: 50 })[0].memberKey).toBe("Actuals");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm test -- src/test/repositoryEditing.test.ts
```

Expected: FAIL because list/update methods are missing.

- [ ] **Step 3: Add member repository list/update methods**

Extend the `members` repository in `src/server/db/repositories.ts`:

```ts
listByDimension(dimensionId: string, paging: { offset: number; limit: number }) {
  return db.prepare(`
    SELECT * FROM dimension_members
    WHERE dimension_id = ? AND is_active = 1
    ORDER BY row_order
    LIMIT ? OFFSET ?
  `).all(dimensionId, paging.limit, paging.offset).map(mapMember);
},
listByProject(projectId: string) {
  return db.prepare(`
    SELECT m.* FROM dimension_members m
    JOIN dimensions d ON d.id = m.dimension_id
    WHERE d.project_id = ? AND m.is_active = 1
    ORDER BY d.sort_order, m.row_order
  `).all(projectId).map(mapMember);
},
update(id: string, input: { memberKey: string; properties: Record<string, unknown> }) {
  const updatedAt = now();
  const description = String(input.properties.Description ?? "");
  db.prepare(`
    UPDATE dimension_members
    SET member_key = ?, description = ?, properties_json = ?, updated_at = ?
    WHERE id = ?
  `).run(input.memberKey, description, JSON.stringify(input.properties), updatedAt, id);
}
```

Add mapper:

```ts
function mapMember(row: any) {
  return {
    id: row.id,
    dimensionId: row.dimension_id,
    memberKey: row.member_key,
    description: row.description,
    properties: parseJson(row.properties_json, {}),
    rowOrder: row.row_order,
    sourceRowNumber: row.source_row_number,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
```

- [ ] **Step 4: Add relationship repository list/update methods**

Extend the `relationships` repository in `src/server/db/repositories.ts`:

```ts
listByDimension(dimensionId: string, paging: { offset: number; limit: number }) {
  return db.prepare(`
    SELECT * FROM dimension_relationships
    WHERE dimension_id = ?
    ORDER BY row_order
    LIMIT ? OFFSET ?
  `).all(dimensionId, paging.limit, paging.offset).map(mapRelationship);
},
listByProject(projectId: string) {
  return db.prepare(`
    SELECT r.* FROM dimension_relationships r
    JOIN dimensions d ON d.id = r.dimension_id
    WHERE d.project_id = ?
    ORDER BY d.sort_order, r.row_order
  `).all(projectId).map(mapRelationship);
},
update(id: string, input: { parentKey: string; childKey: string; properties: Record<string, unknown> }) {
  const updatedAt = now();
  db.prepare(`
    UPDATE dimension_relationships
    SET parent_key = ?, child_key = ?, properties_json = ?, updated_at = ?
    WHERE id = ?
  `).run(input.parentKey, input.childKey, JSON.stringify(input.properties), updatedAt, id);
}
```

Add mapper:

```ts
function mapRelationship(row: any) {
  return {
    id: row.id,
    dimensionId: row.dimension_id,
    parentKey: row.parent_key,
    childKey: row.child_key,
    aggregationWeight: row.aggregation_weight,
    percentConsol: row.percent_consol,
    percentOwnership: row.percent_ownership,
    ownershipType: row.ownership_type,
    properties: parseJson(row.properties_json, {}),
    rowOrder: row.row_order,
    sourceRowNumber: row.source_row_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
```

- [ ] **Step 5: Add grid endpoints**

Modify `src/server/routes/projects.ts`:

```ts
router.get("/:projectId/dimensions/:dimensionId/members", (req, res) => {
  const offset = Number(req.query.offset ?? 0);
  const limit = Number(req.query.limit ?? 200);
  res.json(repos.members.listByDimension(req.params.dimensionId, { offset, limit }));
});

router.patch("/:projectId/members/:memberId", (req, res) => {
  repos.members.update(req.params.memberId, req.body);
  res.json({ ok: true });
});

router.get("/:projectId/dimensions/:dimensionId/relationships", (req, res) => {
  const offset = Number(req.query.offset ?? 0);
  const limit = Number(req.query.limit ?? 200);
  res.json(repos.relationships.listByDimension(req.params.dimensionId, { offset, limit }));
});

router.patch("/:projectId/relationships/:relationshipId", (req, res) => {
  repos.relationships.update(req.params.relationshipId, req.body);
  res.json({ ok: true });
});
```

- [ ] **Step 6: Run repository editing test**

Run:

```powershell
npm test -- src/test/repositoryEditing.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/server/db/repositories.ts src/server/routes/projects.ts src/test/repositoryEditing.test.ts
git commit -m "feat: persist grid edits"
```

---

### Task 9: Build React App Shell and Dashboard

**Files:**
- Create: `src/client/main.tsx`
- Create: `src/client/App.tsx`
- Create: `src/client/styles.css`
- Create: `src/client/api/client.ts`
- Create: `src/client/state/useProjectStore.ts`
- Create: `src/client/components/AppShell.tsx`
- Create: `src/client/components/Dashboard.tsx`

- [ ] **Step 1: Implement API client**

Write `src/client/api/client.ts`:

```ts
export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body ?? {})
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}
```

- [ ] **Step 2: Implement store**

Write `src/client/state/useProjectStore.ts`:

```ts
import { useEffect, useState } from "react";
import { apiGet } from "../api/client";
import type { DimensionRecord, ProjectRecord } from "../../shared/types";

export function useProjects() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiGet<ProjectRecord[]>("/projects").then(setProjects).finally(() => setLoading(false));
  }, []);
  return { projects, loading, refresh: () => apiGet<ProjectRecord[]>("/projects").then(setProjects) };
}

export function useDimensions(projectId: string | null) {
  const [dimensions, setDimensions] = useState<DimensionRecord[]>([]);
  useEffect(() => {
    if (!projectId) return;
    apiGet<DimensionRecord[]>(`/projects/${projectId}/dimensions`).then(setDimensions);
  }, [projectId]);
  return { dimensions, setDimensions };
}
```

- [ ] **Step 3: Implement app shell**

Write `src/client/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Write `src/client/App.tsx`:

```tsx
import { AppShell } from "./components/AppShell";

export function App() {
  return <AppShell />;
}
```

Write `src/client/components/AppShell.tsx`:

```tsx
import { Database, Download, FileUp, RotateCcw, Save, ShieldCheck, Undo2 } from "lucide-react";
import { useState } from "react";
import { Dashboard } from "./Dashboard";
import { DimensionWorkspace } from "./DimensionWorkspace";
import { useDimensions, useProjects } from "../state/useProjectStore";

export function AppShell() {
  const { projects, loading } = useProjects();
  const [projectId, setProjectId] = useState<string | null>(null);
  const selectedProjectId = projectId ?? projects[0]?.id ?? null;
  const { dimensions } = useDimensions(selectedProjectId);
  const [activeDimensionId, setActiveDimensionId] = useState<string | null>(null);
  const activeDimension = dimensions.find((dimension) => dimension.id === activeDimensionId) ?? dimensions[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><Database size={18} /> OneStream XF</div>
        <div className="sidebar-label">Dimensions</div>
        {dimensions.map((dimension) => (
          <button key={dimension.id} className={`nav-item ${activeDimension?.id === dimension.id ? "selected" : ""}`} onClick={() => setActiveDimensionId(dimension.id)}>
            {dimension.sheetName}
          </button>
        ))}
      </aside>
      <main className="main">
        <header className="toolbar">
          <div>
            <strong>Dimension Builder</strong>
            <span>{loading ? "Loading" : projects[0]?.name ?? "No project imported"}</span>
          </div>
          <div className="toolbar-actions">
            <button><FileUp size={16} /> Import</button>
            <button><ShieldCheck size={16} /> Validate</button>
            <button><Download size={16} /> Export</button>
            <button><Save size={16} /> Save</button>
            <button><Undo2 size={16} /></button>
            <button><RotateCcw size={16} /></button>
          </div>
        </header>
        {activeDimension ? <DimensionWorkspace dimension={activeDimension} /> : <Dashboard projects={projects} dimensions={dimensions} />}
      </main>
    </div>
  );
}
```

Write `src/client/components/Dashboard.tsx`:

```tsx
import type { DimensionRecord, ProjectRecord } from "../../shared/types";

export function Dashboard({ projects, dimensions }: { projects: ProjectRecord[]; dimensions: DimensionRecord[] }) {
  return (
    <section className="dashboard">
      <div className="metric"><strong>{dimensions.length}</strong><span>Total dimensions</span></div>
      <div className="metric"><strong>{projects.length}</strong><span>Projects</span></div>
      <div className="metric"><strong>0</strong><span>Blocking errors</span></div>
      <div className="metric"><strong>Ready</strong><span>Export status</span></div>
    </section>
  );
}
```

- [ ] **Step 4: Add enterprise styling**

Write `src/client/styles.css` with restrained enterprise styling:

```css
:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #111827;
  background: #eef2f7;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; min-height: 100vh; }
button { font: inherit; }
.app-shell { min-height: 100vh; display: grid; grid-template-columns: 248px 1fr; background: #eef2f7; }
.sidebar { background: #101827; color: #dbeafe; padding: 18px 14px; }
.brand { display: flex; align-items: center; gap: 9px; font-weight: 750; margin-bottom: 24px; }
.sidebar-label { color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
.nav-item { width: 100%; border: 0; background: transparent; color: #dbeafe; text-align: left; padding: 9px 10px; border-radius: 6px; cursor: pointer; }
.nav-item.selected, .nav-item:hover { background: #243145; }
.main { min-width: 0; display: flex; flex-direction: column; }
.toolbar { height: 60px; background: #fff; border-bottom: 1px solid #d8dee7; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; }
.toolbar span { margin-left: 12px; color: #64748b; font-size: 13px; }
.toolbar-actions { display: flex; gap: 8px; align-items: center; }
.toolbar-actions button { border: 1px solid #cbd5e1; background: #fff; color: #111827; border-radius: 6px; padding: 8px 10px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.dashboard { padding: 18px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.metric { background: #fff; border: 1px solid #d8dee7; border-radius: 8px; padding: 16px; display: grid; gap: 6px; }
.metric strong { font-size: 26px; }
.metric span { color: #64748b; font-size: 13px; }
```

- [ ] **Step 5: Verify frontend starts**

Run:

```powershell
npm run dev
```

Expected: Vite serves the app at `http://127.0.0.1:5173` and the API serves at `http://127.0.0.1:8787`.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/client
git commit -m "feat: add enterprise app shell"
```

---

### Task 10: Build Workspace Tabs, Metadata Editor, Grids, Hierarchy, XML Preview, and Issues

**Files:**
- Create: `src/client/components/DimensionWorkspace.tsx`
- Create: `src/client/components/MetadataEditor.tsx`
- Create: `src/client/components/EditableGrid.tsx`
- Create: `src/client/components/HierarchyTree.tsx`
- Create: `src/client/components/XmlPreview.tsx`
- Create: `src/client/components/IssuePanel.tsx`
- Modify: `src/client/styles.css`

- [ ] **Step 1: Implement workspace tabs**

Write `src/client/components/DimensionWorkspace.tsx`:

```tsx
import { useState } from "react";
import type { DimensionRecord } from "../../shared/types";
import { MetadataEditor } from "./MetadataEditor";
import { EditableGrid } from "./EditableGrid";
import { HierarchyTree } from "./HierarchyTree";
import { XmlPreview } from "./XmlPreview";
import { IssuePanel } from "./IssuePanel";

const tabs = ["Overview", "Members", "Relationships", "Hierarchy", "XML Preview", "Issues"] as const;

export function DimensionWorkspace({ dimension }: { dimension: DimensionRecord }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  return (
    <section className="workspace">
      <div className="workspace-header">
        <div><h1>{dimension.sheetName}</h1><span>{dimension.dimensionType} / {dimension.dimensionName}</span></div>
        <div className="status-strip"><b>0</b> blocking errors</div>
      </div>
      <nav className="tabs">
        {tabs.map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
      </nav>
      <div className="workspace-grid">
        <div className="workspace-main">
          {tab === "Overview" && <MetadataEditor dimension={dimension} />}
          {tab === "Members" && <EditableGrid kind="members" dimension={dimension} />}
          {tab === "Relationships" && <EditableGrid kind="relationships" dimension={dimension} />}
          {tab === "Hierarchy" && <HierarchyTree dimension={dimension} />}
          {tab === "XML Preview" && <XmlPreview dimension={dimension} />}
          {tab === "Issues" && <IssuePanel dimension={dimension} expanded />}
        </div>
        <IssuePanel dimension={dimension} />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Implement metadata editor**

Write `src/client/components/MetadataEditor.tsx`:

```tsx
import type { DimensionRecord } from "../../shared/types";

export function MetadataEditor({ dimension }: { dimension: DimensionRecord }) {
  const fields = [
    ["Dimension Type", dimension.dimensionType],
    ["Dimension Name", dimension.dimensionName],
    ["Description", dimension.description],
    ["Access Group", dimension.accessGroup],
    ["Maintenance Group", dimension.maintenanceGroup],
    ["Inherited Dimension", dimension.inheritedDimension]
  ];
  return (
    <div className="panel form-panel">
      {fields.map(([label, value]) => (
        <label key={label}>
          <span>{label}</span>
          <input value={value} readOnly />
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Implement virtualized grid shell**

Write `src/client/components/EditableGrid.tsx`:

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { getDimensionSchema } from "../../shared/dimensionSchemas";
import type { DimensionRecord } from "../../shared/types";

export function EditableGrid({ kind, dimension }: { kind: "members" | "relationships"; dimension: DimensionRecord }) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const schema = getDimensionSchema(dimension.dimensionType);
  const columns = kind === "members" ? schema.memberFields : schema.relationshipFields;
  const rows = useMemo(() => Array.from({ length: 1000 }, (_, index) => ({ id: index, rowNumber: index + 1 })), []);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => 34 });

  return (
    <div className="panel grid-panel">
      <div className="grid-toolbar">
        <input placeholder={`Search ${kind}`} />
        <button>Add row</button>
        <button>Duplicate</button>
        <button>Delete</button>
        <button>Columns</button>
      </div>
      <div className="data-grid" ref={parentRef}>
        <div className="grid-header" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(150px, 1fr))` }}>
      {columns.map((column) => <div key={column.name}>{column.name}{column.required ? " *" : ""}</div>)}
        </div>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((item) => (
            <div key={item.key} className="grid-row" style={{ transform: `translateY(${item.start}px)`, gridTemplateColumns: `repeat(${columns.length}, minmax(150px, 1fr))` }}>
              {columns.map((column) => <input key={column.name} aria-label={column.name} defaultValue={item.index === 0 && column.required ? "Root" : ""} onBlur={(event) => console.log("cell edited", column.name, event.currentTarget.value)} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement hierarchy, XML, and issue panels**

Write `src/client/components/HierarchyTree.tsx`:

```tsx
import type { DimensionRecord } from "../../shared/types";

export function HierarchyTree({ dimension }: { dimension: DimensionRecord }) {
  return (
    <div className="panel">
      <input className="wide-input" placeholder={`Search ${dimension.sheetName} hierarchy`} />
      <div className="tree">
        <div>Root</div>
        <div className="tree-child">Imported members render here after project data loads.</div>
      </div>
    </div>
  );
}
```

Write `src/client/components/XmlPreview.tsx`:

```tsx
import type { DimensionRecord } from "../../shared/types";

export function XmlPreview({ dimension }: { dimension: DimensionRecord }) {
  return (
    <div className="panel">
      <div className="grid-toolbar"><button>Copy</button><button>Download XML</button></div>
      <pre className="xml-preview">{`<dimension type="${dimension.dimensionType}" name="${dimension.dimensionName}">\n  <members />\n  <relationships />\n</dimension>`}</pre>
    </div>
  );
}
```

Write `src/client/components/IssuePanel.tsx`:

```tsx
import type { DimensionRecord } from "../../shared/types";

export function IssuePanel({ dimension, expanded = false }: { dimension: DimensionRecord; expanded?: boolean }) {
  return (
    <aside className={expanded ? "panel issue-panel expanded" : "panel issue-panel"}>
      <h2>Validation</h2>
      <div className="issue warning">Duplicate member severity is warning by default.</div>
      <div className="issue info">Inherited dimension context is visible during export.</div>
    </aside>
  );
}
```

- [ ] **Step 5: Add workspace CSS**

Append to `src/client/styles.css`:

```css
.workspace { min-width: 0; display: flex; flex-direction: column; }
.workspace-header { background: #fff; border-bottom: 1px solid #d8dee7; padding: 16px 18px; display: flex; align-items: center; justify-content: space-between; }
.workspace-header h1 { margin: 0; font-size: 22px; line-height: 1.2; }
.workspace-header span { color: #64748b; font-size: 13px; }
.status-strip { border: 1px solid #d8dee7; border-radius: 6px; padding: 8px 10px; background: #f8fafc; font-size: 13px; }
.tabs { display: flex; gap: 2px; padding: 0 18px; background: #fff; border-bottom: 1px solid #d8dee7; }
.tabs button { border: 0; background: transparent; padding: 12px 10px; cursor: pointer; color: #475569; border-bottom: 2px solid transparent; }
.tabs button.active { color: #1d4ed8; border-color: #1d4ed8; font-weight: 700; }
.workspace-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; padding: 14px; min-height: calc(100vh - 140px); }
.workspace-main { min-width: 0; }
.panel { background: #fff; border: 1px solid #d8dee7; border-radius: 8px; padding: 14px; min-width: 0; }
.form-panel { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.form-panel label { display: grid; gap: 5px; font-size: 12px; color: #475569; }
.form-panel input, .wide-input, .grid-toolbar input, .grid-row input { border: 1px solid #cbd5e1; border-radius: 5px; padding: 8px; font: inherit; min-width: 0; }
.grid-panel { padding: 0; overflow: hidden; }
.grid-toolbar { display: flex; gap: 8px; align-items: center; padding: 10px; border-bottom: 1px solid #d8dee7; }
.grid-toolbar button { border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; padding: 7px 9px; }
.data-grid { height: calc(100vh - 240px); overflow: auto; }
.grid-header, .grid-row { display: grid; min-width: max-content; }
.grid-header { position: sticky; top: 0; z-index: 2; background: #eef2f7; font-size: 12px; font-weight: 700; color: #334155; }
.grid-header div, .grid-row input { height: 34px; border: 0; border-right: 1px solid #d8dee7; border-bottom: 1px solid #e5e7eb; border-radius: 0; }
.grid-header div { padding: 9px; }
.grid-row { position: absolute; left: 0; right: 0; }
.xml-preview { margin: 0; overflow: auto; background: #0f172a; color: #dbeafe; padding: 14px; border-radius: 6px; min-height: 360px; }
.tree { margin-top: 14px; font-size: 14px; line-height: 1.8; }
.tree-child { margin-left: 20px; color: #64748b; }
.issue-panel h2 { margin: 0 0 10px; font-size: 16px; }
.issue { border-left: 4px solid #94a3b8; padding: 9px; margin-bottom: 8px; background: #f8fafc; font-size: 13px; }
.issue.warning { border-left-color: #f59e0b; background: #fffbeb; }
.issue.info { border-left-color: #2563eb; background: #eff6ff; }
@media (max-width: 900px) {
  .app-shell { grid-template-columns: 1fr; }
  .sidebar { display: none; }
  .workspace-grid { grid-template-columns: 1fr; }
  .form-panel { grid-template-columns: 1fr; }
}
```

- [ ] **Step 6: Verify UI renders**

Run:

```powershell
npm run dev
```

Expected: browser shows dashboard or workspace with no console crash.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/client/components src/client/styles.css
git commit -m "feat: add dimension workspace UI"
```

---

### Task 11: Wire Import, Validation, Export, and Grid Edit Workflows Into UI

**Files:**
- Create: `src/client/components/ImportExportModals.tsx`
- Modify: `src/client/components/AppShell.tsx`
- Modify: `src/client/api/client.ts`
- Modify: `src/client/components/EditableGrid.tsx`

- [ ] **Step 1: Add file upload helper**

Modify `src/client/api/client.ts`:

```ts
export async function uploadWorkbook(file: File, projectName: string): Promise<{ project: unknown; importSummary: unknown }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("projectName", projectName);
  const response = await fetch("/api/import/workbook", { method: "POST", body: formData });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
```

- [ ] **Step 2: Add row fetch and patch helpers**

Modify `src/client/api/client.ts`:

```ts
import type { DimensionMemberRecord, DimensionRelationshipRecord } from "../../shared/types";

export async function fetchMembers(projectId: string, dimensionId: string, offset = 0, limit = 200): Promise<DimensionMemberRecord[]> {
  return apiGet<DimensionMemberRecord[]>(`/projects/${projectId}/dimensions/${dimensionId}/members?offset=${offset}&limit=${limit}`);
}

export async function fetchRelationships(projectId: string, dimensionId: string, offset = 0, limit = 200): Promise<DimensionRelationshipRecord[]> {
  return apiGet<DimensionRelationshipRecord[]>(`/projects/${projectId}/dimensions/${dimensionId}/relationships?offset=${offset}&limit=${limit}`);
}

export async function patchMember(projectId: string, memberId: string, body: { memberKey: string; properties: Record<string, unknown> }): Promise<void> {
  await fetch(`/api/projects/${projectId}/members/${memberId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export async function patchRelationship(projectId: string, relationshipId: string, body: { parentKey: string; childKey: string; properties: Record<string, unknown> }): Promise<void> {
  await fetch(`/api/projects/${projectId}/relationships/${relationshipId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
```

- [ ] **Step 3: Bind editable grid to API data**

Modify `src/client/components/EditableGrid.tsx` so it accepts `projectId` and uses server rows:

```tsx
const [records, setRecords] = useState<Array<DimensionMemberRecord | DimensionRelationshipRecord>>([]);
useEffect(() => {
  if (kind === "members") fetchMembers(projectId, dimension.id).then(setRecords);
  if (kind === "relationships") fetchRelationships(projectId, dimension.id).then(setRecords);
}, [kind, projectId, dimension.id]);

async function saveCell(record: any, fieldName: string, value: string) {
  const properties = { ...record.properties, [fieldName]: value };
  if (kind === "members") {
    const memberKey = fieldName === schema.memberKeyField ? value : record.memberKey;
    await patchMember(projectId, record.id, { memberKey, properties });
  } else {
    const parentKey = fieldName === "Parent" ? value : record.parentKey;
    const childKey = fieldName === "Child" ? value : record.childKey;
    await patchRelationship(projectId, record.id, { parentKey, childKey, properties });
  }
}
```

In the cell input:

```tsx
<input
  key={column.name}
  aria-label={column.name}
  defaultValue={String((record as any).properties?.[column.name] ?? "")}
  onBlur={(event) => saveCell(record, column.name, event.currentTarget.value)}
/>
```

- [ ] **Step 4: Implement modal components**

Write `src/client/components/ImportExportModals.tsx`:

```tsx
import { useState } from "react";
import { uploadWorkbook } from "../api/client";

export function ImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Import XLSX Template</h2>
        <input type="file" accept=".xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button disabled={!file} onClick={async () => {
            if (!file) return;
            setStatus("Importing workbook...");
            await uploadWorkbook(file, file.name.replace(/\.xlsx$/i, ""));
            setStatus("Import complete");
            onImported();
            onClose();
          }}>Import</button>
        </div>
        {status && <p>{status}</p>}
      </div>
    </div>
  );
}

export function ExportModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string | null }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Export Metadata</h2>
        <button disabled={!projectId} onClick={() => projectId && window.open(`/api/export/${projectId}/xml`, "_blank")}>Download XML</button>
        <div className="modal-actions"><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire modals in app shell**

Modify `src/client/components/AppShell.tsx`:

```tsx
// Add imports:
import { ImportModal, ExportModal } from "./ImportExportModals";

// Add state inside component:
const [importOpen, setImportOpen] = useState(false);
const [exportOpen, setExportOpen] = useState(false);

// Replace Import button:
<button onClick={() => setImportOpen(true)}><FileUp size={16} /> Import</button>

// Replace Export button:
<button onClick={() => setExportOpen(true)}><Download size={16} /> Export</button>

// Add before closing main div:
<ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => window.location.reload()} />
<ExportModal open={exportOpen} onClose={() => setExportOpen(false)} projectId={selectedProjectId} />
```

- [ ] **Step 6: Add modal CSS**

Append to `src/client/styles.css`:

```css
.modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.42); display: grid; place-items: center; z-index: 50; }
.modal { width: min(520px, calc(100vw - 32px)); background: #fff; border-radius: 8px; border: 1px solid #cbd5e1; box-shadow: 0 24px 70px rgba(15, 23, 42, 0.28); padding: 18px; }
.modal h2 { margin: 0 0 14px; font-size: 18px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.modal button { border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; padding: 8px 10px; }
.modal button:not(:disabled):last-child { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
```

- [ ] **Step 7: Manual workflow check**

Run:

```powershell
npm run dev
```

Use browser:

1. Open `http://127.0.0.1:5173`.
2. Click Import.
3. Select `XF Dimensions Template - 29.04.2026.xlsx`.
4. Confirm import summary returns.
5. Validate that dimension sidebar lists imported dimensions.
6. Click Export and download XML.

Expected: import completes, sidebar updates, export returns XML.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/client
git commit -m "feat: wire import export and grid editing"
```

---

### Task 12: Verification, Performance Pass, and Final Polish

**Files:**
- Modify: `src/client/styles.css`
- Modify: route/component files touched by verification findings
- Create: `data/uploads/.gitkeep`
- Create: `data/exports/.gitkeep`

- [ ] **Step 1: Add data directory keep files**

Create:

```text
data/uploads/.gitkeep
data/exports/.gitkeep
```

- [ ] **Step 2: Run unit tests**

Run:

```powershell
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Run production build**

Run:

```powershell
npm run build
```

Expected: TypeScript and Vite build complete without errors.

- [ ] **Step 4: Verify workbook import with actual template**

Run:

```powershell
npm run dev
```

In the UI, import:

```text
XF Dimensions Template - 29.04.2026.xlsx
```

Expected import summary:

- `dimensionsImported` is `12`.
- `membersImported` is greater than `32000`.
- `errors` is an empty array or only contains issues that are shown in the UI.
- Large UD3 dimension grid remains scrollable.

- [ ] **Step 5: Verify export**

In the UI:

1. Run Validate.
2. Open XML Preview.
3. Export XML.
4. Confirm XML begins with `<?xml version="1.0" encoding="utf-8"?>`.
5. Confirm XML contains `<OneStreamXF version="5.0.0.9826">`.
6. Confirm XML does not contain `#NAME?`.

- [ ] **Step 6: Visual QA**

Check desktop at `1366x768` and mobile at `390x844`:

- No overlapping toolbar controls.
- Sidebar dimension names fit or truncate cleanly.
- Grid header remains readable.
- Right issue panel collapses below content on mobile.
- Buttons have visible hover/focus states.
- Text does not overflow cards, tabs, buttons, or cells.

- [ ] **Step 7: Commit**

Run:

```powershell
git add .
git commit -m "test: verify workbook workflows"
```

---

## Plan Self-Review

Spec coverage:

- Product architecture: covered in Tasks 1, 3, 7, 8.
- Data model: covered in Task 3.
- Import strategy: covered in Task 4 and Task 10.
- Export strategy: covered in Task 6 and Task 10.
- Validation rules: covered in Task 5.
- UI wireframe plan: covered in Tasks 8, 9, 10.
- Performance requirements: covered through parser tests, SQLite indexes, and virtualized grid shell.
- Acceptance criteria: verified in Task 11.

Known implementation focus:

- The first XML mapper centralizes field-to-attribute naming and emits the required OneStream wrapper. A known-good OneStream XML sample can refine exact attribute names in one module.
- Real production authentication is intentionally out of scope for this local-first implementation.
- Grid editing is covered by repository update tests, grid data APIs, and bound cell `onBlur` persistence in Tasks 8 and 11.
