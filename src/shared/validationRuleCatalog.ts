import type { DimensionType, Severity, ValidationIssue } from "./types";

export type ValidationRuleClassification = "hard_error" | "advisory" | "informational";
export type ValidationRuleScope = "dimension" | "project" | "import" | "change_set";

export interface ValidationRuleEvidence {
  label: string;
  url?: string;
  version?: string;
  kind: "official" | "format" | "implementation" | "local_policy";
}

export interface ValidationRuleDefinition {
  code: string;
  label: string;
  description: string;
  category: "schema" | "member" | "relationship" | "hierarchy" | "property" | "project" | "xml" | "change_set";
  classification: ValidationRuleClassification;
  defaultSeverity: Exclude<Severity, "off">;
  allowedSeverities: Severity[];
  locked: boolean;
  blocksExport: boolean;
  scope: ValidationRuleScope;
  dimensionTypes?: DimensionType[];
  targetVersion: string;
  evidence: ValidationRuleEvidence[];
}

export interface EffectiveValidationRule extends ValidationRuleDefinition {
  effectiveSeverity: Severity;
  active: boolean;
  overridden: boolean;
  legacyOverride?: { severity: string; reason: "unknown_rule" | "locked_rule" | "illegal_severity" };
}

export const VALIDATION_RULE_CATALOG_VERSION = "1.0.0";
export const VALIDATION_RULE_TARGET_VERSION = "9.2.0.18004";

const officialDimensions = "https://documentation.onestream.com/9.2.0/Content/Design%20and%20Reference/Cube/Configurable%20Dimensions.html";
const parentDimension = "https://documentation.onestream.com/docs/Content/Design%20and%20Reference/Cube/Parent%20Dimension.html";
const metadataReports = "https://documentation.onestream.com/docs/Content/RPTA/Metadata%20Analysis%20Reports.html";

const hard = (input: Omit<ValidationRuleDefinition, "classification" | "defaultSeverity" | "allowedSeverities" | "locked" | "blocksExport" | "targetVersion"> & { defaultSeverity?: "error" }): ValidationRuleDefinition => ({
  ...input,
  classification: "hard_error",
  defaultSeverity: input.defaultSeverity ?? "error",
  allowedSeverities: ["error"],
  locked: true,
  blocksExport: true,
  targetVersion: VALIDATION_RULE_TARGET_VERSION
});

const advisory = (input: Omit<ValidationRuleDefinition, "classification" | "defaultSeverity" | "allowedSeverities" | "locked" | "blocksExport" | "targetVersion"> & { defaultSeverity?: "warning" | "info" }): ValidationRuleDefinition => ({
  ...input,
  classification: "advisory",
  defaultSeverity: input.defaultSeverity ?? "warning",
  allowedSeverities: ["warning", "info", "off"],
  locked: false,
  blocksExport: false,
  targetVersion: VALIDATION_RULE_TARGET_VERSION
});

const informational = (input: Omit<ValidationRuleDefinition, "classification" | "defaultSeverity" | "allowedSeverities" | "locked" | "blocksExport" | "targetVersion">): ValidationRuleDefinition => ({
  ...input,
  classification: "informational",
  defaultSeverity: "info",
  allowedSeverities: ["info", "off"],
  locked: false,
  blocksExport: false,
  targetVersion: VALIDATION_RULE_TARGET_VERSION
});

const evidence = {
  officialDimensions: { label: "OneStream 9.2 Configurable Dimensions", url: officialDimensions, version: "9.2", kind: "official" as const },
  parentDimension: { label: "OneStream Parent Dimension and alternate hierarchies", url: parentDimension, version: "current", kind: "official" as const },
  metadataReports: { label: "OneStream Metadata Analysis Reports", url: metadataReports, version: "current", kind: "official" as const },
  xml: { label: "XML and metadata serialization integrity", kind: "format" as const },
  dictionary: { label: "Repository OneStream 9.2 property dictionary", version: "9.2", kind: "implementation" as const },
  engine: { label: "Deterministic repository integrity check", kind: "implementation" as const }
};

