-- Integration credential storage: AES-256-GCM encrypted API keys and secrets.
-- Credentials are NEVER stored in plaintext. The encrypted_value column holds a
-- base64(iv):base64(tag):base64(ciphertext) triplet decryptable only server-side.
-- Full credentials are never returned to the browser — only key_hint (last 4 chars).

CREATE TABLE IF NOT EXISTS integration_credentials (
  id                    SERIAL PRIMARY KEY,
  slug                  TEXT    NOT NULL,             -- e.g. "sam_gov", "eia", "plaid"
  scope                 TEXT    NOT NULL DEFAULT 'platform', -- 'platform' | 'business'
  business_id           INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
  encrypted_value       TEXT,                          -- AES-256-GCM: iv:tag:ciphertext (base64)
  key_hint              TEXT,                          -- last 4 chars, e.g. "ab12"
  status                TEXT    NOT NULL DEFAULT 'unconfigured', -- 'active'|'invalid'|'unconfigured'|'pending'
  last_verified_at      TIMESTAMPTZ,
  last_verify_error     TEXT,
  last_used_at          TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ,                   -- for credentials with known expiration
  renewal_reminder_days INTEGER DEFAULT 30,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Platform credentials: one row per slug where business_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_creds_platform
  ON integration_credentials (slug)
  WHERE business_id IS NULL;

-- Business-scoped credentials: one row per slug+business
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_creds_business
  ON integration_credentials (slug, business_id)
  WHERE business_id IS NOT NULL;
