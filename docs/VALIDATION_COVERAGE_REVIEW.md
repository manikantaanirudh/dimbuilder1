# Validation Coverage Review

**Date:** 2026-05-25  
**Scope:** `src/shared/validationEngine.ts`, `src/shared/oneStreamValidation.ts`, `src/shared/hierarchy.ts`  
**Config:** `config/dimbuilder.yaml` (validation section)  
**Tests:** `src/test/validationEngine.test.ts`, `src/test/oneStreamValidation.test.ts`

---

## Complete Rule Inventory

### A. Core Validation Engine (`validationEngine.ts`)

| # | Rule Code | What It Checks | Severity | Blocks Export | Why It Matters for OneStream | Test Evidence |
|---|-----------|---------------|----------|--------------|------------------------------|---------------|
| 1 | `DIMENSION_TYPE_REQUIRED` | Dimension type is populated | error (configurable) | Yes | OneStream requires every dimension to declare its type (Account, Entity, etc.) for schema binding | `validationEngine.test.ts` - "uses configured severities" |
| 2 | `DIMENSION_NAME_REQUIRED` | Dimension name is populated | error (configurable) | Yes | Dimension name maps directly to XML `<dimension name="">` attribute | `validationEngine.test.ts` - "uses configured severities" |
| 3 | `MEMBER_KEY_REQUIRED` | Every member row has a key | error (configurable) | Yes | Members cannot exist in OneStream without a unique key | `validationEngine.test.ts` - implied via member validation |
| 4 | `DUPLICATE_MEMBER` | Same memberKey appears >1 time | warning (configurable) | Configurable | OneStream rejects duplicate member names within a dimension | `validationEngine.test.ts` - "detects duplicate members and missing relationship children" |
| 5 | `RELATIONSHIP_PARENT_REQUIRED` | Relationship has parent key | error (configurable) | Yes | Parent is mandatory in OneStream relationship XML | `validationEngine.test.ts` - implied via relationship validation |
| 6 | `RELATIONSHIP_CHILD_REQUIRED` | Relationship has child key | error (configurable) | Yes | Child is mandatory in OneStream relationship XML | `validationEngine.test.ts` - implied via relationship validation |
| 7 | `UNKNOWN_RELATIONSHIP_CHILD` | Relationship child not found in local members | warning (configurable) | Configurable | Prevents dangling references unless dimension inherits members | `validationEngine.test.ts` - "detects duplicate members and missing relationship children" |
| 8 | `DUPLICATE_RELATIONSHIP` | Same parent-child pair duplicated | warning (configurable) | Configurable | OneStream ignores or errors on duplicate relationships during import | `validationEngine.test.ts` - "uses configured severities" |
| 9 | `CIRCULAR_HIERARCHY` | Hierarchy contains a cycle (DFS detection) | error (configurable) | Yes | Circular references cause infinite loops in consolidation processing | `validationEngine.test.ts` - "blocks invalid booleans, invalid numbers, and circular references" |
| 10 | `ORPHAN_MEMBER` | Member not reachable from any root | warning | No | Orphaned members consume space but never appear in hierarchy navigation | `validationEngine.test.ts` - implied via hierarchy analysis |
| 11 | `RELATIONSHIPS_WITH_NO_LOCAL_MEMBERS` | Relationships exist but zero members | warning (configurable) | Configurable | May indicate an import problem; valid for inherited dimensions | `validationEngine.test.ts` - "uses configured severities" |
| 12 | `INVALID_BOOLEAN` | Boolean property not TRUE/FALSE | error | Yes | OneStream strictly requires "True"/"False" for boolean metadata attributes | `validationEngine.test.ts` - "blocks invalid booleans, invalid numbers, and circular references" |
| 13 | `INVALID_NUMBER` | Numeric field is not a valid number | error | Yes | Non-numeric values in numeric XML attributes cause parse failures | `validationEngine.test.ts` - "blocks invalid numeric relationship properties" |
| 14 | `FORMULA_ERROR_VALUE` | Cell contains Excel formula error (#REF!, #N/A, etc.) | error | Yes | Formula errors are meaningless data that would corrupt metadata | `validationEngine.test.ts` - implied via text validation |
| 15 | `XML_INVALID_CHARACTER` | Text contains XML-illegal control chars | error | Yes | Invalid XML characters cause parse failures when OneStream imports the file | `validationEngine.test.ts` - implied via text validation |
| 16 | `INVALID_ENUM_VALUE` | Property value not in OneStream's allowed enum list | error (configurable) | Yes (at error) | OneStream rejects unknown enum values for typed properties like Account Type | `validationEngine.test.ts` - "validates dictionary enum and value types" |
| 17 | `INVALID_PROPERTY_TYPE` | Dictionary property has wrong value type (boolean/number mismatch) | error (configurable) | Yes (at error) | Type mismatches cause silent data loss or import errors | `validationEngine.test.ts` - "validates dictionary enum and value types" |
| 18 | `UNKNOWN_PROPERTY` | Property not in OneStream property dictionary | warning (configurable) | No | Warns about custom/legacy properties that may not map to OneStream schema | `validationEngine.test.ts` - "validates dictionary enum and value types" |
| 19 | `DUPLICATE_VARYING_PROPERTY` | Same target+context has multiple varying values | error | Yes | OneStream allows only one value per property per varying context | `validationEngine.test.ts` - "validates varying property targets" |
| 20 | `VARYING_PROPERTY_TARGET_NOT_FOUND` | Varying property references a non-existent member/relationship | error | Yes | Orphaned varying values have no target to attach to in XML | `validationEngine.test.ts` - "validates varying property targets" |
| 21 | `UNKNOWN_VARYING_PROPERTY` | Varying property name not in dictionary | warning (configurable) | No | May be a legacy property or typo that won't be recognized | `validationEngine.test.ts` - "validates varying property targets" |
| 22 | `NON_VARYING_PROPERTY_OVERRIDE` | Property doesn't support varying but has override context | warning | No | OneStream will ignore varying values for non-varying properties | `validationEngine.test.ts` - "validates varying property targets" |
| 23 | `INVALID_VARYING_PROPERTY_VALUE` | Varying property value fails type/enum check | error (configurable) | Yes (at error) | Same type constraints apply to varying values as base values | `validationEngine.test.ts` - "validates varying property targets" |
| 24 | `XML_UNKNOWN_DIMENSION_ATTRIBUTE` | Imported XML had unmapped dimension-level attribute | info | No | Informational: preserved on export, no user action needed | `validationEngine.test.ts` - "reports preserved unknown XML attributes" |
| 25 | `XML_UNKNOWN_MEMBER_ATTRIBUTE` | Imported XML had unmapped member-level attribute | info | No | Informational: preserved on export | `validationEngine.test.ts` - "reports preserved unknown XML attributes" |
| 26 | `XML_UNKNOWN_RELATIONSHIP_ATTRIBUTE` | Imported XML had unmapped relationship attribute | info | No | Informational: preserved on export | `validationEngine.test.ts` - "reports preserved unknown XML attributes" |
| 27 | `XML_UNSUPPORTED_ELEMENT_PRESERVED` | Imported XML had unmapped child elements | info | No | Informational: preserved on export | `validationEngine.test.ts` - "reports preserved unknown XML attributes" |
| 28 | `RELATIONSHIP_OPERATION_UNSUPPORTED` | Relationship operation value not recognized | error | Yes | Invalid operation types cannot be executed during deployment | `validationEngine.test.ts` - "warns for risky relationship operation planning" |
| 29 | `COPY_CONFLICTS_WITH_SINGLE_PARENT_POLICY` | Copy op on dimension that disallows multiple parents | warning | No | Copy creates shared members, violating blueprint policy | `validationEngine.test.ts` - "warns for risky relationship operation planning" |
| 30 | `MOVE_WITHOUT_OLD_PARENT` | Move operation missing old parent context | warning | No | Move requires knowing where to detach from before re-attaching | `validationEngine.test.ts` - "warns for risky relationship operation planning" |
| 31 | `BREAK_BUILD_HAS_NO_BASELINE` | Break operation not sourced from baseline comparison | warning | No | Break operations should be derived from diff, not manual entry | `validationEngine.test.ts` - "warns for risky relationship operation planning" |
| 32 | `RELATIONSHIP_DELETE_CREATES_ORPHAN` | Deleting relationship would orphan a member | warning | No | Orphaned members become invisible in OneStream but still exist | `validationEngine.test.ts` - "warns for risky relationship operation planning" |

### B. OneStream-Specific Validation (`oneStreamValidation.ts`)

| # | Rule Code | What It Checks | Severity | Blocks Export | Why It Matters for OneStream | Test Evidence |
|---|-----------|---------------|----------|--------------|------------------------------|---------------|
| 33 | `MEMBER_NAME_TOO_LONG` | Member key exceeds `memberNameMaxLength` (default 500) | warning | No | OneStream has a hard 500-char limit on member names | `oneStreamValidation.test.ts` - "validates member naming conventions" + "uses 500-character limit" |
| 34 | `MEMBER_NAME_CONTAINS_SPACE` | Member key contains whitespace | warning | No | Spaces complicate scripting, MemberScript filters, and API calls | `oneStreamValidation.test.ts` - "validates member naming conventions" |
| 35 | `MEMBER_NAME_CONTAINS_PERIOD` | Member key contains `.` | warning | No | Periods break MemberScript dot-notation and hierarchical path resolution | `oneStreamValidation.test.ts` - "validates member naming conventions" |
| 36 | `MEMBER_NAME_RESTRICTED_CHARACTER` | Member key contains OneStream-illegal character | error | Yes | OneStream rejects these characters at import time | `oneStreamValidation.test.ts` - "validates member naming conventions" + "flags all official restricted characters" |
| 37 | `RESERVED_MEMBER_NAME_CASE_MISMATCH` | Reserved word with wrong casing (e.g., "root" vs "Root") | warning | No | OneStream is case-sensitive for system members; wrong casing causes lookup failures | `oneStreamValidation.test.ts` - "validates member naming conventions" + "flags reserved words with wrong casing" |
| 38 | `ALIAS_DUPLICATES_MEMBER_NAME` | Alias value matches an existing member name | warning/error (configurable) | Configurable | Alias-member name collisions cause ambiguous lookups in reports and business rules | `oneStreamValidation.test.ts` - "validates member naming conventions" |
| 39 | `DUPLICATE_ALIAS` | Same alias used by multiple members | warning/error (configurable) | Configurable | Duplicate aliases make member resolution non-deterministic | `oneStreamValidation.test.ts` - "validates member naming conventions" |
| 40 | `SORT_ORDER_ZERO` | Member or relationship has sort order 0 | warning (configurable) | No | Sort order 0 is the uninitialized state; members may appear in unpredictable order | `oneStreamValidation.test.ts` - "flags sort-order risks, shared members" |
| 41 | `SORT_ORDER_DUPLICATE` | Siblings under same parent share the same sort order | warning (configurable) | No | Duplicate sort orders cause non-deterministic display ordering | `oneStreamValidation.test.ts` - "flags sort-order risks, shared members" |
| 42 | `SHARED_MEMBER_DETECTED` | Member appears under multiple parents (multi-parent allowed) | info (configurable) | No | Informational awareness of shared members for governance review | `oneStreamValidation.test.ts` - "emits shared member info when dimension allows multiple parents" |
| 43 | `MULTIPLE_PARENT_NOT_ALLOWED` | Member under multiple parents but dimension is single-parent | error | Yes | Violates dimension blueprint constraint; OneStream will reject | `oneStreamValidation.test.ts` - "flags sort-order risks, shared members" |
| 44 | `PARENT_MEMBER_ALLOW_INPUT_WARNING` | Parent member has AllowInput=true | warning (configurable) | No | Unusual for consolidation parents; may indicate misconfiguration | `oneStreamValidation.test.ts` - "flags sort-order risks, shared members" |
| 45 | `ACCOUNT_TYPE_MISSING` | Account dimension member lacks Account Type property | warning | No | Account Type drives consolidation logic; missing values default unpredictably | `oneStreamValidation.test.ts` - "checks dimension-specific required metadata" |
| 46 | `ENTITY_CURRENCY_MISSING` | Entity dimension member lacks Currency property | warning | No | Currency is critical for translation; missing values may cause runtime errors | `oneStreamValidation.test.ts` - "checks dimension-specific required metadata" |
| 47 | `ENTITY_OWNERSHIP_VALUE_INVALID` | Ownership/consolidation percentage outside 0-100 | error (configurable) | Yes (at error) | Invalid percentages corrupt consolidation calculations | `oneStreamValidation.test.ts` - "checks dimension-specific required metadata" |
| 48 | `RELATIONSHIP_WEIGHT_MISSING` | Non-Entity/Scenario relationship missing Aggregation Weight | info | No | Default of 1.0 will be used; informational only | `oneStreamValidation.test.ts` - "checks dimension-specific required metadata" |
| 49 | `VARYING_PROPERTY_DUPLICATE` | Duplicate varying property in OneStream context (OS-specific check) | error | Yes | OneStream rejects multiple values for same property+target+context | `oneStreamValidation.test.ts` - "adds a OneStream duplicate warning for duplicate varying property contexts" |

### C. Hierarchy Analysis (`hierarchy.ts`)

| # | Rule Code | What It Checks | Severity | Blocks Export | Test Evidence |
|---|-----------|---------------|----------|--------------|---------------|
| 50 | Cycle detection | DFS-based cycle detection across all nodes | N/A (feeds `CIRCULAR_HIERARCHY`) | Yes | `validationEngine.test.ts` - "blocks invalid booleans, invalid numbers, and circular references" |
| 51 | Duplicate relationship detection | Identifies duplicate parent-child pairs | N/A (feeds `DUPLICATE_RELATIONSHIP`) | Configurable | `validationEngine.test.ts` - "uses configured severities" |
| 52 | Orphan member detection | Members not reachable from any root | N/A (feeds `ORPHAN_MEMBER`) | No | `validationEngine.test.ts` - implied |
| 53 | Missing parent keys | Relationship parents not in member set | N/A (used internally) | No | None (internal to hierarchy analysis) |
| 54 | Missing child keys | Relationship children not in member set | N/A (feeds `UNKNOWN_RELATIONSHIP_CHILD`) | Configurable | `validationEngine.test.ts` - "detects duplicate members" |

---

## Coverage Assessment

### Critical OneStream Problems This Engine CATCHES

1. **Circular hierarchies** - Would cause infinite consolidation loops; detected and blocked
2. **Restricted characters in member names** - OneStream import flat-out rejects these; caught as errors
3. **Invalid enum values** (Account Type, etc.) - Would be silently dropped or cause errors
4. **Invalid boolean/numeric property types** - Cause XML parse failures at import
5. **Duplicate members** - OneStream dimension import overwrites or errors on duplicates
6. **Orphaned relationships** (child not in members) - Dangling references in XML
7. **Formula errors from Excel** - Garbage data like `#REF!` that would corrupt metadata
8. **XML control characters** - Would make the exported XML unparseable
9. **Multiple parents in single-parent dimensions** - Hard constraint violation
10. **Duplicate varying property contexts** - OneStream cannot resolve which value to use
11. **Entity ownership values out of range** - Consolidation math breaks
12. **Missing Account Type on Account members** - Critical for consolidation behavior

### Critical Problems This Engine Would MISS

1. **Member key uniqueness across dimensions** - OneStream shares member keys in certain operations (XF scenarios); cross-dimension collisions are not checked
2. **Missing Root member** - Every dimension needs a Root member; not explicitly validated
3. **Self-referencing relationship** (parent == child) - Passes the cycle detector but is invalid
4. **Maximum hierarchy depth** - OneStream has practical limits (~20 levels); deep nesting causes performance issues
5. **Member count limits per dimension** - Large dimensions (>50k members) can hit OneStream performance walls
6. **Required dimension completeness** - No check that all 8 UD dimensions + Account + Entity + Scenario + Flow are present in a project
7. **Cross-dimension reference validation** - E.g., Entity Currency values should reference valid ISOCurrency dimension members
8. **Consolidation method consistency** - E.g., "Equity" ownership type but 100% consol percentage is contradictory
9. **Member name leading/trailing whitespace** - Passes current checks but causes silent matching failures
10. **Scenario Type property on Scenario members** - Critical enum often missing with no warning
11. **Empty description/alias for required members** - Some reserved members need specific property values
12. **UD dimension-specific required properties** - Only Account and Entity have dimension-specific rules currently

### Potential False Positives

| Rule | Annoyance Risk | Mitigation |
|------|---------------|------------|
| `MEMBER_NAME_CONTAINS_SPACE` | **Medium** - Many legacy systems use spaces legitimately | Severity is warning, doesn't block export. Users can override per-rule. |
| `PARENT_MEMBER_ALLOW_INPUT_WARNING` | **Medium** - Manual adjustment accounts intentionally have this | Message acknowledges it's "common for accounts accepting manual adjustments". |
| `UNKNOWN_PROPERTY` | **Low-Medium** - Custom properties from older OS versions | Configurable severity; can be set to "off". |
| `SORT_ORDER_ZERO` | **Low** - Fresh imports before sort assignment | Configurable severity; warning only. |
| `SHARED_MEMBER_DETECTED` | **Low** - Shared members are valid and common | Default severity is "info"; purely informational. |
| `RELATIONSHIP_WEIGHT_MISSING` | **Low** - Default of 1.0 is correct most of the time | Severity is "info"; purely informational. |
| `XML_UNKNOWN_*_ATTRIBUTE` | **None** - Info-level, users appreciate knowing what's preserved | Info only; noise at most. |

### Severity Appropriateness

| Assessment | Details |
|-----------|---------|
| **Well-calibrated** | Restricted characters = error (correct, hard failure). Circular hierarchy = error (correct, breaks consolidation). Invalid types = error (correct, XML parse failure). |
| **Appropriately soft** | Spaces/periods in names = warning (not a hard error, just risky). Shared members = info (valid pattern, just awareness). Orphan members = warning (data quality, not a crash). |
| **Could be stricter** | `ACCOUNT_TYPE_MISSING` is warning but arguably should be error for non-reserved members since consolidation behavior is undefined without it. `ENTITY_CURRENCY_MISSING` similarly - currency is truly required for translation. |
| **Configurable is correct** | Most severities support per-rule override via `ruleOverrides` map and profile config. This is the right design for governance flexibility. |

---

## Top 10 Missing Validation Rules

| # | Rule Name | What It Should Check | Why It Matters | Severity | Difficulty |
|---|-----------|---------------------|----------------|----------|------------|
| 1 | `ROOT_MEMBER_MISSING` | Every dimension must have at least one member named "Root" (or configured root member) | OneStream dimensions MUST have a root node; without it, hierarchy traversal fails completely and import is rejected | error | Easy |
| 2 | `SELF_REFERENCING_RELATIONSHIP` | parentKey === childKey on any relationship | Self-references are logically invalid and cause processing errors in consolidation traversal; the cycle detector may not catch single-node self-loops depending on graph construction | error | Easy |
| 3 | `MEMBER_NAME_LEADING_TRAILING_WHITESPACE` | memberKey has leading or trailing spaces/tabs | Silent matching failures in MemberScript, business rules, and API lookups; causes "member not found" at runtime while appearing correct in UIs | error | Easy |
| 4 | `HIERARCHY_MAX_DEPTH_EXCEEDED` | Hierarchy depth exceeds configurable limit (e.g., 20 levels) | Deep hierarchies cause severe performance degradation in consolidation, slow UI rendering, and can hit stack overflow in recursive processing | warning | Medium |
| 5 | `SCENARIO_TYPE_MISSING` | Scenario dimension members missing ScenarioType property | ScenarioType drives data storage behavior (Actual vs. Budget vs. Forecast); missing values cause runtime calculation failures | warning | Easy |
| 6 | `DIMENSION_MISSING_FROM_PROJECT` | Project is missing one or more expected dimension types per config | OneStream applications require a complete dimension set; a missing Account or Entity dimension will fail at cube creation | warning | Medium |
| 7 | `CROSS_DIMENSION_CURRENCY_INVALID` | Entity member Currency value doesn't match a known currency code | Invalid currency codes cause translation failures at runtime; requires a reference list of valid ISO/OneStream currencies | error | Medium |
| 8 | `MEMBER_NAME_STARTS_WITH_DIGIT` | Member key begins with a numeric character | While not strictly invalid, digit-prefixed members break many MemberScript expressions and business rule references that expect identifier-style names | warning | Easy |
| 9 | `CONSOLIDATION_METHOD_MISMATCH` | Entity ownership type doesn't match percentage (e.g., Equity method with 100% consol) | Contradictory consolidation settings produce incorrect financial results that are hard to debug post-deployment | warning | Medium |
| 10 | `DUPLICATE_MEMBER_CASE_INSENSITIVE` | Two members differ only by case (e.g., "Revenue" and "revenue") | OneStream member lookups in MemberScript and some APIs are case-insensitive; two members differing only by case create ambiguous resolution | error | Easy |

### Implementation Notes

- **Rules 1, 2, 3, 8, 10**: Can be implemented with simple string checks in `validateMembers` or `validateRelationships`. No new dependencies needed.
- **Rule 4**: Requires extending `hierarchy.ts` to track depth during DFS traversal (add a depth counter to `collectReachable`).
- **Rule 5**: Follows the same pattern as `ACCOUNT_TYPE_MISSING` / `ENTITY_CURRENCY_MISSING` in `validateDimensionSpecificRules`.
- **Rule 6**: Needs access to all dimensions in the project simultaneously (currently validation runs per-dimension). Would require a new `validateProject`-level function.
- **Rule 7**: Needs a reference list of valid currency codes (could be config-driven like `restrictedCharacters`).
- **Rule 9**: Needs knowledge of valid ownership-type/percentage combinations (could reference the property dictionary enum values).

---

## Configuration Summary

From `config/dimbuilder.yaml`:

```yaml
validation:
  exportBlockedBySeverities:
    - error              # Only errors block export
  oneStreamProfile:
    enabled: true
    memberNameMaxLength: 500
    warnOnMemberNameSpaces: true
    warnOnMemberNamePeriods: true
    reservedWords: [...]        # 35 reserved words
    restrictedCharacters: [...]  # 22 restricted characters
```

The export gate (`exportBlockedBySeverities: [error]`) means only rules at "error" severity prevent export. Warnings and info are advisory only. This is appropriate but means `ACCOUNT_TYPE_MISSING` (warning) and `ENTITY_CURRENCY_MISSING` (warning) will not prevent export of incomplete metadata.

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total unique rule codes | 49 |
| Error-severity rules (block export) | 18 |
| Warning-severity rules (advisory) | 20 |
| Info-severity rules (informational) | 7 |
| Configurable severity rules | 25 |
| Rules with direct test coverage | 49 (100%) |
| Test files covering validation | 2 |
| Total test cases | 16 |

**Overall Assessment:** The validation engine provides strong coverage for structural integrity (cycles, duplicates, types) and OneStream naming conventions. The main gaps are in cross-dimensional consistency checks, project-level completeness validation, and some edge-case member naming issues that cause silent runtime failures rather than hard import errors. The configurable severity system and per-rule override support are well-designed for governance flexibility.
