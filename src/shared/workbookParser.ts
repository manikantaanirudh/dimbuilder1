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
  MetadataDimensionReference,
  MetadataReference,
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
  metadataReference?: MetadataReference;
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
  const dimensionsByLogicalKey = new Map<string, DimensionRecord>();
  const memberRowOrders = new Map<string, number>();
  const relationshipRowOrders = new Map<string, number>();
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

    const workbookDimensionName = normalizeCellValue(sheet.getCell("B2").value);
    const metadataReference = findMetadataReference(options.metadataReference, schema.dimensionType, workbookDimensionName);
    const dimensionName = metadataReference?.name ?? workbookDimensionName;
    if (metadataReference && metadataReference.name !== workbookDimensionName) {
      warnings.push(`Aligned sheet '${sheet.name}' dimension '${schema.dimensionType} / ${workbookDimensionName}' to metadata reference '${metadataReference.type} / ${metadataReference.name}'.`);
    }
    const logicalKey = getDimensionLogicalKey(schema.dimensionType, dimensionName, sheet.name);
    let dimension = dimensionsByLogicalKey.get(logicalKey);
    if (dimension) {
      dimension.sheetName = getPreferredSheetName(dimension.sheetName, sheet.name);
      dimension.metadata = {
        ...dimension.metadata,
        sourceSheetNames: appendSourceSheetName(dimension.metadata.sourceSheetNames, sheet.name)
      };
      warnings.push(`Merged duplicate dimension sheet '${sheet.name}' into '${dimension.dimensionType} / ${dimension.dimensionName}'.`);
    } else {
      dimension = {
        id: nanoid(),
        projectId: project.id,
        sheetName: sheet.name,
        dimensionType: schema.dimensionType,
        dimensionName,
        description: normalizeReferenceValue(metadataReference?.description, normalizeCellValue(sheet.getCell("B3").value)),
        accessGroup: normalizeReferenceValue(metadataReference?.accessGroup, normalizeCellValue(sheet.getCell("B4").value)),
        maintenanceGroup: normalizeReferenceValue(metadataReference?.maintenanceGroup, normalizeCellValue(sheet.getCell("B5").value)),
        inheritedDimension: normalizeReferenceValue(metadataReference?.inheritedDim, normalizeCellValue(sheet.getCell("B6").value)),
        sortOrder: sheetIndex + 1,
        metadata: {
          workbookDimensionType: dimensionTypeText,
          workbookDimensionName,
          oneStreamVersion: options.metadataReference?.version,
          dimMemberSourceType: metadataReference?.dimMemberSourceType ?? "Standard",
          dimMemberSourcePath: metadataReference?.dimMemberSourcePath ?? "",
          dimMemberSourceNVPairs: metadataReference?.dimMemberSourceNVPairs ?? "",
          sourceSheetNames: [sheet.name]
        },
        createdAt,
        updatedAt: createdAt
      };
      dimensionsByLogicalKey.set(logicalKey, dimension);
      dimensions.push(dimension);
    }

    const memberHeaderRow = findMemberHeaderRow(sheet, schema);
    if (!memberHeaderRow) {
      errors.push(`Sheet '${sheet.name}' has no member header row.`);
      return;
    }

    const relationshipHeaderRow = findRelationshipHeaderRow(sheet);
    const memberHeaders = readHeaders(sheet, memberHeaderRow, schema.memberFields);
    const memberEndRow = relationshipHeaderRow ? relationshipHeaderRow - 1 : sheet.rowCount;
    let memberRowOrder = memberRowOrders.get(dimension.id) ?? 1;

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
    memberRowOrders.set(dimension.id, memberRowOrder);

    if (!relationshipHeaderRow) return;

    const relationshipHeaders = readHeaders(sheet, relationshipHeaderRow, schema.relationshipFields);
    let relationshipRowOrder = relationshipRowOrders.get(dimension.id) ?? 1;

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
    relationshipRowOrders.set(dimension.id, relationshipRowOrder);
  });

  appendMetadataOnlyDimensions({
    projectId: project.id,
    metadataReference: options.metadataReference,
    dimensions,
    dimensionsByLogicalKey,
    warnings,
    createdAt
  });
  applyCanonicalSortOrder(dimensions);

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

