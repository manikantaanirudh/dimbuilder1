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
- OneStream design profile rules for naming, aliases, Root/None casing, sort order, shared members, and high-risk dimension properties
- varying property target existence, duplicate contexts, dictionary support, and dictionary value types
- preserved unknown XML import attributes and unsupported child elements
- boolean fields
- numeric fields
- Excel formula error values
- XML-invalid control characters
- missing relationship parent or child
- unknown relationship child values
- relationship operation planning metadata
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
  oneStreamProfile:
    enabled: true
    memberNameMaxLength: 250
    warnOnMemberNameSpaces: true
    warnOnMemberNamePeriods: true
    reservedWords:
      - Root
      - None
    restrictedCharacters:
      - "<"
      - ">"
      - "\""
      - "'"
      - "&"
      - "|"
      - "["
      - "]"
    duplicateAliasSeverity: warning
    invalidSortOrderSeverity: warning
    sharedMemberSeverity: info
    parentInputWarningSeverity: warning
    unknownPropertySeverity: warning
    invalidEnumSeverity: error
    invalidPropertyTypeSeverity: error
  exportBlockedBySeverities:
    - error
```

Allowed severities are:

- `error`
- `warning`
- `info`

## Export Blocking

The client uses `validation.exportBlockedBySeverities` to disable export when matching issues exist, and the server enforces the same rule in `src/server/exportGuards.ts`.

Guarded endpoints:

- `GET /api/export/:projectId/xml`
- `GET /api/export/:projectId/json`
- `GET /api/export/:projectId/members.csv`
- `GET /api/export/:projectId/relationships.csv`
- `GET /api/export/:projectId/xlsx`
- `POST /api/export/:projectId/snapshot`

Blocking validation severities return HTTP `409` with `blocked: true`, `blockedSeverities`, and `issueCounts`. Unknown-property warnings still do not block export unless warnings are configured as blocking.

Optional export config can allow an audited bypass:

- `export.allowValidationBypass`
- `export.validationBypassRequiresReason`
- `export.requireValidationBeforeExport`

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
- `MEMBER_NAME_TOO_LONG`
- `MEMBER_NAME_CONTAINS_SPACE`
- `MEMBER_NAME_CONTAINS_PERIOD`
- `MEMBER_NAME_RESTRICTED_CHARACTER`
- `RESERVED_MEMBER_NAME_CASE_MISMATCH`
- `DUPLICATE_ALIAS`
- `ALIAS_DUPLICATES_MEMBER_NAME`
- `SORT_ORDER_ZERO`
- `SORT_ORDER_DUPLICATE`
- `SHARED_MEMBER_DETECTED`
- `MULTIPLE_PARENT_NOT_ALLOWED`
- `PARENT_MEMBER_ALLOW_INPUT_WARNING`
- `ACCOUNT_TYPE_MISSING`
- `ENTITY_CURRENCY_MISSING`
- `RELATIONSHIP_WEIGHT_MISSING`
- `ENTITY_OWNERSHIP_VALUE_INVALID`
- `VARYING_PROPERTY_DUPLICATE`
- `DUPLICATE_VARYING_PROPERTY`
- `UNKNOWN_VARYING_PROPERTY`
- `NON_VARYING_PROPERTY_OVERRIDE`
- `VARYING_PROPERTY_TARGET_NOT_FOUND`
- `INVALID_VARYING_PROPERTY_VALUE`
- `INVALID_BOOLEAN`
- `INVALID_NUMBER`
- `FORMULA_ERROR_VALUE`
- `XML_INVALID_CHARACTER`
- `XML_UNKNOWN_DIMENSION_ATTRIBUTE`
- `XML_UNKNOWN_MEMBER_ATTRIBUTE`
- `XML_UNKNOWN_RELATIONSHIP_ATTRIBUTE`
- `XML_UNSUPPORTED_ELEMENT_PRESERVED`
- `RELATIONSHIP_DELETE_CREATES_ORPHAN`
- `BREAK_BUILD_HAS_NO_BASELINE`
- `MOVE_WITHOUT_OLD_PARENT`
- `COPY_CONFLICTS_WITH_SINGLE_PARENT_POLICY`
- `RELATIONSHIP_OPERATION_UNSUPPORTED`
- `CIRCULAR_HIERARCHY`
- `DUPLICATE_RELATIONSHIP`
- `ORPHAN_MEMBER`
- `RELATIONSHIPS_WITH_NO_LOCAL_MEMBERS`

## Hierarchy Analysis

Hierarchy checks are delegated to `src/shared/hierarchy.ts`. The validation engine uses that analysis to find cycles, duplicate relationships, and orphan members.

## OneStream Property Dictionary

Property-level validation uses `src/shared/oneStreamPropertyDictionary.ts`. The dictionary is shared with XML export, API schema responses, and grid labels so all layers reason about aliases, XML names, target levels, and value types consistently.

Unknown property findings are warnings by default and do not block export unless warning severities are configured as blocking in `validation.exportBlockedBySeverities`. Enum and property type failures are errors because they indicate a value that does not match a known OneStream property contract. `validation.oneStreamProfile.unknownPropertySeverity`, `invalidEnumSeverity`, and `invalidPropertyTypeSeverity` can tune those severities while keeping the dictionary in shared domain logic.

## OneStream Validation Profile

The OneStream-specific profile lives in `src/shared/oneStreamValidation.ts` and is orchestrated by `src/shared/validationEngine.ts`. It is enabled by default through `validation.oneStreamProfile.enabled` and can be disabled for a single API validation run by posting `profile: "default"`.

Profile rules include:

- member name max length, spaces, periods, and restricted characters
- reserved member casing for `Root` and `None`
- duplicate aliases and aliases that match any member key in the same dimension
- member and relationship sort order zero warnings
- duplicate sibling relationship sort order warnings
- shared-member detection, with `MULTIPLE_PARENT_NOT_ALLOWED` as an error when dimension metadata says `allowMultipleParents: false`
- parent members with `Allow Input` enabled
- missing Account Type on non-reserved Account members
- missing Currency on non-reserved Entity members
- missing Aggregation Weight on weighted relationship dimensions
- Entity ownership and consolidation percentages outside `0-100`
- duplicate varying property contexts as `VARYING_PROPERTY_DUPLICATE`

The profile is intentionally a design-quality layer. It does not replace generic integrity checks, and it does not assume a live OneStream connection.

## Varying Properties

Varying-property validation reads `VaryingPropertyValueRecord` rows from `varying_property_values` through `src/server/routes/validation.ts` and validates them in `src/shared/validationEngine.ts`.

Rules:

- the target must exist in the current dimension
- each target/property/cube/scenario/time combination must be unique
- dictionary-known properties use enum, boolean, number, and decimal checks
- unknown varying properties are warnings, not export blockers by default
- overrides for properties not marked with `supportsVarying` warn with `NON_VARYING_PROPERTY_OVERRIDE`

This keeps unknown custom metadata preservable while still surfacing likely OneStream contract problems.

## Relationship Operation Planning

Relationship load-mode planning uses optional operation metadata on relationship records and shared planning output from `src/shared/relationshipOperations.ts`.

Validation emits:

- `RELATIONSHIP_DELETE_CREATES_ORPHAN` when delete or break operations may make a member unreachable.
- `BREAK_BUILD_HAS_NO_BASELINE` when a break operation is not sourced from a baseline comparison.
- `MOVE_WITHOUT_OLD_PARENT` when a move operation lacks old-parent context.
- `COPY_CONFLICTS_WITH_SINGLE_PARENT_POLICY` when a copy operation conflicts with blueprint metadata where `allowMultipleParents` is false.
- `RELATIONSHIP_OPERATION_UNSUPPORTED` when a relationship row carries an operation outside the supported operation vocabulary.

These checks are warnings by default except unsupported operations, which are errors.

## XML Import Preservation Notes

XML import stores unmapped attributes and unsupported child elements under `__unknownXml` in dimension metadata or member/relationship properties. Validation emits informational notes for those preserved fields:

- `XML_UNKNOWN_DIMENSION_ATTRIBUTE`
- `XML_UNKNOWN_MEMBER_ATTRIBUTE`
- `XML_UNKNOWN_RELATIONSHIP_ATTRIBUTE`
- `XML_UNSUPPORTED_ELEMENT_PRESERVED`

These issues document round-trip preservation and do not block export by default. The exporter re-emits preserved unknown XML when a known edited value has not already claimed the same XML attribute or property name.

## Persistence

Validation issues are stored in `validation_issues`. A validation run replaces all existing issues for the project.
Export blocking reads these stored issues through repository helpers; routes do not query `validation_issues` directly.

## Tests

Primary coverage:

- `src/test/validationEngine.test.ts`
- `src/test/oneStreamValidation.test.ts`
- `src/test/hierarchy.test.ts`
- `src/test/projectRoutes.test.ts`
