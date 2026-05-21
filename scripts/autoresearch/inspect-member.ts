import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("scripts/autoresearch/benchmark-cache.json", "utf8"));
const { members } = data;

const UNKNOWN_XML_DATA_KEY = "__unknownXml__";

// Find the specific member with entityId from the issue
const targetId = "SQXiTGdtny2V0tAD46fF-";
const member = members.find((m: any) => m.id === targetId);
if (member) {
  console.log("Found target member:");
  console.log("  memberKey:", member.memberKey);
  console.log("  dimensionId:", member.dimensionId);
  console.log("  properties keys:", Object.keys(member.properties));
  const unknownXml = member.properties[UNKNOWN_XML_DATA_KEY];
  if (unknownXml) {
    console.log("  unknownXml:", JSON.stringify(unknownXml, null, 2));
  } else {
    console.log("  No unknownXml attached to properties");
  }
  // Also check the member record directly
  console.log("  member keys:", Object.keys(member));
  if (member[UNKNOWN_XML_DATA_KEY]) {
    console.log("  member-level unknownXml:", JSON.stringify(member[UNKNOWN_XML_DATA_KEY], null, 2));
  }
} else {
  console.log("Target member not found");
  
  // Search for members with unknownXml
  let found = 0;
  for (const m of members) {
    if (m.properties?.[UNKNOWN_XML_DATA_KEY]) {
      found++;
      if (found <= 5) {
        const ux = m.properties[UNKNOWN_XML_DATA_KEY];
        console.log(`Member ${m.memberKey}: unknownAttrs=${Object.keys(ux.unknownAttributes||{}).length}, unknownElements=${(ux.unknownElements||[]).length}`);
        if ((ux.unknownElements||[]).length > 0) {
          console.log("  Elements:", ux.unknownElements.map((e:any) => e.name));
        }
      }
    }
  }
  console.log(`Total members with unknownXml: ${found}`);
}
