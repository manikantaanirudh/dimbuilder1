import { dimensionSchemas, supportedDimensionTypes } from "./dimensionSchemas";
import type { DimensionType, FieldDefinition, FieldKind } from "./types";

export type OneStreamPropertyTargetLevel = "dimension" | "member" | "relationship";
export type OneStreamPropertyValueType =
  | "string"
  | "boolean"
  | "number"
  | "decimal"
  | "enum"
  | "memberRef"
  | "formula"
  | "securityGroup"
  | "currency"
  | "timeMember";
export type OneStreamPropertyExportFormat = "xml" | "xlsx" | "csv" | "json" | "acm";

/**
 * Describes how a property's varying context is emitted in OneStream metadata XML.
 * - "scenarioTime": emits scenarioType="" time="" revertToDefaultScenarioType="false"
 * - "scenario": emits scenarioType="" only
 * - "cubeType": emits cubeType="" only
 * - "none": no varying context attributes (simple name/value)
 */
export type OneStreamVaryingContextType = "scenarioTime" | "scenario" | "cubeType" | "none";

export interface OneStreamPropertyDefinition {
  propertyKey: string;
  displayName: string;
  xmlName: string;
  aliases: string[];
  targetLevel: OneStreamPropertyTargetLevel;
  dimensionTypes: DimensionType[] | "all";
  valueType: OneStreamPropertyValueType;
  enumValues?: string[];
  required?: boolean;
  defaultValue?: string | number | boolean;
  supportsVarying?: boolean;
  varyingContextType?: OneStreamVaryingContextType;
  appliesToExportFormats?: OneStreamPropertyExportFormat[];
  helpText?: string;
  oneStreamVersionIntroduced?: string;
  oneStreamVersionDeprecated?: string;
}

export interface GroupedOneStreamPropertyDictionary {
  version: string;
  dimensions: Record<DimensionType, Record<OneStreamPropertyTargetLevel, OneStreamPropertyDefinition[]>>;
}

type DefinitionInput = Omit<OneStreamPropertyDefinition, "aliases" | "appliesToExportFormats"> & {
  aliases?: string[];
  appliesToExportFormats?: OneStreamPropertyExportFormat[];
};

export const ONE_STREAM_PROPERTY_DICTIONARY_VERSION = "9.2.0";
export const supportedOneStreamPropertyDictionaryVersions = [ONE_STREAM_PROPERTY_DICTIONARY_VERSION] as const;

const DEFAULT_EXPORT_FORMATS: OneStreamPropertyExportFormat[] = ["xml", "xlsx", "csv", "json", "acm"];
const udDimensionTypes: DimensionType[] = ["UD1", "UD2", "UD3", "UD4", "UD5", "UD6", "UD7", "UD8"];
const memberKeyAliases = ["Name", "Member", "Member Key", "Entity", "Account", "Flow Member", ...udDimensionTypes];

const define = (input: DefinitionInput): OneStreamPropertyDefinition => ({
  ...input,
  aliases: input.aliases ?? [],
  appliesToExportFormats: input.appliesToExportFormats ?? DEFAULT_EXPORT_FORMATS
});

const textDefinitions = Array.from({ length: 8 }, (_value, index) => {
  const number = index + 1;
  return define({
    propertyKey: `text${number}`,
    displayName: `Text${number}`,
    xmlName: `Text${number}`,
    aliases: [`Text ${number}`],
    targetLevel: "member",
    dimensionTypes: "all",
    valueType: "string",
    supportsVarying: true,
    varyingContextType: "scenarioTime",
    helpText: `Free-form OneStream text property ${number}.`
  });
});

const relationshipTextDefinitions = Array.from({ length: 8 }, (_value, index) => {
  const number = index + 1;
  return define({
    propertyKey: `relationshipText${number}`,
    displayName: `Text${number}`,
    xmlName: `Text${number}`,
    aliases: [`Text ${number}`],
    targetLevel: "relationship",
    dimensionTypes: "all",
    valueType: "string",
    supportsVarying: true,
    varyingContextType: "scenarioTime",
    helpText: `Free-form OneStream relationship text property ${number}.`
  });
});

