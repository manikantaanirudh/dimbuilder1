import type { RequestHandler } from "express";
import { logger } from "../logger";

/**
 * Request logging middleware. Logs method, path, status code, and response time.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration
    }, `${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
};
