-- Task #92: Public marketing website
-- Creates portfolio_photos, inquiries, and services tables

CREATE TABLE IF NOT EXISTS "portfolio_photos" (
  "id" serial PRIMARY KEY NOT NULL,
  "url" text NOT NULL,
  "caption" text,
  "category" text,
  "sort_order" integer DEFAULT 0,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "inquiries" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "phone" text,
  "email" text,
  "service" text,
  "message" text,
  "best_time" text,
  "read" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "services" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "description" text,
  "icon" text,
  "price_display" text,
  "price_note" text,
  "whats_included" text,
  "add_ons" text,
  "sort_order" integer DEFAULT 0,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
