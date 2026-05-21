import { AddressInfo } from "node:net";
import express from "express";
import { describe, expect, it } from "vitest";
import { validateBody } from "../server/middleware/validate";
import { createProjectSchema, updateProjectSchema } from "../server/schemas";

function createTestApp(schema: Parameters<typeof validateBody>[0]) {
  const app = express();
  app.use(express.json());
  app.post("/test", validateBody(schema), (req, res) => {
    res.json({ received: req.body });
  });
  return app;
}

async function withApp(schema: Parameters<typeof validateBody>[0], run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = createTestApp(schema);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

describe("validateBody middleware", () => {
  it("passes valid body through to handler", async () => {
    await withApp(createProjectSchema, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Project", description: "A test" })
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.received.name).toBe("Test Project");
      expect(body.received.description).toBe("A test");
    });
  });

  it("returns 400 with structured errors for invalid body", async () => {
    await withApp(createProjectSchema, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }) // name must be min(1)
      });
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Validation failed");
      expect(body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "name", message: expect.any(String) })
        ])
      );
    });
  });

  it("returns 400 when required field is missing", async () => {
    await withApp(createProjectSchema, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}) // name is required
      });
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Validation failed");
    });
  });

  it("applies default values from schema", async () => {
    await withApp(createProjectSchema, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Defaults Test" }) // description should default to ""
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.received.description).toBe("");
    });
  });

  it("rejects name exceeding max length", async () => {
    await withApp(createProjectSchema, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "x".repeat(256) })
      });
      expect(response.status).toBe(400);
    });
  });
});

describe("updateProjectSchema", () => {
  it("requires at least one field (name or description)", async () => {
    await withApp(updateProjectSchema, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Validation failed");
    });
  });

  it("accepts name only", async () => {
    await withApp(updateProjectSchema, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" })
      });
      expect(response.status).toBe(200);
    });
  });

  it("accepts description only", async () => {
    await withApp(updateProjectSchema, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Updated desc" })
      });
      expect(response.status).toBe(200);
    });
  });
});
