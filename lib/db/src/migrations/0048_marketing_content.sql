-- M16: AI Marketing Assistant — per-business history of generated marketing content
CREATE TABLE IF NOT EXISTS "marketing_content" (
  "id" serial PRIMARY KEY,
  "business_id" integer NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "type" varchar(50) NOT NULL,
  "promo_hint" text,
  "content" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
