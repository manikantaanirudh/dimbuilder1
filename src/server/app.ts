import cors from "cors";
import express from "express";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { AppDatabase } from "./db/database";
import { createDatabase } from "./db/database";
import { createRepositories } from "./db/repositories";
import { logger } from "./logger";
import { createBasicAuthMiddleware } from "./middleware/basicAuth";
import { generalRateLimiter, heavyOperationRateLimiter } from "./middleware/rateLimiter";
import { requestLogger } from "./middleware/requestLogger";
import { createConfigRouter } from "./routes/config";
import { createExportRouter } from "./routes/export";
import { createImportRouter } from "./routes/import";
import { createProjectRouter } from "./routes/projects";
import { createSchemaRouter } from "./routes/schema";
import { createValidationRouter } from "./routes/validation";
import { createBlueprintRouter } from "./routes/blueprints";
import { createAuthRouter } from "./routes/auth";
import { createUserRouter } from "./routes/users";
import { createWorkflowRouter } from "./routes/workflows";
import { createEnvironmentRouter } from "./routes/environments";
import { createConnectorRouter, createMappingRouter, createSyncJobRouter, createSyncRunRouter, createSourceRegistryRouter } from "./routes/connectors";
import { createImpactRouter } from "./routes/impact";
import { createAuthenticateMiddleware } from "./middleware/authenticate";
import { requireRole } from "./middleware/authorize";

export function createApp(db: AppDatabase = createDatabase(), config: AppConfig = defaultAppConfig) {
  const app = express();
  const repos = createRepositories(db);

  const corsOrigins = config.server.corsOrigins;
  app.use(cors(corsOrigins?.length ? { origin: corsOrigins } : undefined));
  app.use(express.json({ limit: "25mb" }));
  app.use(requestLogger);

  // Health check is unauthenticated
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Auth routes handle their own authentication
  app.use("/api/auth", createAuthRouter(repos, config));

  // Apply authentication to all /api routes below depending on strategy
  if (config.auth.strategy === "none" && config.auth.enabled && config.auth.username) {
    // Legacy basic auth fallback when strategy is "none" with credentials configured
    app.use("/api", createBasicAuthMiddleware(config.auth));
  } else if (config.auth.strategy !== "none") {
    // JWT-based authentication for local/oidc strategies
    app.use("/api", createAuthenticateMiddleware(config));
  }

  app.use("/api", generalRateLimiter);
  app.use("/api/import", heavyOperationRateLimiter);
  app.use("/api/export", heavyOperationRateLimiter);

  // Admin-only user management
  app.use("/api/users", requireRole("admin"), createUserRouter(repos));

  app.use("/api/config", createConfigRouter(config));
  app.use("/api/blueprints", createBlueprintRouter(config));
  app.use("/api/projects", createProjectRouter(repos, config));
  app.use("/api/schema", createSchemaRouter());
  app.use("/api/import", createImportRouter(repos, config));
  app.use("/api/export", createExportRouter(repos, config));
  app.use("/api/validation", createValidationRouter(repos, config));
  app.use("/api/workflows", createWorkflowRouter(repos, config));
  app.use("/api/environments", requireRole("admin"), createEnvironmentRouter(repos, config));
  app.use("/api/connectors", requireRole("admin"), createConnectorRouter(repos, config));
  app.use("/api/mappings", requireRole("admin"), createMappingRouter(repos));
  app.use("/api/sync-jobs", requireRole("author", "admin"), createSyncJobRouter(repos));
  app.use("/api/sync-runs", requireRole("author", "admin"), createSyncRunRouter(repos));
  app.use("/api/projects", createSourceRegistryRouter(repos));
  app.use("/api", createImpactRouter(repos, config));

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    const status = resolveErrorStatus(error);
    logger.error({ err: error, status }, message);
    res.status(status).json({ error: message });
  });

  return app;
}

function resolveErrorStatus(error: unknown): number {
  if (!error || typeof error !== "object") return 500;

  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  const candidate = typeof status === "number" ? status : statusCode;
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) return 500;

  return Math.min(599, Math.max(400, Math.trunc(candidate)));
}
