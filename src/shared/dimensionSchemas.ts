import type { DimensionSchema, DimensionType, FieldDefinition } from "./types";

const text = (name: string, required = false, aliases: string[] = []): FieldDefinition => ({
  name,
  kind: "text",
  required,
  aliases
});
const bool = (name: string, aliases: string[] = []): FieldDefinition => ({ name, kind: "boolean", aliases });
const num = (name: string, aliases: string[] = []): FieldDefinition => ({ name, kind: "number", aliases });
const formula = (name: string): FieldDefinition => ({ name, kind: "formula" });

const udMemberFields = [
  text("Member", true),
  text("Description"),
  text("Formula Type"),
  bool("Allow Input"),
  text("Is Consolidated"),
  text("Alternate Currency For Display"),
  bool("Is Attribute Member"),
  text("Source Member For Data"),
  text("Expression Type"),
  text("Related Dimension Type 1"),
  text("Related Property 1"),
  text("Comparison Text 1"),
  text("Comparison Operator 1"),
  text("Related Dimension Type 2"),
  text("Related Property 2"),
  text("Comparison Text 2"),
  text("Comparison Operator 2"),
  text("Workflow Channel"),
  bool("In Use"),
  formula("Formula"),
  formula("Formula For Calc Drill Down"),
  text("Text1"),
  text("Text2"),
  text("Text3"),
  text("Text4"),
  text("Text5"),
  text("Text6"),
  text("Text7"),
  text("Text8"),
  text("Display Group")
];

const weightedRelationshipFields = [text("Parent", true), text("Child", true), num("Aggregation Weight")];

function createUdSchema(dimensionType: DimensionType, sheetNames: string[] = [dimensionType]): DimensionSchema {
  return {
    dimensionType,
    sheetNames,
    memberKeyField: "Member",
    memberFields: udMemberFields,
    relationshipFields: weightedRelationshipFields,
    booleanFields: ["Allow Input", "Is Attribute Member", "In Use"],
    numericFields: ["Aggregation Weight"],
    requiredFields: ["Dimension Type", "Dimension Name", "Member", "Parent", "Child"],
    duplicateSeverity: "warning"
  };
}

