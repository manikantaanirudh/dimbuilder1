import { readFileSync } from "node:fs";
import { validateDimension } from "../../src/shared/validationEngine";

const data = JSON.parse(readFileSync("scripts/autoresearch/benchmark-cache.json", "utf8"));
const { project, dimensions, members, relationships } = data;
const config = {
  duplicateMemberSeverity: "warning" as const,
  duplicateRelationshipSeverity: "warning" as const,
  unknownRelationshipMemberSeverity: "warning" as const,
  missingRequiredFieldSeverity: "error" as const,
  circularHierarchySeverity: "error" as const,
  relationshipsWithNoLocalMembersSeverity: "warning" as const,
  oneStreamProfile: {
    enabled: true,
    memberNameMaxLength: 250,
    warnOnMemberNameSpaces: true,
    warnOnMemberNamePeriods: true,
    reservedWords: ["Root", "None"],
    restrictedCharacters: ["<", ">", "\"", "'", "&", "|", "[", "]"],
    duplicateAliasSeverity: "warning" as const,
    invalidSortOrderSeverity: "warning" as const,
    sharedMemberSeverity: "info" as const,
    parentInputWarningSeverity: "warning" as const,
    unknownPropertySeverity: "warning" as const,
    invalidEnumSeverity: "error" as const,
    invalidPropertyTypeSeverity: "error" as const,
  }
};

for (const dim of dimensions) {
  const dimMembers = members.filter((m: any) => m.dimensionId === dim.id);
  const dimRels = relationships.filter((r: any) => r.dimensionId === dim.id);
  const issues = validateDimension({ project, dimension: dim, members: dimMembers, relationships: dimRels, severities: config });
  const xmlIssues = issues.filter((i: any) => i.code === "XML_UNSUPPORTED_ELEMENT_PRESERVED");
  if (xmlIssues.length > 0) {
    console.log(JSON.stringify({ dimName: dim.name, dimType: dim.dimensionType, issues: xmlIssues }, null, 2));
  }
}
