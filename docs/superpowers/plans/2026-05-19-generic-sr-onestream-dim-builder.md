# Generic SR Onestream Dim Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the app from an Excel-centered metadata viewer into **SR Onestream Dim Builder**, a generic OneStream dimension builder that can create app-authored projects from central YAML blueprints and export XML from the information users add.

**Architecture:** Keep the current record model and XML exporter. Add dimension blueprint config to `config/dimbuilder.yaml`, add a server-side blueprint project creator that seeds dimensions/root members into the existing repositories, expose project creation through `/api/projects`, and update the client narrative so XLSX is an optional seed workflow.

**Tech Stack:** TypeScript, React 18, Express, better-sqlite3, Vitest, Vite, YAML config.

---

## File Structure

- Modify `config/dimbuilder.yaml`: rename app identity and add central `dimensions.blueprints`.
- Modify `index.html`: browser title becomes `SR Onestream Dim Builder`.
- Modify `src/shared/appConfigTypes.ts`: add typed dimension blueprint config.
- Modify `src/shared/appConfigDefaults.ts`: add identity and default blueprints.
- Modify `src/shared/appConfigValidation.ts`: validate blueprint dimension types, member key fields, root members, and relationship defaults.
- Modify `src/server/db/repositories.ts`: add a safe project delete helper for rollback during failed blueprint creation.
- Create `src/server/projectBlueprints.ts`: create app-authored projects from config blueprints.
- Modify `src/server/routes/projects.ts`: add `POST /api/projects` for blank metadata projects and pass config into the router.
- Modify `src/server/app.ts`: pass app config to the project router.
- Modify `src/client/api/client.ts`: add a `createProject` API helper.
- Modify `src/client/components/AppShell.tsx`: add New Project flow, generic brand/title/copy, and "Seed from XLSX".
- Modify `src/client/components/Dashboard.tsx`: generic no-project and project-source copy.
- Modify `src/client/components/ImportExportModals.tsx`: add `CreateProjectModal` and rename the workbook modal to seed-from-XLSX copy.
- Modify `src/client/ui/viewModel.ts`: update no-project export disabled reason.
- Modify tests in `src/test/appConfig.test.ts`, `src/test/clientComponentsMarkup.test.ts`, `src/test/clientUiViewModel.test.ts`, `src/test/notionDesignSystem.test.ts`.
- Create `src/test/projectBlueprints.test.ts`: prove blueprint-created projects can be edited/exported.
- Create `src/test/projectRoutes.test.ts`: prove `POST /api/projects` creates a blueprint-backed project.

## Task 1: App Identity And Blueprint Config

**Files:**
- Modify: `config/dimbuilder.yaml`
- Modify: `index.html`
- Modify: `src/shared/appConfigTypes.ts`
- Modify: `src/shared/appConfigDefaults.ts`
- Modify: `src/shared/appConfigValidation.ts`
- Test: `src/test/appConfig.test.ts`
- Test: `src/test/notionDesignSystem.test.ts`

- [ ] **Step 1: Write failing config and identity tests**

In `src/test/appConfig.test.ts`, replace the identity test and add blueprint validation tests:

```ts
  it("defaults to the SR Onestream builder identity", () => {
    expect(defaultAppConfig.application.productName).toBe("SR Onestream Dim Builder");
    expect(defaultAppConfig.application.title).toBe("SR Onestream Dim Builder");
    expect(defaultAppConfig.export.xlsx.creator).toBe("SR Onestream Dim Builder");
    expect(defaultAppConfig.ui.defaultWorkspaceTab).toBe("Members");
  });

  it("loads dimension blueprint configuration", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: {
            defaultDimensionName: "Corporate Accounts",
            rootMembers: ["Root", "Net Income"],
            memberKeyField: "Account",
            relationshipDefaults: { aggregationWeight: 1 },
            allowMultipleParents: true
          }
        }
      }
    });

    expect(validateAppConfig(config).dimensions.blueprints.Account).toEqual({
      defaultDimensionName: "Corporate Accounts",
      rootMembers: ["Root", "Net Income"],
      memberKeyField: "Account",
      relationshipDefaults: { aggregationWeight: 1 },
      allowMultipleParents: true
    });
  });

  it("rejects unknown dimension types in blueprints", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          BadDim: {
            defaultDimensionName: "Bad",
            rootMembers: ["Root"],
            memberKeyField: "Member",
            relationshipDefaults: {},
            allowMultipleParents: false
          }
        }
      }
    });

    expect(() => validateAppConfig(config)).toThrow("Unknown dimension type 'BadDim'");
  });

  it("rejects blueprint member key fields outside the dimension schema", () => {
    const config = mergeAppConfig(defaultAppConfig, {
      dimensions: {
        blueprints: {
          Account: {
            defaultDimensionName: "Accounts",
            rootMembers: ["Root"],
            memberKeyField: "Bad Field",
            relationshipDefaults: { aggregationWeight: 1 },
            allowMultipleParents: true
          }
        }
      }
    });

    expect(() => validateAppConfig(config)).toThrow("Blueprint for 'Account' uses unsupported memberKeyField 'Bad Field'.");
  });
```

