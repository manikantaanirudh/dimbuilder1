import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("scripts/autoresearch/benchmark-cache.json", "utf8"));
const { members } = data;

const UNKNOWN_XML_DATA_KEY = "__unknownXml";

// Find a member with UD2Constraint elements
let found = 0;
for (const m of members) {
  const unknownXml = m.properties?.[UNKNOWN_XML_DATA_KEY];
  if (unknownXml?.unknownElements?.length > 0) {
    const nonProperty = unknownXml.unknownElements.filter(
      (e: any) => e.name !== "property" && !e.originalXmlPath?.endsWith("/properties/property")
    );
    if (nonProperty.length > 0) {
      console.log(`Member: ${m.memberKey} (dimId: ${m.dimensionId})`);
      console.log(`  Total unknown elements: ${unknownXml.unknownElements.length}`);
      console.log(`  Non-property elements: ${nonProperty.length}`);
      for (const e of nonProperty.slice(0, 5)) {
        console.log(`    name=${e.name}, path=${e.originalXmlPath}, sourceOrder=${e.sourceOrder}`);
        console.log(`    attributes:`, JSON.stringify(e.attributes));
        if (e.children?.length > 0) console.log(`    children count: ${e.children.length}`);
      }
      found++;
      if (found >= 3) break;
    }
  }
}

if (found === 0) {
  // All those elements ARE property elements?
  let propCount = 0;
  let nonPropCount = 0;
  for (const m of members) {
    const unknownXml = m.properties?.[UNKNOWN_XML_DATA_KEY];
    if (unknownXml?.unknownElements) {
      for (const e of unknownXml.unknownElements) {
        if (e.name === "property" || e.originalXmlPath?.endsWith("/properties/property")) {
          propCount++;
        } else {
          nonPropCount++;
        }
      }
    }
  }
  console.log(`Property elements: ${propCount}`);
  console.log(`Non-property elements: ${nonPropCount}`);
}
