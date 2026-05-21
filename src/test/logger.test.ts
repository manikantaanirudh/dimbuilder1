import { AddressInfo } from "node:net";
import express from "express";
import { describe, expect, it } from "vitest";
import { logger } from "../server/logger";
import { requestLogger } from "../server/middleware/requestLogger";

describe("logger", () => {
  it("exports a pino logger instance with standard methods", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.fatal).toBe("function");
  });

  it("logger has a level property", () => {
    expect(typeof logger.level).toBe("string");
    expect(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).toContain(logger.level);
  });
});

describe("request logger middleware", () => {
  it("is a valid express middleware function", () => {
    expect(typeof requestLogger).toBe("function");
    expect(requestLogger.length).toBe(3); // req, res, next
  });

  it("calls next() and does not block the request", async () => {
    const app = express();
    app.use(requestLogger);
    app.get("/ping", (_req, res) => res.json({ pong: true }));

    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/ping`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ pong: true });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it("does not interfere with error responses", async () => {
    const app = express();
    app.use(requestLogger);
    app.get("/fail", (_req, res) => res.status(500).json({ error: "boom" }));

    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/fail`);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "boom" });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
