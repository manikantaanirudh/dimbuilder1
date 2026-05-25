# Extended Autoresearch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the autoresearch benchmark to measure and optimize all new engines (AI duplicates, naming anomalies, hierarchy optimizations, quality scoring, migration parsers) against current project data.

**Architecture:** Add 5 new measurement phases to the existing `benchmark.ts`, create sample migration data files for parser testing, and update `program.md` with expanded scope and metrics.

**Tech Stack:** TypeScript (tsx), Node.js, direct engine function imports (no HTTP calls)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `scripts/autoresearch/benchmark.ts` | Extended benchmark with 7 total phases |
| `scripts/autoresearch/program.md` | Updated research program documentation |
| `scripts/autoresearch/sample-data/sample-hfm.csv` | Hyperion HFM test fixture |
| `scripts/autoresearch/sample-data/sample-epma.csv` | Hyperion EPMA test fixture |
| `scripts/autoresearch/sample-data/sample-bpc.csv` | SAP BPC test fixture |
| `scripts/autoresearch/sample-data/sample-generic.csv` | Generic CSV test fixture |

---

### Task 1: Create Migration Parser Sample Data

**Files:**
- Create: `scripts/autoresearch/sample-data/sample-hfm.csv`
- Create: `scripts/autoresearch/sample-data/sample-epma.csv`
- Create: `scripts/autoresearch/sample-data/sample-bpc.csv`
- Create: `scripts/autoresearch/sample-data/sample-generic.csv`

- [ ] **Step 1: Create sample-hfm.csv**

```csv
Account;Revenue;Root;Revenue Account;Revenue;false
Account;COGS;Root;Cost of Goods Sold;Expense;false
Account;OpEx;Root;Operating Expenses;Expense;false
Account;NetIncome;Root;Net Income;Asset;true
Account;SalesNA;Revenue;NA Sales;Revenue;false
Account;SalesEU;Revenue;EU Sales;Revenue;false
```

- [ ] **Step 2: Create sample-epma.csv**

```csv
Member,Parent,Alias,DataStorage,UDA
TotalRevenue,,Total Revenue,DynamicCalc,
ProductRevenue,TotalRevenue,Product Revenue,StoreData,ProductLine
ServiceRevenue,TotalRevenue,Service Revenue,StoreData,ServiceLine
LicenseRevenue,ProductRevenue,License Revenue,StoreData,
SupportRevenue,ServiceRevenue,Support Revenue,StoreData,
```

- [ ] **Step 3: Create sample-bpc.csv**

```csv
ID,PARENTH1,EVDESCRIPTION,ACCTYPE,RATETYPE
1000,PL,Profit and Loss,INC,
1100,1000,Revenue,INC,
1200,1000,Cost of Sales,EXP,
1300,1000,Gross Profit,INC,
```

- [ ] **Step 4: Create sample-generic.csv**

```csv
member,parent,description,type,currency
TotalEntity,,Total Entity,Parent,USD
NorthAmerica,TotalEntity,North America,Parent,USD
USA,NorthAmerica,United States,Base,USD
Canada,NorthAmerica,Canada,Base,CAD
Europe,TotalEntity,Europe,Parent,EUR
UK,Europe,United Kingdom,Base,GBP
```

- [ ] **Step 5: Commit**

```bash
git add scripts/autoresearch/sample-data/
git commit -m "feat(autoresearch): add sample migration data fixtures"
```

---

### Task 2: Extend Benchmark with AI Duplicate Detection Phase

**Files:**
- Modify: `scripts/autoresearch/benchmark.ts`

- [ ] **Step 1: Add import for duplicate detection**

At the top of `benchmark.ts`, after existing imports, add:

```typescript
import { detectDuplicates } from "../../src/server/ai/suggestions/duplicateDetection";
import type { AIDuplicateDetectionConfig } from "../../src/shared/aiTypes";
```

- [ ] **Step 2: Add Phase 3 after Phase 2 (validation)**

After the validation phase results are collected (after `const validateTimeMs = ...`), add:

