# SR Onestream Dim Builder Generic Builder Design

Status: design approved in conversation, pending written-spec review
Date: 2026-05-19

## Context

The current application can import an Excel-based OneStream XF metadata workbook, parse dimensions, validate the imported members and relationships, and export OneStream-compatible XML. That workbook was useful as a reference and seed source, but the product narrative should not imply that the app is specific to that workbook or to one application.

The product should become a generic builder named **SR Onestream Dim Builder**. Users should be able to create or open a metadata project, define dimensions and hierarchies, edit member and relationship properties, validate the result, preview XML, and export XML from the information they add. Excel import remains useful, but only as an optional seed path.

## Goals

- Rename the browser-facing and app-facing identity to **SR Onestream Dim Builder**.
- Rewrite copy so the application is a generic OneStream dimension metadata builder, not an Excel workbook viewer.
- Promote `config/dimbuilder.yaml` into the central builder configuration document.
- Let configuration define enabled dimension types, display order, default dimension names, hierarchy roots, relationship defaults, validation rules, and export defaults.
- Keep actual editable project data inside the app: dimensions, members, relationships, member properties, and relationship properties.
- Allow XML export from manually entered app data, not only from imported workbook data.
- Keep XLSX import as an optional "seed from XLSX" workflow.
- Preserve the existing Notion-inspired workbench visual system unless a later visual redesign explicitly changes it.

## Non-Goals

- Do not remove XLSX import.
- Do not redesign the whole UI layout again.
- Do not make the YAML file the only place where users must author every member and relationship.
- Do not add authentication, multi-user permissions, or external storage in this iteration.
- Do not change the generated XML structure beyond what is required to support app-authored metadata projects.

## Recommended Approach

Use the hybrid model:

- `config/dimbuilder.yaml` defines the blueprint: what dimensions exist, how they should be named by default, which fields and rules apply, which roots should exist, and how XML should be exported.
- The app database remains the source of truth for project-specific content: dimensions, members, relationships, and property values.
- XML export reads from app state, so both manually entered data and XLSX-seeded data export through the same path.

This fits the current codebase because it already has a central YAML config, typed config defaults, project records, dimension records, member records, relationship records, validation, and XML export from records.

## Central Configuration Design

Extend the existing `dimensions` config with a blueprint section. The exact code shape can be refined during planning, but the intended YAML model is:

```yaml
application:
  productName: SR Onestream Dim Builder
  title: SR Onestream Dim Builder
  description: Build, validate, preview, and export OneStream dimension metadata.

dimensions:
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
  blueprints:
    Account:
      defaultDimensionName: Accounts
      rootMembers:
        - Root
      memberKeyField: Account
      relationshipDefaults:
        aggregationWeight: 1
      allowMultipleParents: true
    Entity:
      defaultDimensionName: Entities
      rootMembers:
        - Root
      memberKeyField: Entity
      relationshipDefaults:
        percentConsol: 100
        percentOwnership: 100
      allowMultipleParents: true
    UD1:
      defaultDimensionName: UD1
      rootMembers:
        - Root
      memberKeyField: Member
      relationshipDefaults:
        aggregationWeight: 1
```

Blueprints should initially support:

- `defaultDimensionName`: the dimension name used when creating a blank dimension of this type.
- `rootMembers`: seed members used to create the top of the hierarchy.
- `memberKeyField`: the primary member key field for the dimension type.
- `relationshipDefaults`: default relationship values applied when adding relationships.
- `allowMultipleParents`: validation hint for relationship structure.

Later iterations can add configured property presets, dropdown values, aliases, or per-dimension XML overrides if needed.

## Data Model

The existing records remain the core model:

- `ProjectRecord`: app-owned metadata project.
- `DimensionRecord`: dimension type, dimension name, security groups, inherited dimension, metadata.
- `DimensionMemberRecord`: member key, description, properties.
- `DimensionRelationshipRecord`: parent, child, aggregation and ownership fields, properties.

