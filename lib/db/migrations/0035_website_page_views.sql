CREATE TABLE IF NOT EXISTS "website_page_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL,
	"viewed_at" timestamp DEFAULT now() NOT NULL,
	"device_type" varchar(10) DEFAULT 'desktop' NOT NULL
);

ALTER TABLE "website_page_views" ADD CONSTRAINT "website_page_views_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_website_page_views_business_id" ON "website_page_views" ("business_id");
CREATE INDEX IF NOT EXISTS "idx_website_page_views_viewed_at" ON "website_page_views" ("viewed_at");
