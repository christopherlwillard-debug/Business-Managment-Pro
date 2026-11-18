import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptSmtpCredential,
  encryptSmtpCredential,
  hasSmtpEncryptionKeyring,
  isSmtpCredentialEncrypted,
} from "./smtpCredential.js";

const testKey = Buffer.alloc(32, 31).toString("base64");

describe("SMTP credential encryption", () => {
  afterEach(() => vi.unstubAllEnvs());

  function configure(keys: Record<string, string> = { dev_test: testKey }, active = "dev_test") {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SMTP_ENCRYPTION_KEYS_DEVELOPMENT", JSON.stringify(keys));
    vi.stubEnv("SMTP_ENCRYPTION_ACTIVE_KEY_ID_DEVELOPMENT", active);
  }

  it("encrypts with a version and key ID, then decrypts the value", () => {
    configure();
    const secret = "synthetic-smtp-password";
    const encrypted = encryptSmtpCredential(secret);
    expect(encrypted).toMatch(/^enc:smtp:v1:dev_test:/);
    expect(encrypted).not.toContain(secret);
    expect(decryptSmtpCredential(encrypted)).toBe(secret);
    expect(isSmtpCredentialEncrypted(encrypted)).toBe(true);
  });

  it("uses a fresh nonce and retains old keys for decryption", () => {
    configure({ old_key: testKey, new_key: Buffer.alloc(32, 32).toString("base64") }, "new_key");
    const oldCiphertext = encryptSmtpCredential("before-rotation");
    vi.stubEnv("SMTP_ENCRYPTION_ACTIVE_KEY_ID_DEVELOPMENT", "old_key");
    const other = encryptSmtpCredential("before-rotation");
    expect(other).not.toBe(oldCiphertext);
    vi.stubEnv("SMTP_ENCRYPTION_ACTIVE_KEY_ID_DEVELOPMENT", "new_key");
    expect(decryptSmtpCredential(oldCiphertext)).toBe("before-rotation");
  });

  it("fails closed for tampering, unknown keys, and a missing keyring", () => {
    configure();
    const encrypted = encryptSmtpCredential("synthetic");
    expect(() => decryptSmtpCredential(`${encrypted.slice(0, -2)}AA`)).toThrow(/SMTP encryption/);
    vi.stubEnv("SMTP_ENCRYPTION_KEYS_DEVELOPMENT", JSON.stringify({ other: testKey }));
    expect(() => decryptSmtpCredential(encrypted)).toThrow(/SMTP encryption/);
    vi.stubEnv("SMTP_ENCRYPTION_KEYS_DEVELOPMENT", "");
    expect(hasSmtpEncryptionKeyring()).toBe(false);
    expect(() => encryptSmtpCredential("new-secret")).toThrow(/SMTP encryption/);
  });

  it("reads legacy plaintext only when the encryption keyring is configured", () => {
    configure();
    expect(decryptSmtpCredential("legacy-synthetic-secret")).toBe("legacy-synthetic-secret");
    vi.stubEnv("SMTP_ENCRYPTION_KEYS_DEVELOPMENT", "");
    expect(() => decryptSmtpCredential("legacy-synthetic-secret")).toThrow(/SMTP encryption/);
  });

  it("uses a separate production keyring", () => {
    configure();
    const developmentValue = encryptSmtpCredential("environment-specific");
    vi.stubEnv("SMTP_ENCRYPTION_KEYS_PRODUCTION", JSON.stringify({
      prod_key: Buffer.alloc(32, 87).toString("base64"),
    }));
    vi.stubEnv("SMTP_ENCRYPTION_ACTIVE_KEY_ID_PRODUCTION", "prod_key");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => decryptSmtpCredential(developmentValue)).toThrow(/SMTP encryption/);
    const productionValue = encryptSmtpCredential("environment-specific");
    expect(productionValue).toContain(":prod_key:");
  });
});
