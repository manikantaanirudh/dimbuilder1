# Snapshot Restore And Branching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users list project snapshots, restore a snapshot into the current project, and create a new project branch from a snapshot.

**Architecture:** Keep restore and branch writes inside repository transactions so route handlers stay thin. Snapshot JSON remains the source artifact; repository methods normalize it into current SQLite records, remapping ids for new-project branching and preserving ids for in-place restore. The UI adds a compact Snapshot Manager to the project dashboard.

**Tech Stack:** TypeScript, Express, React, SQLite/better-sqlite3 repositories, Vitest, existing snapshot JSON shape.

---

### Task 1: Shared Snapshot Types

**Files:**
- Modify: `src/shared/types.ts`

- [x] **Step 1: Add snapshot contracts**

Add typed records:

```ts
export interface ProjectSnapshotState extends ProjectMetadataState {
  varyingPropertyValues?: VaryingPropertyValueRecord[];
  validationIssues?: ValidationIssue[];
}

export interface ProjectSnapshotRecord {
  id: string;
  projectId: string;
  name: string;
  description: string;
  snapshot: ProjectSnapshotState;
  createdBy: string;
  createdAt: string;
}

export interface SnapshotRestoreSummary {
  mode: "replaceCurrent" | "newProject";
  projectId: string;
  snapshotId: string;
  safetySnapshotId?: string;
  dimensionsRestored: number;
  membersRestored: number;
  relationshipsRestored: number;
  varyingPropertiesRestored: number;
}
```

### Task 2: Repository Restore And Branch

**Files:**
- Modify: `src/server/db/repositories.ts`
- Test: `src/test/repositoryEditing.test.ts`

- [x] **Step 1: Write failing repository tests**

Add tests proving:
- `repos.snapshots.listByProject(projectId)` and `get(projectId, snapshotId)` return snapshot records.
- `restoreSnapshotIntoProject(projectId, snapshotId)` replaces current dimensions/members/relationships and creates a safety snapshot.
- `createProjectFromSnapshot(snapshotId, newProjectName)` creates a new project and remaps dimension/member/relationship/varying ids so the branch does not conflict with the source project.

- [x] **Step 2: Run targeted test**

Run: `npm.cmd test -- src/test/repositoryEditing.test.ts`

Expected: FAIL because repository snapshot restore methods do not exist.

- [x] **Step 3: Implement repository methods**

Add:
- `snapshots.listByProject(projectId)`
- `snapshots.get(projectId, snapshotId)`
- `snapshots.restoreSnapshotIntoProject(projectId, snapshotId, options)`
- `snapshots.createProjectFromSnapshot(snapshotId, newProjectName, options)`

Use `runInTransaction`. For current-project restore, create a safety snapshot before deleting dimensions. For branch, insert a new project, remap ids, insert dimensions, members, relationships, and varying properties.

- [x] **Step 4: Run targeted test**

Run: `npm.cmd test -- src/test/repositoryEditing.test.ts`

Expected: PASS.

### Task 3: Snapshot API

**Files:**
- Modify: `src/server/routes/projects.ts`
- Modify: `src/client/api/client.ts`
- Test: `src/test/projectRoutes.test.ts`

- [x] **Step 1: Write failing route tests**

Add an API test that:
- Creates a project.
- Creates a snapshot through `POST /api/export/:projectId/snapshot`.
- Lists snapshots through `GET /api/projects/:projectId/snapshots`.
- Reads a snapshot through `GET /api/projects/:projectId/snapshots/:snapshotId`.
- Mutates project data, restores snapshot, and confirms the original data returned.
- Branches from snapshot and confirms the new project exists with copied data.

- [x] **Step 2: Run targeted route test**

Run: `npm.cmd test -- src/test/projectRoutes.test.ts`

Expected: FAIL with 404 for the new project snapshot endpoints.

- [x] **Step 3: Implement routes and client helpers**

Add project routes:
- `GET /:projectId/snapshots`
- `GET /:projectId/snapshots/:snapshotId`
- `POST /:projectId/snapshots/:snapshotId/restore`
- `POST /:projectId/snapshots/:snapshotId/branch`

Add client helpers:
- `fetchProjectSnapshots`
- `fetchProjectSnapshot`
- `restoreProjectSnapshot`
- `branchProjectSnapshot`

Record audit actions:
- `snapshot.restore`
- `snapshot.branch`

- [x] **Step 4: Run targeted route test**

Run: `npm.cmd test -- src/test/projectRoutes.test.ts`

Expected: PASS.

### Task 4: Snapshot Manager UI

**Files:**
- Create: `src/client/components/SnapshotManager.tsx`
- Modify: `src/client/components/Dashboard.tsx`
- Modify: `src/client/styles.css`
- Test: `src/test/clientComponentsMarkup.test.ts`

- [x] **Step 1: Write failing UI markup test**

Add a static markup test expecting dashboard markup to include:
- `snapshot-manager`
- `Snapshots`
- `Restore current project`
- `Create branch`
- warning copy that restore replaces current metadata

- [x] **Step 2: Run targeted UI test**

Run: `npm.cmd test -- src/test/clientComponentsMarkup.test.ts`

Expected: FAIL because Snapshot Manager is not rendered.

- [x] **Step 3: Implement Snapshot Manager**

The component lists snapshots, provides restore and branch actions, confirms destructive restore, and calls `onProjectChanged(projectId)` so the store refreshes after restore or branch.

- [x] **Step 4: Run targeted UI test**

Run: `npm.cmd test -- src/test/clientComponentsMarkup.test.ts`

Expected: PASS.

### Task 5: Documentation

**Files:**
- Modify: `docs/api-reference.md`
- Modify: `docs/export-modes.md`
- Modify: `docs/database-architecture.md`
- Modify: `docs/audit-reliability.md`
- Modify: `docs/current-state-baseline.md`
- Modify: `docs/production-readiness-checklist.md`
- Modify: `docs/feature-catalog.md`
- Modify: `docs/implementation-map.md`
- Modify: `docs/testing-strategy.md`

- [x] **Step 1: Update docs**

Document snapshot list/read/restore/branch APIs, transactional behavior, safety snapshots, audit events, and UI workflow.

- [x] **Step 2: Run docs check**

Run: `npm.cmd run docs:check`

Expected: PASS.

### Task 6: Final Verification

**Files:**
- No extra files beyond feature/docs/tests.

- [x] **Step 1: Run full tests**

Run: `npm.cmd test`

Expected: PASS. Use a longer timeout because the existing workbook parser suite can take around 160 seconds.

- [x] **Step 2: Run production build**

Run: `npm.cmd run build`

Expected: PASS.

- [x] **Step 3: Run docs check**

Run: `npm.cmd run docs:check`

Expected: PASS.

- [x] **Step 4: Handoff**

Summarize changed files, verification results, and limitations. Validation issues are not restored by default; users should run validation after restore or branch.
