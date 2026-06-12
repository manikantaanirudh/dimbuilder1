import { describe, expect, it } from "vitest";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import { exportProjectXml } from "../shared/xmlExport";
import { parseOneStreamXml } from "../shared/xmlImport";
import {
  certifyXmlRoundTrip,
  compareSnapshots,
  renderCertificationMarkdown
} from "../shared/xmlRoundTripCertification";
import { validateDimension } from "../shared/validationEngine";
import {
  loadFixtureManifest,
  loadOnestreamXmlFixture,
  listOnestreamXmlFixtureFiles,
  snapshotFromOnestreamFixture,
  type FixtureManifestEntry
} from "./helpers/onestreamXmlFixtures";

const manifest = loadFixtureManifest();
const validFixtures = manifest.fixtures.filter((f) => f.category === "valid");
const invalidFixtures = manifest.fixtures.filter((f) => f.category === "invalid");

function parseFixture(file: string) {
  return parseOneStreamXml(loadOnestreamXmlFixture(file), { projectName: file });
}

function validateFirstDimension(file: string) {
  const parsed = parseFixture(file);
  const dimension = parsed.dimensions[0];
  if (!dimension) return [];
  const members = parsed.members.filter((m) => m.dimensionId === dimension.id);
  const relationships = parsed.relationships.filter((r) => r.dimensionId === dimension.id);
  return validateDimension({
    project: parsed.project,
    dimension,
    members,
    relationships,
    severities: defaultAppConfig.validation
  });
}

describe("OneStream XML fixture pack", () => {
  it("keeps manifest.json in sync with fixture files on disk", () => {
    const manifestFiles = new Set(manifest.fixtures.map((f) => f.file));
    const diskFiles = new Set(listOnestreamXmlFixtureFiles());
    expect(manifestFiles).toEqual(diskFiles);
    expect(manifest.fixtures.length).toBe(14);
  });

  describe.each(validFixtures.map((f) => [f.file, f] as const))(
    "valid fixture %s",
    (fileName, entry: FixtureManifestEntry) => {
      it("parses with expected dimension types and member counts", () => {
        const parsed = parseFixture(fileName);
        expect(parsed.dimensions.length).toBeGreaterThan(0);
        expect(parsed.dimensions.map((d) => d.dimensionType)).toEqual(entry.dimensionTypes);
        expect(parsed.members.length).toBeGreaterThan(0);
        expect(parsed.relationships.length).toBeGreaterThan(0);
        expect(parsed.importSummary.errors).toHaveLength(0);
      });

      it("passes import → export → re-import round-trip check", () => {
        const snapshot = snapshotFromOnestreamFixture(fileName);
        const report = certifyXmlRoundTrip(snapshot);
        if (entry.roundTripExpectation === "passed") {
          expect(report.status).toBe("passed");
        } else {
          expect(report.status).not.toBe("failed");
        }
        expect(report.members.missing).toHaveLength(0);
        expect(report.relationships.missing).toHaveLength(0);
      });
    }
  );

  it("account-basic preserves account type, alias, and formula property", () => {
    const parsed = parseFixture("account-basic.xml");
    const revenue = parsed.members.find((m) => m.memberKey === "PL_Revenue");
    expect(revenue?.properties.Alias).toBe("Rev");
    expect(revenue?.properties["Account Type"]).toBe("Revenue");
    expect(String(revenue?.properties.Formula ?? revenue?.properties["Formula"] ?? "")).toBeTruthy();
  });

  it("entity-basic preserves currency and consolidation relationship properties", () => {
    const parsed = parseFixture("entity-basic.xml");
    const entUs = parsed.members.find((m) => m.memberKey === "ENT_US");
    expect(entUs?.properties.Currency).toBe("USD");
    const consol = parsed.relationships.find((r) => r.parentKey === "ENT_US" && r.childKey === "ENT_EU");
    expect(consol?.percentConsol).toBe(80);
    expect(consol?.ownershipType).toMatch(/FullConsolidation/i);
  });

  it("scenario-basic preserves scenario type", () => {
    const parsed = parseFixture("scenario-basic.xml");
    const actual = parsed.members.find((m) => m.memberKey === "SCN_Actual");
    expect(actual?.properties["Scenario Type"]).toBe("Actual");
  });

  it("alternate-hierarchy keeps shared leaf under two parents", () => {
    const snapshot = snapshotFromOnestreamFixture("alternate-hierarchy.xml");
    const report = certifyXmlRoundTrip(snapshot);
    expect(report.status).toBe("passed");
    const parents = snapshot.relationships
      .filter((r) => r.childKey === "ALT_SharedLeaf")
      .map((r) => r.parentKey)
      .sort();
    expect(parents).toEqual(["ALT_BranchA", "ALT_BranchB"]);
  });

  it("special-characters survive round-trip in descriptions", () => {
    const snapshot = snapshotFromOnestreamFixture("special-characters.xml");
    const xml = exportProjectXml(snapshot);
    const reparsed = parseOneStreamXml(xml, { projectName: "special-characters.xml" });
    const amp = reparsed.members.find((m) => m.memberKey === "SCN_Amp");
    expect(amp?.description).toContain("R&D");
    const quote = reparsed.members.find((m) => m.memberKey === "SCN_Quote");
    expect(quote?.description).toContain('"forecast"');
    const report = compareSnapshots(snapshot, {
      project: snapshot.project,
      dimensions: reparsed.dimensions,
      members: reparsed.members,
      relationships: reparsed.relationships
    });
    expect(report.members.missing).toHaveLength(0);
  });

  it("varying-properties fixture preserves contextual property metadata", () => {
    const parsed = parseFixture("varying-properties.xml");
    const member = parsed.members.find((m) => m.memberKey === "VAR_Member");
    expect(member?.properties["Account Type"]).toBe("Asset");
    const unknown = member?.properties.__unknownXml as { unknownElements?: unknown[] } | undefined;
    expect(unknown?.unknownElements?.length ?? 0).toBeGreaterThan(0);
  });

  describe.each(invalidFixtures.map((f) => [f.file, f] as const))(
    "invalid fixture %s",
    (fileName, entry: FixtureManifestEntry) => {
      it("behaves as documented for negative testing", () => {
        const parsed = parseFixture(fileName);
        const exp = entry.invalidExpectation ?? {};

        if (exp.maxDimensions !== undefined) {
          expect(parsed.dimensions.length).toBeLessThanOrEqual(exp.maxDimensions);
        }
        if (exp.minDimensions !== undefined) {
          expect(parsed.dimensions.length).toBeGreaterThanOrEqual(exp.minDimensions);
        }

        if (exp.validationCodes?.length) {
          const issues = validateFirstDimension(fileName);
          const codes = new Set(issues.map((i) => i.code));
          for (const code of exp.validationCodes) {
            expect(codes.has(code)).toBe(true);
          }
        }
      });
    }
  );

  it("round-trip markdown uses import-readiness language", () => {
    const report = certifyXmlRoundTrip(snapshotFromOnestreamFixture("account-basic.xml"));
    const md = renderCertificationMarkdown(report, "Synthetic");
    expect(md).toContain("XML Round-Trip");
    expect(md).toMatch(/import readiness|Internal/i);
    expect(md).not.toMatch(/OneStream-certified/i);
  });
});
