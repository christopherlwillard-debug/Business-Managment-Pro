CREATE TABLE IF NOT EXISTS "square_payments" (
  "id" serial PRIMARY KEY NOT NULL,
  "square_payment_id" text NOT NULL UNIQUE,
  "amount_cents" integer NOT NULL,
  "description" text,
  "invoice_id" integer REFERENCES "invoices"("id"),
  "invoice_number" text,
  "client_name" text,
  "paid_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