In `src/test/notionDesignSystem.test.ts`, update the browser identity test:

```ts
  it("uses SR Onestream Dim Builder as the browser-facing app identity", () => {
    expect(html).toContain("<title>SR Onestream Dim Builder</title>");
  });
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
npm.cmd test -- src/test/appConfig.test.ts src/test/notionDesignSystem.test.ts
```

Expected: FAIL because the identity is still `DimBuilder`, `dimensions.blueprints` is not typed/defaulted, and blueprint validation does not exist.

- [ ] **Step 3: Add blueprint types**

In `src/shared/appConfigTypes.ts`, add this interface above `DimensionsConfig`:

```ts
export interface DimensionBlueprintConfig {
  defaultDimensionName: string;
  rootMembers: string[];
  memberKeyField: string;
  relationshipDefaults: {
    aggregationWeight?: number;
    percentConsol?: number;
    percentOwnership?: number;
    ownershipType?: string;
  };
  allowMultipleParents: boolean;
}
```

Then add this property to `DimensionsConfig`:

```ts
  blueprints: Partial<Record<DimensionType, DimensionBlueprintConfig>>;
```

- [ ] **Step 4: Update default identity and default blueprints**

In `src/shared/appConfigDefaults.ts`, set these values:

```ts
  application: {
    productName: "SR Onestream Dim Builder",
    applicationName: "Local",
    title: "SR Onestream Dim Builder",
    description: "Build, validate, preview, and export OneStream dimension metadata.",
    environmentName: "Local",
    oneStreamVersionFallback: "9.2.0.18004",
    supportText: "Create or seed a metadata project"
  },
```

In the same file, change the XLSX creator:

```ts
    creator: "SR Onestream Dim Builder"
```

Add `blueprints` inside the existing `dimensions` object:

```ts
    blueprints: {
      Scenario: {
        defaultDimensionName: "Scenarios",
        rootMembers: ["Root"],
        memberKeyField: "Entity",
        relationshipDefaults: {},
        allowMultipleParents: true
      },
      Entity: {
        defaultDimensionName: "Entities",
        rootMembers: ["Root"],
        memberKeyField: "Entity",
        relationshipDefaults: {
          percentConsol: 100,
          percentOwnership: 100,
          ownershipType: "FullConsolidation"
        },
        allowMultipleParents: true
      },
      Account: {
        defaultDimensionName: "Accounts",
        rootMembers: ["Root"],
        memberKeyField: "Account",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      Flow: {
        defaultDimensionName: "Flow",
        rootMembers: ["Root"],
        memberKeyField: "Flow Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      UD1: {
        defaultDimensionName: "UD1",
        rootMembers: ["Root"],
        memberKeyField: "Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      UD2: {
        defaultDimensionName: "UD2",
        rootMembers: ["Root"],
        memberKeyField: "Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      UD3: {
        defaultDimensionName: "UD3",
        rootMembers: ["Root"],
        memberKeyField: "Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      UD4: {
        defaultDimensionName: "UD4",
        rootMembers: ["Root"],
        memberKeyField: "Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      UD5: {
        defaultDimensionName: "UD5",
        rootMembers: ["Root"],
        memberKeyField: "Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      UD6: {
        defaultDimensionName: "UD6",
        rootMembers: ["Root"],
        memberKeyField: "Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      UD7: {
        defaultDimensionName: "UD7",
        rootMembers: ["Root"],
        memberKeyField: "Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      },
      UD8: {
        defaultDimensionName: "UD8",
        rootMembers: ["Root"],
        memberKeyField: "Member",
        relationshipDefaults: { aggregationWeight: 1 },
        allowMultipleParents: true
      }
    }
```

- [ ] **Step 5: Update YAML and browser title**

In `config/dimbuilder.yaml`, mirror the same identity values and add the same `dimensions.blueprints` map. Keep the existing `enabledTypes`, `displayOrder`, aliases, import settings, validation settings, and export settings.

