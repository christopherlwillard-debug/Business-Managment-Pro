ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS default_quote_terms text,
  ADD COLUMN IF NOT EXISTS default_quote_validity_days integer NOT NULL DEFAULT 30;

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS quote_expires_at date;
