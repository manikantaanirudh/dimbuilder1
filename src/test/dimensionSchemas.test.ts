import { describe, expect, it } from "vitest";
import { getDimensionSchema, getSchemaBySheetName, supportedDimensionTypes } from "../shared/dimensionSchemas";

describe("dimension schemas", () => {
  it("defines all supported workbook dimensions in navigation order", () => {
    expect(supportedDimensionTypes).toEqual([
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
    ]);
  });

  it("maps scenario member keys from the Entity column", () => {
    const schema = getDimensionSchema("Scenario");

    expect(schema.memberKeyField).toBe("Entity");
    expect(schema.relationshipFields.map((field) => field.name)).toEqual(["Parent", "Child"]);
    expect(schema.memberFields.map((field) => field.name)).not.toContain("Begin Members");
  });

  it("maps entity relationship ownership fields", () => {
    const schema = getDimensionSchema("Entity");

    expect(schema.relationshipFields.map((field) => field.name)).toContain("Percent Ownership");
    expect(schema.numericFields).toContain("Parent Sort Order");
  });

  it("detects the duplicate UD3 sheet names from the supplied workbook", () => {
    expect(getDimensionSchema("UD1").memberKeyField).toBe("Member");
    expect(getSchemaBySheetName("UD3 OUC")?.dimensionType).toBe("UD3");
    expect(getSchemaBySheetName("UD3 OUC (2)")?.dimensionType).toBe("UD3");
  });
});