export const dimensionSchemas: Record<DimensionType, DimensionSchema> = {
  Scenario: {
    dimensionType: "Scenario",
    sheetNames: ["Scenarios"],
    memberKeyField: "Entity",
    memberFields: [
      text("Entity", true),
      text("Description"),
      text("Scenario Type"),
      text("Read Data Group"),
      text("Read and Write Data Group"),
      text("Calculate from Grids Group"),
      text("Manage Data Group"),
      bool("Use In Workflow"),
      text("Workflow Tracking Frequency"),
      text("Workflow Time"),
      text("Workflow Start Time"),
      text("Workflow End Time"),
      num("# of No Input Periods"),
      text("Input Frequency"),
      text("Default View"),
      bool("Retain Next Period Data Using DefaultView"),
      text("Input View For Adj"),
      bool("Use Input View For Adj In Calcs"),
      text("No Data Zero View For Adj"),
      text("No Data Zero View For Non Adj"),
      text("Consolidation View"),
      formula("Formula"),
      formula("Formula For Calc Drill Down"),
      bool("Clear Calculated Data During Calc"),
      bool("Use Cube FX Settings"),
      text("FX Rate Type Revenue Expense"),
      text("FX Rule Type Revenue Expense"),
      text("FX Rate Type Asset Liability"),
      text("FX Rule Type Asset Liability"),
      text("FX Rates Constant Year"),
      text("Text1"),
      text("Text2"),
      text("Text3"),
      text("Text4"),
      text("Text5"),
      text("Text6"),
      text("Text7"),
      text("Text8")
    ],
    relationshipFields: [text("Parent", true), text("Child", true)],
    booleanFields: [
      "Use In Workflow",
      "Retain Next Period Data Using DefaultView",
      "Use Input View For Adj In Calcs",
      "Clear Calculated Data During Calc",
      "Use Cube FX Settings"
    ],
    numericFields: ["# of No Input Periods"],
    requiredFields: ["Dimension Type", "Dimension Name", "Entity", "Parent", "Child"],
    duplicateSeverity: "warning"
  },
  Entity: {
    dimensionType: "Entity",
    sheetNames: ["Entities"],
    memberKeyField: "Entity",
    memberFields: [
      text("Entity", true),
      text("Description"),
      text("Currency"),
      bool("Is IC"),
      bool("IsConsolidated"),
      text("Flow Constraint"),
      text("IC Constraint"),
      text("IC Member Filter"),
      text("UD1 Constraint"),
      text("UD2 Constraint"),
      text("UD3 Constraint"),
      text("UD4 Constraint"),
      text("UD5 Constraint"),
      text("UD6 Constraint"),
      text("UD7 Constraint"),
      text("UD8 Constraint"),
      text("UD1 Default"),
      text("UD2 Default"),
      text("UD3 Default"),
      text("UD4 Default"),
      text("UD5 Default"),
      text("UD6 Default"),
      text("UD7 Default"),
      text("UD8 Default"),
      bool("In Use"),
      bool("Allow Adj"),
      bool("Allow Adj From Child"),
      text("Display Group"),
      num("Sibling Consol Pass"),
      num("Sibling Repeat Calc Pass"),
      text("Auto Translate Currencies"),
      text("Text1"),
      text("Text2"),
      text("Text3"),
      text("Text4"),
      text("Text5"),
      text("Text6"),
      text("Text7"),
      text("Text8"),
      text("Read Group"),
      text("Read Group2"),
      text("Read Write Group"),
      text("Read Write Group2"),
      bool("Use Cube Data Access Security"),
      text("Cube Data Cell Access Categories"),
      text("Cube Conditional Input Categories"),
      text("Cube Data Mgmt Access Categories")
    ],
    relationshipFields: [
      text("Parent", true),
      text("Child", true),
      num("Parent Sort Order"),
      num("Percent Consol"),
      num("Percent Ownership"),
      text("Ownership Type"),
      text("Text1"),
      text("Text2"),
      text("Text3"),
      text("Text4"),
      text("Text5"),
      text("Text6"),
      text("Text7"),
      text("Text8")
    ],
    booleanFields: ["Is IC", "IsConsolidated", "In Use", "Allow Adj", "Allow Adj From Child", "Use Cube Data Access Security"],
    numericFields: ["Sibling Consol Pass", "Sibling Repeat Calc Pass", "Parent Sort Order", "Percent Consol", "Percent Ownership"],
    requiredFields: ["Dimension Type", "Dimension Name", "Entity", "Parent", "Child"],
    duplicateSeverity: "warning"
  },
  Account: {
    dimensionType: "Account",
    sheetNames: ["Accounts"],
    memberKeyField: "Account",
    memberFields: [
      text("Account", true),
      text("Description"),
      text("Account Type"),
      text("Formula Type"),
      bool("Allow Input"),
      text("Is Consolidated"),
      text("Is IC"),
      bool("Use Alt Input Cur In Flow"),
      text("Plug Account"),
      text("Input View For Adj"),
      text("No Data Zero View For Adj"),
      text("No Data Zero View For Non-Adj"),
      text("Used On Entity Dim"),
      text("Used On Cons Dim"),
      text("Flow Aggregation"),
      text("Origin Aggregation"),
      text("IC Aggregation"),
      text("UD1 Aggregation"),
      text("UD2 Aggregation"),
      text("UD3 Aggregation"),
      text("UD4 Aggregation"),
      text("UD5 Aggregation"),
      text("UD6 Aggregation"),
      text("UD7 Aggregation"),
      text("UD8 Aggregation"),
      text("Flow Constraint"),
      text("IC Constraint"),
      text("IC Member Filter"),
      text("UD1 Constraint"),
      text("UD2 Constraint"),
      text("UD3 Constraint"),
      text("UD4 Constraint"),
      text("UD5 Constraint"),
      text("UD6 Constraint"),
      text("UD7 Constraint"),
      text("UD8 Constraint"),
      text("Workflow Channel"),
      bool("InUse"),
      formula("Formula"),
      formula("Formula For Calc Drill Down"),
      text("Adjustment Type"),
      text("Text1"),
      text("Text2"),
      text("Text3"),
      text("Text4"),
      text("Text5"),
      text("Text6"),
      text("Text7"),
      text("Text8"),
      text("Display Group")
    ],
    relationshipFields: weightedRelationshipFields,
    booleanFields: ["Allow Input", "Use Alt Input Cur In Flow", "InUse"],
    numericFields: ["Aggregation Weight"],
    requiredFields: ["Dimension Type", "Dimension Name", "Account", "Parent", "Child"],
    duplicateSeverity: "warning"
  },
  Flow: {
    dimensionType: "Flow",
    sheetNames: ["Flow"],
    memberKeyField: "Flow Member",
    memberFields: [
      text("Flow Member", true),
      text("Description"),
      text("Formula Type"),
      bool("Allow Input"),
      text("Is Consolidated"),
      bool("Switch Sign"),
      bool("Switch Type"),
      text("Flow Processing Type"),
      text("Alternate Input Currency"),
      text("Source Member For Alternate Input Currency", false, ["Source Member For Alternanate Input Currency"]),
      bool("In Use"),
      formula("Formula"),
      formula("Formula For Calc Drill Down"),
      text("Text1"),
      text("Text2"),
      text("Text3"),
      text("Text4"),
      text("Text5"),
      text("Text6"),
      text("Text7"),
      text("Text8"),
      text("Display Group")
    ],
    relationshipFields: weightedRelationshipFields,
    booleanFields: ["Allow Input", "Switch Sign", "Switch Type", "In Use"],
    numericFields: ["Aggregation Weight"],
    requiredFields: ["Dimension Type", "Dimension Name", "Flow Member", "Parent", "Child"],
    duplicateSeverity: "warning"
  },
  UD1: createUdSchema("UD1"),
  UD2: createUdSchema("UD2"),
  UD3: createUdSchema("UD3", ["UD3", "UD3 OUC", "UD3 OUC (2)"]),
  UD4: createUdSchema("UD4"),
  UD5: createUdSchema("UD5"),
  UD6: createUdSchema("UD6"),
  UD7: createUdSchema("UD7"),
  UD8: createUdSchema("UD8")
};

export const supportedDimensionTypes: DimensionType[] = [
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
];

export function getDimensionSchema(type: DimensionType): DimensionSchema {
  return dimensionSchemas[type];
}

export function getSchemaBySheetName(
  sheetName: string,
  sheetAliases: Partial<Record<DimensionType, string[]>> = {}
): DimensionSchema | undefined {
  return supportedDimensionTypes
    .map(getDimensionSchema)
    .find((schema) => [...schema.sheetNames, ...(sheetAliases[schema.dimensionType] ?? [])].includes(sheetName));
}

export function getSchemaByDimensionTypeText(typeText: string): DimensionSchema | undefined {
  return dimensionSchemas[typeText as DimensionType];
}

export function getFieldNames(fields: FieldDefinition[]): string[] {
  return fields.flatMap((field) => [field.name, ...(field.aliases ?? [])]);
}
