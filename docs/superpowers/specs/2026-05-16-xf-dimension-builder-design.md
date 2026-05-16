# OneStream XF Dimension Builder Design

## Purpose

OneStream XF Dimension Builder replaces the Excel-based `XF Dimensions Template` workflow with a modern local-first web application for importing, editing, validating, visualizing, auditing, and exporting OneStream XF dimension metadata.

The first release is a single-user local enterprise app. It must fully handle the supplied workbook, including all 12 dimension sheets and the large `UD3 OUC` worksheet with 65,055 rows, without depending on Excel formulas, macros, or the OneStream Excel add-in. The architecture must preserve clear seams for future multi-user authentication, deployment, and database migration.

## Source Workbook Facts

The workspace contains `XF Dimensions Template - 29.04.2026.xlsx`.

The workbook contains 12 sheets:

1. `Scenarios`
2. `Entities`
3. `Accounts`
4. `Flow`
5. `UD2`
6. `UD3 OUC (2)`
7. `UD3 OUC`
8. `UD4`
9. `UD5`
10. `UD6`
11. `UD7`
12. `UD8`

Observed structure:

- Dimension metadata is stored in rows 1-6 using labels such as `Dimension Type:`, `Dimension Name:`, `Description`, `Access Group`, `Maintenance Group`, and `Inherited Dimension`.
- Member headers are on row 8 in the supplied workbook.
- Relationship headers start on the row where column A is `Parent` and column B is `Child`.
- Some sheets contain generated XML/formula columns such as `Begin Members`, `Begin Relationships`, and formulas like `GetStartMembersXML()`.
- Some large/inherited-style sheets do not include a local relationship section.
- The app must ignore generated formula/XML columns during import and regenerate XML directly in application code.

## Product Architecture

### Recommended Release Shape

Build a local-first full-stack web app:

- Frontend: React + Vite + TypeScript.
- Backend: Node.js + Express.
- Database: SQLite in the project workspace.
- Workbook parsing/export: server-side `exceljs`.
- XML generation: application-owned XML builder with schema-driven mappings.
- Validation: application-owned validation engine.
- UI state: React local state with backend persistence.
- Large grids: virtualized rendering.

This shape keeps the initial product fast and useful while avoiding the risks of browser-only parsing for 65,000+ rows. It also avoids introducing full deployment/auth complexity before the metadata engine is proven.

### Major Components

#### App Shell

The app shell contains:

- Left dimension navigation.
- Top toolbar with Import, Validate, Export, Save, Undo, Redo.
- Main workspace tabs.
- Sticky validation/export status.
- Side drawer for row details and audit/change information.

#### Metadata Engine

The metadata engine owns:

- Dimension schema definitions.
- Field normalization.
- Workbook parsing.
- Validation.
- Hierarchy graph construction.
- XML generation.
- XLSX/CSV/JSON export.

Dimension-specific behavior lives in configuration and mapper modules, not scattered UI conditionals.

#### Persistence Layer

The backend persists imported and edited metadata to SQLite using flexible JSON properties for dimension-specific fields. Common identity, ordering, row-number, and relationship fields remain first-class columns for querying, validation, and hierarchy generation.

#### Governance Layer

The first release includes local governance data structures:

- Audit log.
- Version snapshots.
- Soft delete.
- Project clone.
- Seeded user/role model.

Real sign-in and deployed RBAC can be added in a future release without reshaping the metadata tables.

## Data Model

### Project

- `id`
- `name`
- `description`
- `source_file_name`
- `created_by`
- `created_at`
- `updated_at`

### Dimension

- `id`
- `project_id`
- `sheet_name`
- `dimension_type`
- `dimension_name`
- `description`
- `access_group`
- `maintenance_group`
- `inherited_dimension`
- `sort_order`
- `metadata_json`
- `created_at`
- `updated_at`

### DimensionMember

- `id`
- `dimension_id`
- `member_key`
- `description`
- `properties_json`
- `row_order`
- `source_row_number`
- `is_active`
- `created_at`
- `updated_at`

### DimensionRelationship

