CREATE TABLE IF NOT EXISTS "plaid_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"item_id" text NOT NULL,
	"institution_id" text,
	"institution_name" text,
	"account_id" text,
	"account_name" text,
	"account_mask" text,
	"account_type" text,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plaid_connections_item_id_unique" UNIQUE("item_id")
);
