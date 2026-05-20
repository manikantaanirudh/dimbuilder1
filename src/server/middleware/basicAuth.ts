import type { RequestHandler } from "express";
import type { AuthConfig } from "../../shared/appConfigTypes";

/**
 * HTTP Basic Authentication middleware.
 * Returns a no-op middleware if auth is disabled in config.
 */
export function createBasicAuthMiddleware(auth: AuthConfig): RequestHandler {
  if (!auth.enabled) {
    return (_req, _res, next) => next();
  }

  const expectedCredentials = Buffer.from(`${auth.username}:${auth.password}`).toString("base64");

  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Basic ")) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Dim Builder"');
      return res.status(401).json({ error: "Authentication required" });
    }

    const provided = header.slice(6); // strip "Basic "
    if (provided !== expectedCredentials) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Dim Builder"');
      return res.status(401).json({ error: "Invalid credentials" });
    }

    next();
  };
}