function appendMetadataOnlyDimensions({
  projectId,
  metadataReference,
  dimensions,
  dimensionsByLogicalKey,
  warnings,
  createdAt
}: {
  projectId: string;
  metadataReference: MetadataReference | undefined;
  dimensions: DimensionRecord[];
  dimensionsByLogicalKey: Map<string, DimensionRecord>;
  warnings: string[];
  createdAt: string;
}): void {
  if (!metadataReference) return;
  const importedTypes = new Set(dimensions.map((dimension) => dimension.dimensionType));
  for (const reference of metadataReference.dimensions) {
    if (importedTypes.has(reference.type) || !isApplicationMetadataDimension(reference)) continue;
    const logicalKey = getDimensionLogicalKey(reference.type, reference.name, reference.name);
    if (dimensionsByLogicalKey.has(logicalKey)) continue;

    const dimension: DimensionRecord = {
      id: nanoid(),
      projectId,
      sheetName: `${reference.type} - ${reference.name}`,
      dimensionType: reference.type,
      dimensionName: reference.name,
      description: normalizeCellValue(reference.description),
      accessGroup: normalizeCellValue(reference.accessGroup),
      maintenanceGroup: normalizeCellValue(reference.maintenanceGroup),
      inheritedDimension: normalizeReferenceValue(reference.inheritedDim, ""),
      sortOrder: dimensions.length + 1,
      metadata: {
        metadataOnly: true,
        oneStreamVersion: metadataReference.version,
        metadataMemberCount: reference.memberCount ?? 0,
        metadataRelationshipCount: reference.relationshipCount ?? 0,
        dimMemberSourceType: reference.dimMemberSourceType ?? "Standard",
        dimMemberSourcePath: reference.dimMemberSourcePath ?? "",
        dimMemberSourceNVPairs: reference.dimMemberSourceNVPairs ?? "",
        sourceSheetNames: []
      },
      createdAt,
      updatedAt: createdAt
    };
    dimensionsByLogicalKey.set(logicalKey, dimension);
    dimensions.push(dimension);
    warnings.push(`Added metadata-only dimension '${reference.type} / ${reference.name}' because no workbook sheet exists for dimension type '${reference.type}'.`);
  }
}

function isApplicationMetadataDimension(reference: MetadataDimensionReference): boolean {
  return Boolean(reference.name) && !/^FVA_/i.test(reference.name) && !/^Root/i.test(reference.name);
}

function applyCanonicalSortOrder(dimensions: DimensionRecord[]): void {
  dimensions.sort((left, right) => {
    const leftRank = getDimensionTypeRank(left.dimensionType);
    const rightRank = getDimensionTypeRank(right.dimensionType);
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.dimensionName.localeCompare(right.dimensionName);
  });

  const countersByType = new Map<string, number>();
  for (const dimension of dimensions) {
    const count = (countersByType.get(dimension.dimensionType) ?? 0) + 1;
    countersByType.set(dimension.dimensionType, count);
    dimension.sortOrder = getDimensionTypeRank(dimension.dimensionType) * 100 + count;
  }
}

function getDimensionTypeRank(dimensionType: string): number {
  const order = ["Scenario", "Entity", "Account", "Flow", "UD1", "UD2", "UD3", "UD4", "UD5", "UD6", "UD7", "UD8"];
  const index = order.indexOf(dimensionType);
  return index === -1 ? order.length + 1 : index + 1;
}

function getDimensionLogicalKey(dimensionType: string, dimensionName: string, sheetName: string): string {
  return `${dimensionType}\u0000${dimensionName || sheetName}`;
}

function getPreferredSheetName(current: string, candidate: string): string {
  return removeExcelDuplicateSuffix(current) === candidate ? candidate : current;
}

function removeExcelDuplicateSuffix(value: string): string {
  return value.replace(/\s+\(\d+\)$/, "");
}

function appendSourceSheetName(value: unknown, sheetName: string): string[] {
  const sourceSheetNames = Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  return sourceSheetNames.includes(sheetName) ? sourceSheetNames : [...sourceSheetNames, sheetName];
}

function normalizeReferenceValue(value: string | null | undefined, fallback: string): string {
  return value === null || value === undefined ? fallback : normalizeCellValue(value);
}

function findMetadataReference(
  metadataReference: MetadataReference | undefined,
  dimensionType: string,
  dimensionName: string
): MetadataDimensionReference | undefined {
  if (!metadataReference) return undefined;
  const candidates = metadataReference.dimensions.filter((dimension) => dimension.type === dimensionType);
  if (candidates.length === 0) return undefined;

  const exact = candidates.find((dimension) => dimension.name.toLowerCase() === dimensionName.toLowerCase());
  if (exact) return exact;

  const applicationCandidates = candidates.filter((dimension) => !/^FVA_/i.test(dimension.name) && !/^Root/i.test(dimension.name));
  const populatedCandidates = applicationCandidates.filter((dimension) => (dimension.memberCount ?? 0) > 0 || (dimension.relationshipCount ?? 0) > 0);
  const bestCandidates = populatedCandidates.length > 0 ? populatedCandidates : applicationCandidates;
  if (bestCandidates.length === 0) return undefined;

  return [...bestCandidates].sort((left, right) => {
    const rightSize = (right.memberCount ?? 0) + (right.relationshipCount ?? 0);
    const leftSize = (left.memberCount ?? 0) + (left.relationshipCount ?? 0);
    return rightSize - leftSize;
  })[0];
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