```typescript
  // Phase 3: AI Duplicate Detection
  console.log("--- AI Duplicate Detection ---");
  const aiDupConfig: AIDuplicateDetectionConfig = {
    similarityThreshold: 0.85,
    methods: ['levenshtein', 'soundex', 'prefix']
  };
  const dupStart = performance.now();
  const duplicateGroups = detectDuplicates({ members, config: aiDupConfig });
  const aiDupTimeMs = Math.round(performance.now() - dupStart);
  const totalSimilarMembers = duplicateGroups.reduce((sum, g) => sum + g.members.length, 0);
  const avgSimilarity = duplicateGroups.length > 0
    ? duplicateGroups.reduce((sum, g) => sum + g.similarity, 0) / duplicateGroups.length
    : 0;

  console.log(`  duplicate_groups_found:    ${duplicateGroups.length}`);
  console.log(`  total_similar_members:     ${totalSimilarMembers}`);
  console.log(`  avg_similarity:            ${avgSimilarity.toFixed(3)}`);
  console.log(`  ai_duplicate_time_ms:      ${aiDupTimeMs}`);
  console.log("");
```

- [ ] **Step 3: Run benchmark to verify phase works**

```bash
npx tsx scripts/autoresearch/benchmark.ts --quick --skip-tests
```

Expected: Sees "--- AI Duplicate Detection ---" output with metrics.

- [ ] **Step 4: Commit**

```bash
git add scripts/autoresearch/benchmark.ts
git commit -m "feat(autoresearch): add AI duplicate detection phase to benchmark"
```

---

### Task 3: Add AI Naming Anomalies Phase

**Files:**
- Modify: `scripts/autoresearch/benchmark.ts`

- [ ] **Step 1: Add import**

```typescript
import { detectNamingAnomalies } from "../../src/server/ai/suggestions/namingAnomaly";
```

- [ ] **Step 2: Add Phase 4 after duplicate detection**

```typescript
  // Phase 4: AI Naming Anomalies
  console.log("--- AI Naming Anomalies ---");
  const namingStart = performance.now();
  let totalNamingAnomalies = 0;
  const anomalyTypes = new Map<string, number>();

  for (const dimension of dimensions) {
    const dimensionMembers = members.filter(m => m.dimensionId === dimension.id);
    const anomalies = detectNamingAnomalies({ members: dimensionMembers, dimensionType: dimension.dimensionType });
    totalNamingAnomalies += anomalies.length;
    for (const a of anomalies) {
      anomalyTypes.set(a.anomalyType, (anomalyTypes.get(a.anomalyType) ?? 0) + 1);
    }
  }
  const aiNamingTimeMs = Math.round(performance.now() - namingStart);

  console.log(`  naming_anomalies_found:    ${totalNamingAnomalies}`);
  for (const [type, count] of anomalyTypes) {
    console.log(`    ${type}: ${count}`);
  }
  console.log(`  ai_naming_time_ms:         ${aiNamingTimeMs}`);
  console.log("");
```

- [ ] **Step 3: Commit**

```bash
git add scripts/autoresearch/benchmark.ts
git commit -m "feat(autoresearch): add AI naming anomalies phase to benchmark"
```

---

### Task 4: Add AI Hierarchy Optimizations Phase

**Files:**
- Modify: `scripts/autoresearch/benchmark.ts`

- [ ] **Step 1: Add import**

```typescript
import { suggestHierarchyOptimizations } from "../../src/server/ai/suggestions/hierarchyOptimization";
```

- [ ] **Step 2: Add Phase 5**

```typescript
  // Phase 5: AI Hierarchy Optimizations
  console.log("--- AI Hierarchy Optimizations ---");
  const hierStart = performance.now();
  let totalHierOpts = 0;
  const optStrategies = new Map<string, number>();

  for (const dimension of dimensions) {
    const dimensionMembers = members.filter(m => m.dimensionId === dimension.id);
    const dimensionRels = relationships.filter(r => r.dimensionId === dimension.id);
    const opts = suggestHierarchyOptimizations({ members: dimensionMembers, relationships: dimensionRels });
    totalHierOpts += opts.length;
    for (const opt of opts) {
      optStrategies.set(opt.strategy, (optStrategies.get(opt.strategy) ?? 0) + 1);
    }
  }
  const aiHierTimeMs = Math.round(performance.now() - hierStart);

  console.log(`  hierarchy_opts_found:      ${totalHierOpts}`);
  for (const [strategy, count] of optStrategies) {
    console.log(`    ${strategy}: ${count}`);
  }
  console.log(`  ai_hierarchy_time_ms:      ${aiHierTimeMs}`);
  console.log("");
```

- [ ] **Step 3: Commit**

```bash
git add scripts/autoresearch/benchmark.ts
git commit -m "feat(autoresearch): add AI hierarchy optimizations phase to benchmark"
```

---

### Task 5: Add Quality Scoring Phase

**Files:**
- Modify: `scripts/autoresearch/benchmark.ts`

- [ ] **Step 1: Add import**

