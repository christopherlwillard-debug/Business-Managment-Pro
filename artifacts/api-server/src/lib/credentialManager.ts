/**
 * Secure credential manager for Integrations & API management.
 *
 * Credentials are stored AES-256-GCM encrypted in the `integration_credentials`
 * DB table and cached in memory after decryption. They are NEVER returned to the
 * browser, never logged, and never placed in AI prompts.
 *
 * Resolution order for getCredential(slug):
 *   1. In-memory cache (populated at startup and on credential update)
 *   2. process.env[envFallback] (backward-compatible: existing env vars still work)
 *
 * The DB encrypted_value is loaded into the cache during init(). If init() hasn't
 * run yet (or the table doesn't exist), getCredential falls back to process.env.
 */

import crypto from "node:crypto";
import { db } from "@workspace/db";
import { integrationCredentialsTable } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";

// ── Encryption constants ──────────────────────────────────────────────────────

const ALGORITHM  = "aes-256-gcm";
const KDF_SALT   = "buildpro-integration-credentials-v1";
const KDF_ITER   = 100_000;

function deriveKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("[credentials] SESSION_SECRET is required for credential encryption");
  }
  return crypto.pbkdf2Sync(secret, KDF_SALT, KDF_ITER, 32, "sha256");
}

// ── In-memory cache (decrypted values, platform scope only for v1) ────────────

const _cache = new Map<string, string>();
let _initialized = false;

// ── Encryption helpers ────────────────────────────────────────────────────────

/**
 * Encrypts a plaintext credential. Returns "base64(iv):base64(tag):base64(ciphertext)".
 * The result is safe to store in the database.
 */