const seededDefinitions: OneStreamPropertyDefinition[] = [
  define({
    propertyKey: "dimensionType",
    displayName: "Dimension Type",
    xmlName: "type",
    targetLevel: "dimension",
    dimensionTypes: "all",
    valueType: "enum",
    enumValues: supportedDimensionTypes,
    required: true,
    helpText: "OneStream dimension type."
  }),
  define({
    propertyKey: "dimensionName",
    displayName: "Dimension Name",
    xmlName: "name",
    aliases: ["Name"],
    targetLevel: "dimension",
    dimensionTypes: "all",
    valueType: "string",
    required: true,
    helpText: "OneStream dimension name."
  }),
  define({
    propertyKey: "dimensionDescription",
    displayName: "Description",
    xmlName: "description",
    targetLevel: "dimension",
    dimensionTypes: "all",
    valueType: "string",
    helpText: "Optional dimension description."
  }),
  define({
    propertyKey: "accessGroup",
    displayName: "Access Group",
    xmlName: "accessGroup",
    targetLevel: "dimension",
    dimensionTypes: "all",
    valueType: "securityGroup",
    helpText: "Security group allowed to access the dimension."
  }),
  define({
    propertyKey: "maintenanceGroup",
    displayName: "Maintenance Group",
    xmlName: "maintenanceGroup",
    targetLevel: "dimension",
    dimensionTypes: "all",
    valueType: "securityGroup",
    helpText: "Security group allowed to maintain the dimension."
  }),
  define({
    propertyKey: "inheritedDimension",
    displayName: "Inherited Dimension",
    xmlName: "inheritedDim",
    aliases: ["Inherited Dim"],
    targetLevel: "dimension",
    dimensionTypes: "all",
    valueType: "string",
    helpText: "Optional source dimension inherited by this dimension."
  }),
  define({
    propertyKey: "memberName",
    displayName: "Name",
    xmlName: "name",
    aliases: memberKeyAliases,
    targetLevel: "member",
    dimensionTypes: "all",
    valueType: "memberRef",
    required: true,
    helpText: "Member key used as the OneStream member name."
  }),
  define({
    propertyKey: "alias",
    displayName: "Alias",
    xmlName: "alias",
    targetLevel: "member",
    dimensionTypes: "all",
    valueType: "string",
    helpText: "Optional OneStream member alias."
  }),
  define({
    propertyKey: "description",
    displayName: "Description",
    xmlName: "description",
    targetLevel: "member",
    dimensionTypes: "all",
    valueType: "string",
    helpText: "Member description."
  }),
  define({
    propertyKey: "displayGroup",
    displayName: "Display Group",
    xmlName: "displayMemberGroup",
    aliases: ["Display Member Group"],
    targetLevel: "member",
    dimensionTypes: "all",
    valueType: "securityGroup",
    helpText: "Security group used for display access."
  }),
  define({
    propertyKey: "readDataGroup",
    displayName: "Read Data Group",
    xmlName: "readDataGroup",
    aliases: ["Read Group"],
    targetLevel: "member",
    dimensionTypes: "all",
    valueType: "securityGroup",
    helpText: "Security group used for read data access."
  }),
  define({
    propertyKey: "readSecurityGroup",
    displayName: "Read Security Group",
    xmlName: "readSecurityGroup",
    aliases: ["Read and Write Data Group", "Read Write Group", "readWriteDataGroup"],
    targetLevel: "member",
    dimensionTypes: "all",
    valueType: "securityGroup",
    helpText: "Security group used for read/write access."
  }),
  ...textDefinitions,
  define({
    propertyKey: "relationshipParent",
    displayName: "Parent",
    xmlName: "parent",
    targetLevel: "relationship",
    dimensionTypes: "all",
    valueType: "memberRef",
    required: true,
    helpText: "Parent member in the hierarchy relationship."
  }),
  define({
    propertyKey: "relationshipChild",
    displayName: "Child",
    xmlName: "child",
    targetLevel: "relationship",
    dimensionTypes: "all",
    valueType: "memberRef",
    required: true,
    helpText: "Child member in the hierarchy relationship."
  }),
  define({
    propertyKey: "aggregationWeight",
    displayName: "Aggregation Weight",
    xmlName: "AggregationWeight",
    aliases: ["Weight"],
    targetLevel: "relationship",
    dimensionTypes: "all",
    valueType: "decimal",
    defaultValue: 1,
    helpText: "Numeric hierarchy aggregation weight."
  }),
  define({
    propertyKey: "percentConsol",
    displayName: "Percent Consol",
    xmlName: "PercentConsolidation",
    aliases: ["Percent Consolidation"],
    targetLevel: "relationship",
    dimensionTypes: ["Entity"],
    valueType: "decimal",
    defaultValue: 100,
    supportsVarying: true,
    varyingContextType: "scenarioTime",
    helpText: "Entity relationship consolidation percentage."
  }),
  define({
    propertyKey: "percentOwnership",
    displayName: "Percent Ownership",
    xmlName: "PercentOwnership",
    aliases: ["Ownership Percent"],
    targetLevel: "relationship",
    dimensionTypes: ["Entity"],
    valueType: "decimal",
    defaultValue: 100,
    supportsVarying: true,
    varyingContextType: "scenarioTime",
    helpText: "Entity relationship ownership percentage."
  }),
  define({
    propertyKey: "ownershipType",
    displayName: "Ownership Type",
    xmlName: "OwnershipType",
    targetLevel: "relationship",
    dimensionTypes: ["Entity"],
    valueType: "enum",
    enumValues: ["FullConsolidation", "Full Consolidation", "PercentConsolidation", "Percent Consolidation", "NoConsolidation", "No Consolidation"],
    defaultValue: "FullConsolidation",
    supportsVarying: true,
    varyingContextType: "scenarioTime",
    helpText: "Entity relationship ownership method."
  }),
  ...relationshipTextDefinitions,
  define({
    propertyKey: "accountType",
    displayName: "Account Type",
    xmlName: "AccountType",
    aliases: ["Acct Type", "AccountCategory"],
    targetLevel: "member",
    dimensionTypes: ["Account"],
    valueType: "enum",
    enumValues: ["Asset", "Liability", "Revenue", "Expense", "Balance", "BalanceRecurring", "Flow", "NonFinancial", "Statistical", "DynamicCalc", "Group"],
    helpText: "Categorizes the account for OneStream consolidation and reporting behavior."
  }),
  define({
    propertyKey: "formulaType",
    displayName: "Formula Type",
    xmlName: "FormulaType",
    targetLevel: "member",
    dimensionTypes: ["Account", "Flow", ...udDimensionTypes],
    valueType: "string",
    helpText: "Formula calculation mode for the member."
  }),
  define({
    propertyKey: "allowInput",
    displayName: "Allow Input",
    xmlName: "AllowInput",
    targetLevel: "member",
    dimensionTypes: ["Entity", "Account", "Flow", ...udDimensionTypes],
    valueType: "boolean",
    defaultValue: true,
    helpText: "Controls whether data can be entered against the member."
  }),
  define({
    propertyKey: "isConsolidated",
    displayName: "Is Consolidated",
    xmlName: "IsConsolidated",
    aliases: ["IsConsolidated"],
    targetLevel: "member",
    dimensionTypes: ["Account", "Entity", "Flow", ...udDimensionTypes],
    valueType: "string",
    helpText: "Consolidation behavior for this member."
  }),
  define({
    propertyKey: "currency",
    displayName: "Currency",
    xmlName: "Currency",
    targetLevel: "member",
    dimensionTypes: ["Entity"],
    valueType: "currency",
    helpText: "Default currency for the entity member."
  }),
  define({
    propertyKey: "useCubeFxSettings",
    displayName: "Use Cube FX Settings",
    xmlName: "UseCubeFxSettings",
    targetLevel: "member",
    dimensionTypes: ["Entity", "Scenario"],
    valueType: "boolean",
    helpText: "Uses cube-level foreign exchange settings."
  }),
  define({
    propertyKey: "readDataGroup2",
    displayName: "Read Data Group 2",
    xmlName: "readDataGroup2",
    targetLevel: "member",
    dimensionTypes: ["Entity"],
    valueType: "securityGroup",
    helpText: "Secondary security group used for read data access."
  }),
  define({
    propertyKey: "readWriteDataGroup2",
    displayName: "Read Write Data Group 2",
    xmlName: "readWriteDataGroup2",
    targetLevel: "member",
    dimensionTypes: ["Entity"],
    valueType: "securityGroup",
    helpText: "Secondary security group used for read/write data access."
  }),
  define({
    propertyKey: "dataCellAccessCategories",
    displayName: "Data Cell Access Categories",
    xmlName: "dataCellAccessCategories",
    targetLevel: "member",
    dimensionTypes: ["Entity"],
    valueType: "string",
    helpText: "Comma-separated data cell access category assignments for the entity."
  }),
  define({
    propertyKey: "conditionalInputCategories",
    displayName: "Conditional Input Categories",
    xmlName: "conditionalInputCategories",
    targetLevel: "member",
    dimensionTypes: ["Entity"],
    valueType: "string",
    helpText: "Comma-separated conditional input category assignments for the entity."
  }),
  define({
    propertyKey: "dataMgmtAccessCategories",
    displayName: "Data Mgmt Access Categories",
    xmlName: "dataMgmtAccessCategories",
    targetLevel: "member",
    dimensionTypes: ["Entity"],
    valueType: "string",
    helpText: "Comma-separated data management access category assignments for the entity."
  }),
  define({
    propertyKey: "flowType",
    displayName: "Flow Type",
    xmlName: "FlowProcessingType",
    aliases: ["Flow Processing Type"],
    targetLevel: "member",
    dimensionTypes: ["Flow"],
    valueType: "string",
    helpText: "Flow processing behavior for the member."
  }),
  define({
    propertyKey: "switchSign",
    displayName: "Switch Sign",
    xmlName: "SwitchSign",
    targetLevel: "member",
    dimensionTypes: ["Flow"],
    valueType: "boolean",
    helpText: "Controls whether the flow switches sign."
  }),
  define({
    propertyKey: "switchType",
    displayName: "Switch Type",
    xmlName: "SwitchType",
    targetLevel: "member",
    dimensionTypes: ["Flow"],
    valueType: "boolean",
    helpText: "Controls whether the flow switches type."
  }),
  define({
    propertyKey: "scenarioType",
    displayName: "Scenario Type",
    xmlName: "ScenarioType",
    targetLevel: "member",
    dimensionTypes: ["Scenario"],
    valueType: "string",
    helpText: "Scenario classification."
  }),
  define({
    propertyKey: "workflowTrackingFrequency",
    displayName: "Workflow Tracking Frequency",
    xmlName: "WorkflowTrackingFrequency",
    targetLevel: "member",
    dimensionTypes: ["Scenario"],
    valueType: "string",
    helpText: "Workflow tracking frequency for the scenario."
  }),
  define({
    propertyKey: "isAttributeMember",
    displayName: "Is Attribute Member",
    xmlName: "AttributeMemberIsAttribute",
    targetLevel: "member",
    dimensionTypes: udDimensionTypes,
    valueType: "boolean",
    helpText: "Marks a UD member as an attribute member."
  }),
  define({
    propertyKey: "sourceMemberForData",
    displayName: "Source Member For Data",
    xmlName: "AttributeMemberSourceMember",
    targetLevel: "member",
    dimensionTypes: udDimensionTypes,
    valueType: "memberRef",
    helpText: "Source member used by an attribute member."
  }),
  define({
    propertyKey: "expressionType",
    displayName: "Expression Type",
    xmlName: "AttributeMemberExpressionType",
    targetLevel: "member",
    dimensionTypes: udDimensionTypes,
    valueType: "string",
    helpText: "Attribute member expression type."
  }),
  ...[1, 2].flatMap((number) => [
    define({
      propertyKey: `relatedDimensionType${number}`,
      displayName: `Related Dimension Type ${number}`,
      xmlName: `AttributeMemberRelatedDimType${number}`,
      targetLevel: "member",
      dimensionTypes: udDimensionTypes,
      valueType: "enum",
      enumValues: supportedDimensionTypes,
      helpText: `Related dimension type ${number} for an attribute-style UD member.`
    }),
    define({
      propertyKey: `relatedProperty${number}`,
      displayName: `Related Property ${number}`,
      xmlName: `AttributeMemberPropType${number}`,
      targetLevel: "member",
      dimensionTypes: udDimensionTypes,
      valueType: "string",
      helpText: `Related property ${number} for an attribute-style UD member.`
    }),
    define({
      propertyKey: `comparisonText${number}`,
      displayName: `Comparison Text ${number}`,
      xmlName: `AttributeMemberComparisonText${number}`,
      targetLevel: "member",
      dimensionTypes: udDimensionTypes,
      valueType: "string",
      helpText: `Comparison text ${number} for an attribute-style UD member.`
    }),
    define({
      propertyKey: `comparisonOperator${number}`,
      displayName: `Comparison Operator ${number}`,
      xmlName: `AttributeMemberOperatorType${number}`,
      targetLevel: "member",
      dimensionTypes: udDimensionTypes,
      valueType: "string",
      helpText: `Comparison operator ${number} for an attribute-style UD member.`
    })
  ])
];

