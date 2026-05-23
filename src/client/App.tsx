import { useEffect } from "react";
import { AppShell } from "./components/AppShell";
import { AuthProvider, ProtectedRoute } from "./auth";
import { useAppConfig } from "./config/useAppConfig";

export function App() {
  const { config, loading, error } = useAppConfig();
  const title = config.application.title;

  useEffect(() => {
    document.title = title;
  }, [title]);

  if (loading) {
    return (
      <div className="app-shell loading-shell">
        <main className="main">
          <div className="empty-state">Loading configuration...</div>
        </main>
      </div>
    );
  }

  return (
    <AuthProvider>
      <ProtectedRoute>
        <AppShell appConfig={config} configError={error?.message ?? null} />
      </ProtectedRoute>
    </AuthProvider>
  );
}
