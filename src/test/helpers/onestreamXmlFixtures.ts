import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseOneStreamXml } from "../../shared/xmlImport";
import type { CertificationSnapshot } from "../../shared/xmlRoundTripCertification";

export const ONESTREAM_XML_FIXTURE_DIR = join(process.cwd(), "tests", "fixtures", "onestream", "xml");

export interface FixtureManifestEntry {
  file: string;
  category: "valid" | "invalid";
  purpose: string;
  dimensionTypes: string[];
  roundTripExpectation?: "passed" | "passed_with_warnings" | "not_applicable";
  invalidExpectation?: {
    minDimensions?: number;
    maxDimensions?: number;
    validationCodes?: string[];
    importErrorSubstring?: string;
  };
}

export interface FixtureManifest {
  version: number;
  description: string;
  fixtures: FixtureManifestEntry[];
}

export function loadFixtureManifest(): FixtureManifest {
  const raw = readFileSync(join(ONESTREAM_XML_FIXTURE_DIR, "manifest.json"), "utf8");
  return JSON.parse(raw) as FixtureManifest;
}

export function loadOnestreamXmlFixture(fileName: string): string {
  return readFileSync(join(ONESTREAM_XML_FIXTURE_DIR, fileName), "utf8");
}

export function snapshotFromOnestreamFixture(fileName: string): CertificationSnapshot {
  const parsed = parseOneStreamXml(loadOnestreamXmlFixture(fileName), { projectName: fileName });
  return {
    project: parsed.project,
    dimensions: parsed.dimensions,
    members: parsed.members,
    relationships: parsed.relationships
  };
}

export function listOnestreamXmlFixtureFiles(): string[] {
  return readdirSync(ONESTREAM_XML_FIXTURE_DIR).filter((f) => f.endsWith(".xml"));
}