- `id`
- `dimension_id`
- `parent_key`
- `child_key`
- `aggregation_weight`
- `percent_consol`
- `percent_ownership`
- `ownership_type`
- `properties_json`
- `row_order`
- `source_row_number`
- `created_at`
- `updated_at`

### ValidationIssue

- `id`
- `project_id`
- `dimension_id`
- `entity_type`
- `entity_id`
- `severity`
- `code`
- `message`
- `field_name`
- `row_number`
- `created_at`

### ExportJob

- `id`
- `project_id`
- `export_type`
- `status`
- `file_url`
- `validation_summary_json`
- `created_at`
- `completed_at`

### AuditLog

- `id`
- `project_id`
- `user_id`
- `action`
- `entity_type`
- `entity_id`
- `before_json`
- `after_json`
- `created_at`

### ProjectSnapshot

- `id`
- `project_id`
- `name`
- `description`
- `snapshot_json`
- `created_by`
- `created_at`

### User, Role, UserRole

The first release seeds one local admin user and `Viewer`, `Editor`, and `Admin` roles. The UI can show role-aware affordances, but real authentication is out of scope for the local-first release.

## Dimension Schema System

Each dimension type has a schema definition:

- `dimensionType`
- `sheetNames`
- `memberKeyField`
- `memberFields`
- `relationshipFields`
- `xmlMemberMapper`
- `xmlRelationshipMapper`
- `booleanFields`
- `numericFields`
- `requiredFields`
- `defaultDuplicateSeverity`

Schemas are required for:

- Scenario
- Entity
- Account
- Flow
- UD2
- UD3
- UD4
- UD5
- UD6
- UD7
- UD8

UD2 through UD8 share a UDx base schema with dimension type-specific labels and XML mapping values.

## Import Strategy

### Workflow

1. User opens Import Wizard.
2. User selects an XLSX workbook.
3. Backend stores the upload temporarily.
4. Backend streams/parses workbook sheets.
5. Parser detects supported dimension sheets by sheet name and/or dimension type metadata.
6. Parser reads dimension metadata from top rows.
7. Parser detects member headers from the configured member header row, with fallback search.
8. Parser detects relationship headers by finding `Parent` and `Child`.
9. Parser imports member rows until the relationship header or sheet end.
10. Parser imports relationship rows from the relationship section when present.
11. Parser ignores generated XML/formula columns.
12. Parser stores project, dimensions, members, and relationships.
13. Parser returns an import summary with counts, warnings, skipped blank rows, and errors.

### Import Rules

- Preserve original column names in `properties_json`.
- Preserve blank/default property values when the row has a real member key.
- Skip rows with no member key and no meaningful values.
- Warn on rows that have default properties but no member key.
- Record `source_row_number`.
- Do not evaluate Excel formulas.
- Treat formula error strings like `#NAME?` as invalid generated output or invalid cell values depending on the source column.
- Support sheets with no local relationship section.
- Handle large sheets efficiently; the `UD3 OUC` sheet must remain importable.

## Export Strategy

### XML Export

XML export generates:

```xml
<?xml version="1.0" encoding="utf-8"?>
<OneStreamXF version="5.0.0.9826">
  <metadataRoot>
    <dimensions>
      <dimension type="{Dimension Type}" name="{Dimension Name}" description="{Description}" accessGroup="{Access Group}" maintenanceGroup="{Maintenance Group}" inheritedDim="{Inherited Dimension}">
        <members>
          <!-- generated member XML -->
        </members>
        <relationships>
          <!-- generated relationship XML -->
        </relationships>
      </dimension>
    </dimensions>
  </metadataRoot>
</OneStreamXF>
```

The generator must:

- Use Scenario-specific member and relationship mappings.
- Use Entity-specific member and relationship mappings.
- Use Account-specific member and relationship mappings.
- Use Flow-specific member and relationship mappings.
- Use generic UDx member and relationship mappings for UD2 through UD8.
- Skip blank member rows.
- Skip generated formula/XML columns.
- Never export `#NAME?` or other formula error values.
- Escape XML special characters.
- Preserve Text1 through Text8.
- Preserve display groups, workflow channels, input flags, consolidation flags, FX fields, ownership fields, and security fields.

