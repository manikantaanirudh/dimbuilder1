/**
 * autoresearch benchmark harness for Dim Builder.
 *
 * This is the FIXED measurement script (do NOT modify during autoresearch).
 * It imports the real metadata XML, runs validation, and outputs structured metrics.
 *
 * Usage:
 *   npx tsx scripts/autoresearch/benchmark.ts          # full import + validate (slow, ~5 min)
 *   npx tsx scripts/autoresearch/benchmark.ts --quick  # validate-only using cache (fast, ~3 sec)
 *   npx tsx scripts/autoresearch/benchmark.ts --cache  # import + save cache for future --quick runs
 *
 * The --quick mode is intended for the tight experiment loop.
 * The full mode should be run periodically to verify XML_UNKNOWN counts.
 */
import { createReadStream, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { parseOneStreamXmlFromStream } from "../../src/shared/xmlImport";
import { validateDimension } from "../../src/shared/validationEngine";
import type { ValidationIssue } from "../../src/shared/types";
import type { DimensionRecord, DimensionMemberRecord, DimensionRelationshipRecord, ProjectRecord } from "../../src/shared/types";
import { existsSync, writeFileSync } from "node:fs";
import { detectDuplicates } from "../../src/server/ai/suggestions/duplicateDetection";
import { detectNamingAnomalies } from "../../src/server/ai/suggestions/namingAnomaly";
import { suggestHierarchyOptimizations } from "../../src/server/ai/suggestions/hierarchyOptimization";
import { scoreMemberQuality } from "../../src/server/tier3/tier3Engine";
import { parseHyperionHFM, parseHyperionEPMA, parseSAPBPC, parseGenericCSV } from "../../src/server/migration/migrationParsers";
import type { AIDuplicateDetectionConfig } from "../../src/shared/aiTypes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "../..");
const METADATA_FILE = resolve(PROJECT_ROOT, "metadata/SWF.xml");
const CACHE_FILE = resolve(__dirname, "benchmark-cache.json");
const RESULTS_FILE = resolve(__dirname, "results.tsv");

const args = process.argv.slice(2);
const QUICK_MODE = args.includes("--quick");
const CACHE_MODE = args.includes("--cache");
const SKIP_TESTS = args.includes("--skip-tests");

// Default validation config matching dimbuilder.yaml
const VALIDATION_CONFIG = {
  duplicateMemberSeverity: "warning" as const,
  duplicateRelationshipSeverity: "warning" as const,
  unknownRelationshipMemberSeverity: "warning" as const,
  missingRequiredFieldSeverity: "error" as const,
  circularHierarchySeverity: "error" as const,
  relationshipsWithNoLocalMembersSeverity: "warning" as const,
  oneStreamProfile: {
    enabled: true,
    memberNameMaxLength: 250,
    warnOnMemberNameSpaces: true,
    warnOnMemberNamePeriods: true,
    reservedWords: ["Root", "None"],
    restrictedCharacters: ["<", ">", "\"", "'", "&", "|", "[", "]"],
    duplicateAliasSeverity: "warning" as const,
    invalidSortOrderSeverity: "warning" as const,
    sharedMemberSeverity: "info" as const,
    parentInputWarningSeverity: "warning" as const,
    unknownPropertySeverity: "warning" as const,
    invalidEnumSeverity: "error" as const,
    invalidPropertyTypeSeverity: "error" as const,
  }
};

interface CachedData {
  project: ProjectRecord;
  dimensions: DimensionRecord[];
  members: DimensionMemberRecord[];
  relationships: DimensionRelationshipRecord[];
}

async function loadData(): Promise<{ data: CachedData; importTimeMs: number; fromCache: boolean }> {
  if (QUICK_MODE) {
    if (!existsSync(CACHE_FILE)) {
      console.error("ERROR: No cache file found. Run with --cache first to create it.");
      console.error(`Expected: ${CACHE_FILE}`);
      process.exit(2);
    }
    const start = performance.now();
    const data = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as CachedData;
    const importTimeMs = Math.round(performance.now() - start);
    return { data, importTimeMs, fromCache: true };
  }

  // Full import from XML
  const importStart = performance.now();
  const stream = createReadStream(METADATA_FILE, { encoding: "utf8" });
  const parsed = await parseOneStreamXmlFromStream(stream, {
    projectName: "Benchmark Import",
    sourceFileName: "SWF.xml"
  });
  const importTimeMs = Math.round(performance.now() - importStart);

  const data: CachedData = {
    project: parsed.project,
    dimensions: parsed.dimensions,
    members: parsed.members,
    relationships: parsed.relationships
  };

  // Save cache if requested
  if (CACHE_MODE) {
    console.log("Saving cache...");
    writeFileSync(CACHE_FILE, JSON.stringify(data));
    console.log(`Cache saved: ${CACHE_FILE} (${(readFileSync(CACHE_FILE).length / 1024 / 1024).toFixed(1)} MB)`);
  }

  return { data, importTimeMs, fromCache: false };
}

async function runBenchmark() {
  console.log("=== Dim Builder Autoresearch Benchmark ===");
  console.log(`Mode: ${QUICK_MODE ? "quick (cached)" : "full import"}`);
  console.log("");

  // Phase 1: Load data
  const { data, importTimeMs, fromCache } = await loadData();
  const { project, dimensions, members, relationships } = data;

  console.log(`Data: ${dimensions.length} dimensions, ${members.length} members, ${relationships.length} relationships`);
  console.log(`${fromCache ? "Cache load" : "Import"} time: ${importTimeMs}ms`);
  console.log("");

  // Phase 2: Run validation on all dimensions
  const validateStart = performance.now();
  const allIssues: ValidationIssue[] = [];

  for (const dimension of dimensions) {
    const dimensionMembers = members.filter(m => m.dimensionId === dimension.id);
    const dimensionRelationships = relationships.filter(r => r.dimensionId === dimension.id);
    const issues = validateDimension({
      project,
      dimension,
      members: dimensionMembers,
      relationships: dimensionRelationships,
      severities: VALIDATION_CONFIG
    });
    allIssues.push(...issues);
  }
  const validateTimeMs = Math.round(performance.now() - validateStart);

  // Phase 3: Count issues by code
  const issueCounts = new Map<string, number>();
  for (const issue of allIssues) {
    issueCounts.set(issue.code, (issueCounts.get(issue.code) ?? 0) + 1);
  }

  // Key metrics
  const xmlUnknownCount =
    (issueCounts.get("XML_UNKNOWN_MEMBER_ATTRIBUTE") ?? 0) +
    (issueCounts.get("XML_UNKNOWN_DIMENSION_ATTRIBUTE") ?? 0) +
    (issueCounts.get("XML_UNKNOWN_RELATIONSHIP_ATTRIBUTE") ?? 0) +
    (issueCounts.get("XML_UNSUPPORTED_ELEMENT_PRESERVED") ?? 0);
  const unknownPropertyCount = issueCounts.get("UNKNOWN_PROPERTY") ?? 0;
  const invalidEnumCount = issueCounts.get("INVALID_ENUM_VALUE") ?? 0;
  const invalidPropertyTypeCount = issueCounts.get("INVALID_PROPERTY_TYPE") ?? 0;
  const totalIssues = allIssues.length;
  const errorCount = allIssues.filter(i => i.severity === "error").length;
  const warningCount = allIssues.filter(i => i.severity === "warning").length;
  const infoCount = allIssues.filter(i => i.severity === "info").length;

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

  // Phase 6: Quality Scoring
  console.log("--- Quality Scoring ---");
  const qualityStart = performance.now();
  const qualityScores: number[] = [];
  for (const dimension of dimensions) {
    const dimensionMembers = members.filter(m => m.dimensionId === dimension.id);
    for (const member of dimensionMembers) {
      const score = scoreMemberQuality(member, dimension, []);
      qualityScores.push(score.overallScore);
    }
  }
  const qualityTimeMs = Math.round(performance.now() - qualityStart);
  const avgQualityScore = qualityScores.length > 0 ? Math.round(qualityScores.reduce((s, v) => s + v, 0) / qualityScores.length) : 0;
  const minScore = qualityScores.length > 0 ? Math.min(...qualityScores) : 0;
  const maxScore = qualityScores.length > 0 ? Math.max(...qualityScores) : 0;
  const scoreSpread = maxScore - minScore;
  console.log(`  avg_quality_score:         ${avgQualityScore}`);
  console.log(`  min_member_score:          ${minScore}`);
  console.log(`  max_member_score:          ${maxScore}`);
  console.log(`  score_spread:              ${scoreSpread}`);
  console.log(`  quality_time_ms:           ${qualityTimeMs}`);
  console.log("");

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
  console.log(`  migration_pass_rate:       ${migrationPassCount}/4`);
  console.log(`  total_parse_warnings:      ${totalParseWarnings}`);
  console.log(`  migration_time_ms:         ${migrationTimeMs}`);
  console.log("");

  // Phase 8: Run tests (unless skipped)
  let testsPass = true;
  if (!SKIP_TESTS) {
    console.log("Running test suite...");
    try {
      execSync("npx vitest run", { cwd: PROJECT_ROOT, stdio: "pipe", timeout: 300_000 });
      testsPass = true;
      console.log("Tests: PASS");
    } catch {
      testsPass = false;
      console.log("Tests: FAIL");
    }
  } else {
    console.log("Tests: SKIPPED");
  }

  // Phase 5: Print structured output
  console.log("");
  console.log("--- Issue Breakdown ---");
  const sortedCodes = [...issueCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [code, count] of sortedCodes) {
    console.log(`  ${code}: ${count}`);
  }

  console.log("");
  console.log("---");
  console.log(`xml_unknown_count:       ${xmlUnknownCount}`);
  console.log(`unknown_property_count:  ${unknownPropertyCount}`);
  console.log(`invalid_enum_count:      ${invalidEnumCount}`);
  console.log(`invalid_type_count:      ${invalidPropertyTypeCount}`);
  console.log(`total_issues:            ${totalIssues}`);
  console.log(`error_count:             ${errorCount}`);
  console.log(`warning_count:           ${warningCount}`);
  console.log(`info_count:              ${infoCount}`);
  console.log(`duplicate_groups:        ${duplicateGroups.length}`);
  console.log(`naming_anomalies:        ${totalNamingAnomalies}`);
  console.log(`hierarchy_opts:          ${totalHierOpts}`);
  console.log(`avg_quality_score:       ${avgQualityScore}`);
  console.log(`score_spread:            ${scoreSpread}`);
  console.log(`migration_pass_rate:     ${migrationPassCount}/4`);
  console.log(`parse_warnings:          ${totalParseWarnings}`);
  console.log(`import_time_ms:          ${importTimeMs}`);
  console.log(`validate_time_ms:        ${validateTimeMs}`);
  console.log(`dimensions_count:        ${dimensions.length}`);
  console.log(`members_count:           ${members.length}`);
  console.log(`relationships_count:     ${relationships.length}`);
  console.log(`tests_pass:              ${testsPass}`);
  console.log(`from_cache:              ${fromCache}`);
  console.log("---");

  // Phase 10: Initialize results.tsv if needed
  if (!existsSync(RESULTS_FILE)) {
    writeFileSync(RESULTS_FILE, "timestamp\txml_unknown\tunknown_prop\tinvalid_enum\tdup_groups\tnaming_anomalies\thierarchy_opts\tavg_quality\tscore_spread\tmigration_pass\ttotal_issues\ttests_pass\ttime_ms\tdescription\n");
  }

  return {
    xmlUnknownCount, unknownPropertyCount, invalidEnumCount, invalidPropertyTypeCount,
    totalIssues, errorCount, warningCount, infoCount, importTimeMs, validateTimeMs,
    testsPass, dimensionsCount: dimensions.length, membersCount: members.length,
    relationshipsCount: relationships.length,
    duplicateGroups: duplicateGroups.length, totalNamingAnomalies, totalHierOpts,
    avgQualityScore, scoreSpread, migrationPassCount, totalParseWarnings
  };
}

// Main
runBenchmark()
  .then((results) => {
    if (!results.testsPass) {
      console.error("\n*** TESTS FAILED — this change must be reverted ***");
      process.exit(1);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("Benchmark failed:", error);
    process.exit(2);
  });
