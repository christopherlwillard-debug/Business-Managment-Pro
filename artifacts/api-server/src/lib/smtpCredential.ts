import crypto from "node:crypto";

const ENVELOPE_PREFIX = "enc:smtp:v1:";

export class SmtpCredentialConfigurationError extends Error {
  constructor() {
    super("SMTP encryption is not configured or the saved credential cannot be read. Configure the SMTP encryption key before sending email.");
    this.name = "SmtpCredentialConfigurationError";
  }
}

type Keyring = { activeKeyId: string; keys: Map<string, Buffer> };

function readKeyring(): Keyring {
  try {
    const raw = process.env.SMTP_ENCRYPTION_KEYS;
    const activeKeyId = process.env.SMTP_ENCRYPTION_ACTIVE_KEY_ID;
    if (!raw || !activeKeyId || !/^[A-Za-z0-9_-]{1,64}$/.test(activeKeyId)) {
      throw new Error("invalid configuration");
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const keys = new Map<string, Buffer>();
    for (const [keyId, encoded] of Object.entries(parsed)) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(keyId) || typeof encoded !== "string") {
        throw new Error("invalid configuration");
      }
      const key = Buffer.from(encoded, "base64");
      if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
        throw new Error("invalid configuration");
      }
      keys.set(keyId, key);
    }
    if (!keys.has(activeKeyId)) throw new Error("invalid configuration");
    return { activeKeyId, keys };
  } catch {
    throw new SmtpCredentialConfigurationError();
  }
}

export function isSmtpCredentialEncrypted(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(ENVELOPE_PREFIX));
}

export function encryptSmtpCredential(plaintext: string): string {
  if (!plaintext) throw new SmtpCredentialConfigurationError();
  const { activeKeyId, keys } = readKeyring();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keys.get(activeKeyId)!, iv);
  cipher.setAAD(Buffer.from(`${ENVELOPE_PREFIX}${activeKeyId}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${ENVELOPE_PREFIX}${activeKeyId}:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptSmtpCredential(stored: string): string {
  const { activeKeyId, keys } = readKeyring();
  if (!isSmtpCredentialEncrypted(stored)) {
    // Legacy plaintext is readable only after the dedicated keyring is configured.
    return stored;
  }
  const match = stored.match(/^enc:smtp:v1:([A-Za-z0-9_-]{1,64}):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]*)$/);
  if (!match) throw new SmtpCredentialConfigurationError();
  const [, keyId, ivText, tagText, ciphertextText] = match;
  const key = keys.get(keyId);
  if (!key) throw new SmtpCredentialConfigurationError();
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
    decipher.setAAD(Buffer.from(`${ENVELOPE_PREFIX}${keyId}`, "utf8"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new SmtpCredentialConfigurationError();
  }
}

export function hasSmtpEncryptionKeyring(): boolean {
  try {
    readKeyring();
    return true;
  } catch {
    return false;
  }
}
