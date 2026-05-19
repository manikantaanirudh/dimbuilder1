# Bulk Update Guide

The Bulk Update workflow lets users safely change many member or relationship properties at once. It is designed around preview, transactional apply, audit logging, and rollback data rather than direct fire-and-forget updates.

## Workflow

1. Open a project and select a dimension.
2. Open the **Bulk Update** workspace tab.
3. Choose the target type: members or relationships.
4. Choose a property and operation.
5. Add filters such as member key, parent key, child key, or property criteria.
6. Run preview.
7. Review exact old/new values and warnings.
8. Apply the update.
9. Use **Run Validation** from the panel to refresh project issues after the bulk edit.

Apply recomputes the preview on the server before writing anything. If any write fails, the repository transaction rolls back the job and the row edits together.

## Supported Operations

- `set`: replace the target property with one value.
- `clear`: set the target property to blank.
- `replaceText`: replace literal text inside the old value.
- `append`: append text to the old value.
- `prepend`: prepend text to the old value.
- `copyFromProperty`: copy another property on the same member or relationship.
- `deriveFromParent`: use the relationship parent, or a member's first found parent relationship.
- `regexReplace`: apply a JavaScript regular-expression replacement.

## Filters

Current filters include:

- dimension id
- active-only member rows
- member key contains, starts with, or regex
- relationship parent contains, starts with, or regex
- relationship child contains, starts with, or regex
- property filters with equals, not equals, contains, blank, not blank, or regex

## Validation And Warnings

Preview uses the shared OneStream property dictionary when available. It warns when:

- a property is unknown for the target dimension and level
- a numeric or decimal property would receive a nonnumeric value
- a boolean property would receive a value other than true/false-style text
- an enum property would receive a value outside the dictionary enum list

Warnings do not block apply by default. Users should run full validation after larger bulk updates.

## Persistence And Audit

Applied updates create:

- a `bulk_update_jobs` row with request JSON, summary JSON, rollback JSON, status, user, and timestamp
- `bulk_update_items` rows with target id, target key, property, old value, new value, status, and warning message
- a `bulkUpdate.apply` audit log entry

Rollback JSON is stored for every applied item. A rollback API/UI is not exposed yet.

## Current Limits

- CSV mapping upload is not implemented yet. The API and UI should not be described as supporting CSV-driven mapping until a dedicated parser and preview path are added.
- Preview is synchronous and local-first. Very large dimensions may need paging or background-job behavior later.
- Rollback data is captured, but rollback execution remains a future workflow.

## Source Anchors

- Shared preview engine: `src/shared/bulkUpdate.ts`
- API routes: `src/server/routes/projects.ts`
- Repository persistence: `src/server/db/repositories.ts`
- Schema: `src/server/db/schema.ts`
- UI: `src/client/components/BulkUpdatePanel.tsx`
- Client API: `src/client/api/client.ts`
- Tests: `src/test/bulkUpdate.test.ts`, `src/test/projectRoutes.test.ts`, `src/test/repositoryEditing.test.ts`
