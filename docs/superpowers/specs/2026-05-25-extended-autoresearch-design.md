# Extended Autoresearch — Design Spec

**Project:** OneStream Dim Builder  
**Date:** 2026-05-25  
**Approach:** A — Extend Existing Benchmark  
**Status:** Approved

---

## Overview

Extend the autoresearch benchmark system to measure and optimize all new engines (AI duplicate detection, naming anomaly detection, hierarchy optimization, quality scoring, and migration parsers) in addition to the existing property dictionary validation loop.

---

## 1. Extended Benchmark Phases

The benchmark script (`scripts/autoresearch/benchmark.ts`) gains 5 new measurement phases after the existing validation phase:

### Phase 3: AI Duplicate Detection

**Calls:** `detectDuplicates()` from `src/server/ai/suggestions/duplicateDetection.ts`

**Metrics:**
- `duplicate_groups_found` — number of groups detected
- `total_similar_members` — total members flagged as similar
- `avg_similarity` — average similarity score across all groups
- `detection_methods_used` — which methods produced matches (levenshtein, soundex, prefix)
- `ai_duplicate_time_ms` — execution time

**Optimization target:** Minimize false positives (groups where members are clearly not duplicates). Maximize detection of genuinely similar names.

### Phase 4: AI Naming Anomalies

**Calls:** `detectNamingAnomalies()` from `src/server/ai/suggestions/namingAnomaly.ts`

**Metrics:**
- `naming_anomalies_found` — total anomalies detected
- `anomaly_by_type` — breakdown by type (case, separator, prefix, length)
- `ai_naming_time_ms` — execution time

**Optimization target:** Every flagged anomaly should represent a genuine OneStream naming convention violation. Zero false positives on well-formed member names.

### Phase 5: AI Hierarchy Optimizations

**Calls:** `suggestHierarchyOptimizations()` from `src/server/ai/suggestions/hierarchyOptimization.ts`

**Metrics:**
- `hierarchy_opts_found` — total suggestions
- `opt_by_strategy` — breakdown by strategy (group, flatten, rebalance)
- `affected_members_count` — total members affected by suggestions
- `ai_hierarchy_time_ms` — execution time

**Optimization target:** Suggestions should be actionable and relevant. Avoid trivial suggestions on well-structured hierarchies.

### Phase 6: Quality Scoring

**Calls:** `scoreDimensionQuality()` and `scoreMemberQuality()` from `src/server/tier3/tier3Engine.ts`

**Metrics:**
- `avg_quality_score` — average across all dimensions
- `min_member_score` — lowest individual member score
- `max_member_score` — highest individual member score
- `score_spread` — max - min (higher = better differentiation)
- `quality_time_ms` — execution time

**Optimization target:** Scores should differentiate well between high-quality and low-quality members. A spread < 10 means the scoring is too uniform. Members with empty descriptions/properties should score lower than fully populated ones.

### Phase 7: Migration Parsers

**Calls:** `parseHyperionHFM()`, `parseHyperionEPMA()`, `parseSAPBPC()`, `parseGenericCSV()` from `src/server/migration/migrationParsers.ts`

**Input:** Sample data files in `scripts/autoresearch/sample-data/`

**Metrics:**
- `hfm_parse_result` — PASS/FAIL + member count
- `epma_parse_result` — PASS/FAIL + member count
- `bpc_parse_result` — PASS/FAIL + member count
- `csv_parse_result` — PASS/FAIL + member count
- `total_parse_warnings` — accumulated warnings across all parsers
- `migration_time_ms` — execution time

**Optimization target:** All 4 parsers succeed on their sample data with zero warnings. Parsed member counts match expected.

---

## 2. Updated program.md Scope

### What You CAN Modify (expanded)

| File | Purpose |
|------|---------|
| `src/shared/oneStreamPropertyDictionary.ts` | Property dictionary entries (original) |
| `src/server/ai/suggestions/duplicateDetection.ts` | Tune similarity thresholds, add detection methods |
| `src/server/ai/suggestions/namingAnomaly.ts` | Tune anomaly detection rules and thresholds |
| `src/server/ai/suggestions/hierarchyOptimization.ts` | Tune optimization strategies and thresholds |
| `src/server/tier3/tier3Engine.ts` | Tune quality scoring weights and breakdowns |
| `src/server/migration/migrationParsers.ts` | Improve parser coverage and field mapping |
| `src/shared/aiTypes.ts` | Adjust AI config defaults (thresholds, enabled methods) |
| `src/shared/appConfigDefaults.ts` | AI config defaults only |

### What You CANNOT Modify (unchanged)

- `scripts/autoresearch/benchmark.ts` — fixed measurement harness
- `src/shared/validationEngine.ts` — fixed scoring engine
- `src/shared/xmlImport.ts` — fixed importer
- Test files
- Route files
- Client/UI files

---

## 3. Results.tsv Format (Extended)

```
timestamp  xml_unknown  unknown_prop  invalid_enum  dup_groups  naming_anomalies  hierarchy_opts  avg_quality  score_spread  migration_pass  total_issues  tests_pass  time_ms  description
```

---

## 4. Sample Data Files

Create `scripts/autoresearch/sample-data/` with:

- `sample-hfm.csv` — 5-10 rows of Hyperion HFM format (semicolons, Dimension;Member;Parent;Alias)
- `sample-epma.csv` — 5-10 rows of Hyperion EPMA format (header row with Member,Parent,Alias,DataStorage)
- `sample-bpc.csv` — 5-10 rows of SAP BPC format (header with ID,PARENTH1,EVDESCRIPTION)
- `sample-generic.csv` — 5-10 rows of generic format (member,parent,description)

These are static test fixtures — they don't change during the research loop.

---

## 5. Experiment Loop (Updated)

The loop remains the same structure but now monitors all metrics:

```
LOOP FOREVER:
1. Run benchmark:quick → read all metrics
2. Identify worst-performing engine (highest false positives, lowest spread, failing parsers)
3. Make a targeted improvement to that engine's source file
4. git commit
5. Run benchmark:quick again
6. If metrics improved AND tests pass → KEEP
7. If metrics worsened OR tests fail → git reset --hard HEAD~1
8. Log to results.tsv
9. Move to next engine
```

**Priority order for optimization:**
1. Migration parsers pass rate → 4/4
2. Quality score spread → > 20
3. AI duplicate false positive rate → < 10%
4. AI naming accuracy → only flag genuine issues
5. Property dictionary unknowns → 0 (original goal)

---

## 6. Configuration

The benchmark uses the project's default AI config from `src/shared/appConfigDefaults.ts`:

```typescript
ai: {
  enabled: true,
  provider: 'none',
  features: {
    duplicateDetection: true,
    namingAnalysis: true,
    hierarchyOptimization: true,
    propertySuggestion: true,
    naturalLanguageQuery: true
  },
  duplicateDetection: {
    similarityThreshold: 0.85,
    methods: ['levenshtein', 'soundex', 'prefix']
  }
}
```

---

## 7. Data Source

The benchmark operates on the **current project data** loaded from the existing benchmark cache or from the running database. Since the user's current project has 1 dimension (Scenario) with 13 members and 13 relationships, this is the primary dataset.

For migration parser testing, the sample data files provide fixed inputs.

---

## 8. Anti-Patterns

- Do NOT modify the benchmark script during the research loop
- Do NOT add npm dependencies
- Do NOT change route files or client code
- Do NOT make changes that break existing tests
- Do NOT optimize for one engine at the expense of another
- Do NOT add properties to the dictionary without evidence from real XML data
