import { createApp } from "./app";
import { loadAppConfig } from "./config/loadAppConfig";
import { createDbClient, dbConfigFromAppConfig } from "./db/createDbClient";
import { isAppDatabase } from "./db/database";
import type { DbClient } from "./db/dbClient";
import { createRepositories } from "./db/repositories";
import { hashPassword } from "./auth/passwords";
import { logger } from "./logger";

async function seedDefaultAdmin(repos: ReturnType<typeof createRepositories>) {
  const config = loadAppConfig();
  if (!config.auth.enabled || config.auth.strategy === "none") return;

  const allUsers = await repos.users.listUsers();
  const realUsers = allUsers.filter(u => u.id !== "local-admin");
  if (realUsers.length > 0) return;

  const email = process.env.ADMIN_EMAIL || "admin@dimbuilder.local";
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await hashPassword(password);

  await repos.users.createUser({
    id: "seeded-admin",
    email,
    displayName: "Admin",
    passwordHash,
    authProvider: "local",
    role: "admin"
  });

  logger.info("Default admin created (configure via ADMIN_EMAIL and ADMIN_PASSWORD env vars)");
}

async function main() {
  const config = loadAppConfig();
  const db = await createDbClient(dbConfigFromAppConfig(config));
  const repos = createRepositories(db);
  const app = createApp({ db, repos, config });

  // Security: warn if JWT secret is still the default placeholder
  if (config.auth.enabled && config.auth.jwt.secret === "change-me-in-production") {
    logger.warn("JWT secret is set to the default placeholder. Set JWT_SECRET environment variable before deploying.");
  }

  await seedDefaultAdmin(repos);

  const server = app.listen(config.server.port, config.server.host, () => {
    logger.info(`${config.application.productName} API listening on http://${config.server.host}:${config.server.port}`);
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      logger.error(
        `Port ${config.server.port} is already in use. Stop the other process or run scripts\\restart-services.bat, then try again.`
      );
      process.exit(1);
    }
    throw error;
  });

  async function shutdown(signal: string) {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      logger.info("HTTP server closed.");
      await closeDatabase(db);
      logger.info("Database closed.");
      process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown hangs
    setTimeout(() => {
      logger.error("Graceful shutdown timed out. Forcing exit.");
      process.exit(1);
    }, 10_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

async function closeDatabase(db: DbClient | ReturnType<typeof import("./db/database").createDatabase>) {
  if (isAppDatabase(db)) {
    db.close();
    return;
  }
  await db.close();
}

void main().catch((error) => {
  logger.error({ err: error }, "Failed to start server");
  process.exit(1);
});
