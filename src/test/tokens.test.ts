import { describe, expect, it } from "vitest";
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from "../server/auth/tokens";
import type { SystemRole } from "../shared/authTypes";
import type { TokenConfig } from "../server/auth/tokens";

const tokenConfig: TokenConfig = { secret: "test-secret-key-for-unit-tests", accessTokenExpiry: "15m", refreshTokenExpiry: "7d" };

describe("JWT token helpers", () => {
  it("signs and verifies an access token", () => {
    const token = signAccessToken({ sub: "user-1", email: "test@example.com", role: "author" as SystemRole }, tokenConfig);
    const payload = verifyAccessToken(token, tokenConfig);
    expect(payload.sub).toBe("user-1");
    expect(payload.email).toBe("test@example.com");
    expect(payload.role).toBe("author");
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it("rejects a token with wrong secret", () => {
    const token = signAccessToken({ sub: "user-1", email: "test@example.com", role: "admin" as SystemRole }, tokenConfig);
    expect(() => verifyAccessToken(token, { ...tokenConfig, secret: "wrong-secret" })).toThrow();
  });

  it("signs and verifies a refresh token", () => {
    const token = signRefreshToken("user-1", tokenConfig);
    const payload = verifyRefreshToken(token, tokenConfig);
    expect(payload.sub).toBe("user-1");
  });

  it("rejects an access token used as refresh token", () => {
    const token = signAccessToken({ sub: "user-1", email: "test@example.com", role: "viewer" as SystemRole }, tokenConfig);
    expect(() => verifyRefreshToken(token, tokenConfig)).toThrow("Not a refresh token");
  });
});