In `index.html`, replace the title with:

```html
<title>SR Onestream Dim Builder</title>
```

- [ ] **Step 6: Validate blueprints**

In `src/shared/appConfigValidation.ts`, change the dimension schema import:

```ts
import { getDimensionSchema, supportedDimensionTypes } from "./dimensionSchemas";
```

Add blueprint keys to the existing dimension-map validation loop:

```ts
  for (const type of [
    ...Object.keys(config.dimensions.sheetAliases),
    ...Object.keys(config.dimensions.preferredMetadataNames),
    ...Object.keys(config.dimensions.blueprints)
  ]) {
    if (!isSupportedDimensionType(type)) {
      throw new Error(`Unknown dimension type '${type}' in configuration.`);
    }
  }
```

Add this validation block before the severity loop:

```ts
  const supportedRelationshipDefaultKeys = new Set([
    "aggregationWeight",
    "percentConsol",
    "percentOwnership",
    "ownershipType"
  ]);

  for (const [type, blueprint] of Object.entries(config.dimensions.blueprints)) {
    if (!isSupportedDimensionType(type)) continue;
    const schema = getDimensionSchema(type);
    const supportedMemberFields = new Set(schema.memberFields.map((field) => field.name));

    if (!blueprint.defaultDimensionName.trim()) {
      throw new Error(`Blueprint for '${type}' must define defaultDimensionName.`);
    }
    if (!Array.isArray(blueprint.rootMembers) || blueprint.rootMembers.some((member) => !member.trim())) {
      throw new Error(`Blueprint for '${type}' must define non-empty rootMembers.`);
    }
    if (!supportedMemberFields.has(blueprint.memberKeyField)) {
      throw new Error(`Blueprint for '${type}' uses unsupported memberKeyField '${blueprint.memberKeyField}'.`);
    }
    for (const key of Object.keys(blueprint.relationshipDefaults)) {
      if (!supportedRelationshipDefaultKeys.has(key)) {
        throw new Error(`Blueprint for '${type}' uses unsupported relationship default '${key}'.`);
      }
    }
  }
```

- [ ] **Step 7: Run focused tests**

Run:

```powershell
npm.cmd test -- src/test/appConfig.test.ts src/test/notionDesignSystem.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

Run:

```powershell
git add config/dimbuilder.yaml index.html src/shared/appConfigTypes.ts src/shared/appConfigDefaults.ts src/shared/appConfigValidation.ts src/test/appConfig.test.ts src/test/notionDesignSystem.test.ts
git commit -m "feat: add SR builder blueprint config"
```

## Task 2: Blueprint Project Creation Service

**Files:**
- Modify: `src/server/db/repositories.ts`
- Create: `src/server/projectBlueprints.ts`
- Test: `src/test/projectBlueprints.test.ts`

- [ ] **Step 1: Write failing tests for app-authored projects and XML export**

Create `src/test/projectBlueprints.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../server/db/database";
import { createRepositories } from "../server/db/repositories";
import { createProjectFromBlueprints } from "../server/projectBlueprints";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import { exportProjectXml } from "../shared/xmlExport";

