import { describe, expect, it } from "vitest";
import { buildMetadataCsvCommitPlan, previewMetadataCsvImport } from "../shared/metadataCsvImport";

const ENABLED = ["Account", "Entity"] as const;

function previewCsv(csv: string, overrides: Partial<Parameters<typeof previewMetadataCsvImport>[0]> = {}) {
  return previewMetadataCsvImport({
    csvContent: csv,
    enabledDimensionTypes: [...ENABLED],
    mode: "newProject",
    formDefaults: { dimensionType: "Account", dimensionName: "Accounts" },
    ...overrides
  });
}

describe("metadataCsvImport", () => {
  it("parses minimal parent,member CSV with form dimension defaults", () => {
    const preview = previewCsv("parent,member\n,Revenue\nRoot,ProductRevenue");
    expect(preview.ok).toBe(true);
    expect(preview.counts.membersToCreate).toBe(2);
    expect(preview.counts.relationshipsToCreate).toBe(1);
  });

  it("parses multi-dimension CSV with dimensionType and dimensionName columns", () => {
    const preview = previewCsv([
      "dimensionType,dimensionName,parent,member",
      "Account,Accounts,Root,Revenue",
      "Entity,Entities,,Corp"
    ].join("\n"));
    expect(preview.ok).toBe(true);
    expect(preview.counts.dimensionsToCreate).toBe(2);
    expect(preview.counts.membersToCreate).toBe(2);
  });

  it("handles quoted commas and ignores blank lines", () => {
    const preview = previewCsv('parent,member\n"Root, All",Revenue\n\n,Other');
    expect(preview.ok).toBe(true);
    expect(preview.counts.rowCount).toBe(2);
    expect(preview.counts.membersToCreate).toBe(2);
  });

  it("maps property.*, alias, description, and sortOrder", () => {
    const { plan } = buildMetadataCsvCommitPlan({
      csvContent: "parent,member,description,alias,sortOrder,property.Text1\nRoot,Revenue,Revenue accounts,Revenue,10,P&L",
      enabledDimensionTypes: ["Account"],
      mode: "newProject",
      formDefaults: { dimensionType: "Account", dimensionName: "Accounts" }
    }, "sample.csv");
    expect(plan).not.toBeNull();
    const member = plan!.membersToCreate[0];
    expect(member.description).toBe("Revenue accounts");
    expect(member.properties.Alias).toBe("Revenue");
    expect(member.rowOrder).toBe(10);
    expect(member.properties.Text1).toBe("P&L");
  });

  it("warns on duplicate member rows and keeps the last row", () => {
    const preview = previewCsv("parent,member,description\n,Revenue,First\n,Revenue,Second");
    expect(preview.ok).toBe(true);
    expect(preview.warnings.some((warning) => /duplicate member/i.test(warning))).toBe(true);
    const { plan } = buildMetadataCsvCommitPlan({
      csvContent: "parent,member,description\n,Revenue,First\n,Revenue,Second",
      enabledDimensionTypes: ["Account"],
      mode: "newProject",
      formDefaults: { dimensionType: "Account", dimensionName: "Accounts" }
    }, "dup.csv");
    expect(plan?.membersToCreate[0].description).toBe("Second");
  });

  it("blocks missing member column", () => {
    const preview = previewCsv("parent,description\nRoot,Revenue");
    expect(preview.ok).toBe(false);
    expect(preview.errors.some((error) => /member column/i.test(error))).toBe(true);
  });

  it("blocks unsupported dimension type", () => {
    const preview = previewCsv("dimensionType,dimensionName,parent,member\nUD9,Bad,,Member");
    expect(preview.ok).toBe(false);
    expect(preview.errors.some((error) => /unsupported dimension type/i.test(error))).toBe(true);
  });

  it("blocks missing dimension metadata when defaults are absent", () => {
    const preview = previewMetadataCsvImport({
      csvContent: "parent,member\n,Revenue",
      enabledDimensionTypes: ["Account"],
      mode: "newProject",
      formDefaults: {}
    });
    expect(preview.ok).toBe(false);
    expect(preview.errors.some((error) => /dimension type and dimension name/i.test(error))).toBe(true);
  });

  it("skips self-reference rows with a warning so other rows can still import", () => {
    const preview = previewCsv("parent,member\nRevenue,Revenue\nRoot,Product");
    expect(preview.ok).toBe(true);
    expect(preview.warnings.some((warning) => /skipped because parent equals member/i.test(warning))).toBe(true);
    expect(preview.counts.membersToCreate).toBe(1);
  });

  it("parses semicolon Opex-style exports with hierarchy level columns", () => {
    const sample = [
      ";NK_GLAccountCode;GLAccountName;L01_OPEXGroup;L02_OPEXGroup;L03_OPEXGroup",
      "1;619290;External Warehouse Fixed Cost;Operating Expenses Pro Forma;Gross Spending;Facilities"
    ].join("\n");
    const preview = previewCsv(sample);
    expect(preview.ok).toBe(true);
    expect(preview.counts.membersToCreate).toBe(4);
    expect(preview.counts.relationshipsToCreate).toBe(3);
  });

  it("does not import non-dictionary Opex columns as member properties", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../OpexAccount_Export_3Jun.txt");
    const csvContent = readFileSync(fixturePath, "utf8");
    const { plan } = buildMetadataCsvCommitPlan({
      csvContent,
      enabledDimensionTypes: ["Account"],
      mode: "newProject",
      formDefaults: { dimensionType: "Account", dimensionName: "GLAccounts", defaultAccountType: "Expense" }
    }, "opex.txt");
    const leaf = plan?.membersToCreate.find((member) => member.memberKey === "619290");
    expect(leaf?.properties.ActiveFlag).toBeUndefined();
    expect(leaf?.properties["Account Type"]).toBe("Expense");
  });

  it("loads OpexAccount export fixture with hierarchy expansion", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../OpexAccount_Export_3Jun.txt");
    const csvContent = readFileSync(fixturePath, "utf8");
    const preview = previewCsv(csvContent, {
      formDefaults: { dimensionType: "Account", dimensionName: "GLAccounts", projectName: "Opex Import" }
    });
    expect(preview.ok).toBe(true);
    expect(preview.counts.rowCount).toBeGreaterThan(200);
    expect(preview.counts.membersToCreate).toBeGreaterThan(preview.counts.rowCount);
    expect(preview.counts.relationshipsToCreate).toBeGreaterThan(preview.counts.rowCount);
  });

  it("counts member updates for existing projects", () => {
    const preview = previewMetadataCsvImport({
      csvContent: "parent,member,description\n,Revenue,Updated description",
      enabledDimensionTypes: ["Account"],
      mode: "existingProject",
      projectId: "proj-1",
      formDefaults: { dimensionType: "Account", dimensionName: "Accounts" },
      existingDimensions: [{
        id: "dim-1",
        projectId: "proj-1",
        sheetName: "Accounts",
        dimensionType: "Account",
        dimensionName: "Accounts",
        description: "",
        accessGroup: "",
        maintenanceGroup: "",
        inheritedDimension: "",
        sortOrder: 1,
        metadata: {},
        createdAt: "",
        updatedAt: ""
      }],
      existingMembers: [{
        id: "mem-1",
        dimensionId: "dim-1",
        memberKey: "Revenue",
        description: "Old",
        properties: { Member: "Revenue", Description: "Old" },
        rowOrder: 1,
        sourceRowNumber: 1,
        isActive: true,
        createdAt: "",
        updatedAt: ""
      }],
      existingRelationships: []
    });
    expect(preview.ok).toBe(true);
    expect(preview.counts.membersToUpdate).toBe(1);
    expect(preview.counts.membersToCreate).toBe(0);
  });
});
