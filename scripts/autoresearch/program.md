# Dim Builder Autoresearch

Autonomous improvement loop for the Spaulding Ridge OneStream Dimension Builder.
Adapted from [karpathy/autoresearch](https://github.com/karpathy/autoresearch).

## Overview

You are an AI agent tasked with improving the OneStream property dictionary coverage. The project imports real OneStream metadata XML files and validates them. Properties not in our dictionary generate `XML_UNKNOWN_*` and `UNKNOWN_PROPERTY` validation issues. Your goal is to **expand the property dictionary** so that real-world metadata imports cleanly with zero unknown warnings.

## Setup

1. **Read the in-scope files** for full context:
   - `src/shared/oneStreamPropertyDictionary.ts` — the file you modify. Contains `define(...)` entries for known properties.
   - `src/shared/validationEngine.ts` — produces validation issues (read-only).
   - `src/shared/xmlImport.ts` — the XML importer (read-only).
   - `config/dimbuilder.yaml` — app config with validation settings (read-only).
   - `metadata/Dev_Metadata_20260516_202239Z.xml` — the real 567MB benchmark XML (read-only, scan for property names).

2. **Create the benchmark cache** (one-time, takes ~5 min):
   ```
   npm run benchmark:cache
   ```
   This imports the full XML and saves parsed data to `scripts/autoresearch/benchmark-cache.json`.

3. **Verify quick benchmark runs**: `npm run benchmark:quick`
   This loads the cache and runs validation only (~3 seconds).

4. **Establish baseline**: The first `benchmark:quick` output is your baseline metrics.

**IMPORTANT**: After making dictionary changes, use `npm run benchmark:quick` for the fast loop. The quick mode runs validation against cached data — it accurately measures `UNKNOWN_PROPERTY` reductions. To verify `XML_UNKNOWN_*` reductions (which depend on re-importing), run `npm run benchmark:cache` periodically (every 5-10 experiments).

## What You CAN Do

- Modify `src/shared/oneStreamPropertyDictionary.ts` — this is the ONLY file you edit.
  - Add new `define(...)` entries to `seededDefinitions` for missing properties.
  - Add entries to `KNOWN_VARYING_CONTEXT_BY_XML_NAME` for properties with varying context.
  - Add `enumValues` arrays to existing definitions if the XML shows valid enum values.
  - Add `aliases` to existing definitions.
  - Change `dimensionTypes` on existing definitions if the XML shows broader usage.

## What You CANNOT Do

- Modify `scripts/autoresearch/benchmark.ts` — it is the fixed measurement harness.
- Modify `src/shared/validationEngine.ts` — it is the fixed scoring engine.
- Modify `src/shared/xmlImport.ts` — it is the fixed importer.
- Modify test files or any file other than `oneStreamPropertyDictionary.ts`.
- Add new npm dependencies.
- Remove or rename existing property definitions (only add or augment).

## The Metric

**Primary goal: reduce `xml_unknown_count` + `unknown_property_count` to 0.**

The benchmark outputs:
```
xml_unknown_count:       N    ← XML attributes/elements not mapped (lower is better)
unknown_property_count:  N    ← Properties not in dictionary (lower is better)
invalid_enum_count:      N    ← Enum values outside allowed list (lower is better)
total_issues:            N    ← All validation issues combined
tests_pass:              true ← MUST remain true (safety gate)
```

Priority order:
1. `xml_unknown_count` → 0 (highest priority)
2. `unknown_property_count` → 0
3. `invalid_enum_count` → 0 (requires knowing valid enum values from the XML)

## Research Methodology

To discover what properties need to be added:

1. **Scan the real XML** for property names. Look at `<property name="X" .../>` elements across different dimension types (Scenario, Entity, Account, Flow, UD1-UD8, Consolidation, Currency, IC).
2. **Check dimension-level attributes** like `accessGroup`, `maintenanceGroup` — some may not be in the dictionary.
3. **Note varying context** — if a property has `time=""` or `scenarioType=""` attributes, it needs `supportsVarying: true` and appropriate `varyingContextType`.
4. **Infer value types** from actual values: "true"/"false" → boolean, numbers → number, specific set → enum.

## The Experiment Loop

Work on branch `autoresearch/<tag>` (ask the user for the tag or propose one based on today's date).

**LOOP FOREVER:**

1. Look at the current benchmark output — which codes are generating unknown issues?
2. Scan the XML to find the property names causing those issues.
3. Add appropriate `define(...)` entries to `oneStreamPropertyDictionary.ts`.
4. `git commit -m "add [property names] to dictionary"`
5. Run: `npm run benchmark:quick`
6. Read the metrics from stdout.
7. If `unknown_property_count` decreased AND tests pass (run `npm test` separately if quick mode skips tests):
   - **KEEP** the commit (advance the branch).
   - Log to results.tsv: `timestamp  xml_unknown  unknown_prop  invalid_enum  total  true  time_ms  description`
8. If metrics did not improve OR tests fail:
   - `git reset --hard HEAD~1` to revert.
   - Log to results.tsv with status "reverted".
9. Move to the next property or group.
10. Every 5 experiments, run `npm run benchmark:cache` to refresh the cache and verify XML_UNKNOWN_* counts.

**Batch size**: You may add multiple related properties in one commit (e.g., all Scenario-type properties), but keep batches small enough that a revert doesn't lose too much good work.

**Timing**: Each quick benchmark takes ~5 minutes (dominated by validation of 440K entities). This yields ~12 experiments/hour. The full import benchmark takes ~10 minutes total.

**NEVER STOP**: Continue working indefinitely until manually stopped by the human.

## Property Definition Format

```typescript
define({
  propertyKey: "camelCaseKey",          // internal key
  displayName: "Human Readable Name",   // display name
  xmlName: "ExactXmlAttributeName",     // MUST match XML exactly
  targetLevel: "member",                // "dimension" | "member" | "relationship"
  dimensionTypes: ["Scenario"],         // or "all" for universal properties
  valueType: "string",                  // "string" | "boolean" | "number" | "enum" | etc.
  supportsVarying: true,                // if it has time/scenario context
  varyingContextType: "scenarioTime",   // "scenarioTime" | "scenario" | "cubeType" | "none"
  helpText: "Brief description."
})
```

For enums, add:
```typescript
  valueType: "enum",
  enumValues: ["Value1", "Value2", "Value3"],
```

## Simplicity Criterion

- Prefer correct, minimal definitions. Don't add fields you can't verify from the XML.
- If you're unsure about `valueType`, use `"string"` — it's the safest default.
- Only add `enumValues` when you've confirmed the full set from the XML data.
- Group related properties logically (all Scenario properties together, all Entity properties together, etc.)

## Tips

- The XML has `<property name="X" value="Y" />` — the `name` attribute is what maps to `xmlName`.
- Member-level attributes like `readDataGroup`, `readWriteDataGroup` are on the `<member>` element directly, not in `<properties>`.
- Dimension-level attributes are on the `<dimension>` element.
- Use `grep` or streaming reads on the XML to find patterns — don't try to load 567MB into memory at once.
- When in doubt about dimension type scope, use `"all"`.
