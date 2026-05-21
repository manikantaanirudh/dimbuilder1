import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("scripts/autoresearch/benchmark-cache.json", "utf8"));
const { members } = data;

const UNKNOWN_XML_DATA_KEY = "__unknownXml";

// Sample the element names 
const nameSet = new Map<string, number>();
let total = 0;
let samplePrinted = false;

for (const m of members) {
  const unknownXml = m.properties?.[UNKNOWN_XML_DATA_KEY];
  if (unknownXml?.unknownElements) {
    for (const e of unknownXml.unknownElements) {
      nameSet.set(e.name, (nameSet.get(e.name) ?? 0) + 1);
      total++;
      if (!samplePrinted && e.name !== "property" && e.name !== "descriptions") {
        console.log("Sample non-property, non-descriptions element:");
        console.log(JSON.stringify(e, null, 2).slice(0, 1000));
        samplePrinted = true;
      }
    }
  }
}

console.log(`\nTotal elements: ${total}`);
console.log("Element name distribution:");
for (const [name, count] of [...nameSet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`  ${name}: ${count}`);
}
