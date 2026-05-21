import rateLimit from "express-rate-limit";

const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

/** General API rate limiter: 100 requests per minute per IP */
export const generalRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 10_000 : 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
});

/** Stricter rate limiter for heavy operations (import/export): 10 per minute per IP */
export const heavyOperationRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 10_000 : 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many import/export requests, please try again later." }
});