describe("project blueprints", () => {
  it("creates a metadata project from configured dimension blueprints", () => {
    const db = createDatabase(":memory:");
    const repos = createRepositories(db);

    const project = createProjectFromBlueprints(repos, defaultAppConfig, {
      name: "Manual Build",
      description: "Built in the app",
      createdBy: "local-admin"
    });

    const dimensions = repos.dimensions.listByProject(project.id);
    const account = dimensions.find((dimension) => dimension.dimensionType === "Account");

    expect(project.name).toBe("Manual Build");
    expect(project.sourceFileName).toBe("");
    expect(dimensions.map((dimension) => dimension.dimensionType)).toEqual(defaultAppConfig.dimensions.displayOrder);
    expect(account?.dimensionName).toBe("Accounts");
    expect(account?.metadata).toMatchObject({
      source: "blueprint",
      allowMultipleParents: true,
      relationshipDefaults: { aggregationWeight: 1 }
    });
    expect(repos.members.listByDimension(account?.id ?? "").map((member) => member.memberKey)).toEqual(["Root"]);

    db.close();
  });

  it("exports XML from app-authored project data", () => {
    const db = createDatabase(":memory:");
    const repos = createRepositories(db);

    const project = createProjectFromBlueprints(repos, defaultAppConfig, {
      name: "Manual Export",
      description: "",
      createdBy: "local-admin"
    });
    const account = repos.dimensions.listByProject(project.id).find((dimension) => dimension.dimensionType === "Account");
    if (!account) throw new Error("Account dimension was not created");

    repos.members.create({
      dimensionId: account.id,
      memberKey: "Revenue",
      description: "Revenue",
      properties: { Account: "Revenue", Description: "Revenue" },
      rowOrder: 2,
      sourceRowNumber: 0,
      isActive: true
    });
    repos.relationships.create({
      dimensionId: account.id,
      parentKey: "Root",
      childKey: "Revenue",
      aggregationWeight: 1,
      percentConsol: null,
      percentOwnership: null,
      ownershipType: "",
      properties: { Parent: "Root", Child: "Revenue", "Aggregation Weight": 1 },
      rowOrder: 1,
      sourceRowNumber: 0
    });

    const xml = exportProjectXml({
      project,
      dimensions: repos.dimensions.listByProject(project.id),
      members: repos.members.listByProject(project.id),
      relationships: repos.relationships.listByProject(project.id)
    });

    expect(xml).toContain('type="Account"');
    expect(xml).toContain('<member name="Revenue" alias="" description="Revenue"');
    expect(xml).toContain('<relationship parent="Root" child="Revenue" aggregationWeight="1" />');

    db.close();
  });
});
```

- [ ] **Step 2: Run the service test and verify it fails**

Run:

```powershell
npm.cmd test -- src/test/projectBlueprints.test.ts
```

Expected: FAIL because `src/server/projectBlueprints.ts` does not exist.

- [ ] **Step 3: Add repository rollback helper**

In `src/server/db/repositories.ts`, add this method inside `projects` after `get(projectId: string)`:

```ts
      delete(projectId: string): void {
        db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
      },
```

- [ ] **Step 4: Create blueprint project service**

Create `src/server/projectBlueprints.ts`:

```ts
import type { AppConfig, DimensionBlueprintConfig } from "../shared/appConfigTypes";
import { getDimensionSchema } from "../shared/dimensionSchemas";
import type { DimensionType, ProjectRecord } from "../shared/types";
import type { Repositories } from "./db/repositories";

interface CreateBlueprintProjectInput {
  name: string;
  description: string;
  createdBy: string;
}

export function createProjectFromBlueprints(
  repos: Repositories,
  config: AppConfig,
  input: CreateBlueprintProjectInput
): ProjectRecord {
  const project = repos.projects.create({
    name: input.name.trim() || "New Metadata Project",
    description: input.description,
    sourceFileName: "",
    createdBy: input.createdBy
  });

  try {
    const enabledTypes = new Set(config.dimensions.enabledTypes);
    const orderedTypes = config.dimensions.displayOrder.filter((type) => enabledTypes.has(type));

    orderedTypes.forEach((dimensionType, index) => {
      const schema = getDimensionSchema(dimensionType);
      const blueprint = resolveBlueprint(config, dimensionType);
      const dimension = repos.dimensions.create({
        projectId: project.id,
        sheetName: schema.sheetNames[0] ?? dimensionType,
        dimensionType,
        dimensionName: blueprint.defaultDimensionName,
        description: "",
        accessGroup: "",
        maintenanceGroup: "",
        inheritedDimension: "",
        sortOrder: index + 1,
        metadata: {
          source: "blueprint",
          allowMultipleParents: blueprint.allowMultipleParents,
          relationshipDefaults: blueprint.relationshipDefaults
        }
      });

      blueprint.rootMembers.forEach((rootMember, rootIndex) => {
        repos.members.create({
          dimensionId: dimension.id,
          memberKey: rootMember,
          description: "",
          properties: {
            [blueprint.memberKeyField]: rootMember,
            Description: ""
          },
          rowOrder: rootIndex + 1,
          sourceRowNumber: 0,
          isActive: true
        });
      });
    });

    repos.audit.record({
      projectId: project.id,
      action: "project.create",
      entityType: "project",
      entityId: project.id,
      after: {
        source: "blueprint",
        dimensionCount: orderedTypes.length
      }
    });

    return project;
  } catch (error) {
    repos.projects.delete(project.id);
    throw error;
  }
}

