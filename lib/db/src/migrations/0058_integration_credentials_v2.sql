-- Extend integration_credentials to support portal and username/password credential types.
-- All new columns are nullable so existing API-key rows are unaffected.

ALTER TABLE integration_credentials
  ADD COLUMN IF NOT EXISTS portal_url       TEXT,          -- user-saved portal URL (not sensitive)
  ADD COLUMN IF NOT EXISTS encrypted_username TEXT,        -- AES-256-GCM: iv:tag:ciphertext (base64) — same scheme as encrypted_value
  ADD COLUMN IF NOT EXISTS username_hint    TEXT;          -- display hint (masked or verbatim depending on sensitivity)

-- Index for looking up portal records by slug (covers both platform and business scopes)
CREATE INDEX IF NOT EXISTS idx_integration_credentials_slug
  ON integration_credentials(slug);

COMMENT ON COLUMN integration_credentials.portal_url IS
  'Editable portal URL for this integration. Not sensitive — returned safely to the browser.';
COMMENT ON COLUMN integration_credentials.encrypted_username IS
  'AES-256-GCM encrypted username/login. Same format as encrypted_value. NEVER returned to browser.';
COMMENT ON COLUMN integration_credentials.username_hint IS
  'Safe hint for the stored username (e.g. first chars + domain). Returned to browser; never the full value.';
