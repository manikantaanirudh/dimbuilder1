import ExcelJS from "exceljs";
import { getDimensionSchema } from "./dimensionSchemas";
import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord
} from "./types";

export async function exportWorkbook(
  filePath: string,
  dimensions: DimensionRecord[],
  members: DimensionMemberRecord[],
  relationships: DimensionRelationshipRecord[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OneStream XF Dimension Builder";
  workbook.created = new Date();

  for (const dimension of dimensions) {
    const schema = getDimensionSchema(dimension.dimensionType);
    const sheet = workbook.addWorksheet(safeSheetName(dimension.sheetName));

    sheet.getCell("A1").value = "Dimension Type:";
    sheet.getCell("B1").value = dimension.dimensionType;
    sheet.getCell("A2").value = "Dimension Name:";
    sheet.getCell("B2").value = dimension.dimensionName;
    sheet.getCell("A3").value = "Description";
    sheet.getCell("B3").value = dimension.description;
    sheet.getCell("A4").value = "Access Group";
    sheet.getCell("B4").value = dimension.accessGroup;
    sheet.getCell("A5").value = "Maintenance Group";
    sheet.getCell("B5").value = dimension.maintenanceGroup;
    sheet.getCell("A6").value = "Inherited Dimension";
    sheet.getCell("B6").value = dimension.inheritedDimension;

    schema.memberFields.forEach((field, index) => {
      sheet.getRow(8).getCell(index + 1).value = field.name;
    });

    const localMembers = members.filter((member) => member.dimensionId === dimension.id && member.memberKey);
    localMembers.forEach((member, memberIndex) => {
      const row = sheet.getRow(9 + memberIndex);
      schema.memberFields.forEach((field, fieldIndex) => {
        row.getCell(fieldIndex + 1).value = String(member.properties[field.name] ?? "");
      });
    });

    const relationshipHeaderRow = 10 + localMembers.length;
    schema.relationshipFields.forEach((field, index) => {
      sheet.getRow(relationshipHeaderRow).getCell(index + 1).value = field.name;
    });

    relationships
      .filter((relationship) => relationship.dimensionId === dimension.id)
      .forEach((relationship, relationshipIndex) => {
        const row = sheet.getRow(relationshipHeaderRow + 1 + relationshipIndex);
        const values = { ...relationship.properties, Parent: relationship.parentKey, Child: relationship.childKey };
        schema.relationshipFields.forEach((field, fieldIndex) => {
          row.getCell(fieldIndex + 1).value = String(values[field.name] ?? "");
        });
      });

    sheet.views = [{ state: "frozen", ySplit: 8 }];
  }

  await workbook.xlsx.writeFile(filePath);
}

function safeSheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Dimension";
}