function resolveBlueprint(config: AppConfig, dimensionType: DimensionType): DimensionBlueprintConfig {
  const schema = getDimensionSchema(dimensionType);
  const configured = config.dimensions.blueprints[dimensionType];
  if (configured) return configured;

  return {
    defaultDimensionName: config.dimensions.preferredMetadataNames[dimensionType] ?? schema.sheetNames[0] ?? dimensionType,
    rootMembers: ["Root"],
    memberKeyField: schema.memberKeyField,
    relationshipDefaults: dimensionType === "Scenario" ? {} : { aggregationWeight: 1 },
    allowMultipleParents: true
  };
}
```

- [ ] **Step 5: Run the service test**

Run:

```powershell
npm.cmd test -- src/test/projectBlueprints.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```powershell
git add src/server/db/repositories.ts src/server/projectBlueprints.ts src/test/projectBlueprints.test.ts
git commit -m "feat: create projects from dimension blueprints"
```

## Task 3: Project Creation API

**Files:**
- Modify: `src/server/routes/projects.ts`
- Modify: `src/server/app.ts`
- Test: `src/test/projectRoutes.test.ts`

- [ ] **Step 1: Write failing API route test**

Create `src/test/projectRoutes.test.ts`:

```ts
import { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { ProjectRecord } from "../shared/types";

describe("project routes", () => {
  it("creates a blank metadata project from configured blueprints", async () => {
    const db = createDatabase(":memory:");
    const server = createApp(db, defaultAppConfig).listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Manual Route Project", description: "Created without XLSX" })
      });

      expect(response.status).toBe(201);
      const project = await response.json() as ProjectRecord;
      expect(project.name).toBe("Manual Route Project");
      expect(project.sourceFileName).toBe("");

      const dimensionsResponse = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/dimensions`);
      expect(dimensionsResponse.status).toBe(200);
      const dimensions = await dimensionsResponse.json() as Array<{ dimensionType: string }>;
      expect(dimensions.map((dimension) => dimension.dimensionType)).toEqual(defaultAppConfig.dimensions.displayOrder);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      db.close();
    }
  });
});
```

- [ ] **Step 2: Run the route test and verify it fails**

Run:

```powershell
npm.cmd test -- src/test/projectRoutes.test.ts
```

Expected: FAIL because `POST /api/projects` is not implemented.

- [ ] **Step 3: Add POST route**

In `src/server/routes/projects.ts`, add imports:

```ts
import type { AppConfig } from "../../shared/appConfigTypes";
import { createProjectFromBlueprints } from "../projectBlueprints";
```

Change the router factory signature:

```ts
export function createProjectRouter(repos: Repositories, config: AppConfig): Router {
```

Add this route after `router.get("/")`:

```ts
  router.post("/", (req, res, next) => {
    try {
      const project = createProjectFromBlueprints(repos, config, {
        name: String(req.body.name ?? "").trim() || "New Metadata Project",
        description: String(req.body.description ?? ""),
        createdBy: "local-admin"
      });
      res.status(201).json(project);
    } catch (error) {
      next(error);
    }
  });
```

In `src/server/app.ts`, update the project router registration:

```ts
  app.use("/api/projects", createProjectRouter(repos, config));
```

- [ ] **Step 4: Run the route test**

Run:

```powershell
npm.cmd test -- src/test/projectRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```powershell
git add src/server/routes/projects.ts src/server/app.ts src/test/projectRoutes.test.ts
git commit -m "feat: expose blueprint project creation API"
```

## Task 4: Client Create-Project Flow And Generic Narrative

**Files:**
- Modify: `src/client/api/client.ts`
- Modify: `src/client/components/AppShell.tsx`
- Modify: `src/client/components/Dashboard.tsx`
- Modify: `src/client/components/ImportExportModals.tsx`
- Modify: `src/client/ui/viewModel.ts`
- Test: `src/test/clientUiViewModel.test.ts`
- Test: `src/test/clientComponentsMarkup.test.ts`

- [ ] **Step 1: Write failing view-model and markup tests**

In `src/test/clientUiViewModel.test.ts`, update the no-project export availability expectation:

```ts
    expect(getExportAvailability({
      projectId: null,
      exportConfig: defaultAppConfig.export,
      issues: [],
      blockedSeverities: ["error"]
    })).toEqual({ disabled: true, title: "Create or open a project before exporting", reason: "No project open" });
```

In `src/test/clientComponentsMarkup.test.ts`, update or add these expectations:

```ts
  it("renders SR Onestream Dim Builder identity and generic lifecycle actions", () => {
    const markup = render(createElement(AppShell, { appConfig: defaultAppConfig }));

    expect(markup).toContain(">SR Onestream Dim Builder<");
    expect(markup).toContain(">New Project</button>");
    expect(markup).toContain(">Seed from XLSX</button>");
    expect(markup).toMatch(/<button[^>]*title="Create or open a project before validating"[^>]*disabled=""[^>]*>[\s\S]*Validate<\/button>/);
    expect(markup).not.toContain(">DimBuilder<");
    expect(markup).not.toContain("Import a workbook to begin.");
  });

  it("renders generic no-project dashboard guidance", () => {
    const markup = dashboardMarkup(defaultAppConfig);

    expect(markup).toContain('<span class="status-badge neutral">No project</span>');
    expect(markup).toContain("Create a project or seed one from XLSX.");
    expect(markup).not.toContain("Use the Import button in the top command bar to load an XF metadata workbook.");
  });

  it("labels the XLSX workflow as optional seeding", () => {
    const importMarkup = render(createElement(ImportModal, {
      open: true,
      onClose: () => undefined,
      onImported: () => undefined
    }));

    expect(importMarkup).toContain("Seed from XLSX");
    expect(importMarkup).toContain("Select an optional `.xlsx` OneStream metadata workbook to seed a project.");
    expect(importMarkup).not.toContain("Import workbook");
  });
```

Keep the existing modal accessibility expectations.

- [ ] **Step 2: Run focused client tests and verify they fail**

Run:

```powershell
npm.cmd test -- src/test/clientUiViewModel.test.ts src/test/clientComponentsMarkup.test.ts
```

Expected: FAIL because UI copy and API helpers have not changed.

- [ ] **Step 3: Add client create-project API**

In `src/client/api/client.ts`, add:

```ts
export function createProject(body: { name: string; description: string }) {
  return apiPost<ProjectRecord>("/projects", body);
}
```

- [ ] **Step 4: Update export availability copy**

In `src/client/ui/viewModel.ts`, change the no-project branch:

```ts
  if (!projectId) {
    return { disabled: true, title: "Create or open a project before exporting", reason: "No project open" };
  }
```

- [ ] **Step 5: Add create-project modal**

In `src/client/components/ImportExportModals.tsx`, add `PlusCircle` to the icon import:

```ts
import { CheckCircle2, Download, FileUp, PlusCircle, TriangleAlert } from "lucide-react";
```

Add `createProject` to the API import:

```ts
import { createProject, uploadWorkbook } from "../api/client";
```

Add this component above `ImportModal`:

```tsx
export function CreateProjectModal({
  open,
  onClose,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (projectId: string) => void;
}) {
  const [name, setName] = useState("New Metadata Project");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("New Metadata Project");
      setDescription("");
      setStatus("");
      setIsCreating(false);
    }
  }, [open]);

  if (!open) return null;

  async function createBlankProject() {
    if (isCreating) return;
    setIsCreating(true);
    setStatus("Creating project from configured dimension blueprints...");
    try {
      const project = await createProject({ name, description });
      setStatus("Project created");
      onCreated(project.id);
      onClose();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Project creation failed");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-project-modal-title">
        <div className="modal-heading">
          <h2 id="create-project-modal-title">New metadata project</h2>
        </div>
        <p>Create a blank project from the dimension blueprints in the central configuration.</p>
        <label className="modal-field">
          <span>Project name</span>
          <input value={name} disabled={isCreating} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="modal-field">
          <span>Description</span>
          <textarea value={description} disabled={isCreating} onChange={(event) => setDescription(event.target.value)} />
        </label>
        {status && <div className="modal-status">{status}</div>}
        <div className="modal-actions">
          <ActionButton disabled={isCreating} onClick={onClose}>Cancel</ActionButton>
          <ActionButton variant="primary" disabled={isCreating} onClick={() => void createBlankProject()}>
            <PlusCircle size={15} /> {isCreating ? "Creating..." : "Create Project"}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Rename XLSX import modal copy**

In `ImportModal`, change:

```tsx
          <h2 id="import-modal-title">Seed from XLSX</h2>
```

Change the description:

```tsx
        <p>Select an optional `.xlsx` OneStream metadata workbook to seed a project. Generated XML and formula columns are ignored.</p>
```

Change status strings:

```ts
    setStatus("Seeding project from XLSX. Large UD3 sheets can take a few seconds...");
```

```ts
      setStatus(`Seeded ${String(result.importSummary.dimensionsImported)} dimensions`);
```

Change the primary button label:

```tsx
          {!importedProject && <ActionButton variant="primary" disabled={!file || isImporting} onClick={() => void importWorkbook()}><FileUp size={15} /> {isImporting ? "Seeding..." : "Seed Project"}</ActionButton>}
```

- [ ] **Step 7: Wire the create-project modal into AppShell**

In `src/client/components/AppShell.tsx`, add `PlusCircle` to the lucide import:

```ts
  PlusCircle,
```

Change the modal import:

```ts
import { CreateProjectModal, ExportModal, ImportModal } from "./ImportExportModals";
```

Add state:

```ts
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
```

Change project defaults:

```ts
  const projectName = store.projects[0]?.name ?? "No project open";
  const projectSource = store.loading
    ? "Loading metadata workspace..."
    : store.projects[0]?.sourceFileName || appConfig.application.supportText;
```

Change brand wordmark:

```tsx
          <span className="brand-wordmark">{appConfig.application.productName}</span>
```

Change toolbar actions:

```tsx
          <ActionButton variant="primary" onClick={() => setCreateProjectOpen(true)}>
            <PlusCircle size={16} /> New Project
          </ActionButton>
          {toolbar.showImport && (
            <ActionButton onClick={() => setImportOpen(true)}>
              <FileUp size={16} /> Seed from XLSX
            </ActionButton>
          )}
```

Change validation title:

```tsx
              title={store.selectedProjectId ? "Validate metadata" : "Create or open a project before validating"}
```

Change empty sidebar:

```tsx
        {dimensionNavItems.length === 0 && <div className="empty-sidebar">Create or seed a project to begin.</div>}
```

Render `CreateProjectModal` before `ImportModal`:

```tsx
      <CreateProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onCreated={(projectId) => {
          setStatus("Project created");
          void store.refresh(projectId);
        }}
      />
```

- [ ] **Step 8: Update dashboard copy**

In `src/client/components/Dashboard.tsx`, change the header title and paragraph:

```tsx
            <h1>{project?.name ?? "No project open"}</h1>
            <p>{project?.sourceFileName || "Create a project or seed one from XLSX."}</p>
```

Change the empty state:

```tsx
            <EmptyState title={project ? "No dimensions available" : "No project open"}>
              {project
                ? "This project has no configured dimensions to inspect."
                : "Create a project or seed one from XLSX."}
            </EmptyState>
```

- [ ] **Step 9: Run focused client tests**

Run:

```powershell
npm.cmd test -- src/test/clientUiViewModel.test.ts src/test/clientComponentsMarkup.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Task 4**

Run:

```powershell
git add src/client/api/client.ts src/client/components/AppShell.tsx src/client/components/Dashboard.tsx src/client/components/ImportExportModals.tsx src/client/ui/viewModel.ts src/test/clientUiViewModel.test.ts src/test/clientComponentsMarkup.test.ts
git commit -m "feat: add generic project creation flow"
```

## Task 5: Update Remaining Tests And Compatibility Copy

**Files:**
- Modify: `src/test/fixtures.ts`
- Modify: `src/test/database.test.ts`
- Modify: `src/test/repositoryEditing.test.ts`
- Modify: `src/test/xlsxExport.test.ts`
- Modify: `src/test/workbookParser.test.ts` only if a copied generic-product expectation appears there during implementation; keep workbook parsing behavior and XLSX fixture names intact.

- [ ] **Step 1: Run the full suite and capture remaining failures**

Run:

```powershell
npm.cmd test
```

Expected: FAIL only in tests that still expect `DimBuilder`, `XF Dimensions Template` as the default generic app context, or required workbook import copy.

- [ ] **Step 2: Update fixtures to include a manual project fixture**

In `src/test/fixtures.ts`, add this project after `sampleProject`:

```ts
export const manualProject: ProjectRecord = {
  id: "project-manual",
  name: "Manual Metadata Project",
  description: "App-authored project",
  sourceFileName: "",
  createdBy: "local-admin",
  createdAt: testTimestamp,
  updatedAt: testTimestamp
};
```

Use `manualProject` in newly added generic UI tests. Keep `sampleProject` for XLSX parser and import-specific tests.

- [ ] **Step 3: Update repository tests to prove empty source files are valid**

In `src/test/database.test.ts`, change the project creation source:

```ts
      sourceFileName: "",
```

Add this assertion after project creation:

```ts
    expect(project.sourceFileName).toBe("");
```

In `src/test/repositoryEditing.test.ts`, change the project creation source:

```ts
      sourceFileName: "",
```

- [ ] **Step 4: Update XLSX export creator test**

In `src/test/xlsxExport.test.ts`, change the creator expectation:

```ts
      expect(workbook.creator).toBe("SR Onestream Dim Builder");
```

- [ ] **Step 5: Run full suite**

Run:

```powershell
npm.cmd test
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

Run:

```powershell
git add src/test/fixtures.ts src/test/database.test.ts src/test/repositoryEditing.test.ts src/test/xlsxExport.test.ts
git commit -m "test: align suite with generic builder narrative"
```

## Task 6: Build And Browser Verification

**Files:**
- No source edits expected unless verification reveals a defect.

- [ ] **Step 1: Run build**

Run:

```powershell
npm.cmd run build
```

Expected: PASS with TypeScript and Vite build completing successfully.

- [ ] **Step 2: Start or restart the dev server**

If the dev server is already running, stop the existing `npm run dev` tree first. Then run:

```powershell
Start-Process -FilePath npm.cmd -ArgumentList 'run','dev' -WorkingDirectory 'C:\Naga\projects\dimbuilder' -RedirectStandardOutput 'C:\Naga\projects\dimbuilder\data\logs\dev-server.out.log' -RedirectStandardError 'C:\Naga\projects\dimbuilder\data\logs\dev-server.err.log' -WindowStyle Hidden -PassThru
```

Expected: a background process starts and Vite serves the app on `http://127.0.0.1:5173/` or the next available configured client port.

- [ ] **Step 3: Verify initial page with Playwright**

Run:

```powershell
node -e "const { chromium } = require('playwright'); (async () => { const browser = await chromium.launch({ channel: 'msedge', headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const logs = []; page.on('console', msg => { if (['error','warning'].includes(msg.type())) logs.push(msg.type()+': '+msg.text()); }); await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' }); const title = await page.title(); const brand = await page.locator('.brand-wordmark').textContent(); const h1 = await page.locator('.overview-header h1').textContent(); const body = await page.locator('body').innerText(); await page.screenshot({ path: 'C:/tmp/sr-onestream-builder-home.png', fullPage: false }); console.log(JSON.stringify({ title, brand, h1, hasNewProject: body.includes('New Project'), hasSeedFromXlsx: body.includes('Seed from XLSX'), logs }, null, 2)); await browser.close(); })().catch(e => { console.error(e); process.exit(1); });"
```

Expected JSON:

```json
{
  "title": "SR Onestream Dim Builder",
  "brand": "SR Onestream Dim Builder",
  "h1": "No project open",
  "hasNewProject": true,
  "hasSeedFromXlsx": true,
  "logs": []
}
```

- [ ] **Step 4: Verify blank project creation in browser**

Run:

```powershell
node -e "const { chromium } = require('playwright'); (async () => { const browser = await chromium.launch({ channel: 'msedge', headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const logs = []; page.on('console', msg => { if (['error','warning'].includes(msg.type())) logs.push(msg.type()+': '+msg.text()); }); await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' }); await page.getByRole('button', { name: /New Project/ }).click(); await page.getByLabel('Project name').fill('Browser Manual Project'); await page.getByRole('button', { name: /Create Project/ }).click(); await page.waitForTimeout(1000); const h1 = await page.locator('.overview-header h1').textContent(); const navItems = await page.locator('.nav-item span').allTextContents(); await page.screenshot({ path: 'C:/tmp/sr-onestream-builder-created-project.png', fullPage: false }); console.log(JSON.stringify({ h1, navCount: navItems.length, firstNav: navItems[0], logs }, null, 2)); await browser.close(); })().catch(e => { console.error(e); process.exit(1); });"
```

Expected: `h1` is `Browser Manual Project`, `navCount` is greater than `0`, `firstNav` is a configured dimension label, and `logs` is empty.

- [ ] **Step 5: Handle verification defects**

If browser verification reveals a defect, return to the task that introduced the defect, add a focused failing test for that behavior, implement the fix, rerun that task's focused tests, and commit with that task's files. If browser verification passes, make no commit in this step.

## Task 7: Final Verification And Handoff

**Files:**
- No source edits expected.

- [ ] **Step 1: Run final tests**

Run:

```powershell
npm.cmd test
```

Expected: PASS.

- [ ] **Step 2: Run final build**

Run:

```powershell
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 3: Check git status**

Run:

```powershell
git status --short
```

Expected: only pre-existing unrelated dirty files remain, or no dirty files remain if this implementation intentionally absorbed them. Do not revert user changes.

- [ ] **Step 4: Summarize implementation**

Final response should include:

- `SR Onestream Dim Builder` identity is live.
- Central blueprint config exists in `config/dimbuilder.yaml`.
- New blank metadata project creation works.
- XLSX import remains as optional seeding.
- XML export works from app-authored records.
- Verification commands run and their results.
