import { describe, expect, it } from "vitest";
import { exportProjectXml } from "../shared/xmlExport";
import { parseOneStreamXml, UNKNOWN_XML_DATA_KEY } from "../shared/xmlImport";

const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
<OneStreamXF version="9.3.0.0">
  <metadataRoot>
    <dimensions>
      <dimension type="Account" name="Accounts" description="Account metadata" accessGroup="Everyone" maintenanceGroup="Admins" inheritedDim="" customDimAttr="dim-custom">
        <properties>
          <property name="DimLegacyFlag" value="KeepDimension" />
        </properties>
        <unsupportedDimensionNode code="D1">Hold</unsupportedDimensionNode>
        <members>
          <member name="Revenue" alias="Rev" description="Revenue accounts" displayMemberGroup="Everyone" customMemberAttr="member-custom">
            <properties>
              <property name="AccountType" value="Revenue" />
              <property name="LegacyMemberFlag" value="PreserveMember" />
            </properties>
            <unsupportedMemberNode code="M1" />
          </member>
        </members>
        <relationships>
          <relationship parent="Root" child="Revenue" aggregationWeight="1" customRelationshipAttr="relationship-custom">
            <properties>
              <property name="LegacyRelationshipFlag" value="PreserveRelationship" />
            </properties>
            <unsupportedRelationshipNode code="R1">Rel</unsupportedRelationshipNode>
          </relationship>
        </relationships>
      </dimension>
    </dimensions>
  </metadataRoot>
</OneStreamXF>`;

describe("OneStream XML import", () => {
  it("parses dimensions, members, relationships, known properties, and preserved unknown XML data", () => {
    const parsed = parseOneStreamXml(sampleXml, {
      projectName: "XML Import Project",
      sourceFileName: "accounts.xml",
      createdBy: "local-admin"
    });

    expect(parsed.project.name).toBe("XML Import Project");
    expect(parsed.project.sourceFileName).toBe("accounts.xml");
    expect(parsed.dimensions).toHaveLength(1);
    expect(parsed.members).toHaveLength(1);
    expect(parsed.relationships).toHaveLength(1);
    expect(parsed.importSummary).toMatchObject({
      dimensionsImported: 1,
      membersImported: 1,
      relationshipsImported: 1,
      unknownAttributesPreserved: 3,
      unknownElementsPreserved: 3,
      unknownPropertiesPreserved: 3
    });

    const dimension = parsed.dimensions[0];
    expect(dimension).toMatchObject({
      dimensionType: "Account",
      dimensionName: "Accounts",
      description: "Account metadata",
      accessGroup: "Everyone",
      maintenanceGroup: "Admins"
    });
    expect(dimension.metadata.oneStreamVersion).toBe("9.3.0.0");
    expect(dimension.metadata[UNKNOWN_XML_DATA_KEY]).toMatchObject({
      unknownAttributes: { customDimAttr: "dim-custom" },
      sourceOrder: expect.any(Number)
    });

    const member = parsed.members[0];
    expect(member).toMatchObject({
      dimensionId: dimension.id,
      memberKey: "Revenue",
      description: "Revenue accounts",
      properties: {
        Alias: "Rev",
        "Display Group": "Everyone",
        "Account Type": "Revenue"
      }
    });
    expect(member.properties[UNKNOWN_XML_DATA_KEY]).toMatchObject({
      unknownAttributes: { customMemberAttr: "member-custom" },
      unknownElements: expect.arrayContaining([
        expect.objectContaining({ name: "LegacyMemberFlag" }),
        expect.objectContaining({ name: "unsupportedMemberNode" })
      ])
    });

    const relationship = parsed.relationships[0];
    expect(relationship).toMatchObject({
      dimensionId: dimension.id,
      parentKey: "Root",
      childKey: "Revenue",
      aggregationWeight: 1,
      properties: { "Aggregation Weight": 1 }
    });
    expect(relationship.properties[UNKNOWN_XML_DATA_KEY]).toMatchObject({
      unknownAttributes: { customRelationshipAttr: "relationship-custom" },
      unknownElements: expect.arrayContaining([
        expect.objectContaining({ name: "LegacyRelationshipFlag" }),
        expect.objectContaining({ name: "unsupportedRelationshipNode" })
      ])
    });
  });

  it("round-trips preserved unknown attributes, properties, and unsupported elements", () => {
    const parsed = parseOneStreamXml(sampleXml, { projectName: "Round Trip Project" });
    const xml = exportProjectXml({
      project: parsed.project,
      dimensions: parsed.dimensions,
      members: parsed.members,
      relationships: parsed.relationships
    });

    expect(xml).toContain('<OneStreamXF version="9.3.0.0">');
    expect(xml).toContain('customDimAttr="dim-custom"');
    expect(xml).toContain('customMemberAttr="member-custom"');
    expect(xml).toContain('customRelationshipAttr="relationship-custom"');
    expect(xml).toContain('<property name="DimLegacyFlag" value="KeepDimension" />');
    expect(xml).toContain('<property name="LegacyMemberFlag" value="PreserveMember" />');
    expect(xml).toContain('<property name="LegacyRelationshipFlag" value="PreserveRelationship" />');
    expect(xml).toContain('<unsupportedDimensionNode code="D1">Hold</unsupportedDimensionNode>');
    expect(xml).toContain('<unsupportedMemberNode code="M1" />');
    expect(xml).toContain('<unsupportedRelationshipNode code="R1">Rel</unsupportedRelationshipNode>');
  });

  it("lets edited known values win while keeping unknown XML data", () => {
    const parsed = parseOneStreamXml(sampleXml, { projectName: "Edited Round Trip Project" });
    const editedMember = {
      ...parsed.members[0],
      description: "Edited revenue accounts",
      properties: {
        ...parsed.members[0].properties,
        "Account Type": "Expense"
      }
    };

    const xml = exportProjectXml({
      project: parsed.project,
      dimensions: parsed.dimensions,
      members: [editedMember],
      relationships: parsed.relationships
    });

    expect(xml).toContain('description="Edited revenue accounts"');
    expect(xml).toContain('<property name="AccountType" value="Expense" />');
    expect(xml).not.toContain('<property name="AccountType" value="Revenue" />');
    expect(xml).toContain('customMemberAttr="member-custom"');
    expect(xml).toContain('<property name="LegacyMemberFlag" value="PreserveMember" />');
  });
});
