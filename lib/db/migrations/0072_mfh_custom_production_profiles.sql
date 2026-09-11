CREATE TABLE IF NOT EXISTS "mfh_custom_production_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "profile_key" text NOT NULL,
  "name" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "mfh_custom_production_profiles_business_key_unique" UNIQUE("business_id","profile_key"),
  CONSTRAINT "mfh_custom_production_profiles_business_name_unique" UNIQUE("business_id","name")
);

CREATE TABLE IF NOT EXISTS "mfh_custom_production_profile_services" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "profile_id" integer NOT NULL REFERENCES "mfh_custom_production_profiles"("id") ON DELETE CASCADE,
  "service_type_id" integer NOT NULL REFERENCES "production_service_types"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "mfh_custom_profile_services_business_service_unique" UNIQUE("business_id","service_type_id"),
  CONSTRAINT "mfh_custom_profile_services_profile_service_unique" UNIQUE("profile_id","service_type_id")
);

CREATE INDEX IF NOT EXISTS "mfh_custom_production_profiles_business_idx"
  ON "mfh_custom_production_profiles" ("business_id");

CREATE INDEX IF NOT EXISTS "mfh_custom_profile_services_profile_idx"
  ON "mfh_custom_production_profile_services" ("profile_id");

CREATE INDEX IF NOT EXISTS "mfh_custom_profile_services_service_idx"
  ON "mfh_custom_production_profile_services" ("service_type_id");