The implementation should add a way to create a blank project and seed dimensions from configured blueprints. Imported XLSX projects and blank app-authored projects should converge into the same records.

`sourceFileName` should become optional or be treated as source status, because a manually created project does not have a source workbook.

## User Experience

The visible identity should be:

- Browser title: `SR Onestream Dim Builder`
- Header/brand wordmark: `SR Onestream Dim Builder`
- Config product title: `SR Onestream Dim Builder`
- Export creator fallback: `SR Onestream Dim Builder`

Main narrative changes:

- Replace "Import a workbook to begin" with "Create or seed a metadata project."
- Replace "Import" as the dominant required action with either "New Project" or "Create Project".
- Rename workbook import affordances to "Seed from XLSX" or "Import XLSX".
- Keep Validate and Export available once a project exists, regardless of whether it came from XLSX.
- Dashboard should describe current project status, dimension count, member count, relationship count, validation status, and export readiness.

The app should support this primary path:

1. User creates a new metadata project.
2. App seeds configured dimension shells and root members from YAML blueprints.
3. User adds members and relationships in the existing grid/tree workspace.
4. User validates.
5. User previews XML.
6. User exports XML.

The app should also support this secondary path:

1. User seeds from XLSX.
2. Parser creates the same project, dimension, member, and relationship records.
3. User edits, validates, previews, and exports through the same path.

## XML Export

XML export should continue to use `exportProjectXml` with project, dimension, member, and relationship records. The important behavioral change is that those records may originate from manual creation instead of workbook parsing.

Export should remain blocked by configured blocking severities. Blank manually created roots and dimensions should be valid only if they satisfy required member and relationship rules.

## Validation

Existing validation stays relevant:

- missing required fields
- duplicate members
- duplicate relationships
- unknown relationship members
- circular hierarchy
- relationship records with no local members
- formula error values when imported from XLSX

Blueprint-aware validation should add or clarify:

- configured root members should exist when a blueprint defines them.
- relationship defaults should be applied consistently when a relationship is created.
- dimension type and dimension name should be valid for configured enabled types.
- export should explain what is missing in a manually authored project instead of telling the user to import a workbook.

## Error Handling

- If config has an invalid dimension type, the config loader should reject it with a clear error.
- If a blueprint references an unsupported field, validation should warn or fail during config validation.
- If project creation from blueprint fails, the UI should show a concise failure message and leave existing projects untouched.
- If XML export is requested with no project, the UI should say a project must be created or opened first.
- If XML export is requested with validation-blocking errors, export should remain disabled and the issue panel should guide the user to the blocking rows.

## Testing Strategy

Unit tests should cover:

- default app identity is `SR Onestream Dim Builder`.
- YAML config can load dimension blueprints.
- config validation rejects unsupported blueprint dimension types.
- blank project creation from blueprints creates dimensions and root members.
- XML export works for a manually created project.
- XLSX import still works and still converges into the same records.
- UI copy no longer describes XLSX import as the only start path.
- export/validate disabled reasons say "create or open a project" instead of "import a project".

Existing parser and XML tests should be adjusted only where wording or app identity changes require it.

## Acceptance Criteria

- The application heading and browser title show `SR Onestream Dim Builder`.
- The app no longer presents the Excel workbook as the required source of truth.
- `config/dimbuilder.yaml` contains central dimension blueprint configuration.
- A user can create a blank project using configured dimensions.
- A user can add or edit metadata in the app and export XML from it.
- XLSX import remains available as an optional seeding workflow.
- Validation and export behavior works for both app-authored and XLSX-seeded projects.
- Tests and build pass after implementation.

## Scope Boundary

This spec covers product narrative, central blueprint configuration, blank project creation, and XML export from app-authored data. It does not cover a deeper drag-and-drop hierarchy designer, advanced bulk editing, multi-application deployment management, or direct OneStream API deployment.
