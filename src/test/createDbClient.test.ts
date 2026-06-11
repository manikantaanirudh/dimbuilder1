import { describe, expect, it } from "vitest";
import { createDbClient } from "../server/db/createDbClient";

describe("createDbClient", () => {
  it("uses sqlite when databaseUrl is absent", async () => {
    const client = await createDbClient({ databaseFile: ":memory:" });
    expect(client.dialect).toBe("sqlite");
    await client.close();
  });

  it.skipIf(!process.env.PG_TEST_URL)("uses postgres when databaseUrl is set", async () => {
    const client = await createDbClient({
      databaseUrl: process.env.PG_TEST_URL!,
      poolMax: 2
    });
    expect(client.dialect).toBe("postgres");
    await client.close();
  });
});
