import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../server/auth/passwords";

describe("password helpers", () => {
  it("hashes a password and verifies it correctly", async () => {
    const hash = await hashPassword("SecureP@ss123");
    expect(hash).not.toBe("SecureP@ss123");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("SecureP@ss123", hash)).toBe(true);
  });

  it("rejects incorrect passwords", async () => {
    const hash = await hashPassword("SecureP@ss123");
    expect(await verifyPassword("WrongPassword", hash)).toBe(false);
  });

  it("produces different hashes for the same password (salted)", async () => {
    const hash1 = await hashPassword("SamePassword");
    const hash2 = await hashPassword("SamePassword");
    expect(hash1).not.toBe(hash2);
  });
});
