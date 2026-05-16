import ExcelJS from "exceljs";
import { nanoid } from "nanoid";
import {
  getFieldNames,
  getSchemaByDimensionTypeText,
  getSchemaBySheetName
} from "./dimensionSchemas";
import type {
  DimensionMemberRecord,
  DimensionRecord,
  DimensionRelationshipRecord,
  DimensionSchema,
  FieldDefinition,
  ParsedProject,
  ProjectRecord
} from "./types";
import {
  isBlankValue,
  isFormulaError,
  normalizeCellValue,
  normalizeHeader,
  parseOptionalNumber
} from "./text";

interface ParseOptions {
  projectName: string;
  createdBy: string;
}

interface HeaderInfo {
  column: number;
  fieldName: string;
}

export async function parseWorkbook(filePath: string, options: ParseOptions): Promise<ParsedProject> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const createdAt = new Date().toISOString();
  const project: ProjectRecord = {
    id: nanoid(),
    name: options.projectName,
    description: "",
    sourceFileName: filePath.split(/[\\/]/).pop() ?? filePath,
    createdBy: options.createdBy,
    createdAt,
    updatedAt: createdAt
  };

  const dimensions: DimensionRecord[] = [];
  const members: DimensionMemberRecord[] = [];
  const relationships: DimensionRelationshipRecord[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  let skippedBlankRows = 0;

  workbook.worksheets.forEach((sheet, sheetIndex) => {
    const dimensionTypeText = normalizeCellValue(sheet.getCell("B1").value);
    const schema = getSchemaBySheetName(sheet.name) ?? getSchemaByDimensionTypeText(dimensionTypeText);
    if (!schema) {
      warnings.push(`Skipped unsupported sheet '${sheet.name}'.`);
      return;
    }

    const dimension: DimensionRecord = {
      id: nanoid(),
      projectId: project.id,
      sheetName: sheet.name,
      dimensionType: schema.dimensionType,
      dimensionName: normalizeCellValue(sheet.getCell("B2").value),
      description: normalizeCellValue(sheet.getCell("B3").value),
      accessGroup: normalizeCellValue(sheet.getCell("B4").value),
      maintenanceGroup: normalizeCellValue(sheet.getCell("B5").value),
      inheritedDimension: normalizeCellValue(sheet.getCell("B6").value),
      sortOrder: sheetIndex + 1,
      metadata: {
        workbookDimensionType: dimensionTypeText
      },
      createdAt,
      updatedAt: createdAt
    };
    dimensions.push(dimension);

    const memberHeaderRow = findMemberHeaderRow(sheet, schema);
    if (!memberHeaderRow) {
      errors.push(`Sheet '${sheet.name}' has no member header row.`);
      return;
    }

    const relationshipHeaderRow = findRelationshipHeaderRow(sheet);
    const memberHeaders = readHeaders(sheet, memberHeaderRow, schema.memberFields);
    const memberEndRow = relationshipHeaderRow ? relationshipHeaderRow - 1 : sheet.rowCount;
    let memberRowOrder = 1;

    for (let rowNumber = memberHeaderRow + 1; rowNumber <= memberEndRow; rowNumber += 1) {
      const rowValues = readRow(sheet, rowNumber, memberHeaders);
      const memberKey = normalizeCellValue(rowValues[schema.memberKeyField]);
      const meaningful = hasMeaningfulValues(rowValues);

      if (!memberKey && !meaningful) {
        skippedBlankRows += 1;
        continue;
      }

      if (!memberKey && meaningful) {
        warnings.push(`Sheet '${sheet.name}' row ${rowNumber} has default values but no member key.`);
        skippedBlankRows += 1;
        continue;
      }

      members.push({
        id: nanoid(),
        dimensionId: dimension.id,
        memberKey,
        description: normalizeCellValue(rowValues.Description),
        properties: rowValues,
        rowOrder: memberRowOrder,
        sourceRowNumber: rowNumber,
        isActive: true,
        createdAt,
        updatedAt: createdAt
      });
      memberRowOrder += 1;
    }

    if (!relationshipHeaderRow) return;

    const relationshipHeaders = readHeaders(sheet, relationshipHeaderRow, schema.relationshipFields);
    let relationshipRowOrder = 1;

    for (let rowNumber = relationshipHeaderRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const rowValues = readRow(sheet, rowNumber, relationshipHeaders);
      const parentKey = normalizeCellValue(rowValues.Parent);
      const childKey = normalizeCellValue(rowValues.Child);
      const meaningful = hasMeaningfulValues(rowValues);

      if (!parentKey && !childKey && !meaningful) {
        skippedBlankRows += 1;
        continue;
      }

      if (!parentKey || !childKey) {
        warnings.push(`Sheet '${sheet.name}' relationship row ${rowNumber} is missing Parent or Child.`);
        skippedBlankRows += 1;
        continue;
      }

      relationships.push({
        id: nanoid(),
        dimensionId: dimension.id,
        parentKey,
        childKey,
        aggregationWeight: parseOptionalNumber(rowValues["Aggregation Weight"]),
        percentConsol: parseOptionalNumber(rowValues["Percent Consol"]),
        percentOwnership: parseOptionalNumber(rowValues["Percent Ownership"]),
        ownershipType: normalizeCellValue(rowValues["Ownership Type"]),
        properties: rowValues,
        rowOrder: relationshipRowOrder,
        sourceRowNumber: rowNumber,
        createdAt,
        updatedAt: createdAt
      });
      relationshipRowOrder += 1;
    }
  });

  return {
    project,
    dimensions,
    members,
    relationships,
    importSummary: {
      sheetsDetected: workbook.worksheets.length,
      dimensionsImported: dimensions.length,
      membersImported: members.length,
      relationshipsImported: relationships.length,
      skippedBlankRows,
      warnings,
      errors
    }
  };
}

