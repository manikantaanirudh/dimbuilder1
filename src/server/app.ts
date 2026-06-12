import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import { allModulesEnabled, resolveModulesConfig } from "../shared/modulesConfig";
import type { AppDatabase } from "./db/database";
import { createDatabase, isAppDatabase } from "./db/database";
import type { DbClient } from "./db/dbClient";
import { createRepositories } from "./db/repositories";
import { logger } from "./logger";
import { createBasicAuthMiddleware } from "./middleware/basicAuth";
import { createAuthenticateMiddleware } from "./middleware/authenticate";
import { generalRateLimiter, heavyOperationRateLimiter } from "./middleware/rateLimiter";
import { requestLogger } from "./middleware/requestLogger";
import { registerApiRoutes } from "./registerApiRoutes";
import { createAuthRouter } from "./routes/auth";

function resolveTestAwareConfig(config: AppConfig): AppConfig {
  if (config.operations?.respectModuleGating || process.env.VITEST !== "true") {
    return config;
  }
  return {
    ...config,
    // Do not merge config.modules here — defaultAppConfig leaves flags false and would disable routes in tests.
    modules: allModulesEnabled(),
    ai: {
      ...(config.ai ?? defaultAppConfig.ai!),
      enabled: true
    }
  };
}

export function createApp(db: AppDatabase | DbClient = createDatabase(), config: AppConfig = defaultAppConfig) {
  const effectiveConfig = resolveTestAwareConfig(config);
  const app = express();
  const repos = createRepositories(db);

  app.use(helmet({ contentSecurityPolicy: false }));
  const corsOrigins = effectiveConfig.server.corsOrigins;
  app.use(cors(corsOrigins?.length ? { origin: corsOrigins } : undefined));
  app.use(express.json({ limit: "25mb" }));
  app.use(requestLogger);

  // Health check is unauthenticated
  app.get("/api/health", async (_req, res) => {
    try {
      if (isAppDatabase(db)) {
        db.prepare("SELECT 1").get();
      } else {
        await db.queryOne("SELECT 1");
      }
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false, error: "Database unavailable" });
    }
  });

  // Auth routes handle their own authentication
  app.use("/api/auth", createAuthRouter(repos, effectiveConfig));

  // Apply authentication to all /api routes below depending on strategy
  if (effectiveConfig.auth.strategy === "none" && effectiveConfig.auth.enabled && effectiveConfig.auth.username) {
    // Legacy basic auth fallback when strategy is "none" with credentials configured
    app.use("/api", createBasicAuthMiddleware(effectiveConfig.auth));
  } else if (effectiveConfig.auth.strategy !== "none") {
    // JWT-based authentication for local/oidc strategies
    app.use("/api", createAuthenticateMiddleware(effectiveConfig));
  }

  app.use("/api", generalRateLimiter);
  app.use("/api/import", heavyOperationRateLimiter);
  app.use("/api/export", heavyOperationRateLimiter);

  registerApiRoutes(app, repos, db, effectiveConfig, resolveModulesConfig(effectiveConfig));

  // Serve the built React SPA in production. API routes above take precedence;
  // any non-/api path falls back to index.html for client-side routing.
  const clientDir = process.env.CLIENT_DIST_DIR ?? path.resolve(process.cwd(), "dist");
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(clientDir, "index.html"));
    });
  }

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
