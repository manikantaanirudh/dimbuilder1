import cors from "cors";
import express from "express";
import { defaultAppConfig } from "../shared/appConfigDefaults";
import type { AppConfig } from "../shared/appConfigTypes";
import type { AppDatabase } from "./db/database";
import { createDatabase } from "./db/database";
import { createRepositories } from "./db/repositories";
import { createConfigRouter } from "./routes/config";
import { createExportRouter } from "./routes/export";
import { createImportRouter } from "./routes/import";
import { createProjectRouter } from "./routes/projects";
import { createValidationRouter } from "./routes/validation";

export function createApp(db: AppDatabase = createDatabase(), config: AppConfig = defaultAppConfig) {
  const app = express();
  const repos = createRepositories(db);

  app.use(cors());
  app.use(express.json({ limit: "25mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/config", createConfigRouter(config));
  app.use("/api/projects", createProjectRouter(repos));
  app.use("/api/import", createImportRouter(repos, config));
  app.use("/api/export", createExportRouter(repos, config));
  app.use("/api/validation", createValidationRouter(repos));

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    console.error(error);
    res.status(500).json({ error: message });
  });

  return app;
}