```typescript
import { scoreMemberQuality, scoreDimensionQuality } from "../../src/server/tier3/tier3Engine";
```

- [ ] **Step 2: Add Phase 6**

```typescript
  // Phase 6: Quality Scoring
  console.log("--- Quality Scoring ---");
  const qualityStart = performance.now();
  let totalScores: number[] = [];

  for (const dimension of dimensions) {
    const dimensionMembers = members.filter(m => m.dimensionId === dimension.id);
    for (const member of dimensionMembers) {
      const score = scoreMemberQuality(member, dimension, []);
      totalScores.push(score.overallScore);
    }
  }
  const qualityTimeMs = Math.round(performance.now() - qualityStart);
  const avgQualityScore = totalScores.length > 0 ? Math.round(totalScores.reduce((s, v) => s + v, 0) / totalScores.length) : 0;
  const minScore = totalScores.length > 0 ? Math.min(...totalScores) : 0;
  const maxScore = totalScores.length > 0 ? Math.max(...totalScores) : 0;
  const scoreSpread = maxScore - minScore;

  console.log(`  avg_quality_score:         ${avgQualityScore}`);
  console.log(`  min_member_score:          ${minScore}`);
  console.log(`  max_member_score:          ${maxScore}`);
  console.log(`  score_spread:              ${scoreSpread}`);
  console.log(`  quality_time_ms:           ${qualityTimeMs}`);
  console.log("");
```

- [ ] **Step 3: Commit**

```bash
git add scripts/autoresearch/benchmark.ts
git commit -m "feat(autoresearch): add quality scoring phase to benchmark"
```

---

### Task 6: Add Migration Parsers Phase

**Files:**
- Modify: `scripts/autoresearch/benchmark.ts`

- [ ] **Step 1: Add imports**

```typescript
import { parseHyperionHFM, parseHyperionEPMA, parseSAPBPC, parseGenericCSV } from "../../src/server/migration/migrationParsers";
import { readFileSync } from "node:fs";
```

Note: `readFileSync` is already imported — just add the migration parsers import.

- [ ] **Step 2: Add Phase 7**

```typescript
  // Phase 7: Migration Parsers
  console.log("--- Migration Parsers ---");
  const SAMPLE_DIR = resolve(__dirname, "sample-data");
  const migrationStart = performance.now();
  let migrationPassCount = 0;
  let totalParseWarnings = 0;

  const parsers = [
    { name: "hfm", file: "sample-hfm.csv", fn: (content: string) => parseHyperionHFM(content) },
    { name: "epma", file: "sample-epma.csv", fn: (content: string) => parseHyperionEPMA(content) },
    { name: "bpc", file: "sample-bpc.csv", fn: (content: string) => parseSAPBPC(content) },
    { name: "csv", file: "sample-generic.csv", fn: (content: string) => parseGenericCSV(content) },
  ];

  for (const parser of parsers) {
    try {
      const filePath = resolve(SAMPLE_DIR, parser.file);
      const content = readFileSync(filePath, "utf8");
      const result = parser.fn(content);
      const memberCount = result.totalMembers;
      const warnings = result.warnings.length;
      totalParseWarnings += warnings;
      migrationPassCount++;
      console.log(`  ${parser.name}_parse:                 PASS (${memberCount} members, ${warnings} warnings)`);
    } catch (err) {
      console.log(`  ${parser.name}_parse:                 FAIL (${err instanceof Error ? err.message : "unknown error"})`);
    }
  }
  const migrationTimeMs = Math.round(performance.now() - migrationStart);

  console.log(`  total_parse_warnings:      ${totalParseWarnings}`);
  console.log(`  migration_pass_rate:       ${migrationPassCount}/4`);
  console.log(`  migration_time_ms:         ${migrationTimeMs}`);
  console.log("");
```

- [ ] **Step 3: Commit**

```bash
git add scripts/autoresearch/benchmark.ts
git commit -m "feat(autoresearch): add migration parsers phase to benchmark"
```

---

### Task 7: Update Summary Output and Results.tsv

**Files:**
- Modify: `scripts/autoresearch/benchmark.ts`

- [ ] **Step 1: Update the structured output section**

Replace the existing "Phase 5: Print structured output" (now Phase 8) to include new metrics:

After the existing `console.log("---")` block that prints `xml_unknown_count` etc., add the new engine metrics:

