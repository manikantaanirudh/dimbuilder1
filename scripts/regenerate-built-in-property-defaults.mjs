/**
 * Regenerates config/builtInPropertyDefaults.json from a reference OneStream metadata XML.
 *
 * Usage:
 *   node scripts/regenerate-built-in-property-defaults.mjs [path-to-xml]
 *
 * Default input: Dev_Metadata_20260519_181236Z.xml in the repo root.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeXmlPropertyDefaults } from "../src/shared/propertyDefaults.ts";

const xmlPath = process.argv[2] ?? join(process.cwd(), "Dev_Metadata_20260519_181236Z.xml");
const EXCLUDE = new Set([
  "Description",
  "Alias",
  "Parent",
  "Child",
  "Account",
  "Entity",
  "Flow Member",
  "Scenario",
  "UD1",
  "UD2",
  "UD3",
  "UD4",
  "UD5",
  "UD6",
  "UD7",
  "UD8"
]);

/** Always keep these even when mode confidence is below the general threshold. */
const ALWAYS_INCLUDE = new Set([
  "Account Type",
  "Currency",
  "Scenario Type",
  "Flow Type",
  "Flow Processing Type",
  "Percent Consol",
  "Percent Ownership",
  "Ownership Type",
  "Aggregation Weight"
]);

const xml = readFileSync(xmlPath, "utf8");
const analysis = analyzeXmlPropertyDefaults(xml, { sourceFileName: xmlPath.split(/[/\\]/).pop() });
const values = analysis.values.filter((value) => {
  if (EXCLUDE.has(value.propertyName)) return false;
  if (!value.defaultValue) return false;
  if (ALWAYS_INCLUDE.has(value.propertyName)) return true;
  if (value.confidence < 0.75 && value.distinctCount > 1) return false;
  return true;
});

const outputPath = join(process.cwd(), "config", "builtInPropertyDefaults.json");
writeFileSync(outputPath, JSON.stringify({ source: analysis.profile, values }, null, 2), "utf8");
console.log(`Wrote ${values.length} defaults to ${outputPath}`);
