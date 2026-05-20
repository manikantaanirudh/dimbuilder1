import { writeFileSync } from "node:fs";
import { Router } from "express";
import { stringify } from "yaml";
import { defaultAppConfig } from "../../shared/appConfigDefaults";
import type { AppConfig } from "../../shared/appConfigTypes";
import { buildClientAppConfig, mergeAppConfig, validateAppConfig } from "../../shared/appConfigValidation";

export function createConfigRouter(config: AppConfig): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(buildClientAppConfig(config));
  });

  router.put("/", (req, res, next) => {
    try {
      const submitted = req.body;
      if (!submitted || typeof submitted !== "object") {
        return res.status(400).json({ error: "Invalid config body" });
      }
      // Merge submitted config with defaults and validate
      const merged = mergeAppConfig(defaultAppConfig, submitted);
      const validated = validateAppConfig(merged);

      // Write to YAML file
      const configPath = process.env.DIMBUILDER_CONFIG_FILE || "config/dimbuilder.yaml";
      writeFileSync(configPath, stringify(submitted, { lineWidth: 120 }));

      // Update in-memory config (mutate the reference)
      Object.assign(config, validated);

      res.json({ ok: true, config: buildClientAppConfig(config) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