/**
 * Known OneStream varying context types by xmlName.
 * Derived from real OneStream 9.2.0 metadata XML extracts.
 */
const KNOWN_VARYING_CONTEXT_BY_XML_NAME: Record<string, OneStreamVaryingContextType> = {
  // scenarioTime: emit scenarioType="" time="" revertToDefaultScenarioType="false"
  Formula: "scenarioTime",
  FormulaForCalcDrillDown: "scenarioTime",
  InUse: "scenarioTime",
  AllowAdjustments: "scenarioTime",
  AllowAdjustmentsFromChildren: "scenarioTime",
  PercentConsolidation: "scenarioTime",
  PercentOwnership: "scenarioTime",
  OwnershipType: "scenarioTime",
  // scenario: emit scenarioType="" only
  WorkflowChannel: "scenario",
  SiblingConsolidationPass: "scenario",
  SiblingRepeatCalcPass: "scenario",
  AutoTranslationCurrencies: "scenario",
  // cubeType: emit cubeType="" only
  FlowConstraint: "cubeType",
  ICConstraint: "cubeType",
  ICMemberFilter: "cubeType",
  UD1Constraint: "cubeType",
  UD2Constraint: "cubeType",
  UD3Constraint: "cubeType",
  UD4Constraint: "cubeType",
  UD5Constraint: "cubeType",
  UD6Constraint: "cubeType",
  UD7Constraint: "cubeType",
  UD8Constraint: "cubeType",
  UD1Default: "cubeType",
  UD2Default: "cubeType",
  UD3Default: "cubeType",
  UD4Default: "cubeType",
  UD5Default: "cubeType",
  UD6Default: "cubeType",
  UD7Default: "cubeType",
  UD8Default: "cubeType"
};

