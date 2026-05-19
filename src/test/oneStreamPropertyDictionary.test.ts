import { describe, expect, it } from "vitest";
import {
  getPropertyDefinitionByName,
  getPropertyDefinitionsForDimension,
  getUnknownProperties,
  isKnownProperty,
  normalizePropertyName,
  toOneStreamXmlPropertyNameFromDictionary
} from "../shared/oneStreamPropertyDictionary";

describe("OneStream property dictionary", () => {
  it("returns common and dimension-specific member definitions", () => {
    const definitions = getPropertyDefinitionsForDimension("Account", "member");

    expect(definitions.map((definition) => definition.displayName)).toEqual(
      expect.arrayContaining(["Name", "Description", "Text8", "Account Type", "Allow Input"])
    );
  });

  it("normalizes aliases to canonical property definitions", () => {
    const accountType = getPropertyDefinitionByName("Account", "member", "Acct Type");

    expect(accountType?.displayName).toBe("Account Type");
    expect(normalizePropertyName("Account", "member", "Acct Type")).toBe("Account Type");
    expect(toOneStreamXmlPropertyNameFromDictionary("Account", "member", "Acct Type")).toBe("AccountType");
    expect(isKnownProperty("Account", "member", "Acct Type")).toBe(true);
  });

  it("separates known and unknown properties for a target level", () => {
    const definitions = getPropertyDefinitionsForDimension("Entity", "relationship");

    expect(getUnknownProperties({
      Parent: "Root",
      Child: "E100",
      "Percent Consol": "100",
      "Legacy Relationship Flag": "Y"
    }, definitions)).toEqual(["Legacy Relationship Flag"]);
  });
});