export const VALIDATION_RULE_CATALOG: ValidationRuleDefinition[] = [
  hard({ code: "DIMENSION_TYPE_REQUIRED", label: "Dimension type required", description: "A dimension must declare its dimension type before it can be serialized.", category: "schema", scope: "dimension", evidence: [evidence.xml] }),
  hard({ code: "DIMENSION_NAME_REQUIRED", label: "Dimension name required", description: "A dimension must have a name before it can be serialized.", category: "schema", scope: "dimension", evidence: [evidence.xml] }),
  hard({ code: "MEMBER_KEY_REQUIRED", label: "Member key required", description: "Every member row must have a member key.", category: "schema", scope: "dimension", evidence: [evidence.xml] }),
  hard({ code: "DUPLICATE_MEMBER", label: "Duplicate member row", description: "The same member key occurs more than once in a dimension.", category: "member", scope: "dimension", evidence: [evidence.officialDimensions] }),
  hard({ code: "DUPLICATE_MEMBER_CASE_INSENSITIVE", label: "Case-insensitive duplicate member", description: "Member keys collide when compared case-insensitively.", category: "member", scope: "project", evidence: [evidence.officialDimensions] }),
  hard({ code: "DUPLICATE_MEMBER_ACROSS_DIMENSION_TYPE", label: "Duplicate member within dimension type", description: "A member key is defined in more than one dimension of the same dimension type.", category: "member", scope: "project", evidence: [evidence.officialDimensions] }),
  hard({ code: "ALIAS_DUPLICATES_MEMBER_NAME", label: "Alias duplicates member name", description: "An alias collides with a member name within the dimension type.", category: "member", scope: "project", evidence: [evidence.officialDimensions] }),
  hard({ code: "DUPLICATE_ALIAS", label: "Duplicate alias", description: "The same alias is assigned to more than one member within the dimension type.", category: "member", scope: "project", evidence: [evidence.officialDimensions] }),
  hard({ code: "MEMBER_NAME_TOO_LONG", label: "Member name exceeds 500 characters", description: "The member name exceeds OneStream's documented 500-character limit.", category: "member", scope: "dimension", evidence: [evidence.officialDimensions] }),
  hard({ code: "MEMBER_NAME_RESTRICTED_CHARACTER", label: "Restricted member-name character", description: "The member name contains a character restricted by OneStream documentation.", category: "member", scope: "dimension", evidence: [evidence.officialDimensions] }),
  hard({ code: "RESERVED_MEMBER_NAME", label: "Reserved member name", description: "A user-created member uses a reserved structural name.", category: "member", scope: "dimension", evidence: [evidence.officialDimensions] }),
  hard({ code: "INVALID_BOOLEAN", label: "Invalid boolean value", description: "A boolean property contains a value other than TRUE or FALSE.", category: "property", scope: "dimension", evidence: [evidence.dictionary, evidence.xml] }),
  hard({ code: "INVALID_NUMBER", label: "Invalid numeric value", description: "A numeric property contains a non-numeric value.", category: "property", scope: "dimension", evidence: [evidence.dictionary, evidence.xml] }),
  hard({ code: "FORMULA_ERROR_VALUE", label: "Spreadsheet formula error", description: "A source cell contains an Excel formula error value.", category: "xml", scope: "import", evidence: [evidence.xml] }),
  hard({ code: "XML_INVALID_CHARACTER", label: "XML-invalid character", description: "A value contains a control character that cannot be written to XML.", category: "xml", scope: "import", evidence: [evidence.xml] }),
  hard({ code: "INVALID_ENUM_VALUE", label: "Invalid property option", description: "A known OneStream property contains a value outside its allowed enumeration.", category: "property", scope: "dimension", evidence: [evidence.dictionary] }),
  hard({ code: "INVALID_PROPERTY_TYPE", label: "Invalid property type", description: "A known OneStream property contains a value of the wrong type.", category: "property", scope: "dimension", evidence: [evidence.dictionary] }),
  hard({ code: "RELATIONSHIP_PARENT_REQUIRED", label: "Relationship parent required", description: "A relationship row is missing its parent key.", category: "schema", scope: "dimension", evidence: [evidence.xml] }),
  hard({ code: "RELATIONSHIP_CHILD_REQUIRED", label: "Relationship child required", description: "A relationship row is missing its child key.", category: "schema", scope: "dimension", evidence: [evidence.xml] }),

  advisory({ code: "UNKNOWN_RELATIONSHIP_CHILD", label: "Unknown relationship child", description: "A relationship child cannot be resolved in the effective member set.", category: "relationship", scope: "dimension", evidence: [evidence.engine] }),
  advisory({ code: "UNKNOWN_RELATIONSHIP_PARENT", label: "Unknown relationship parent", description: "A relationship parent cannot be resolved in the effective member set.", category: "relationship", scope: "dimension", evidence: [evidence.engine] }),
  advisory({ code: "DUPLICATE_RELATIONSHIP", label: "Duplicate relationship", description: "The same parent-child relationship occurs more than once.", category: "relationship", scope: "dimension", evidence: [evidence.engine] }),
  advisory({ code: "CIRCULAR_HIERARCHY", label: "Circular hierarchy", description: "The relationship graph contains a cycle that requires consultant review.", category: "hierarchy", scope: "dimension", evidence: [evidence.engine] }),
  advisory({ code: "SELF_REFERENCING_RELATIONSHIP", label: "Self-referencing relationship", description: "A relationship uses the same member as parent and child.", category: "hierarchy", scope: "dimension", evidence: [evidence.engine] }),
  advisory({ code: "ORPHAN_MEMBER", label: "Orphan member", description: "A member is not assigned to a reachable hierarchy. OneStream exposes orphan members for review.", category: "hierarchy", scope: "dimension", evidence: [evidence.metadataReports] }),
  informational({ code: "RELATIONSHIPS_WITH_NO_LOCAL_MEMBERS", label: "Relationships without local members", description: "Relationships exist without local members, which can be valid for inherited dimensions.", category: "hierarchy", scope: "dimension", evidence: [evidence.parentDimension] }),
  advisory({ code: "MEMBER_NAME_ONLY_SPECIAL_CHARACTERS", label: "Member name has no letters or numbers", description: "The member key contains no alphanumeric characters and should be reviewed.", category: "member", scope: "dimension", evidence: [evidence.engine] }),
  advisory({ code: "RESERVED_MEMBER_NAME_CASE_MISMATCH", label: "Reserved name casing", description: "A reserved system name uses non-canonical casing.", category: "member", scope: "dimension", evidence: [evidence.officialDimensions] }),
  advisory({ code: "MEMBER_NAME_LEADING_TRAILING_WHITESPACE", label: "Member-name whitespace", description: "A member key has leading or trailing whitespace.", category: "member", scope: "dimension", evidence: [evidence.engine] }),
  advisory({ code: "SORT_ORDER_ZERO", label: "Zero sort order", description: "A member or relationship uses sort order zero and should be reviewed against the project convention.", category: "relationship", scope: "dimension", evidence: [evidence.engine] }),
  advisory({ code: "SORT_ORDER_DUPLICATE", label: "Duplicate sort order", description: "Sibling relationships use the same sort order and should be reviewed for deterministic presentation.", category: "relationship", scope: "dimension", evidence: [evidence.engine] }),
  informational({ code: "MEMBER_NAME_CONTAINS_SPACE", label: "Member name contains spaces", description: "Spaces are allowed by OneStream but require bracket notation in queries.", category: "member", scope: "dimension", evidence: [evidence.officialDimensions] }),
  informational({ code: "MEMBER_NAME_CONTAINS_PERIOD", label: "Member name contains a period", description: "Periods are allowed by OneStream but require bracket notation in queries.", category: "member", scope: "dimension", evidence: [evidence.officialDimensions] }),
  informational({ code: "MEMBER_NAME_QUERY_BRACKETS", label: "Member requires query brackets", description: "Use square brackets when querying a member containing a space or period.", category: "member", scope: "dimension", evidence: [evidence.officialDimensions] }),
  advisory({ code: "HIERARCHY_MAX_DEPTH_EXCEEDED", label: "Hierarchy depth threshold exceeded", description: "The configured consultant depth threshold was exceeded; this is a performance review, not a documented OneStream hard limit.", category: "hierarchy", scope: "dimension", evidence: [evidence.engine] }),
  advisory({ code: "SCENARIO_TYPE_MISSING", label: "Scenario type missing", description: "A Scenario member does not contain a Scenario Type value.", category: "property", scope: "dimension", dimensionTypes: ["Scenario"], evidence: [evidence.engine] }),
  advisory({ code: "CONSOLIDATION_METHOD_MISMATCH", label: "Consolidation settings need review", description: "Ownership and consolidation settings appear inconsistent and require consultant review.", category: "property", scope: "dimension", dimensionTypes: ["Entity"], evidence: [evidence.engine] }),
  advisory({ code: "MULTIPLE_PARENT_NOT_ALLOWED", label: "Multiple parents conflict with local policy", description: "A dimension configured as single-parent contains a member under multiple parents. Alternate hierarchies are supported by OneStream, so this is a local policy advisory.", category: "hierarchy", scope: "dimension", evidence: [evidence.parentDimension] }),
  informational({ code: "SHARED_MEMBER_DETECTED", label: "Shared member", description: "A member appears in more than one hierarchy. This is a supported alternate-hierarchy pattern.", category: "hierarchy", scope: "dimension", evidence: [evidence.parentDimension] }),
  advisory({ code: "PARENT_MEMBER_ALLOW_INPUT_WARNING", label: "Parent allows input", description: "A hierarchy parent has Allow Input enabled and should be reviewed against the design.", category: "property", scope: "dimension", evidence: [evidence.engine] }),
  advisory({ code: "ACCOUNT_TYPE_MISSING", label: "Account type missing", description: "An Account member has no Account Type value; confirm the intended consolidation behavior.", category: "property", scope: "dimension", dimensionTypes: ["Account"], evidence: [evidence.engine] }),
  advisory({ code: "ENTITY_CURRENCY_MISSING", label: "Entity currency missing", description: "An Entity member has no Currency value; confirm the intended translation behavior.", category: "property", scope: "dimension", dimensionTypes: ["Entity"], evidence: [evidence.engine] }),
  advisory({ code: "ENTITY_OWNERSHIP_VALUE_INVALID", label: "Entity ownership value out of range", description: "An ownership or consolidation percentage is outside 0-100 and requires review.", category: "property", scope: "dimension", dimensionTypes: ["Entity"], evidence: [evidence.engine] }),
  advisory({ code: "SECURITY_GROUP_REFERENCE_MISSING", label: "Security group reference missing", description: "A member references a security group not present in the configured project list.", category: "property", scope: "dimension", evidence: [evidence.engine] }),
  informational({ code: "RELATIONSHIP_WEIGHT_MISSING", label: "Aggregation weight defaults", description: "No aggregation weight is stored; the configured default will be used.", category: "relationship", scope: "dimension", evidence: [evidence.engine] }),
  advisory({ code: "DUPLICATE_VARYING_PROPERTY", label: "Duplicate varying property", description: "More than one varying value exists for the same target and context.", category: "property", scope: "dimension", evidence: [evidence.engine] }),
  advisory({ code: "VARYING_PROPERTY_DUPLICATE", label: "OneStream varying property duplicate", description: "A OneStream varying property context contains duplicate values.", category: "property", scope: "dimension", evidence: [evidence.engine] }),
  advisory({ code: "VARYING_PROPERTY_TARGET_NOT_FOUND", label: "Varying property target missing", description: "A varying property references a member or relationship that cannot be resolved.", category: "property", scope: "dimension", evidence: [evidence.engine] }),
  advisory({ code: "UNKNOWN_VARYING_PROPERTY", label: "Unknown varying property", description: "A varying property is not present in the known OneStream 9.2 dictionary.", category: "property", scope: "dimension", evidence: [evidence.dictionary] }),
  informational({ code: "NON_VARYING_PROPERTY_OVERRIDE", label: "Non-varying property override", description: "A varying context was supplied for a property that is not marked as varying.", category: "property", scope: "dimension", evidence: [evidence.dictionary] }),
  advisory({ code: "INVALID_VARYING_PROPERTY_VALUE", label: "Invalid varying property value", description: "A varying property value does not match its known type or enumeration.", category: "property", scope: "dimension", evidence: [evidence.dictionary] }),
  advisory({ code: "UNKNOWN_PROPERTY", label: "Unknown property", description: "A property is not present in the known OneStream 9.2 dictionary and requires review.", category: "property", scope: "dimension", evidence: [evidence.dictionary] }),
  advisory({ code: "DIMENSION_MISSING_FROM_PROJECT", label: "Expected dimension missing", description: "The project does not contain a configured expected dimension type.", category: "project", scope: "project", evidence: [evidence.engine] }),
  advisory({ code: "CROSS_DIMENSION_CURRENCY_INVALID", label: "Currency reference needs review", description: "An Entity currency is not present in the explicitly configured authoritative currency list.", category: "project", scope: "project", dimensionTypes: ["Entity"], evidence: [evidence.engine] }),
  advisory({ code: "RELATIONSHIP_OPERATION_UNSUPPORTED", label: "Unsupported relationship operation", description: "A change-set relationship operation is outside the supported operation vocabulary.", category: "change_set", scope: "change_set", evidence: [evidence.engine] }),
  advisory({ code: "COPY_CONFLICTS_WITH_SINGLE_PARENT_POLICY", label: "Copy conflicts with parent policy", description: "A copy operation may create a second parent where local policy disallows it.", category: "change_set", scope: "change_set", evidence: [evidence.engine] }),
  advisory({ code: "MOVE_WITHOUT_OLD_PARENT", label: "Move lacks old parent", description: "A move operation does not include enough old-parent context for safe review.", category: "change_set", scope: "change_set", evidence: [evidence.engine] }),
  advisory({ code: "BREAK_BUILD_HAS_NO_BASELINE", label: "Break operation lacks baseline", description: "A break operation was not derived from a stored baseline comparison.", category: "change_set", scope: "change_set", evidence: [evidence.engine] }),
  advisory({ code: "RELATIONSHIP_DELETE_CREATES_ORPHAN", label: "Relationship deletion may orphan member", description: "A relationship deletion may leave a member outside the hierarchy.", category: "change_set", scope: "change_set", evidence: [evidence.engine] }),
  informational({ code: "XML_UNKNOWN_DIMENSION_ATTRIBUTE", label: "Unknown dimension XML preserved", description: "An unmapped dimension XML attribute is preserved for round-trip export.", category: "xml", scope: "import", evidence: [evidence.xml] }),
  informational({ code: "XML_UNKNOWN_MEMBER_ATTRIBUTE", label: "Unknown member XML preserved", description: "An unmapped member XML attribute is preserved for round-trip export.", category: "xml", scope: "import", evidence: [evidence.xml] }),
  informational({ code: "XML_UNKNOWN_RELATIONSHIP_ATTRIBUTE", label: "Unknown relationship XML preserved", description: "An unmapped relationship XML attribute is preserved for round-trip export.", category: "xml", scope: "import", evidence: [evidence.xml] }),
  informational({ code: "XML_UNSUPPORTED_ELEMENT_PRESERVED", label: "Unsupported XML element preserved", description: "An unsupported XML element is preserved for round-trip export.", category: "xml", scope: "import", evidence: [evidence.xml] })
];

