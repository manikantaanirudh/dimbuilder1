import type { Express } from "express";
import type { AppConfig, ModulesConfig } from "../shared/appConfigTypes";
import type { AppDatabase } from "./db/database";
import type { DbClient } from "./db/dbClient";
import type { Repositories } from "./db/repositories";
import { createProjectACLRouter } from "./acl/projectACL";
import { requireRole } from "./middleware/authorize";
import { createAIRouter } from "./routes/ai";
import { createArtifactRouter } from "./routes/artifacts";
import { createAuthRouter } from "./routes/auth";
import { createBlueprintRouter } from "./routes/blueprints";
import { createCertificationRouter } from "./routes/certification";
import { createConfigRouter } from "./routes/config";
import { createConnectorRouter, createMappingRouter, createSourceRegistryRouter, createSyncJobRouter, createSyncRunRouter } from "./routes/connectors";
import { createCrossDimensionRouter } from "./routes/crossDimension";
import { createEffectivePovRouter } from "./routes/effectivePov";
import { createPropertyDefaultsRouter } from "./routes/propertyDefaults";
import { createEnvironmentRouter } from "./routes/environments";
import { createExportRouter } from "./routes/export";
import { createExtensibilityRouter } from "./routes/extensibility";
import { createHandoffRouter } from "./routes/handoff";
import { createImpactRouter } from "./routes/impact";
import { createImportRouter } from "./routes/import";
import { createMigrationRouter } from "./routes/migration";
import { createPatternProfileRouter } from "./routes/patternProfiles";
import { createProjectRouter } from "./routes/projects";
import { createReadinessRouter } from "./routes/readiness";
import { createReportingRouter } from "./routes/reporting";
import { createRiskHeatmapRouter } from "./routes/riskHeatmap";
import { createSchemaRouter } from "./routes/schema";
import { createAssistantRouter } from "./routes/assistant";
import { createTemplateRouter } from "./routes/templates";
import { createTier3Router } from "./routes/tier3";
import { createTier4Router } from "./routes/tier4";
import { createUserRouter } from "./routes/users";
import { createValidationRouter } from "./routes/validation";
import { createWaiversRouter } from "./routes/waivers";
import { createVcsRouter } from "./routes/vcs";
import { createWorkflowRouter } from "./routes/workflows";
import { createWorkflowStatusRouter } from "./routes/workflowStatus";
import { createXdXrayRouter } from "./routes/xdXray";

export function registerApiRoutes(
  app: Express,
  repos: Repositories,
  _db: AppDatabase | DbClient,
  config: AppConfig,
  modules: ModulesConfig
): void {
  app.use("/api/users", requireRole("admin"), createUserRouter(repos));
  app.use("/api/config", createConfigRouter(config));
  app.use("/api/blueprints", createBlueprintRouter(config));
  app.use("/api/projects", createProjectRouter(repos, config));
  app.use("/api/projects", createCertificationRouter(repos, config));
  app.use("/api/projects", createWaiversRouter(repos));
  app.use("/api/projects", createReadinessRouter(repos, config));
  app.use("/api/projects", createWorkflowStatusRouter(repos, config));
  app.use("/api/projects", createArtifactRouter(repos, config));
  app.use("/api/projects", createEffectivePovRouter(repos, config));
  app.use("/api/projects", createPropertyDefaultsRouter(repos, config));
  app.use("/api/projects", createXdXrayRouter(repos, config));
  app.use("/api/projects", createHandoffRouter(repos, config));
  if (modules.chatAssistant && config.ai?.enabled) {
    app.use("/api/projects", createAssistantRouter(repos, config));
  }
  app.use("/api/projects", createRiskHeatmapRouter(repos, config));
  app.use("/api/projects", createPatternProfileRouter(repos, config));
  if (modules.platformExtras) {
    app.use("/api/projects", createMigrationRouter(repos, config));
  }
  app.use("/api/schema", createSchemaRouter());
  app.use("/api/import", createImportRouter(repos, config));
  app.use("/api/export", createExportRouter(repos, config));
  app.use("/api/validation", createValidationRouter(repos, config));
  app.use("/api/workflows", createWorkflowRouter(repos, config));

  if (modules.environmentManagement) {
    app.use("/api/environments", requireRole("admin"), createEnvironmentRouter(repos, config));
    app.use("/api/connectors", requireRole("admin"), createConnectorRouter(repos, config));
    app.use("/api/mappings", requireRole("admin"), createMappingRouter(repos));
    app.use("/api/sync-jobs", requireRole("author", "admin"), createSyncJobRouter(repos));
    app.use("/api/sync-runs", requireRole("author", "admin"), createSyncRunRouter(repos));
    app.use("/api/projects", createSourceRegistryRouter(repos));
  }

  app.use("/api", createImpactRouter(repos, config));

  if (modules.chatAssistant && config.ai?.enabled) {
    app.use("/api", createAIRouter(repos, config));
  }

  if (modules.platformExtras) {
    app.use("/api", createCrossDimensionRouter(repos, config));
    app.use("/api/templates", createTemplateRouter(repos, config));
    app.use("/api/reports", createReportingRouter(repos, config));
    app.use("/api", createVcsRouter(repos, config));
    app.use("/api", createExtensibilityRouter(repos, config));
  }

  if (modules.offlineSync || modules.apiPlatform) {
    app.use("/api", createTier3Router(repos, config));
  }

  if (modules.multiTenancy) {
    app.use("/api", createTier4Router(repos, config));
  }

  app.use("/api", createProjectACLRouter(repos));
}
