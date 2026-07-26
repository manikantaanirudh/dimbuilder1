import type { AuthUser, LoginResponse } from "@shared/authTypes";
import { apiGet, authHeaders, clearTokens, getAccessToken, setTokens } from "./core";

export interface AuthStatusResponse {
  enabled: boolean;
  strategy: string;
  oidcAuthorizeUrl: string | null;
}

export async function fetchAuthStatus(): Promise<AuthStatusResponse> {
  const response = await fetch("/api/auth/status");
  if (!response.ok) return { enabled: false, strategy: "none", oidcAuthorizeUrl: null };
  return response.json() as Promise<AuthStatusResponse>;
}

export async function apiLogin(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error(await response.text());
  const data = (await response.json()) as LoginResponse;
  setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function apiLogout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", headers: authHeaders() });
  clearTokens();
}

export async function apiGetMe(): Promise<AuthUser | null> {
  if (!getAccessToken()) return null;
  try {
    return await apiGet<AuthUser>("/auth/me");
  } catch {
    return null;
  }
}

export async function apiRegister(email: string, password: string, displayName: string): Promise<AuthUser> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<AuthUser>;
}
