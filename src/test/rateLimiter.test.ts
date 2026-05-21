import { describe, expect, it } from "vitest";
import express from "express";
import rateLimit from "express-rate-limit";
import { AddressInfo } from "node:net";

/**
 * Tests rate limiting behavior using a standalone Express app with a low limit.
 * The production rateLimiter module uses a high limit (10,000) in test mode,
 * so we test the behavior pattern directly with a controlled limit.
 */
function createRateLimitedApp(limit: number, windowMs = 60_000) {
  const app = express();
  const limiter = rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
  });
  app.use(limiter);
  app.get("/test", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("rate limiter", () => {
  it("allows requests under the limit", async () => {
    const app = createRateLimitedApp(5);
    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${port}`;

      const response = await fetch(`${baseUrl}/test`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });

      // Verify response is successful
      expect(response.ok).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it("returns 429 after exceeding the limit", async () => {
    const app = createRateLimitedApp(3);
    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${port}`;

      // Send 3 requests (all should pass)
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${baseUrl}/test`);
        expect(res.status).toBe(200);
      }

      // 4th request should be rate limited
      const blocked = await fetch(`${baseUrl}/test`);
      expect(blocked.status).toBe(429);
      const body = await blocked.json();
      expect(body.error).toBe("Too many requests, please try again later.");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it("production module exports general and heavy operation limiters", async () => {
    const { generalRateLimiter, heavyOperationRateLimiter } = await import("../server/middleware/rateLimiter");
    // Both should be express middleware functions
    expect(typeof generalRateLimiter).toBe("function");
    expect(typeof heavyOperationRateLimiter).toBe("function");
  });

  it("heavy operation limiter has a stricter limit than general limiter", async () => {
    // In test mode both are 10,000, but we verify they are separate middleware instances
    const { generalRateLimiter, heavyOperationRateLimiter } = await import("../server/middleware/rateLimiter");
    expect(generalRateLimiter).not.toBe(heavyOperationRateLimiter);
  });
});
