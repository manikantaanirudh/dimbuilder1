# Dim Builder Autoresearch

Autonomous improvement loop for the Spaulding Ridge OneStream Dimension Builder.
Adapted from [karpathy/autoresearch](https://github.com/karpathy/autoresearch).

## Overview

You are an AI agent tasked with improving the OneStream Dimension Builder's engines. The benchmark measures **7 engine phases** against real metadata (7,048 members, 18 dimensions, 8,663 relationships):

1. **XML Import & Validation** — property dictionary coverage
2. **Validation Issue Counting** — breakdown by severity and code
3. **AI Duplicate Detection** — find near-identical member keys
4. **AI Naming Anomalies** — detect naming convention deviations
5. **AI Hierarchy Optimizations** — suggest structural improvements
6. **Quality Scoring** — per-member quality assessment
7. **Migration Parsers** — import from HFM, EPMA, BPC, generic CSV

## Setup

1. **Read the in-scope files** for full context:
   - `src/shared/oneStreamPropertyDictionary.ts` — property definitions (editable)
   - `src/shared/validationEngine.ts` — validation rules (read-only)
   - `src/shared/xmlImport.ts` — XML importer (read-only)
   - `src/server/ai/suggestions/duplicateDetection.ts` — duplicate detection engine (editable)
   - `src/server/ai/suggestions/namingAnomaly.ts` — naming anomaly engine (editable)
   - `src/server/ai/suggestions/hierarchyOptimization.ts` — hierarchy optimization engine (editable)
   - `src/server/tier3/tier3Engine.ts` — quality scoring engine (editable)
   - `src/server/migration/migrationParsers.ts` — migration parsers (editable)
   - `scripts/autoresearch/sample-data/` — parser test fixtures (editable)
   - `metadata/SWF.xml` — the real 567MB benchmark XML (read-only)

2. **Create the benchmark cache** (one-time, takes ~5 min):
   ```
   npm run benchmark:cache
   ```
   This imports the full XML and saves parsed data to `scripts/autoresearch/benchmark-cache.json`.

3. **Verify quick benchmark runs**: `npm run benchmark:quick`
   This loads the cache and runs all engine phases (~15 seconds).

4. **Establish baseline**: The first `benchmark:quick` output is your baseline metrics.

**IMPORTANT**: After making engine changes, use `npm run benchmark:quick` for the fast loop. For XML import changes, run `npm run benchmark:cache` periodically (every 5-10 experiments).

## Engines You CAN Modify

| Engine | File | Optimization Target |
|--------|------|-------------------|
| Property Dictionary | `src/shared/oneStreamPropertyDictionary.ts` | Reduce `xml_unknown_count` + `unknown_property_count` → 0 |
| Duplicate Detection | `src/server/ai/suggestions/duplicateDetection.ts` | Reduce false positive groups, improve similarity precision |
| Naming Anomalies | `src/server/ai/suggestions/namingAnomaly.ts` | Improve detection accuracy, reduce noise |
| Hierarchy Optimization | `src/server/ai/suggestions/hierarchyOptimization.ts` | Improve suggestion quality, reduce low-confidence noise |
| Quality Scoring | `src/server/tier3/tier3Engine.ts` | Increase score spread, improve differentiation |
| Migration Parsers | `src/server/migration/migrationParsers.ts` | Maintain 4/4 pass rate, reduce parse warnings |

## What You CANNOT Do

- Modify `scripts/autoresearch/benchmark.ts` — it is the fixed measurement harness.
- Modify `src/shared/validationEngine.ts` — it is the fixed scoring engine.
- Modify `src/shared/xmlImport.ts` — it is the fixed importer.
- Modify test files or the benchmark cache.
- Add new npm dependencies.

## The Metrics

The benchmark outputs these key metrics:

```
--- Validation ---
xml_unknown_count:       0    ← XML attributes not mapped (lower is better)
unknown_property_count:  0    ← Properties not in dictionary (lower is better)
total_issues:            N    ← All validation issues combined

--- AI Engines ---
duplicate_groups:        N    ← Groups found (fewer with high precision is better)
naming_anomalies:        N    ← Anomalies found (should show real type breakdown)
hierarchy_opts:          N    ← Suggestions (should show real action breakdown)

--- Quality ---
avg_quality_score:       N    ← Higher is better (members are well-structured)
score_spread:            N    ← Higher is better (differentiates good from bad)

--- Migration ---
migration_pass_rate:     N/4  ← Must stay 4/4
parse_warnings:          N    ← Lower is better
```

**Priority order:**
1. `xml_unknown_count` → 0 (highest priority — property dictionary)
2. `unknown_property_count` → 0
3. Duplicate detection precision (fewer false positives)
4. Naming anomaly categorization accuracy (type breakdown should be meaningful)
5. Hierarchy optimization quality (high-confidence suggestions only)
6. Quality score spread (better differentiation)
7. Migration parser robustness (0 warnings, handles edge cases)

## The Experiment Loop

Work on branch `autoresearch/<tag>`.

**LOOP FOREVER:**

1. Read the current benchmark output — which metrics need improvement?
2. Choose one engine to improve based on priority order.
3. Make a targeted change to the engine file.
4. `git commit -m "tune [engine]: [what changed]"`
5. Run: `npm run benchmark:quick`
6. Read the metrics from stdout.
7. If target metric improved AND tests pass AND no other metric regressed:
   - **KEEP** the commit (advance the branch).
   - Log to results.tsv.
8. If metrics did not improve OR tests fail OR other metrics regressed:
   - `git reset --hard HEAD~1` to revert.
   - Log to results.tsv with status "reverted".
9. Move to the next optimization target.
10. Every 5 experiments, run `npm run benchmark:cache` to refresh.

**Batch size**: Keep changes small and atomic — one logical improvement per commit.

**NEVER STOP**: Continue working indefinitely until manually stopped by the human.

## Current Baseline (2026-05-25)

```
duplicate_groups:        206  (avg similarity 0.998 — mostly real shared members)
naming_anomalies:        481  (Length: 74, Common: 12, PascalCase: 395)
hierarchy_opts:          106  (rebalance: 6, group: 23, flatten: 77)
avg_quality_score:       80   (spread: 39, min: 55, max: 94)
migration_pass_rate:     4/4  (0 warnings)
xml_unknown_count:       0
unknown_property_count:  0
total_issues:            4118
```

## Tips

- The XML has `<property name="X" value="Y" />` — the `name` attribute maps to `xmlName`.
- Member-level attributes are on the `<member>` element directly.
- Dimension-level attributes are on the `<dimension>` element.
- Use `grep` or streaming reads on the XML — don't load 567MB into memory.
- For AI engines, focus on reducing false positives over increasing raw detection counts.
- For quality scoring, aim to widen the spread between well-formed and poorly-formed members.
