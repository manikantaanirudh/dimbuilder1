import { bootstrapPostgresSchema } from "../../server/db/bootstrapPostgresSchema";
import type { DbClient } from "../../server/db/dbClient";
import { createPostgresClient } from "../../server/db/postgresClient";

const pgUrl = process.env.PG_TEST_URL;

let schemaBootstrapped = false;

export function hasPostgresTestUrl(): boolean {
  return Boolean(pgUrl);
}

async function truncateProjectData(client: DbClient): Promise<void> {
  await client.exec("TRUNCATE TABLE projects RESTART IDENTITY CASCADE");
}

export async function withPostgresClient<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  if (!pgUrl) {
    throw new Error("PG_TEST_URL is not set");
  }

  const client = await createPostgresClient(pgUrl);
  try {
    if (!schemaBootstrapped) {
      await bootstrapPostgresSchema(client);
      schemaBootstrapped = true;
    }
    await truncateProjectData(client);
    return await fn(client);
  } finally {
    await client.close();
  }
}
