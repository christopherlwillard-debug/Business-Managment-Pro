CREATE TABLE IF NOT EXISTS "website_form_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
	"site_slug" varchar(100) NOT NULL,
	"fields" jsonb DEFAULT '{}' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
