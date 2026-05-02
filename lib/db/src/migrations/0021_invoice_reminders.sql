ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "reminders_sent_at" jsonb DEFAULT '[]';
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "invoice_reminder_enabled" integer DEFAULT 1;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "invoice_reminder_day1" integer DEFAULT 7;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "invoice_reminder_day2" integer DEFAULT 14;
