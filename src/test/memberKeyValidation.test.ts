import { describe, expect, it } from "vitest";
import { validateMemberKey } from "../shared/memberKeyValidation";
import { defaultAppConfig } from "../shared/appConfigDefaults";

const profile = defaultAppConfig.validation.oneStreamProfile!;

describe("memberKeyValidation", () => {
  it("rejects empty keys", () => {
    expect(validateMemberKey("  ", profile)).toMatch(/required/i);
  });

  it("rejects keys with only special characters", () => {
    expect(validateMemberKey("?", profile)).toMatch(/letter or number/i);
    expect(validateMemberKey("&&&", profile)).toMatch(/letter or number/i);
  });

  it("accepts numeric and alphanumeric keys", () => {
    expect(validateMemberKey("619290", profile)).toBeNull();
    expect(validateMemberKey("A100", profile)).toBeNull();
    expect(validateMemberKey("A_100", profile)).toBeNull();
    expect(validateMemberKey("Gross Income", profile)).toBeNull();
    expect(validateMemberKey("Quebec.City", profile)).toBeNull();
  });

  it("rejects restricted characters from the OneStream profile", () => {
    expect(validateMemberKey("Bad?Name", profile)).toMatch(/restricted/i);
    expect(validateMemberKey("Bad/Name", profile)).toMatch(/restricted/i);
  });

  it("rejects reserved words", () => {
    expect(validateMemberKey("Root", profile)).toMatch(/reserved/i);
  });
});
