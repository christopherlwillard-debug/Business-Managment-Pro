CREATE TABLE IF NOT EXISTS "website_media_folders" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL,
  "name" varchar(100) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "website_media_folders" ADD CONSTRAINT "website_media_folders_business_id_businesses_id_fk"
  FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_website_media_folders_business_id" ON "website_media_folders" ("business_id");

ALTER TABLE "website_media"
  ADD COLUMN IF NOT EXISTS "folder_id" integer,
  ADD COLUMN IF NOT EXISTS "display_name" varchar(255);

ALTER TABLE "website_media" ADD CONSTRAINT "website_media_folder_id_fk"
  FOREIGN KEY ("folder_id") REFERENCES "public"."website_media_folders"("id") ON DELETE set null ON UPDATE no action;
