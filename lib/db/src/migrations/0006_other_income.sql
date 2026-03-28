-- Task #55: Other income ledger
-- Creates other_income table for recording non-invoice income
-- (cash jobs, pre-app payments, retainers, deposits, etc.)

CREATE TABLE IF NOT EXISTS "other_income" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" text,
  "amount" numeric(12, 2) NOT NULL,
  "date" text NOT NULL,
  "description" text NOT NULL,
  "source" text,
  "payment_method" text NOT NULL DEFAULT 'other',
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
