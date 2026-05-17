import { useEffect } from "react";
import { AppShell } from "./components/AppShell";
import { useAppConfig } from "./config/useAppConfig";

export function App() {
  const { config } = useAppConfig();
  const title = config.application.title;

  useEffect(() => {
    document.title = title;
  }, [title]);

  return <AppShell appConfig={config} />;
}
