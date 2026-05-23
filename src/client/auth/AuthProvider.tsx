import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import type { AuthUser } from "../../shared/authTypes";
import { apiGetMe, apiLogin, apiLogout, fetchAuthStatus, type AuthStatusResponse } from "../api/client";

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authEnabled: boolean;
  authStatus: AuthStatusResponse | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const status = await fetchAuthStatus();
        if (cancelled) return;
        setAuthStatus(status);
        setAuthEnabled(status.enabled);

        if (status.enabled) {
          const me = await apiGetMe();
          if (cancelled) return;
          setUser(me);
        }
      } catch {
        // Auth check failed — treat as not authenticated
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void init();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiLogin(email, password);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    authEnabled,
    authStatus,
    login,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
