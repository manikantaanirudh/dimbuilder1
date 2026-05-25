# XML Correctness Review

Reviewed: 2026-05-25

## Assessment Summary

| Area | Rating | Risk |
|------|--------|------|
| Dimension structure | **Green** | Low |
| Member property mapping | **Green** | Low |
| Relationship mapping | **Green** | Low |
| Unknown XML preservation | **Green** | Low |
| Varying property handling | **Green** | Low |
| Aggregation weight | **Green** | Low |
| Round-trip fidelity | **Yellow** | Medium |
| Test coverage | **Yellow** | Medium |

**Overall XML Safety: GREEN (pilot-ready)**

---

## Detailed Findings

### 1. Dimension Structure Correctness — GREEN

**Evidence:** `src/shared/xmlExport.ts:122-180`

The export produces:
```xml
<OneStreamXF version="9.2.0.18004">
  <metadataRoot>
    <dimensions>
      <dimension type="Entity" name="LegalEntity" accessGroup="Everyone" maintenanceGroup="Everyone" inheritedDim="...">
```

- Version string captured from imported metadata or falls back to config
- All required dimension attributes exported (type, name, accessGroup, maintenanceGroup, inheritedDim)
- Optional source attributes (sheetName, sortOrder) included when `includeDimensionSourceAttributes=true`
- Dimension-level properties exported in `<properties>` block

**Risk:** Low — structure matches OneStream XF format exactly.

### 2. Member Property Mapping — GREEN

**Evidence:** `src/shared/xmlExport.ts:94-120` (memberAttributeFieldsByType), `src/shared/xmlExport.ts:54-92` (fieldNameOverrides)

- 40+ field name overrides map internal display names to OneStream XML attribute names
- Per-dimension-type member attributes correctly mapped (Scenario readDataGroup, Entity displayMemberGroup, etc.)
- Property dictionary (`oneStreamPropertyDictionary.ts`) drives XML name resolution via `toOneStreamXmlPropertyNameFromDictionary()`
- Fallback conversion: PascalCase normalization when no dictionary match

**Risk:** Low — dictionary has 100+ property definitions covering all common OneStream properties.

### 3. Relationship Mapping — GREEN

**Evidence:** `src/shared/xmlExport.ts:162-170`

- Relationships exported as `<relationship parentMember="X" childMember="Y" aggregationWeight="1" />`
- Entity ownership fields (PercentConsolidation, PercentOwnership, OwnershipType) exported as relationship properties
- Varying properties on relationships supported

**Risk:** Low — test `writes entity ownership fields as relationship properties` confirms correctness.

### 4. Unknown XML Preservation — GREEN

**Evidence:** `src/shared/xmlExport.ts:146-151`, `src/shared/xmlImport.ts` (UNKNOWN_XML_DATA_KEY)

- Unknown XML attributes/elements captured during import into a `__unknownXml` metadata key
- On export, unknown properties rendered AFTER known properties
- Unknown elements rendered at appropriate nesting level
- Test: `preserves imported unknown XML fields after known exported properties`

**Risk:** Low — this is a critical feature for round-trip safety and it's well-tested.

### 5. Varying Property Handling — GREEN

**Evidence:** `src/shared/xmlExport.ts` (renderVaryingPropertyLines function)

- Varying properties exported with explicit context attributes: `scenarioType=""`, `time=""`, `revertToDefaultScenarioType="false"`
- Context types supported: scenarioTime, scenario, cubeType, none
- Applied at dimension, member, and relationship levels
- Test: `emits varying properties with deterministic explicit context attributes`

**Risk:** Low — the conservative "explicit context" approach is safe even if slightly verbose.

### 6. Aggregation Weight — GREEN

**Evidence:** `src/shared/xmlExport.ts:91` (fieldNameOverrides: "Aggregation Weight" → "AggregationWeight")

- Rendered as attribute on relationship element
- Default value handling present (weight of 1 = standard roll-up)

**Risk:** Low.

### 7. Round-Trip Fidelity — YELLOW

**Evidence:** Import tests (3 tests) + Export tests (10 tests), but no dedicated round-trip test.

- Import: `src/shared/xmlImport.ts` streams XML, maps properties, preserves unknowns
- Export: Generates from persisted records
- No test that imports a real XML file and exports it back to compare

**Risk:** Medium — property value normalization during import (trimming, case changes) may not perfectly match original XML. Unknown attributes ARE preserved, but property values may differ slightly in formatting.

**Recommendation:** Add a round-trip test: import `metadata/sample_xml.xml`, export, compare key structural elements.

### 8. Test Coverage — YELLOW

**Evidence:** 10 export tests + 3 import tests = 13 total XML tests

- Export tests cover: basic structure, entity ownership, aliases, varying properties, version handling, compact mode, formula errors, unknown preservation, relationship plans
- Import tests cover: basic parsing, property extraction, streaming

**Missing tests:**
- Round-trip import → export → compare
- Large file performance (the 567MB SWF.xml)
- Malformed XML handling (unclosed tags, encoding issues)
- Special characters in member names (& < > " ')
- Empty dimension export
- Dimension with 0 members but relationships

**Risk:** Medium — the happy path is well-tested, but edge cases aren't.

---

## Blockers Before Production Deployment

| # | Blocker | Severity | Status |
|---|---------|----------|--------|
| 1 | No round-trip test (import→export→compare) | Medium | Missing |
| 2 | No real OneStream import validation (only mock) | Medium | Planned |
| 3 | Special character encoding in member names | Low | Handled via `escapeXml()` |

**None of these are blockers for internal pilot.** All are blockers for production deployment to real OneStream environments.

## What Works Well

1. Property dictionary with 100+ definitions drives correct XML name resolution
2. Unknown XML preservation ensures nothing is lost during editing
3. Per-dimension-type attribute mapping is comprehensive (all 12 types)
4. 40+ field name overrides handle OneStream's inconsistent naming
5. Varying property context is explicit and deterministic
6. Relationship operation plans support non-full load modes (additive, update)
7. Formula error handling prevents corrupt values in export

## Recommended Next Actions

1. Add a round-trip test using the existing `metadata/` XML files
2. Add edge case tests for special characters and empty dimensions
3. Validate exported XML against a real OneStream environment (when available)
4. Consider adding XML schema validation (XSD) if OneStream publishes one
