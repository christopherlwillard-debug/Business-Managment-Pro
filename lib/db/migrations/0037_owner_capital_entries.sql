CREATE TABLE IF NOT EXISTS "owner_capital_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer,
  "date" text NOT NULL,
  "description" text NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_owner_capital_entries_business_id" ON "owner_capital_entries" ("business_id");
