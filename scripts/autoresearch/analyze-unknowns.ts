import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("scripts/autoresearch/benchmark-cache.json", "utf8"));
const { dimensions, members } = data;

const UNKNOWN_XML_DATA_KEY = "__unknownXml";

// Map dimensionId to dimensionType
const dimMap = new Map<string, string>();
for (const d of dimensions) {
  dimMap.set(d.id, d.dimensionType);
}

// Find which dimension types have which unknown property names
const propByDimType = new Map<string, Map<string, number>>();

for (const m of members) {
  const unknownXml = m.properties?.[UNKNOWN_XML_DATA_KEY];
  if (!unknownXml?.unknownElements) continue;
  const dimType = dimMap.get(m.dimensionId) || "unknown";
  
  for (const e of unknownXml.unknownElements) {
    if (e.originalXmlPath?.endsWith("/properties/property")) {
      if (!propByDimType.has(dimType)) propByDimType.set(dimType, new Map());
      const typeMap = propByDimType.get(dimType)!;
      typeMap.set(e.name, (typeMap.get(e.name) ?? 0) + 1);
    }
  }
}

for (const [dimType, props] of [...propByDimType.entries()].sort()) {
  console.log(`\n=== ${dimType} ===`);
  for (const [name, count] of [...props.entries()].sort((a, b) => b[1] - a[1])) {
    // Also get sample values
    console.log(`  ${name}: ${count}`);
  }
}

// Get sample values for each unique property
console.log("\n\n=== Sample Values ===");
const sampleValues = new Map<string, Set<string>>();
for (const m of members) {
  const unknownXml = m.properties?.[UNKNOWN_XML_DATA_KEY];
  if (!unknownXml?.unknownElements) continue;
  for (const e of unknownXml.unknownElements) {
    if (e.originalXmlPath?.endsWith("/properties/property")) {
      if (!sampleValues.has(e.name)) sampleValues.set(e.name, new Set());
      const vals = sampleValues.get(e.name)!;
      if (vals.size < 10) {
        vals.add(e.attributes?.value ?? e.text ?? "");
      }
    }
  }
}
for (const [name, vals] of [...sampleValues.entries()].sort()) {
  console.log(`  ${name}: ${[...vals].join(", ")}`);
}
