import { createReadStream, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import readline from "node:readline";
import type { DimensionType, MetadataDimensionReference, MetadataReference } from "../shared/types";

const supportedDimensionTypes = new Set([
  "Scenario",
  "Entity",
  "Account",
  "Flow",
  "UD1",
  "UD2",
  "UD3",
  "UD4",
  "UD5",
  "UD6",
  "UD7",
  "UD8"
]);

export function findDefaultMetadataReferencePath(directory = "metadata"): string | null {
  if (!existsSync(directory)) return null;
  const files = readdirSync(directory)
    .filter((fileName) => fileName.toLowerCase().endsWith(".xml"))
    .sort()
    .reverse();
  return files[0] ? join(directory, files[0]) : null;
}

export async function parseMetadataReference(filePath: string): Promise<MetadataReference> {
  const dimensions: MetadataDimensionReference[] = [];
  const byName = new Map<string, MetadataDimensionReference>();
  let version: string | undefined;
  let current: MetadataDimensionReference | null = null;

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of lines) {
    if (!version && line.includes("<OneStreamXF")) version = readAttributes(line).version;

    if (line.includes("<dimension ")) {
      const attributes = readAttributes(line);
      if (!supportedDimensionTypes.has(attributes.type ?? "")) {
        current = null;
        continue;
      }
      current = {
        type: attributes.type as DimensionType,
        name: attributes.name ?? "",
        description: attributes.description ?? "",
        accessGroup: attributes.accessGroup ?? "",
        maintenanceGroup: attributes.maintenanceGroup ?? "",
        inheritedDim: attributes.inheritedDim ?? null,
        dimMemberSourceType: attributes.dimMemberSourceType ?? "",
        dimMemberSourcePath: attributes.dimMemberSourcePath ?? "",
        dimMemberSourceNVPairs: attributes.dimMemberSourceNVPairs ?? "",
        memberCount: 0,
        relationshipCount: 0
      };
      dimensions.push(current);
      byName.set(`${current.type}\u0000${current.name}`, current);
      continue;
    }

    if (!current) continue;
    if (line.includes("</dimension>")) {
      current = null;
      continue;
    }
    if (line.includes("<member ")) current.memberCount = (current.memberCount ?? 0) + 1;
    if (line.includes("<relationship ")) current.relationshipCount = (current.relationshipCount ?? 0) + 1;
  }

  return { version, dimensions: [...byName.values()] };
}

function readAttributes(line: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/g;
  for (const match of line.matchAll(pattern)) attributes[match[1]] = decodeXmlAttribute(match[2]);
  return attributes;
}

function decodeXmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
