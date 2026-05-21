import { createApp } from "./app";
import { loadAppConfig } from "./config/loadAppConfig";
import { createDatabase } from "./db/database";
import { logger } from "./logger";

const config = loadAppConfig();
const db = createDatabase(config.paths.databaseFile);

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
