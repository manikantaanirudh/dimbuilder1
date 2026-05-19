import { Router } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import {
  blueprintToYamlFragment,
  validateBlueprintDraft
} from "../../shared/blueprintStudio";
import { supportedDimensionTypes } from "../../shared/dimensionSchemas";
import type { DimensionType } from "../../shared/types";

export function createBlueprintRouter(config: AppConfig): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      enabled: true,
      allowConfigWrite: false,
      dimensionTypes: supportedDimensionTypes,
      blueprints: config.dimensions.blueprints
    });
  });

  router.post("/validate", (req, res) => {
    const dimensionType = parseDimensionType(req.body?.dimensionType);
    if (!dimensionType) return res.status(400).json({ error: "dimensionType is required" });
    res.json(validateBlueprintDraft(dimensionType, req.body?.draft ?? {}));
  });

  router.post("/yaml", (req, res) => {
    const dimensionType = parseDimensionType(req.body?.dimensionType);
    if (!dimensionType) return res.status(400).json({ error: "dimensionType is required" });
    const validation = validateBlueprintDraft(dimensionType, req.body?.draft ?? {});
    if (!validation.valid || !validation.blueprint) return res.status(400).json(validation);
    res.json({
      dimensionType,
      yaml: blueprintToYamlFragment(dimensionType, validation.blueprint),
      blueprint: validation.blueprint
    });
  });

  return router;
}

function parseDimensionType(value: unknown): DimensionType | null {
  return typeof value === "string" && (supportedDimensionTypes as readonly string[]).includes(value)
    ? value as DimensionType
    : null;
}
