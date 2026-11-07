import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptCredential, encryptCredential } from "./credentialManager.js";

describe("integration credential encryption", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("encrypts and decrypts credentials without persisting plaintext", () => {
    vi.stubEnv("SESSION_SECRET", "credential-manager-test-secret");
    const plaintext = "private-portal-password-123";
    const encrypted = encryptCredential(plaintext);

    expect(encrypted).not.toContain(plaintext);
    expect(encrypted.split(":")).toHaveLength(3);
    expect(decryptCredential(encrypted)).toBe(plaintext);
  });

  it("uses a fresh IV for each encryption", () => {
    vi.stubEnv("SESSION_SECRET", "credential-manager-test-secret");
    const first = encryptCredential("same-value");
    const second = encryptCredential("same-value");

    expect(second).not.toBe(first);
    expect(decryptCredential(first)).toBe("same-value");
    expect(decryptCredential(second)).toBe("same-value");
  });

  it("rejects tampered ciphertext", () => {
    vi.stubEnv("SESSION_SECRET", "credential-manager-test-secret");
    const encrypted = encryptCredential("sensitive");
    const [iv, tag, ciphertext] = encrypted.split(":");
    const tampered = `${iv}:${tag}:${ciphertext.slice(0, -4)}AAAA`;

    expect(() => decryptCredential(tampered)).toThrow();
  });
});
