import type { ReactNode } from "react";
import { useAuth } from "./useAuth";
import { LoginPage } from "./LoginPage";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { authEnabled, isLoading, isAuthenticated } = useAuth();

  // Auth not enabled — pass through
  if (!authEnabled && !isLoading) {
    return <>{children}</>;
  }

  // Still loading auth state
  if (isLoading) {
    return (
      <div className="app-shell loading-shell">
        <main className="main">
          <div className="empty-state">Checking authentication...</div>
        </main>
      </div>
    );
  }

  // Not authenticated — show login
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Authenticated — render app
  return <>{children}</>;
}
