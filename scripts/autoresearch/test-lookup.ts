import { getPropertyDefinitionByName } from "../../src/shared/oneStreamPropertyDictionary";

// Check if these properties are found by the dictionary
const testCases = [
  { dimType: "UD1", level: "member", name: "UD2Constraint" },
  { dimType: "UD1", level: "member", name: "UD2Default" },
  { dimType: "Account", level: "member", name: "EnableFlowAggregation" },
  { dimType: "Account", level: "member", name: "UseAltInputCurrencyInFlow" },
  { dimType: "Entity", level: "member", name: "AllowAdjustments" },
  { dimType: "Entity", level: "member", name: "SiblingConsolidationPass" },
  { dimType: "Entity", level: "member", name: "AutoTranslationCurrencies" },
  { dimType: "Flow", level: "member", name: "SourceMemberForAltInputCurrency" },
  { dimType: "Scenario", level: "member", name: "UseInputFreqDataInLowerFreqs" },
  { dimType: "Scenario", level: "member", name: "ForceConsolidateTranslateCalculateGroup" },
  { dimType: "Scenario", level: "member", name: "FxRateTypeForRevenueExpense" },
  { dimType: "Scenario", level: "member", name: "DataBindingType" },
] as const;

for (const tc of testCases) {
  const def = getPropertyDefinitionByName(tc.dimType as any, tc.level as any, tc.name);
  console.log(`${tc.dimType}/${tc.level}/${tc.name}: ${def ? `FOUND (key=${def.propertyKey}, xmlName=${def.xmlName})` : "NOT FOUND"}`);
}
