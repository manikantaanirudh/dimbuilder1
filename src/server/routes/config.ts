import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import { buildClientAppConfig } from "../../shared/appConfigValidation";

export function createConfigRouter(config: AppConfig): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(buildClientAppConfig(config));
  });

  return router;
}
