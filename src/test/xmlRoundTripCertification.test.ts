import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOneStreamXml } from "../shared/xmlImport";
import { exportProjectXml } from "../shared/xmlExport";
import {
  certifyXmlRoundTrip,
  compareSnapshots,
  renderCertificationMarkdown,
  type CertificationSnapshot
} from "../shared/xmlRoundTripCertification";

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "xml", name), "utf8");
}

function snapshotFromXml(name: string): CertificationSnapshot {
  const parsed = parseOneStreamXml(fixture(name), { projectName: name });
  return {
    project: parsed.project,
    dimensions: parsed.dimensions,
    members: parsed.members,
    relationships: parsed.relationships
  };
}

describe("XML round-trip certification", () => {
  it("certifies a basic project as passed", () => {
    const report = certifyXmlRoundTrip(snapshotFromXml("roundtrip-basic.xml"));
    expect(report.status).toBe("passed");
    expect(report.dimensions.missing).toHaveLength(0);
    expect(report.members.matched).toBe(report.members.original);
    expect(report.relationships.matched).toBe(report.relationships.original);
  });

  it("preserves unknown attributes and properties on round-trip", () => {
    const snapshot = snapshotFromXml("roundtrip-unknowns.xml");
    const report = certifyXmlRoundTrip(snapshot);
    expect(report.status).not.toBe("failed");
    expect(report.unknownPreservation.attributesOriginal).toBeGreaterThan(0);
    // Unknown attribute counts should match between source and export.
    expect(report.unknownPreservation.attributesExported).toBe(report.unknownPreservation.attributesOriginal);
    expect(report.unknownPreservation.propertiesExported).toBe(report.unknownPreservation.propertiesOriginal);
  });

  it("certifies varying-property fixture without metadata loss", () => {
    const report = certifyXmlRoundTrip(snapshotFromXml("roundtrip-varying-properties.xml"));
    expect(report.status).not.toBe("failed");
    expect(report.members.missing).toHaveLength(0);
  });

  it("fails certification when a relationship is missing from the export", () => {
    const source = snapshotFromXml("roundtrip-basic.xml");
    // Simulate a lossy export that dropped one relationship.
    const lossy: CertificationSnapshot = {
      ...source,
      relationships: source.relationships.slice(0, source.relationships.length - 1)
    };
    const report = compareSnapshots(source, lossy);
    expect(report.status).toBe("failed");
    expect(report.relationships.missing.length).toBeGreaterThan(0);
    expect(report.recommendedAction).toMatch(/Do not export/i);
  });

  it("reports changed (not lost) when a property value differs", () => {
    const source = snapshotFromXml("roundtrip-basic.xml");
    const changed: CertificationSnapshot = {
      ...source,
      members: source.members.map((m) =>
        m.memberKey === "Revenue"
          ? { ...m, properties: { ...m.properties, AccountType: "Expense" } }
          : m
      )
    };
    const report = compareSnapshots(source, changed);
    expect(report.properties.changed.length).toBeGreaterThan(0);
    expect(report.properties.lost).toHaveLength(0);
    expect(report.status).toBe("passed_with_warnings");
  });

  it("handles special characters in member descriptions", () => {
    const report = certifyXmlRoundTrip(snapshotFromXml("roundtrip-special-chars.xml"));
    expect(report.status).not.toBe("failed");
    expect(report.members.missing).toHaveLength(0);
  });

  it("import export re-import keeps member counts stable", () => {
    const source = snapshotFromXml("roundtrip-basic.xml");
    const xml = exportProjectXml({
      project: source.project,
      dimensions: source.dimensions,
      members: source.members,
      relationships: source.relationships
    });
    const reparsed = parseOneStreamXml(xml, { projectName: "roundtrip-basic.xml" });
    const roundTrip: CertificationSnapshot = {
      project: reparsed.project,
      dimensions: reparsed.dimensions,
      members: reparsed.members,
      relationships: reparsed.relationships
    };
    const report = compareSnapshots(source, roundTrip);
    expect(report.members.missing).toHaveLength(0);
    expect(report.relationships.missing).toHaveLength(0);
  });

  it("renders a markdown report", () => {
    const report = certifyXmlRoundTrip(snapshotFromXml("roundtrip-basic.xml"));
    const md = renderCertificationMarkdown(report, "Basic");
    expect(md).toContain("XML Round-Trip");
    expect(md).toMatch(/Internal|import readiness/i);
  });
});
