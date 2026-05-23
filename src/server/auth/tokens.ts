import jwt from "jsonwebtoken";
import type { AuthTokenPayload, SystemRole } from "../../shared/authTypes";

export interface TokenConfig {
  secret: string;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
}

interface SignPayload {
  sub: string;
  email: string;
  role: SystemRole;
}

export function signAccessToken(payload: SignPayload, config: TokenConfig): string {
  return jwt.sign(
    { sub: payload.sub, email: payload.email, role: payload.role },
    config.secret,
    { expiresIn: config.accessTokenExpiry }
  );
}

export function signRefreshToken(userId: string, config: TokenConfig): string {
  return jwt.sign(
    { sub: userId, type: "refresh" },
    config.secret,
    { expiresIn: config.refreshTokenExpiry }
  );
}

export function verifyAccessToken(token: string, config: TokenConfig): AuthTokenPayload {
  const payload = jwt.verify(token, config.secret) as AuthTokenPayload;
  if (!payload.sub || !payload.email || !payload.role) {
    throw new Error("Invalid token payload");
  }
  return payload;
}

export function verifyRefreshToken(token: string, config: TokenConfig): { sub: string } {
  const payload = jwt.verify(token, config.secret) as { sub: string; type: string };
  if (payload.type !== "refresh") throw new Error("Not a refresh token");
  return { sub: payload.sub };
}
