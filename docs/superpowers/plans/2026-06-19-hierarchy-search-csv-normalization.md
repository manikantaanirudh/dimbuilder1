# Hierarchy Search And CSV Level Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add seamless full-dataset hierarchy search and import-time placeholder normalization for stacked CSV level columns.

**Architecture:** Add a read-only server search endpoint that returns direct hierarchy matches plus ancestor context, then update the Hierarchy tab to use that endpoint while search is active. Extend CSV column mapping with normalization options and apply them in the shared CSV import parser so preview and commit stay identical.

**Tech Stack:** React, TypeScript, Express routers, Vitest, existing repository abstractions.

---

## File Structure

- Modify `src/shared/metadataCsvMapping.ts` to define and parse optional level placeholder normalization config.
- Modify `src/shared/metadataCsvImport.ts` to normalize mapped level-column values during hierarchy expansion.
- Modify `src/test/metadataCsvImport.test.ts` to cover preview and commit-plan normalization.
- Create or modify server hierarchy search logic in `src/server/routes/hierarchy.ts`.
- Modify `src/client/api/client.ts` to add `searchHierarchy`.
- Modify `src/client/components/HierarchyTree.tsx` to use debounced full-dataset search.
- Modify `src/test/hierarchySearch.test.ts` or add a focused route test if no existing route coverage fits.

---

### Task 1: CSV Level Placeholder Normalization

**Files:**
- Modify: `src/shared/metadataCsvMapping.ts`
- Modify: `src/shared/metadataCsvImport.ts`
- Test: `src/test/metadataCsvImport.test.ts`

- [ ] **Step 1: Write failing preview test**

Add a test in `src/test/metadataCsvImport.test.ts`:

```ts
it("normalizes blank and dash placeholders in stacked hierarchy levels", () => {
  const csv = [
    "Level1,Level2,Level3,Member,Description",
    "Ops,--,,IO100,Travel order"
  ].join("\n");

  const preview = previewMetadataCsvImport({
    csvContent: csv,
    enabledDimensionTypes: ["UD2"],
    formDefaults: {
      projectName: "Opex",
      dimensionType: "UD2",
      dimensionName: "IO"
    },
    columnMapping: {
      member: "Member",
      description: "Description",
      hierarchyMode: "levelColumns",
      hierarchyColumns: ["Level1", "Level2", "Level3"]
    }
  });

  expect(preview.ok).toBe(true);
  expect(preview.counts.membersToCreate).toBe(4);
  expect(preview.counts.relationshipsToCreate).toBe(3);
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
npm.cmd test -- src/test/metadataCsvImport.test.ts
```

Expected: FAIL because blank level values are currently filtered out and `--` remains literal.

- [ ] **Step 3: Add mapping types and defaults**

In `src/shared/metadataCsvMapping.ts`, add:

```ts
export interface MetadataCsvLevelPlaceholderNormalization {
  enabled: boolean;
  placeholders: string[];
  replacementPattern: string;
}
```

Add optional property to `MetadataCsvColumnMapping`:

```ts
levelPlaceholderNormalization?: MetadataCsvLevelPlaceholderNormalization;
```

Update `parseMetadataCsvColumnMapping` to parse an object with `enabled`, `placeholders`, and `replacementPattern`.

- [ ] **Step 4: Normalize hierarchy levels in import parser**

In `src/shared/metadataCsvImport.ts`, add helpers:

```ts
const DEFAULT_LEVEL_PLACEHOLDER_NORMALIZATION = {
  enabled: true,
  placeholders: ["", "--"],
  replacementPattern: "Unassigned Level {level}"
};

function resolveLevelPlaceholderNormalization(mapping: MetadataCsvColumnMapping | undefined) {
  return mapping?.levelPlaceholderNormalization ?? DEFAULT_LEVEL_PLACEHOLDER_NORMALIZATION;
}

function normalizeHierarchyLevelValue(rawValue: string, levelIndex: number, mapping: MetadataCsvColumnMapping | undefined): string {
  const config = resolveLevelPlaceholderNormalization(mapping);
  if (!config.enabled) return rawValue.trim();
  const trimmed = rawValue.trim();
  const matchesPlaceholder = config.placeholders.some((placeholder) => placeholder.trim().toLowerCase() === trimmed.toLowerCase());
  if (!matchesPlaceholder) return trimmed;
  return config.replacementPattern.replace(/\{level\}/g, String(levelIndex + 1));
}
```

Change `expandHierarchyRows` to receive `mapping` and use `normalizeHierarchyLevelValue(row[header] ?? "", index, mapping)` instead of filtering blanks before expansion.

- [ ] **Step 5: Run CSV import tests**

Run:

```powershell
npm.cmd test -- src/test/metadataCsvImport.test.ts src/test/importRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/shared/metadataCsvMapping.ts src/shared/metadataCsvImport.ts src/test/metadataCsvImport.test.ts
git commit -m "feat(import): normalize stacked CSV hierarchy placeholders"
```

---

### Task 2: Server-Side Hierarchy Search

**Files:**
- Modify: `src/server/routes/hierarchy.ts`
- Test: `src/test/hierarchySearch.test.ts`

- [ ] **Step 1: Write failing route test**

