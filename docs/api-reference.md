# API Reference

The Express app mounts API routes under `/api`. Client helper functions live in `src/client/api/client.ts`.

## Health

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Returns `{ ok: true }`. |

## Config

| Method | Path | Description |
|---|---|---|
| GET | `/api/config` | Returns client-safe app config with server paths omitted. |

## Projects

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects` | List projects ordered by updated time. |
| POST | `/api/projects` | Create a blank metadata project from YAML blueprints. |
| GET | `/api/projects/:projectId/summary` | Return dashboard counts and recent dimensions. |
| GET | `/api/projects/:projectId/dimensions` | List dimensions for a project. |
| PATCH | `/api/projects/:projectId/dimensions/:dimensionId` | Update dimension metadata fields. |
| GET | `/api/projects/:projectId/issues` | List persisted validation issues. |

POST `/api/projects` body:

```json
{
  "name": "New Metadata Project",
  "description": "Optional description"
}
```

## Members

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/:projectId/dimensions/:dimensionId/members?offset=0&limit=300` | Page active members for a dimension. |
| POST | `/api/projects/:projectId/dimensions/:dimensionId/members` | Create a member. |
| PATCH | `/api/projects/:projectId/members/:memberId` | Update a member. |
| DELETE | `/api/projects/:projectId/members/:memberId` | Soft-delete a member. |

Create member body:

```json
{
  "memberKey": "Revenue",
  "properties": {
    "Account": "Revenue",
    "Description": "Revenue"
  }
}
```

## Relationships

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/:projectId/dimensions/:dimensionId/relationships?offset=0&limit=300` | Page relationships for a dimension. |
| POST | `/api/projects/:projectId/dimensions/:dimensionId/relationships` | Create a relationship with configured defaults. |
| PATCH | `/api/projects/:projectId/relationships/:relationshipId` | Update a relationship. |
| DELETE | `/api/projects/:projectId/relationships/:relationshipId` | Delete a relationship. |

Create relationship body:

```json
{
  "parentKey": "Root",
  "childKey": "Revenue",
  "properties": {
    "Parent": "Root",
    "Child": "Revenue"
  }
}
```

## Import

| Method | Path | Description |
|---|---|---|
| POST | `/api/import/workbook` | Multipart XLSX upload used to seed a project. |

Form fields:

- `file`: required XLSX file.
- `projectName`: optional project name.

## Validation

| Method | Path | Description |
|---|---|---|
| POST | `/api/validation/:projectId/run` | Run validation, replace stored issues, and return issues. |

Body:

```json
{
  "duplicateSeverity": "warning"
}
```

## Export

| Method | Path | Description |
|---|---|---|
| GET | `/api/export/:projectId/xml` | Return OneStream metadata XML. |
| GET | `/api/export/:projectId/json` | Return JSON backup. |
| GET | `/api/export/:projectId/members.csv` | Return members CSV. |
| GET | `/api/export/:projectId/relationships.csv` | Return relationships CSV. |
| GET | `/api/export/:projectId/xlsx` | Return workbook export. |
| POST | `/api/export/:projectId/snapshot` | Persist a project snapshot and write JSON to exports directory. |

## Error Shape

Unhandled route errors are normalized by `src/server/app.ts`:

```json
{
  "error": "message"
}
```

