CREATE TABLE IF NOT EXISTS "client_errors" (
  "id" serial PRIMARY KEY NOT NULL,
  "message" text NOT NULL,
  "stack" text,
  "component_stack" text,
  "location" text,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "count" integer DEFAULT 1 NOT NULL
);
