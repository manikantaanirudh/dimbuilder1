# Dimension Blueprints

Dimension blueprints are the mechanism that makes SR Onestream Dim Builder generic. They live under `dimensions.blueprints` in `config/dimbuilder.yaml` and are used by `src/server/projectBlueprints.ts` to create blank metadata projects.

## Purpose

Blueprints define the default starting state for each dimension type:

- dimension name
- root members
- member key field
- optional seeded members
- optional seeded relationships
- relationship defaults
- multiple-parent policy metadata

## Blueprint Shape

```yaml
dimensions:
  blueprints:
    Account:
      defaultDimensionName: Accounts
      rootMembers:
        - Root
      memberKeyField: Account
      members:
        - memberKey: Revenue
          description: Revenue
          properties:
            Account Type: Revenue
      relationships:
        - parentKey: Root
          childKey: Revenue
          aggregationWeight: 1
      relationshipDefaults:
        aggregationWeight: 1
      allowMultipleParents: true
```

## Required Fields

- `defaultDimensionName`: Non-empty OneStream dimension name.
- `rootMembers`: Non-empty list of member keys created first.
- `memberKeyField`: Must exist in the dimension schema's member fields.
- `relationshipDefaults`: Object. May be empty.
- `allowMultipleParents`: Boolean metadata used by the app, relationship operation planning, and validation.

## Optional Fields

- `members`: Additional seeded members.
- `relationships`: Seeded parent-child relationships.

## Relationship Defaults

Supported default keys are defined in `src/shared/relationshipDefaults.ts`:

- `aggregationWeight`
- `percentConsol`
- `percentOwnership`
- `ownershipType`

Defaults are mapped to OneStream relationship fields only when the target dimension schema supports those fields.

## Multiple Parent Policy

`allowMultipleParents` is stored on created dimension metadata. Relationship load-mode planning and validation use it to warn when a planned `copy` operation would add another parent in a dimension configured as single-parent. The app still preserves the user-entered relationship data; the warning is there so release reviewers can decide whether the hierarchy change is intentional.

## Project Creation Behavior

When a blank project is created:

1. The server filters `dimensions.displayOrder` to only `dimensions.enabledTypes`.
2. Each dimension type resolves a configured blueprint or a fallback blueprint.
3. A dimension record is inserted.
4. Root members are inserted first.
5. Optional blueprint members are merged by `memberKey`.
6. Optional blueprint relationships are inserted with default properties applied.
7. An audit log records `project.create`.

## Fallback Behavior

If a dimension type is enabled but has no explicit blueprint, `projectBlueprints.ts` falls back to:

- dimension name from `preferredMetadataNames`, first schema sheet name, or dimension type
- `Root` as the root member
- schema member key field
- relationship defaults inferred from schema fields
- `allowMultipleParents: true`

## Blueprint Studio

Blueprint Studio is a UI and API authoring aid for blueprint changes. It lets admins inspect the effective configured blueprint, edit a JSON draft, validate it through the same config validation used at startup, preview a deterministic YAML fragment, and generate a draft from an existing project dimension.

Blueprint Studio is intentionally safe:

- It does not write `config/dimbuilder.yaml`.
- `config/dimbuilder.yaml` remains the reviewed source of truth.
- Generated YAML fragments must be applied through the team's normal config change process.
- Draft generation reads dimensions, members, and relationships through repositories and strips fields the app can regenerate, such as member key and relationship parent/child fields.

Source anchors:

- Shared helpers: `src/shared/blueprintStudio.ts`
- HTTP routes: `src/server/routes/blueprints.ts` and `POST /api/projects/:projectId/dimensions/:dimensionId/blueprint`
- Client panel: `src/client/components/BlueprintStudio.tsx`

## Source Anchors

- Config file: `config/dimbuilder.yaml`
- Types: `src/shared/appConfigTypes.ts`
- Validation: `src/shared/appConfigValidation.ts`
- Defaults mapping: `src/shared/relationshipDefaults.ts`
- Studio helpers: `src/shared/blueprintStudio.ts`
- Creation service: `src/server/projectBlueprints.ts`
- Tests: `src/test/projectBlueprints.test.ts`, `src/test/appConfig.test.ts`, `src/test/blueprintStudio.test.ts`
