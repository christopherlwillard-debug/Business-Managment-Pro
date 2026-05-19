CREATE TABLE IF NOT EXISTS "businesses" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "type" text DEFAULT 'other' NOT NULL,
  "logo_url" text,
  "address" text,
  "city" text,
  "state" text,
  "zip" text,
  "phone" text,
  "email" text,
  "license_number" text,
  "tax_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "businesses_slug_unique" UNIQUE("slug")
);
