import type { RequestHandler } from "express";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { AuthUser, AuthTokenPayload, SystemRole } from "../../shared/authTypes";
import { verifyAccessToken, type TokenConfig } from "../auth/tokens";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tokenPayload?: AuthTokenPayload;
    }
  }
}

export function createAuthenticateMiddleware(config: AppConfig): RequestHandler {
  if (!config.auth.enabled || config.auth.strategy === "none") {
    return (req, _res, next) => {
      req.user = {
        id: "system",
        email: "admin@local",
        displayName: "Local Admin",
        authProvider: "local",
        role: "admin" as SystemRole,
        isActive: true
      };
      next();
    };
  }

  const tokenConfig: TokenConfig = {
    secret: process.env.JWT_SECRET || config.auth.jwt.secret,
    accessTokenExpiry: config.auth.jwt.accessTokenExpiry,
    refreshTokenExpiry: config.auth.jwt.refreshTokenExpiry
  };

  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required", code: "NO_TOKEN" });
    }

    const token = header.slice(7);
    try {
      const payload = verifyAccessToken(token, tokenConfig);
      req.tokenPayload = payload;
      req.user = {
        id: payload.sub,
        email: payload.email,
        displayName: payload.email.split("@")[0],
        authProvider: "local",
        role: payload.role,
        isActive: true
      };
      next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired token", code: "INVALID_TOKEN" });
    }
  };
}