Create `src/test/hierarchySearch.test.ts` with a test that creates a dimension with relationships beyond the normal page size and asserts search finds a deep child plus ancestors:

```ts
it("searches the full hierarchy and returns ancestor context", async () => {
  // Use existing API test helpers to create a project, dimension, members, and relationships.
  // Create Root -> A -> B -> Member4642 and enough unrelated relationships to exceed the first page.
  // Call GET /api/projects/:projectId/dimensions/:dimensionId/hierarchy/search?q=4642.
  // Expect directMatchCount to be 1.
  // Expect relationships to include Root -> A, A -> B, and B -> Member4642.
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
npm.cmd test -- src/test/hierarchySearch.test.ts
```

Expected: FAIL with route not found.

- [ ] **Step 3: Implement search endpoint**

In `src/server/routes/hierarchy.ts`, add before CSV export routes:

```ts
router.get("/dimensions/:dimensionId/hierarchy/search", async (req, res) => {
  const state = await loadDimensionHierarchyState(repos, req.params.projectId, req.params.dimensionId);
  const query = String(req.query.q ?? "").trim().toLowerCase();
  const requestedLimit = Number(req.query.limit ?? 100);
  const limit = Math.min(100, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 100));
  if (!query) return res.json({ query: "", directMatchCount: 0, capped: false, relationships: [] });

  const descriptionByKey = new Map(state.members.map((member) => [member.memberKey.toLowerCase(), member.description ?? ""]));
  const directMatches = state.relationships.filter((relationship) => {
    const childDescription = descriptionByKey.get(relationship.childKey.toLowerCase()) ?? "";
    return relationship.parentKey.toLowerCase().includes(query)
      || relationship.childKey.toLowerCase().includes(query)
      || childDescription.toLowerCase().includes(query);
  });
  const selectedMatches = directMatches.slice(0, limit);
  const selected = collectAncestorRelationships(selectedMatches, state.relationships);
  res.json({
    query,
    directMatchCount: directMatches.length,
    capped: directMatches.length > selectedMatches.length,
    relationships: selected
  });
});
```

Add `collectAncestorRelationships` below `loadDimensionHierarchyState`.

- [ ] **Step 4: Run route test**

Run:

```powershell
npm.cmd test -- src/test/hierarchySearch.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/server/routes/hierarchy.ts src/test/hierarchySearch.test.ts
git commit -m "feat(hierarchy): search full relationship dataset"
```

---

### Task 3: Hierarchy UI Search

**Files:**
- Modify: `src/client/api/client.ts`
- Modify: `src/client/components/HierarchyTree.tsx`
- Test: `src/test/clientComponentsMarkup.test.ts`

- [ ] **Step 1: Add client API helper**

Add to `src/client/api/client.ts`:

```ts
export interface HierarchySearchResponse {
  query: string;
  directMatchCount: number;
  capped: boolean;
  relationships: DimensionRelationshipRecord[];
}

export function searchHierarchy(projectId: string, dimensionId: string, query: string, limit = 100) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return apiGet<HierarchySearchResponse>(`/projects/${projectId}/dimensions/${dimensionId}/hierarchy/search?${params.toString()}`);
}
```

- [ ] **Step 2: Update HierarchyTree search state**

In `src/client/components/HierarchyTree.tsx`, add state:

```ts
const [serverSearch, setServerSearch] = useState<HierarchySearchResponse | null>(null);
const [isSearching, setIsSearching] = useState(false);
const [searchError, setSearchError] = useState("");
```

Debounce search with `useEffect`, call `searchHierarchy`, and render `buildHierarchyTree(serverSearch.relationships)` while search is active.

- [ ] **Step 3: Improve search status text**

Render:

- `Searching full hierarchy...` while loading.
- `Showing X matches across full hierarchy` when results are returned.
- `Showing first 100 matches. Refine search.` when capped.
- Keep “Load more relationships” hidden while server search is active.

- [ ] **Step 4: Run frontend markup/build tests**

Run:

```powershell
npm.cmd run build
npm.cmd test -- src/test/clientComponentsMarkup.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/client/api/client.ts src/client/components/HierarchyTree.tsx src/test/clientComponentsMarkup.test.ts
git commit -m "feat(hierarchy): add seamless server search UI"
```

---

### Task 4: Verification

**Files:**
- No production files unless tests reveal a defect.

- [ ] **Step 1: Run focused tests**

```powershell
npm.cmd test -- src/test/metadataCsvImport.test.ts src/test/importRoutes.test.ts src/test/hierarchySearch.test.ts src/test/clientComponentsMarkup.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run build**

```powershell
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 3: Run full non-Postgres suite**

```powershell
npm.cmd test
```

Expected: PASS.

- [ ] **Step 4: Manual browser check**

Start the app, import a stacked-level CSV with `--` and blank level values, then verify:

- Preview counts include generated unassigned nodes.
- Commit produces `Unassigned Level 2` and `Unassigned Level 3`.
- Searching for a deep member in Hierarchy finds it without clicking Load more.

---

## Self-Review

- Spec coverage: CSV normalization, server search, client search, capped results, and verification are covered.
- Placeholder scan: no `TBD` or unresolved placeholders remain.
- Type consistency: `HierarchySearchResponse` and `levelPlaceholderNormalization` names are consistent across tasks.
