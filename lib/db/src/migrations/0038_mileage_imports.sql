-- Mileage import history table
CREATE TABLE IF NOT EXISTS "mileage_imports" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer REFERENCES "businesses"("id") ON DELETE cascade,
  "user_id" text,
  "source" text NOT NULL DEFAULT 'mileiq',
  "filename" text NOT NULL,
  "file_hash" text,
  "status" text NOT NULL DEFAULT 'completed',
  "trips_found" integer NOT NULL DEFAULT 0,
  "trips_imported" integer NOT NULL DEFAULT 0,
  "duplicates_skipped" integer NOT NULL DEFAULT 0,
  "total_miles" numeric(10, 2),
  "estimated_deduction" numeric(10, 2),
  "error_summary" text,
  "rolled_back_at" timestamp,
  "imported_at" timestamp DEFAULT now() NOT NULL
);

-- Link imported trips back to their import batch (for rollback)
ALTER TABLE "mileage_logs" ADD COLUMN IF NOT EXISTS "import_id" integer REFERENCES "mileage_imports"("id") ON DELETE SET NULL;
