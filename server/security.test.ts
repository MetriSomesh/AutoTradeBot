import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("JWT_SECRET", "a-strong-test-session-secret-with-more-than-thirty-two-characters");
  vi.stubEnv("TMT_CREDENTIAL_ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
});
afterEach(() => vi.unstubAllEnvs());

describe("local-account and BYOK security primitives", () => {
  it("hashes and verifies passwords without accepting a wrong password", async () => {
    const { hashPassword, verifyPassword } = await import("./security");
    const hash = await hashPassword("Correct-Horse-Battery-12");
    expect(hash).not.toContain("Correct-Horse-Battery-12");
    await expect(verifyPassword("Correct-Horse-Battery-12", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("encrypts Delta credentials with distinct authenticated ciphertext records", async () => {
    const { decryptCredential, encryptCredential } = await import("./security");
    const first = encryptCredential("delta-secret-value");
    const second = encryptCredential("delta-secret-value");
    expect(first.ciphertext).not.toContain("delta-secret-value");
    expect(first.iv).not.toBe(second.iv);
    expect(decryptCredential(first)).toBe("delta-secret-value");
  });

  it("creates opaque session tokens whose database hash cannot reveal the raw token", async () => {
    const { createOpaqueToken, hashOpaqueToken } = await import("./security");
    const token = createOpaqueToken();
    const tokenHash = hashOpaqueToken(token);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(hashOpaqueToken(token)).toBe(tokenHash);
  });
});