```typescript
  console.log(`duplicate_groups:        ${duplicateGroups.length}`);
  console.log(`naming_anomalies:        ${totalNamingAnomalies}`);
  console.log(`hierarchy_opts:          ${totalHierOpts}`);
  console.log(`avg_quality_score:       ${avgQualityScore}`);
  console.log(`score_spread:            ${scoreSpread}`);
  console.log(`migration_pass_rate:     ${migrationPassCount}/4`);
  console.log(`parse_warnings:          ${totalParseWarnings}`);
```

- [ ] **Step 2: Update results.tsv header**

Update the header initialization:

```typescript
  if (!existsSync(RESULTS_FILE)) {
    writeFileSync(RESULTS_FILE, "timestamp\txml_unknown\tunknown_prop\tinvalid_enum\tdup_groups\tnaming_anomalies\thierarchy_opts\tavg_quality\tscore_spread\tmigration_pass\ttotal_issues\ttests_pass\ttime_ms\tdescription\n");
  }
```

- [ ] **Step 3: Update the return value**

Add new metrics to the return object:

```typescript
  return {
    xmlUnknownCount, unknownPropertyCount, invalidEnumCount, invalidPropertyTypeCount,
    totalIssues, errorCount, warningCount, infoCount, importTimeMs, validateTimeMs,
    testsPass, dimensionsCount: dimensions.length, membersCount: members.length,
    relationshipsCount: relationships.length,
    // New engine metrics
    duplicateGroups: duplicateGroups.length,
    totalNamingAnomalies,
    totalHierOpts,
    avgQualityScore,
    scoreSpread,
    migrationPassCount,
    totalParseWarnings
  };
```

- [ ] **Step 4: Commit**

```bash
git add scripts/autoresearch/benchmark.ts
git commit -m "feat(autoresearch): update summary output and results.tsv with all engine metrics"
```

---

### Task 8: Update program.md

**Files:**
- Modify: `scripts/autoresearch/program.md`

- [ ] **Step 1: Update the program documentation**

Replace the entire contents of `scripts/autoresearch/program.md` with the updated version that includes:

1. Overview section mentioning all engines (not just property dictionary)
2. Expanded "What You CAN Do" section listing the new tunable files
3. Updated "The Metric" section with all engine metrics
4. Updated "Research Methodology" section covering all engines
5. Updated experiment loop priority order

Key additions to "What You CAN Do":
- `src/server/ai/suggestions/duplicateDetection.ts` — tune similarity thresholds, add detection methods
- `src/server/ai/suggestions/namingAnomaly.ts` — tune anomaly detection rules and thresholds
- `src/server/ai/suggestions/hierarchyOptimization.ts` — tune optimization strategies and thresholds
- `src/server/tier3/tier3Engine.ts` — tune quality scoring weights and breakdowns
- `src/server/migration/migrationParsers.ts` — improve parser coverage and field mapping
- `src/shared/aiTypes.ts` — adjust AI config defaults

Updated priority order:
1. Migration parsers pass rate → 4/4
2. Quality score spread → > 20
3. AI duplicate groups reasonable (2-5 for 13 members, no single-member groups)
4. AI naming anomalies → only flag genuine OneStream violations
5. Property dictionary unknowns → 0 (original goal)

- [ ] **Step 2: Commit**

```bash
git add scripts/autoresearch/program.md
git commit -m "docs(autoresearch): update program.md with expanded engine scope"
```

---

### Task 9: End-to-End Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full extended benchmark**

```bash
npx tsx scripts/autoresearch/benchmark.ts --quick --skip-tests
```

Expected output includes all 7 phases with metrics.

- [ ] **Step 2: Verify all phases produce valid output**

Check that:
- Phase 1-2 (import + validation): existing metrics still work
- Phase 3 (AI duplicates): `duplicate_groups_found >= 0`
- Phase 4 (AI naming): `naming_anomalies_found >= 0`
- Phase 5 (AI hierarchy): `hierarchy_opts_found >= 0`
- Phase 6 (Quality): `avg_quality_score > 0`, `score_spread >= 0`
- Phase 7 (Migration): `migration_pass_rate = 4/4`

- [ ] **Step 3: Run test suite**

```bash
npx vitest run --exclude "src/test/workbookParser.test.ts"
```

Expected: All 549 tests pass.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(autoresearch): complete extended benchmark — all engines measured

Phases: validation, AI duplicates, AI naming, AI hierarchy,
quality scoring, migration parsers. Sample data included.

.... Generated with [Cortex Code](https://docs.snowflake.com/en/user-guide/cortex-code/cortex-code)

Co-Authored-By: Cortex Code <noreply@snowflake.com>"
```