function applyKnownVaryingContextTypes(definitions: OneStreamPropertyDefinition[]): void {
  for (const definition of definitions) {
    if (definition.varyingContextType) continue;
    const contextType = KNOWN_VARYING_CONTEXT_BY_XML_NAME[definition.xmlName];
    if (contextType) {
      definition.varyingContextType = contextType;
      if (!definition.supportsVarying) definition.supportsVarying = true;
    }
  }
}

/**
 * Returns the varying context type for a property, or "none" if it has no varying context.
 */
export function getVaryingContextType(
  dimensionType: DimensionType,
  targetLevel: OneStreamPropertyTargetLevel,
  fieldName: string
): OneStreamVaryingContextType {
  const definition = getPropertyDefinitionByName(dimensionType, targetLevel, fieldName);
  return definition?.varyingContextType ?? "none";
}

export const oneStreamPropertyDefinitions = buildDictionaryDefinitions();

export function getPropertyDefinitionsForDimension(
  dimensionType: DimensionType,
  targetLevel: OneStreamPropertyTargetLevel
): OneStreamPropertyDefinition[] {
  return oneStreamPropertyDefinitions
    .filter((definition) => definition.targetLevel === targetLevel && definitionAppliesToDimension(definition, dimensionType))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function getPropertyDefinitionByName(
  dimensionType: DimensionType,
  targetLevel: OneStreamPropertyTargetLevel,
  fieldName: string
): OneStreamPropertyDefinition | undefined {
  const normalized = normalizePropertyLookupName(fieldName);
  return getPropertyDefinitionsForDimension(dimensionType, targetLevel)
    .find((definition) => getDefinitionLookupNames(definition).has(normalized));
}

export function normalizePropertyName(
  dimensionType: DimensionType,
  targetLevel: OneStreamPropertyTargetLevel,
  fieldName: string
): string {
  return getPropertyDefinitionByName(dimensionType, targetLevel, fieldName)?.displayName ?? fieldName;
}

export function toOneStreamXmlPropertyNameFromDictionary(
  dimensionType: DimensionType,
  targetLevel: OneStreamPropertyTargetLevel,
  fieldName: string
): string | undefined {
  return getPropertyDefinitionByName(dimensionType, targetLevel, fieldName)?.xmlName;
}

export function isKnownProperty(
  dimensionType: DimensionType,
  targetLevel: OneStreamPropertyTargetLevel,
  fieldName: string
): boolean {
  return Boolean(getPropertyDefinitionByName(dimensionType, targetLevel, fieldName));
}

export function getUnknownProperties(
  record: Record<string, unknown>,
  dictionary: OneStreamPropertyDefinition[]
): string[] {
  const known = new Set(dictionary.flatMap((definition) => [...getDefinitionLookupNames(definition)]));
  return Object.keys(record).filter((fieldName) => !known.has(normalizePropertyLookupName(fieldName)));
}

export function getGroupedOneStreamPropertyDictionary(
  version = ONE_STREAM_PROPERTY_DICTIONARY_VERSION
): GroupedOneStreamPropertyDictionary {
  if (!isSupportedOneStreamPropertyDictionaryVersion(version)) {
    throw new Error(`Unsupported OneStream property dictionary version '${version}'.`);
  }

  return {
    version: ONE_STREAM_PROPERTY_DICTIONARY_VERSION,
    dimensions: Object.fromEntries(
      supportedDimensionTypes.map((dimensionType) => [
        dimensionType,
        {
          dimension: getPropertyDefinitionsForDimension(dimensionType, "dimension"),
          member: getPropertyDefinitionsForDimension(dimensionType, "member"),
          relationship: getPropertyDefinitionsForDimension(dimensionType, "relationship")
        }
      ])
    ) as GroupedOneStreamPropertyDictionary["dimensions"]
  };
}

export function isSupportedOneStreamPropertyDictionaryVersion(version: string): boolean {
  return supportedOneStreamPropertyDictionaryVersions.includes(version as typeof supportedOneStreamPropertyDictionaryVersions[number]);
}

export function normalizePropertyLookupName(fieldName: string): string {
  return fieldName.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildDictionaryDefinitions(): OneStreamPropertyDefinition[] {
  const definitions = [...seededDefinitions];

  for (const dimensionType of supportedDimensionTypes) {
    const schema = dimensionSchemas[dimensionType];
    for (const field of schema.memberFields) {
      addSchemaBackedDefinition(definitions, dimensionType, "member", field);
    }
    for (const field of schema.relationshipFields) {
      addSchemaBackedDefinition(definitions, dimensionType, "relationship", field);
    }
  }

  applyKnownVaryingContextTypes(definitions);
  return definitions;
}

function addSchemaBackedDefinition(
  definitions: OneStreamPropertyDefinition[],
  dimensionType: DimensionType,
  targetLevel: OneStreamPropertyTargetLevel,
  field: FieldDefinition
): void {
  if (definitions.some((definition) => definition.targetLevel === targetLevel && definitionAppliesToDimension(definition, dimensionType) && getDefinitionLookupNames(definition).has(normalizePropertyLookupName(field.name)))) {
    return;
  }

  definitions.push(define({
    propertyKey: `${dimensionType.toLowerCase()}${targetLevel}${field.name.replace(/[^A-Za-z0-9]+/g, "")}`,
    displayName: field.name,
    xmlName: toDefaultXmlName(field.name),
    aliases: field.aliases,
    targetLevel,
    dimensionTypes: [dimensionType],
    valueType: valueTypeFromFieldKind(field.kind),
    required: field.required,
    helpText: `${dimensionType} ${targetLevel} field from the configured application schema.`
  }));
}

function definitionAppliesToDimension(definition: OneStreamPropertyDefinition, dimensionType: DimensionType): boolean {
  return definition.dimensionTypes === "all" || definition.dimensionTypes.includes(dimensionType);
}

function getDefinitionLookupNames(definition: OneStreamPropertyDefinition): Set<string> {
  return new Set([
    definition.propertyKey,
    definition.displayName,
    definition.xmlName,
    ...definition.aliases
  ].map(normalizePropertyLookupName));
}

function valueTypeFromFieldKind(kind: FieldKind): OneStreamPropertyValueType {
  if (kind === "boolean") return "boolean";
  if (kind === "number") return "decimal";
  if (kind === "formula") return "formula";
  return "string";
}

function toDefaultXmlName(fieldName: string): string {
  const cleaned = fieldName
    .replace(/#/g, "Number")
    .replace(/&/g, "And")
    .replace(/[^A-Za-z0-9]+(.)/g, (_match, character: string) => character.toUpperCase())
    .replace(/[^A-Za-z0-9]/g, "");
  if (!cleaned) return "value";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