const ruleByCode = new Map(VALIDATION_RULE_CATALOG.map((rule) => [rule.code, rule]));

export function getValidationRule(code: string): ValidationRuleDefinition | undefined {
  return ruleByCode.get(code);
}

export function isRegisteredValidationRule(code: string): boolean {
  return ruleByCode.has(code);
}

export function getValidationRuleCatalog(): ValidationRuleDefinition[] {
  return VALIDATION_RULE_CATALOG.map((rule) => ({ ...rule, allowedSeverities: [...rule.allowedSeverities], evidence: rule.evidence.map((source) => ({ ...source })) }));
}

export function resolveValidationSeverity(code: string, baseSeverity: Severity, overrides?: Map<string, Severity>): Severity {
  const rule = getValidationRule(code);
  if (!rule) return baseSeverity;
  if (rule.locked) return "error";
  const override = overrides?.get(code);
  if (override && rule.allowedSeverities.includes(override)) return override;
  return rule.defaultSeverity === baseSeverity || rule.allowedSeverities.includes(baseSeverity) ? baseSeverity : rule.defaultSeverity;
}

export function canOverrideValidationRule(code: string, severity: Severity): boolean {
  const rule = getValidationRule(code);
  return Boolean(rule && !rule.locked && rule.allowedSeverities.includes(severity));
}

export function validationRuleSet(): Set<string> {
  return new Set(VALIDATION_RULE_CATALOG.map((rule) => rule.code));
}

export function isExportBlockingValidationIssue(issue: Pick<ValidationIssue, "code" | "severity">): boolean {
  return issue.severity === "error" && getValidationRule(issue.code)?.blocksExport === true;
}
