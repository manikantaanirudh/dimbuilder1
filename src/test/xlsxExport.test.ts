import ExcelJS from "exceljs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exportWorkbook } from "../shared/xlsxExport";
import type { DimensionRecord } from "../shared/types";

describe("xlsx export", () => {
  it("uses SR Onestream Dim Builder as the fallback workbook creator", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dimbuilder-xlsx-"));
    const filePath = join(directory, "metadata.xlsx");
    const now = new Date().toISOString();
    const dimension: DimensionRecord = {
      id: "dimension-1",
      projectId: "project-1",
      sheetName: "Account",
      dimensionType: "Account",
      dimensionName: "GLAccounts",
      description: "",
      accessGroup: "",
      maintenanceGroup: "",
      inheritedDimension: "",
      sortOrder: 1,
      metadata: {},
      createdAt: now,
      updatedAt: now
    };

    try {
      await exportWorkbook(filePath, [dimension], [], []);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      expect(workbook.creator).toBe("SR Onestream Dim Builder");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
