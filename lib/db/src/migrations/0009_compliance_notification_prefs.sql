-- Task #142: Compliance notification email preferences
-- Adds two columns to the settings table so owners can control
-- where (and whether) compliance advance emails are sent.

ALTER TABLE "settings"
  ADD COLUMN IF NOT EXISTS "compliance_notification_email" text,
  ADD COLUMN IF NOT EXISTS "compliance_email_enabled" integer DEFAULT 1;
