# Hierarchy Search And CSV Level Normalization Design

## Context

Large imported dimensions can contain tens of thousands of hierarchy relationships. The current Hierarchy tab loads only an initial relationship page and filters only that browser-local subset. Users searching for a member outside the loaded page see no useful result and are asked to load more rows manually.

CSV imports with stacked level columns can also contain placeholder hierarchy values such as `--` or blank cells. Today those values either become poor member names or are skipped, which loses the intended level structure.

## Goals

1. Make Hierarchy tab search seamless for large dimensions.
2. Search across the full dimension, not just loaded relationship rows.
3. Preserve hierarchy context by returning ancestor paths for matches.
4. Normalize placeholder level values during CSV preview and commit.
5. Make the import preview reflect the exact normalized hierarchy that will be committed.

## Non-Goals

- Do not change final member key values during CSV import.
- Do not build a general-purpose find-and-replace editor in this pass.
- Do not remove the existing browse/load-more hierarchy behavior when search is empty.
- Do not change export formats in this pass.

## Hierarchy Search Behavior

When the user types in the Hierarchy search box:

- The UI continues to filter the currently loaded local tree immediately.
- After a short debounce, the UI calls a server endpoint to search the full dimension.
- The server searches relationship parent keys, relationship child keys, and member descriptions.
- The server returns up to 100 direct matches plus all ancestor-path relationships needed to reconstruct context.
- If more than 100 direct matches exist, the response reports that the result was capped and the UI asks the user to refine the search.
- The Hierarchy tab renders a contextual mini-tree while search is active.
- When search is cleared, the normal paged browsing tree returns.

## CSV Normalization Behavior

When CSV hierarchy mode is `levelColumns`:

- Placeholder normalization is enabled by default.
- Normalization applies only to mapped hierarchy level columns.
- Placeholder values are blank strings and `--`.
- Placeholder labels use the default pattern `Unassigned Level {level}`.
- Level numbering is based on the mapped hierarchy column order shown in the UI: first mapped level is level 1, second is level 2, etc.
- Placeholder levels are preserved as explicit nodes, so `Level1=Ops, Level2=blank, Level3=Travel` becomes `Ops -> Unassigned Level 2 -> Travel`.
- The leaf/final member key column is never normalized by this feature.

## Technical Design

### Server Search

Add a dimension hierarchy search route under the existing project/dimension route family:

`GET /api/projects/:projectId/dimensions/:dimensionId/hierarchy/search?q=<term>&limit=100`

The route loads the dimension members and relationships, finds direct matching relationships, reconstructs ancestor relationships for those matches, and returns:

```ts
interface HierarchySearchResponse {
  query: string;
  directMatchCount: number;
  capped: boolean;
  relationships: DimensionRelationshipRecord[];
}
```

The route remains read-only and uses existing repository methods.

### Client Search

`HierarchyTree` receives the server search response when a debounced query is active. It builds the tree from returned relationships instead of the paged browse rows. It displays search status, match count, and capped-result guidance.

### CSV Import

Extend `MetadataCsvColumnMapping` with optional normalization config:

```ts
levelPlaceholderNormalization?: {
  enabled: boolean;
  placeholders: string[];
  replacementPattern: string;
};
```

If the config is absent and `hierarchyMode` is `levelColumns`, the importer uses defaults:

```ts
{
  enabled: true,
  placeholders: ["", "--"],
  replacementPattern: "Unassigned Level {level}"
}
```

`expandHierarchyRows` normalizes only mapped hierarchy level values before building hierarchy rows.

## Error Handling

- Empty or whitespace hierarchy search query returns an empty result without error.
- Search route validates project and dimension ownership and returns `404` if invalid.
- Invalid search limit falls back to 100 and is capped to a safe maximum.
- CSV normalization never mutates final member key columns.
- Preview and commit use the same normalization code path.

## Testing

Add tests for:

- Full-dataset hierarchy search finds relationships beyond the first loaded page.
- Search response includes ancestor path relationships.
- Search response reports capped results.
- CSV preview normalizes `--` and blank level cells to `Unassigned Level {level}`.
- CSV commit plan uses the same normalized member and relationship keys as preview.

## User-Facing Result

Users can search for a member such as `4642` without clicking “Load more relationships.” CSV imports with placeholders produce clean level-aware hierarchy nodes such as `Unassigned Level 2` and `Unassigned Level 3`.
