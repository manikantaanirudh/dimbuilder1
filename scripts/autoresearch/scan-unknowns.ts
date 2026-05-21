import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("scripts/autoresearch/benchmark-cache.json", "utf8"));
const { dimensions, members, relationships } = data;

const UNKNOWN_XML_DATA_KEY = "__unknownXml";

let memberUnknownAttrs = 0;
let memberUnknownElements = 0;
let relUnknownAttrs = 0;
let relUnknownElements = 0;
let dimUnknownAttrs = 0;
let dimUnknownElements = 0;

const unknownAttrNames = new Map<string, number>();
const unknownElementNames = new Map<string, number>();

for (const dim of dimensions) {
  const unknownXml = dim.metadata?.[UNKNOWN_XML_DATA_KEY];
  if (unknownXml) {
    const attrs = Object.keys(unknownXml.unknownAttributes || {});
    dimUnknownAttrs += attrs.length;
    for (const a of attrs) unknownAttrNames.set(`dim:${a}`, (unknownAttrNames.get(`dim:${a}`) ?? 0) + 1);
    const elements = unknownXml.unknownElements || [];
    dimUnknownElements += elements.length;
    for (const e of elements) unknownElementNames.set(`dim:${e.name}`, (unknownElementNames.get(`dim:${e.name}`) ?? 0) + 1);
  }
}

for (const member of members) {
  const unknownXml = member.properties?.[UNKNOWN_XML_DATA_KEY];
  if (unknownXml) {
    const attrs = Object.keys(unknownXml.unknownAttributes || {});
    memberUnknownAttrs += attrs.length;
    for (const a of attrs) unknownAttrNames.set(`member:${a}`, (unknownAttrNames.get(`member:${a}`) ?? 0) + 1);
    const elements = unknownXml.unknownElements || [];
    memberUnknownElements += elements.length;
    for (const e of elements) unknownElementNames.set(`member:${e.name}`, (unknownElementNames.get(`member:${e.name}`) ?? 0) + 1);
  }
}

for (const rel of relationships) {
  const unknownXml = rel.properties?.[UNKNOWN_XML_DATA_KEY];
  if (unknownXml) {
    const attrs = Object.keys(unknownXml.unknownAttributes || {});
    relUnknownAttrs += attrs.length;
    for (const a of attrs) unknownAttrNames.set(`rel:${a}`, (unknownAttrNames.get(`rel:${a}`) ?? 0) + 1);
    const elements = unknownXml.unknownElements || [];
    relUnknownElements += elements.length;
    for (const e of elements) unknownElementNames.set(`rel:${e.name}`, (unknownElementNames.get(`rel:${e.name}`) ?? 0) + 1);
  }
}

console.log("=== Unknown XML Summary ===");
console.log(`Dimension unknown attrs: ${dimUnknownAttrs}, elements: ${dimUnknownElements}`);
console.log(`Member unknown attrs: ${memberUnknownAttrs}, elements: ${memberUnknownElements}`);
console.log(`Relationship unknown attrs: ${relUnknownAttrs}, elements: ${relUnknownElements}`);
console.log("");
console.log("Unknown attribute names:");
for (const [name, count] of [...unknownAttrNames.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${name}: ${count}`);
}
console.log("");
console.log("Unknown element names:");
for (const [name, count] of [...unknownElementNames.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${name}: ${count}`);
}