export function encryptCredential(plaintext: string): string {
  const key = deriveKey();
  const iv  = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

/**
 * Decrypts a stored credential triplet ("iv:tag:ciphertext" all base64).
 * Throws if the data is tampered or the key is wrong.
 */
export function decryptCredential(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Invalid credential storage format");
  const [ivB64, tagB64, encB64] = parts;
  const key     = deriveKey();
  const iv      = Buffer.from(ivB64,  "base64");
  const tag     = Buffer.from(tagB64, "base64");
  const enc     = Buffer.from(encB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc).toString("utf8") + decipher.final().toString("utf8");
}

/** Returns a safe display hint: "••••" + last 4 chars (e.g. "••••ab12"). */
export function buildKeyHint(value: string): string {
  if (!value || value.length < 4) return "••••";
  return "••••" + value.slice(-4);
}

/** Returns a fully masked display value for the UI (never exposes the credential). */
export function maskCredential(value: string): string {
  return "••••••••" + (value.length >= 4 ? value.slice(-4) : "");
}

// ── Initialization ─────────────────────────────────────────────────────────────

/**
 * Load all platform-scoped credentials from DB into the in-memory cache.
 * Call once at startup in index.ts. Non-fatal — if the table doesn't exist yet
 * (pre-migration deploy), getCredential falls back to process.env.
 */
export async function init(): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(integrationCredentialsTable)
      .where(isNull(integrationCredentialsTable.businessId));

    let loaded = 0;
    for (const row of rows) {
      if (row.encryptedValue) {
        try {
          const decrypted = decryptCredential(row.encryptedValue);
          _cache.set(row.slug, decrypted);
          loaded++;
        } catch (err) {
          console.error(`[credentials] Failed to decrypt "${row.slug}" — will fall back to env:`, (err as Error).message);
        }
      }
    }
    _initialized = true;
    if (loaded > 0) console.log(`[credentials] Loaded ${loaded} credential(s) from DB.`);
  } catch (err) {
    // Non-fatal: table might not exist yet on first deploy before migration runs.
    console.warn("[credentials] init: could not load from DB (falling back to env vars):", (err as Error).message);
    _initialized = false;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Get a decrypted credential value. Resolution: cache (populated from DB) → process.env fallback.
 * Returns null if the credential is not configured anywhere.
 *
 * This is SYNCHRONOUS — reads from the in-memory cache.
 * The cache is populated at startup by init() and updated by setCredential().
 */
export function getCredential(slug: string, envFallback?: string): string | null {
  const cached = _cache.get(slug);
  if (cached) return cached;
  if (envFallback) return process.env[envFallback] ?? null;
  return null;
}

/**
 * Check if a credential is available (DB or env). Does not return the value.
 */
export function hasCredential(slug: string, envFallback?: string): boolean {
  return getCredential(slug, envFallback) !== null;
}

/**
 * Store a new credential: encrypt → upsert to DB → update in-memory cache.
 * The plaintext is never persisted; only the ciphertext goes to the DB.
 */
export async function setCredential(
  slug: string,
  plaintext: string,
  opts?: { expiresAt?: Date | null },
): Promise<void> {
  const encrypted = encryptCredential(plaintext);
  const hint      = buildKeyHint(plaintext);

  // Platform-scoped upsert using the partial unique index (business_id IS NULL)
  const existing = await db
    .select({ id: integrationCredentialsTable.id })
    .from(integrationCredentialsTable)
    .where(
      and(
        eq(integrationCredentialsTable.slug, slug),
        isNull(integrationCredentialsTable.businessId),
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(integrationCredentialsTable)
      .set({
        encryptedValue:  encrypted,
        keyHint:         hint,
        status:          "active",
        lastVerifiedAt:  new Date(),
        lastVerifyError: null,
        ...(opts?.expiresAt !== undefined ? { expiresAt: opts.expiresAt } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(integrationCredentialsTable.slug, slug),
          isNull(integrationCredentialsTable.businessId),
        )
      );
  } else {
    await db
      .insert(integrationCredentialsTable)
      .values({
        slug,
        scope:           "platform",
        businessId:      null,
        encryptedValue:  encrypted,
        keyHint:         hint,
        status:          "active",
        lastVerifiedAt:  new Date(),
        lastVerifyError: null,
        ...(opts?.expiresAt ? { expiresAt: opts.expiresAt } : {}),
      });
  }

  // Update in-memory cache so subsequent getCredential() calls immediately use the new value
  _cache.set(slug, plaintext);
}

/**
 * Remove a stored credential from DB and cache, reverting to process.env fallback.
 */
export async function removeCredential(slug: string): Promise<void> {
  await db
    .update(integrationCredentialsTable)
    .set({
      encryptedValue:  null,
      keyHint:         null,
      status:          "unconfigured",
      lastVerifyError: null,
      updatedAt:       new Date(),
    })
    .where(
      and(
        eq(integrationCredentialsTable.slug, slug),
        isNull(integrationCredentialsTable.businessId),
      )
    );
  _cache.delete(slug);
}

/**
 * Record a verification result (called after a test, not after every usage).
 */
export async function recordVerification(
  slug: string,
  success: boolean,
  error?: string | null,
): Promise<void> {
  try {
    const existing = await db
      .select({ id: integrationCredentialsTable.id })
      .from(integrationCredentialsTable)
      .where(and(eq(integrationCredentialsTable.slug, slug), isNull(integrationCredentialsTable.businessId)))
      .limit(1);

    if (existing.length === 0) {
      // No DB row — create a status-only row (no credential stored)
      await db.insert(integrationCredentialsTable).values({
        slug,
        scope:           "platform",
        status:          success ? "active" : "invalid",
        lastVerifiedAt:  success ? new Date() : null,
        lastVerifyError: error ?? null,
      }).onConflictDoNothing();
      return;
    }

    await db
      .update(integrationCredentialsTable)
      .set({
        status:          success ? "active" : "invalid",
        lastVerifiedAt:  success ? new Date() : undefined,
        lastVerifyError: error ?? null,
        updatedAt:       new Date(),
      })
      .where(and(eq(integrationCredentialsTable.slug, slug), isNull(integrationCredentialsTable.businessId)));
  } catch {
    // Non-fatal
  }
}

export { _initialized as isInitialized };

// ── Portal credential helpers ──────────────────────────────────────────────────
// Portal credentials (username + password + URL) use the same AES-256-GCM
// encryption scheme. Password → encryptedValue; Username → encryptedUsername.
// The portalUrl is NOT sensitive and is stored/returned in plaintext.

export interface PortalCredentialOpts {
  portalUrl?:  string | null;
  username?:   string | null;
  password?:   string | null;
  notes?:      string | null;
}

/**
 * Build a safe username hint: show up to 3 chars + "…@domain" for email-like
 * usernames, or first 3 chars + "…" for plain usernames.
 */
export function buildUsernameHint(username: string): string {
  if (!username) return "";
  if (username.includes("@")) {
    const [local, domain] = username.split("@");
    const prefix = local.slice(0, Math.min(3, local.length));
    return `${prefix}…@${domain ?? ""}`;
  }
  const prefix = username.slice(0, Math.min(3, username.length));
  return prefix + "…";
}

/**
 * Persist portal credentials for a slug.
 * Any of portalUrl / username / password may be omitted (null) to leave
 * the existing stored value unchanged.  Pass empty string to explicitly clear.
 */
export async function setPortalCredential(
  slug: string,
  opts: PortalCredentialOpts,
  businessId?: number | null,
): Promise<void> {
  const encPassword  = opts.password  ? encryptCredential(opts.password)  : undefined;
  const encUsername  = opts.username  ? encryptCredential(opts.username)  : undefined;
  const passwordHint = opts.password  ? buildKeyHint(opts.password)        : undefined;
  const usernameHint = opts.username  ? buildUsernameHint(opts.username)   : undefined;

  // Figure out new status
  const hasCredential = !!(opts.password || (encPassword === undefined /* unchanged */ && false));
  const newStatus = (opts.password || opts.username) ? "active" : "unconfigured";

  const existing = await db
    .select({ id: integrationCredentialsTable.id })
    .from(integrationCredentialsTable)
    .where(and(
      eq(integrationCredentialsTable.slug, slug),
      businessId == null ? isNull(integrationCredentialsTable.businessId) : eq(integrationCredentialsTable.businessId, businessId),
    ))
    .limit(1);

  // Build a typed partial update object
  type UpdateShape = Partial<typeof integrationCredentialsTable.$inferInsert> & { updatedAt: Date };
  const updateFields: UpdateShape = { updatedAt: new Date() };
  if (opts.portalUrl  !== undefined) updateFields.portalUrl         = opts.portalUrl ?? null;
  if (opts.notes      !== undefined) updateFields.notes              = opts.notes ?? null;
  if (encPassword     !== undefined) { updateFields.encryptedValue   = encPassword; updateFields.keyHint = passwordHint ?? null; }
  if (encUsername     !== undefined) { updateFields.encryptedUsername = encUsername; updateFields.usernameHint = usernameHint ?? null; }
  // If password is being set (not just cleared), update status
  if (opts.password) {
    updateFields.status          = "active";
    updateFields.lastVerifiedAt  = new Date();
    updateFields.lastVerifyError = null;
  }
  // Explicit clear: empty string means remove
  if (opts.password === "") { updateFields.encryptedValue = null; updateFields.keyHint = null; updateFields.status = "unconfigured"; }
  if (opts.username === "") { updateFields.encryptedUsername = null; updateFields.usernameHint = null; }

  if (existing.length > 0) {
    await db
      .update(integrationCredentialsTable)
      .set(updateFields)
      .where(and(
      eq(integrationCredentialsTable.slug, slug),
      businessId == null ? isNull(integrationCredentialsTable.businessId) : eq(integrationCredentialsTable.businessId, businessId),
    ));
  } else {
    await db.insert(integrationCredentialsTable).values({
      slug,
      scope:              businessId == null ? "platform" : "business",
      businessId:         businessId ?? null,
      portalUrl:          (opts.portalUrl ?? null) as string | null,
      encryptedValue:     (encPassword ?? null) as string | null,
      keyHint:            (passwordHint ?? null) as string | null,
      encryptedUsername:  (encUsername ?? null) as string | null,
      usernameHint:       (usernameHint ?? null) as string | null,
      notes:              (opts.notes ?? null) as string | null,
      status:             opts.password ? "active" : "unconfigured",
      lastVerifiedAt:     opts.password ? new Date() : null,
      lastVerifyError:    null,
    });
  }
}

/**
 * Clear all portal credentials for a slug (URL, username, password).
 */
export async function removePortalCredential(slug: string): Promise<void> {
  await db
    .update(integrationCredentialsTable)
    .set({
      portalUrl:          null,
      encryptedValue:     null,
      keyHint:            null,
      encryptedUsername:  null,
      usernameHint:       null,
      status:             "unconfigured",
      lastVerifyError:    null,
      updatedAt:          new Date(),
    })
    .where(and(
      eq(integrationCredentialsTable.slug, slug),
      businessId == null ? isNull(integrationCredentialsTable.businessId) : eq(integrationCredentialsTable.businessId, businessId),
    ));
}