The first implementation will generate OneStream-compatible XML shape based on the workbook field names and existing metadata-builder function families. Exact OneStream attribute naming must be centralized in mapper modules so future verification against a known-good OneStream XML export can be done without touching UI code.

### XLSX Export

XLSX export recreates the template layout:

- One worksheet per dimension.
- Dimension metadata in rows 1-6.
- Member headers at row 8.
- Member rows below headers.
- Relationship section after member rows with a blank spacer.
- Relationship headers beginning with `Parent`, `Child`, and dimension-specific relationship fields.
- No dependency on OneStream add-in formulas.

The exported workbook may omit generated XML formula columns by default. A compatibility option can include non-formula `Begin Members` and `Begin Relationships` columns if users need familiar layout columns.

### CSV Export

CSV export supports:

- Members for selected dimension.
- Relationships for selected dimension.
- All dimensions as separate files in a zip archive in a future release.

### JSON Backup

JSON backup exports the complete project:

- Project metadata.
- Dimensions.
- Members.
- Relationships.
- Validation settings.
- Snapshots metadata.

It must be importable by the app for restore/clone scenarios.

## Validation Rules

Validation runs after import, during editing, before XML preview, and before export.

### Blocking Errors

- Dimension Type is required.
- Dimension Name is required.
- Member key is required for rows treated as actual members.
- Relationship Parent is required for rows treated as actual relationships.
- Relationship Child is required for rows treated as actual relationships.
- Circular hierarchy references are blocking errors.
- Numeric fields with non-numeric values are blocking errors unless the field is blank.
- Invalid XML control characters are blocking errors.

### Configurable Severity

- Duplicate member names within a dimension default to warning for legacy workbook tolerance.
- The project setting can make duplicate member names blocking.

### Warnings

- Relationship child not found in local members or inherited-dimension context.
- Relationship parent not found in local members or inherited-dimension context.
- Orphan members not reachable from a root relationship.
- Duplicate parent-child relationship.
- Blank row with default properties but no member key.
- Dimension has relationships but no local members.
- Dimension has local members but no relationships.
- Formula-like values in text/formula fields are not executed.
- OneStream-reserved character concerns when a member name contains characters likely to be rejected by OneStream.

### Field Type Validation

- Boolean-like fields must be blank, `TRUE`, `FALSE`, `True`, `False`, `true`, or `false`.
- Numeric-like fields must parse to finite numbers.
- Formula fields are treated as text and are never executed.
- Text fields are escaped on XML export.

## Hierarchy Strategy

The hierarchy visualizer builds a graph from relationships:

- Nodes are member keys.
- Edges are parent-child relationships.
- Roots are parents with no incoming parent or known OneStream roots such as `Root`.
- Missing referenced members are shown as warning nodes.
- Duplicate relationships are highlighted.
- Circular references are detected by depth-first traversal.
- Orphans are members with no relationship path from a root.

The UI supports:

- Expand/collapse.
- Search.
- Selected-node property drawer.
- Lineage display.
- Issue badges.

For very large dimensions, hierarchy rendering must be incremental and searchable instead of expanding the full graph at once.

## UI Wireframe Plan

### Dashboard

Dashboard cards:

- Total dimensions.
- Total members.
- Total relationships.
- Validation errors.
- Import status.
- Export status.
- Recently edited dimensions.

### Workspace

The workspace has:

- Left sidebar dimension list.
- Top toolbar: Import, Validate, Export, Save, Undo, Redo.
- Dimension title and status.
- Tabs: Overview, Members, Relationships, Hierarchy, XML Preview, Issues.
- Right-side validation summary drawer.

### Overview Tab

Shows:

- Dimension metadata editor.
- Counts by member/relationship/issues.
- Import source details.
- Recent edits.
- Snapshot controls.

### Members Tab

Shows a virtualized editable grid:

