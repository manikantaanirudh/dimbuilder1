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
- `allowMultipleParents`: Boolean metadata used by the app and future governance logic.

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

## Source Anchors

- Config file: `config/dimbuilder.yaml`
- Types: `src/shared/appConfigTypes.ts`
- Validation: `src/shared/appConfigValidation.ts`
- Defaults mapping: `src/shared/relationshipDefaults.ts`
- Creation service: `src/server/projectBlueprints.ts`
- Tests: `src/test/projectBlueprints.test.ts`, `src/test/appConfig.test.ts`

