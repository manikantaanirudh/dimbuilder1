import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { logger } from "../logger";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/**
 * Request logging middleware. Logs method, path, status code, response time, and correlation ID.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const requestId = (req.headers["x-request-id"] as string) || randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info({
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      userId: req.user?.id
    }, `${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
};
