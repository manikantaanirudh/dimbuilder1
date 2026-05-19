# Validation Rules

Validation is implemented in `src/shared/validationEngine.ts` and invoked by `src/server/routes/validation.ts` and the import route.

## Validation Scope

Validation runs per dimension and checks:

- required dimension fields
- required member keys
- duplicate members
- unknown member and relationship properties by OneStream dimension type
- dictionary enum values
- dictionary-backed boolean, number, and decimal property types
- boolean fields
- numeric fields
- Excel formula error values
- XML-invalid control characters
- missing relationship parent or child
- unknown relationship child values
- duplicate relationships
- circular hierarchy
- orphan members
- relationships with no local members

## Severity Configuration

Config section:

```yaml
validation:
  duplicateMemberSeverity: warning
  duplicateRelationshipSeverity: warning
  unknownRelationshipMemberSeverity: warning
  missingRequiredFieldSeverity: error
  circularHierarchySeverity: error
  relationshipsWithNoLocalMembersSeverity: warning
  exportBlockedBySeverities:
    - error
```

Allowed severities are:

- `error`
- `warning`
- `info`

## Export Blocking

The client uses `validation.exportBlockedBySeverities` to disable export when matching issues exist. The server currently does not block export requests based on stored issues.

## Issue Codes

Current issue codes include:

- `DIMENSION_TYPE_REQUIRED`
- `DIMENSION_NAME_REQUIRED`
- `MEMBER_KEY_REQUIRED`
- `DUPLICATE_MEMBER`
- `RELATIONSHIP_PARENT_REQUIRED`
- `RELATIONSHIP_CHILD_REQUIRED`
- `UNKNOWN_RELATIONSHIP_CHILD`
- `UNKNOWN_PROPERTY`
- `INVALID_ENUM_VALUE`
- `INVALID_PROPERTY_TYPE`
- `INVALID_BOOLEAN`
- `INVALID_NUMBER`
- `FORMULA_ERROR_VALUE`
- `XML_INVALID_CHARACTER`
- `CIRCULAR_HIERARCHY`
- `DUPLICATE_RELATIONSHIP`
- `ORPHAN_MEMBER`
- `RELATIONSHIPS_WITH_NO_LOCAL_MEMBERS`

## Hierarchy Analysis

Hierarchy checks are delegated to `src/shared/hierarchy.ts`. The validation engine uses that analysis to find cycles, duplicate relationships, and orphan members.

## OneStream Property Dictionary

Property-level validation uses `src/shared/oneStreamPropertyDictionary.ts`. The dictionary is shared with XML export, API schema responses, and grid labels so all layers reason about aliases, XML names, target levels, and value types consistently.

Unknown property findings are warnings by default and do not block export unless warning severities are configured as blocking in `validation.exportBlockedBySeverities`. Enum and property type failures are errors because they indicate a value that does not match a known OneStream property contract.

## Persistence

Validation issues are stored in `validation_issues`. A validation run replaces all existing issues for the project.

## Tests

Primary coverage:

- `src/test/validationEngine.test.ts`
- `src/test/hierarchy.test.ts`
- `src/test/projectRoutes.test.ts`