function findMemberHeaderRow(sheet: ExcelJS.Worksheet, schema: DimensionSchema): number | null {
  const expected = new Set(getFieldNames(schema.memberFields).map(normalizeHeader));
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 30); rowNumber += 1) {
    const firstHeader = normalizeHeader(sheet.getRow(rowNumber).getCell(1).value);
    if (firstHeader === normalizeHeader(schema.memberKeyField)) return rowNumber;
    if (expected.has(firstHeader)) {
      const secondHeader = normalizeHeader(sheet.getRow(rowNumber).getCell(2).value);
      if (secondHeader === "Description") return rowNumber;
    }
  }
  return null;
}

function findRelationshipHeaderRow(sheet: ExcelJS.Worksheet): number | null {
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (normalizeHeader(row.getCell(1).value) === "Parent" && normalizeHeader(row.getCell(2).value) === "Child") {
      return rowNumber;
    }
  }
  return null;
}

function readHeaders(sheet: ExcelJS.Worksheet, rowNumber: number, fields: FieldDefinition[]): HeaderInfo[] {
  const headerToField = new Map<string, string>();
  for (const field of fields) {
    headerToField.set(normalizeHeader(field.name), field.name);
    for (const alias of field.aliases ?? []) headerToField.set(normalizeHeader(alias), field.name);
  }

  const headers: HeaderInfo[] = [];
  const row = sheet.getRow(rowNumber);
  for (let column = 1; column <= Math.max(sheet.columnCount, row.cellCount); column += 1) {
    const rawHeader = normalizeHeader(row.getCell(column).value);
    if (isGeneratedHeader(rawHeader)) continue;
    const fieldName = headerToField.get(rawHeader);
    if (fieldName) headers.push({ column, fieldName });
  }
  return headers;
}

function readRow(sheet: ExcelJS.Worksheet, rowNumber: number, headers: HeaderInfo[]): Record<string, string> {
  const row = sheet.getRow(rowNumber);
  const values: Record<string, string> = {};
  for (const header of headers) {
    const value = normalizeCellValue(row.getCell(header.column).value);
    values[header.fieldName] = isFormulaError(value) ? "" : value;
  }
  return values;
}

function isGeneratedHeader(header: string): boolean {
  return !header || header.startsWith("=") || header === "Begin Members" || header === "Begin Relationships";
}

function hasMeaningfulValues(values: Record<string, string>): boolean {
  return Object.entries(values).some(([field, value]) => {
    if (field === "Description") return !isBlankValue(value);
    if (isBlankValue(value) || isFormulaError(value)) return false;
    return !["(Not Used)", "(Use Default)", "True", "False", "Conditional"].includes(value);
  });
}

