import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDatabase } from "../server/db/database";
import { defaultAppConfig } from "../shared/appConfigDefaults";

describe("api", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;

  beforeEach(async () => {
    await startServer();
  });

  afterEach(async () => {
    await closeServer();
  });

  async function startServer(config = defaultAppConfig) {
    const app = createApp(createDatabase(":memory:"), config);
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind to a port");
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeServer = () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  it("reports health and lists projects", async () => {
    const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
    const projects = await fetch(`${baseUrl}/api/projects`).then((response) => response.json());

    expect(health).toEqual({ ok: true });
    expect(projects).toEqual([]);
  });

  it("returns client-safe app config", async () => {
    await closeServer();
    await startServer({
      ...defaultAppConfig,
      application: {
        ...defaultAppConfig.application,
        title: "Configured Title"
      }
    });

    const config = await fetch(`${baseUrl}/api/config`).then((response) => response.json());

    expect(config.application.title).toBe("Configured Title");
    expect("paths" in config).toBe(false);
    expect("server" in config).toBe(false);
  });

  it("returns the versioned OneStream property dictionary", async () => {
    const dictionary = await fetch(`${baseUrl}/api/schema/onestream`).then((response) => response.json());
    const versionedDictionary = await fetch(`${baseUrl}/api/schema/onestream/9.2.0`).then((response) => response.json());

    expect(dictionary.version).toBe("9.2.0");
    expect(dictionary.dimensions.Account.member.some((definition: { propertyKey: string }) => definition.propertyKey === "accountType")).toBe(true);
    expect(dictionary.dimensions.Entity.relationship.some((definition: { propertyKey: string }) => definition.propertyKey === "percentConsol")).toBe(true);
    expect(versionedDictionary.version).toBe("9.2.0");
    expect(versionedDictionary.dimensions.Flow.member.some((definition: { displayName: string }) => definition.displayName === "Switch Sign")).toBe(true);
  });
});