- Frozen first column.
- Filtering.
- Sorting.
- Search.
- Bulk paste from Excel.
- Bulk edit.
- Add row.
- Delete row.
- Duplicate row.
- Column visibility controls.
- Required-field indicators.
- Type-aware cells for booleans, numbers, dropdowns, and text.

### Relationships Tab

Shows a virtualized editable grid:

- Parent.
- Child.
- Aggregation Weight for Account, Flow, and UDx.
- Parent Sort Order, Percent Consol, Percent Ownership, Ownership Type, and Text1-Text8 for Entity.
- Parent/Child only for Scenario.

### Hierarchy Tab

Shows:

- Searchable tree.
- Issue highlights.
- Selected member properties.
- Lineage panel.

### XML Preview Tab

Shows:

- One dimension or all dimensions.
- Pretty-printed XML.
- Inline validation issue summary.
- Copy.
- Download.

### Issues Tab

Shows:

- Filterable issues table.
- Severity filters.
- Field/row links back into grids.
- Export blocking summary.

## Security and Governance

First release:

- Local seeded admin user.
- Viewer, Editor, Admin role model in the database.
- UI-aware permissions.
- Audit history for imports, edits, deletes, exports, validation runs, snapshots, and clone operations.
- Soft delete for dimensions, members, and relationships where practical.
- Project snapshots.
- Clone project before edits.

Future release:

- Real authentication.
- Server-side permission enforcement by user identity.
- PostgreSQL or managed database.
- File storage for upload/export artifacts.
- Deployment hardening.

## Performance Requirements

The app must support:

- At least 65,000 total worksheet rows.
- At least 32,000 members in one dimension.
- The observed `UD3 OUC` sheet with 65,055 rows.
- Virtualized member and relationship grids.
- Server-side XLSX processing.
- Batch validation.
- Efficient graph generation.
- Export jobs that do not freeze the UI.

Implementation choices:

- Paginated or windowed API endpoints for grid data.
- Virtualized table rendering in the frontend.
- Indexed SQLite columns for `dimension_id`, `member_key`, `parent_key`, `child_key`, and row order.
- Avoid loading all grid rows into React state for large dimensions.

## Acceptance Criteria

The first release is complete when:

- User can import `XF Dimensions Template - 29.04.2026.xlsx`.
- All 12 sheets are parsed.
- Members and relationships are persisted and editable.
- Generated XML/formula columns are ignored during import.
- Blank/default rows are not exported as members.
- Validation issues are shown clearly.
- Hierarchy tree renders from relationships.
- XML preview matches the required OneStream XF metadata wrapper structure.
- User can export XML.
- User can export workbook-compatible XLSX.
- User can export member and relationship CSV.
- User can export JSON backup.
- Large UD3-style dimensions remain usable through virtualization.
- Audit log records import, edit, validate, export, snapshot, and clone actions.
- The UI has clean enterprise styling and feels like a professional metadata management tool.

## Implementation Roadmap

1. Scaffold React/Vite frontend and Express backend.
2. Add TypeScript, lint/build scripts, and app folder structure.
3. Add SQLite schema and repository modules.
4. Define dimension schemas and shared field types.
5. Implement workbook import parser.
6. Implement validation engine.
7. Implement XML generator.
8. Implement CSV, JSON, and XLSX exporters.
9. Build dashboard and app shell.
10. Build dimension metadata editor.
11. Build virtualized members grid.
12. Build virtualized relationships grid.
13. Build hierarchy visualizer.
14. Build XML preview.
15. Build import and export wizards.
16. Add audit log, snapshots, and clone project.
17. Verify with the supplied workbook.
18. Polish styling, responsiveness, and error states.

## Open Constraints

- A known-good OneStream XML export from the Excel add-in is not present in the workspace. The first implementation will use a centralized mapper based on the template fields and required wrapper structure. Exact attribute names can be refined in a future XML-mapping pass against a known-good XML sample without changing storage or UI architecture.
- The local-first release does not include production authentication. It includes the data model and UI permission boundaries needed to add it in a future release.
- The workspace is not currently a git repository, so the design document cannot be committed unless a repository is initialized or supplied.
