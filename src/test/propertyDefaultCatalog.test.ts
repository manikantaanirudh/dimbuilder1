import { describe, expect, it } from "vitest";
import { createDatabase } from "../server/db/database";
import { createRepositories } from "../server/db/repositories";

describe("property default catalog", () => {
  it("seeds global defaults in the database for all projects", async () => {
    const db = createDatabase(":memory:");
    const repos = createRepositories(db);

    const accountDefaults = await repos.propertyDefaults.listCatalog("Account");
    expect(accountDefaults.length).toBeGreaterThan(0);

    const accountType = accountDefaults.find((row) => row.propertyName === "Account Type");
    expect(accountType?.defaultValue).toBe("Expense");
    expect(accountType?.xmlName).toBe("AccountType");

    const effective = await repos.propertyDefaults.getEffectiveDefaultsForExport("any-project-id");
    expect(effective.some((entry) => entry.propertyName === "Account Type" && entry.defaultValue === "Expense")).toBe(true);

    const entityDefaults = await repos.propertyDefaults.listCatalog("Entity");
    expect(entityDefaults.length).toBeGreaterThan(0);

    db.close();
  });

  it("persists catalog edits globally", async () => {
    const db = createDatabase(":memory:");
    const repos = createRepositories(db);
    const accountType = (await repos.propertyDefaults.listCatalog("Account")).find((row) => row.propertyName === "Account Type");
    expect(accountType).toBeDefined();

    await repos.propertyDefaults.updateCatalog(accountType!.id, { defaultValue: "Asset" });
    const updated = (await repos.propertyDefaults.listCatalog("Account")).find((row) => row.id === accountType!.id);
    expect(updated?.defaultValue).toBe("Asset");
    db.close();
  });
});
