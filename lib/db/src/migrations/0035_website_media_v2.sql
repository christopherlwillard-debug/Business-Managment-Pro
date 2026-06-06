-- Media Library v2: folders + display names
-- Adds website_media_folders and website_media tables (folders, folderId FK, displayName)

CREATE TABLE IF NOT EXISTS "website_media_folders" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "name" varchar(100) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "website_media" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "filename" varchar(255) NOT NULL,
  "object_path" varchar(512) NOT NULL,
  "url" varchar(512) NOT NULL,
  "size" integer NOT NULL DEFAULT 0,
  "uploaded_at" timestamp DEFAULT now() NOT NULL,
  "folder_id" integer REFERENCES "website_media_folders"("id") ON DELETE SET NULL,
  "display_name" varchar(255)
);
