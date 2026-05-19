import { Router } from "express";
import {
  getGroupedOneStreamPropertyDictionary,
  isSupportedOneStreamPropertyDictionaryVersion,
  ONE_STREAM_PROPERTY_DICTIONARY_VERSION
} from "../../shared/oneStreamPropertyDictionary";

export function createSchemaRouter() {
  const router = Router();

  router.get("/onestream", (_req, res) => {
    res.json(getGroupedOneStreamPropertyDictionary());
  });

  router.get("/onestream/:version", (req, res) => {
    const version = req.params.version || ONE_STREAM_PROPERTY_DICTIONARY_VERSION;
    if (!isSupportedOneStreamPropertyDictionaryVersion(version)) {
      res.status(404).json({ error: `Unsupported OneStream property dictionary version '${version}'.` });
      return;
    }
    res.json(getGroupedOneStreamPropertyDictionary(version));
  });

  return router;
}
