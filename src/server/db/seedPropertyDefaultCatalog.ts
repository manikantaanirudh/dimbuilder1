import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import type { AppDatabase } from "./database";

interface SeedCatalogJson {
  values: Array<{
    dimensionType: string;
    targetLevel: "dimension" | "member" | "relationship";
    propertyName: string;
    xmlName: string;
    defaultValue: string;
    enabled?: boolean;
  }>;
}

function loadSeedCatalog(): SeedCatalogJson {
  const configPath = join(process.cwd(), "config", "builtInPropertyDefaults.json");
  try {
    return JSON.parse(readFileSync(configPath, "utf8")) as SeedCatalogJson;
  } catch {
    const moduleDir = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
    return JSON.parse(readFileSync(join(moduleDir, "config", "builtInPropertyDefaults.json"), "utf8")) as SeedCatalogJson;
  }
}

/** Inserts the global property default catalog when the table is empty. Returns rows inserted. */
export function seedPropertyDefaultCatalog(db: AppDatabase): number {
  const existing = Number(db.prepare("SELECT COUNT(*) AS count FROM property_default_catalog").get()?.count ?? 0);
  if (existing > 0) return 0;

  const catalog = loadSeedCatalog();
  const timestamp = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO property_default_catalog (
      id, dimension_type, target_level, property_name, xml_name, default_value, enabled, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const value of catalog.values) {
    insert.run(
      nanoid(),
      value.dimensionType,
      value.targetLevel,
      value.propertyName,
      value.xmlName,
      value.defaultValue,
      value.enabled === false ? 0 : 1,
      timestamp
    );
  }

  return catalog.values.length;
}
