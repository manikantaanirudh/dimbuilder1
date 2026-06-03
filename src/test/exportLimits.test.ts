import { describe, expect, it } from "vitest";
import {
  assertExportWithinMemberLimit,
  ExportLimitError,
  formatExportLimitMessage
} from "../shared/exportLimits";

describe("assertExportWithinMemberLimit", () => {
  it("does not throw when memberCount is under the limit", () => {
    expect(() => assertExportWithinMemberLimit({ memberCount: 50, exportType: "xml", limit: 100 })).not.toThrow();
  });

  it("throws ExportLimitError with status 413 when memberCount exceeds limit", () => {
    try {
      assertExportWithinMemberLimit({ memberCount: 101, exportType: "xml", limit: 100 });
      expect.fail("expected ExportLimitError");
    } catch (error) {
      expect(error).toBeInstanceOf(ExportLimitError);
      const limitError = error as ExportLimitError;
      expect(limitError.status).toBe(413);
      expect(limitError.payload.memberCount).toBe(101);
      expect(limitError.payload.limit).toBe(100);
      expect(limitError.payload.exportType).toBe("xml");
      expect(limitError.payload.error).toBe(formatExportLimitMessage("xml", 101, 100));
      expect(limitError.payload.suggestion.length).toBeGreaterThan(0);
    }
  });

  it("does not throw when limit is 0 (unlimited)", () => {
    expect(() => assertExportWithinMemberLimit({ memberCount: 1_000_000, exportType: "xml", limit: 0 })).not.toThrow();
  });
});
