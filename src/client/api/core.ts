// --- Token Store ---

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string, refresh: string): void {
  accessToken = access;
  refreshToken = refresh;
}

export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  return headers;
}

async function attemptRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    if (!response.ok) { clearTokens(); return false; }
    const data = await response.json() as { accessToken: string };
    accessToken = data.accessToken;
    return true;
  } catch { clearTokens(); return false; }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`, { headers: authHeaders() });
  if (response.status === 401 && accessToken) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      const retryResponse = await fetch(`/api${path}`, { headers: authHeaders() });
      if (!retryResponse.ok) throw new Error(await retryResponse.text());
      return retryResponse.json() as Promise<T>;
    }
  }
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiText(path: string): Promise<string> {
  const response = await fetch(`/api${path}`, { headers: authHeaders() });
  if (response.status === 401 && accessToken) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      const retryResponse = await fetch(`/api${path}`, { headers: authHeaders() });
      if (!retryResponse.ok) throw new Error(await retryResponse.text());
      return retryResponse.text();
    }
  }
  if (!response.ok) throw new Error(await response.text());
  return response.text();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const contentHeaders = body instanceof FormData
    ? authHeaders()
    : { ...authHeaders(), "Content-Type": "application/json" };
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: contentHeaders,
    body: body instanceof FormData ? body : JSON.stringify(body ?? {})
  });
  if (response.status === 401 && accessToken) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      const retryHeaders = body instanceof FormData
        ? authHeaders()
        : { ...authHeaders(), "Content-Type": "application/json" };
      const retryResponse = await fetch(`/api${path}`, {
        method: "POST",
        headers: retryHeaders,
        body: body instanceof FormData ? body : JSON.stringify(body ?? {})
      });
      if (!retryResponse.ok) throw new Error(await retryResponse.text());
      return retryResponse.json() as Promise<T>;
    }
  }
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPatch(path: string, body: unknown): Promise<void> {
  const response = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (response.status === 401 && accessToken) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      const retryResponse = await fetch(`/api${path}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!retryResponse.ok) throw new Error(await retryResponse.text());
      return;
    }
  }
  if (!response.ok) throw new Error(await response.text());
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (response.status === 401 && accessToken) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      const retryResponse = await fetch(`/api${path}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!retryResponse.ok) throw new Error(await retryResponse.text());
      return retryResponse.json() as Promise<T>;
    }
  }
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPatchJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (response.status === 401 && accessToken) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      const retryResponse = await fetch(`/api${path}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!retryResponse.ok) throw new Error(await retryResponse.text());
      return retryResponse.json() as Promise<T>;
    }
  }
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  await apiDeleteJson(path);
}

export async function apiDeleteJson<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`, { method: "DELETE", headers: authHeaders() });
  if (response.status === 401 && accessToken) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      const retryResponse = await fetch(`/api${path}`, { method: "DELETE", headers: authHeaders() });
      if (!retryResponse.ok) throw new Error(await retryResponse.text());
      const text = await retryResponse.text();
      return (text ? JSON.parse(text) : {}) as T;
    }
  }
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}
