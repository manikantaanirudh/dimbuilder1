import { useEffect, useState } from "react";

import { fetchAppConfig } from "../api/client";
import { defaultAppConfig } from "../../shared/appConfigDefaults";
import type { ClientAppConfig } from "../../shared/appConfigTypes";
import { buildClientAppConfig } from "../../shared/appConfigValidation";

const fallbackConfig = buildClientAppConfig(defaultAppConfig);

export function useAppConfig(): { config: ClientAppConfig; loading: boolean; error: Error | null } {
  const [config, setConfig] = useState<ClientAppConfig>(fallbackConfig);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchAppConfig()
      .then((loadedConfig) => {
        if (cancelled) return;
        setConfig(loadedConfig);
        setError(null);
      })
      .catch((caughtError: unknown) => {
        if (cancelled) return;
        setError(caughtError instanceof Error ? caughtError : new Error(String(caughtError)));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { config, loading, error };
}
