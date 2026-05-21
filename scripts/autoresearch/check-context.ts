import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("scripts/autoresearch/benchmark-cache.json", "utf8"));
const { members } = data;

const UNKNOWN_XML_DATA_KEY = "__unknownXml";

// Check varying context on unknown properties
const propsWithContext = new Map<string, { scenarioType: Set<string>, time: Set<string>, cubeType: Set<string>, count: number }>();

for (const m of members) {
  const unknownXml = m.properties?.[UNKNOWN_XML_DATA_KEY];
  if (!unknownXml?.unknownElements) continue;
  for (const e of unknownXml.unknownElements) {
    if (!e.originalXmlPath?.endsWith("/properties/property")) continue;
    const attrs = e.attributes || {};
    const hasContext = attrs.scenarioType || attrs.time || attrs.cubeType;
    if (hasContext) {
      if (!propsWithContext.has(e.name)) {
        propsWithContext.set(e.name, { scenarioType: new Set(), time: new Set(), cubeType: new Set(), count: 0 });
      }
      const entry = propsWithContext.get(e.name)!;
      entry.count++;
      if (attrs.scenarioType) entry.scenarioType.add(attrs.scenarioType);
      if (attrs.time) entry.time.add(attrs.time);
      if (attrs.cubeType) entry.cubeType.add(attrs.cubeType);
    }
  }
}

console.log("Properties with varying context:");
for (const [name, info] of [...propsWithContext.entries()].sort()) {
  const ctx: string[] = [];
  if (info.scenarioType.size > 0) ctx.push(`scenarioType=[${[...info.scenarioType].slice(0, 5).join(",")}]`);
  if (info.time.size > 0) ctx.push(`time=[${[...info.time].slice(0, 5).join(",")}]`);
  if (info.cubeType.size > 0) ctx.push(`cubeType=[${[...info.cubeType].slice(0, 5).join(",")}]`);
  console.log(`  ${name} (${info.count}): ${ctx.join(", ")}`);
}

// Count those WITHOUT context
let withoutContext = 0;
const noContextNames = new Map<string, number>();
for (const m of members) {
  const unknownXml = m.properties?.[UNKNOWN_XML_DATA_KEY];
  if (!unknownXml?.unknownElements) continue;
  for (const e of unknownXml.unknownElements) {
    if (!e.originalXmlPath?.endsWith("/properties/property")) continue;
    const attrs = e.attributes || {};
    if (!attrs.scenarioType && !attrs.time && !attrs.cubeType) {
      withoutContext++;
      noContextNames.set(e.name, (noContextNames.get(e.name) ?? 0) + 1);
    }
  }
}
console.log(`\nProperties WITHOUT context: ${withoutContext}`);
for (const [name, count] of [...noContextNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`  ${name}: ${count}`);
}
