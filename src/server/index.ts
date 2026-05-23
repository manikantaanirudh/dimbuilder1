import { createApp } from "./app";
import { loadAppConfig } from "./config/loadAppConfig";
import { createDatabase } from "./db/database";
import { createRepositories } from "./db/repositories";
import { hashPassword } from "./auth/passwords";
import { logger } from "./logger";

const config = loadAppConfig();
const db = createDatabase(config.paths.databaseFile);
const repos = createRepositories(db);

// Seed default admin user if auth is enabled and no users exist
async function seedDefaultAdmin() {
  if (!config.auth.enabled || config.auth.strategy === "none") return;

  const allUsers = repos.users.listUsers();
  const realUsers = allUsers.filter(u => u.id !== "local-admin");
  if (realUsers.length > 0) return;

  const email = process.env.ADMIN_EMAIL || "admin@dimbuilder.local";
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await hashPassword(password);

  repos.users.createUser({
    id: "seeded-admin",
    email,
    displayName: "Admin",
    passwordHash,
    authProvider: "local",
    role: "admin"
  });

  logger.info(`Default admin created: ${email} (password from ADMIN_PASSWORD env or default)`);
}

void seedDefaultAdmin();

const server = createApp(db, config).listen(config.server.port, config.server.host, () => {
  logger.info(`${config.application.productName} API listening on http://${config.server.host}:${config.server.port}`);
});

function shutdown(signal: string) {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    logger.info("HTTP server closed.");
    db.close();
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
