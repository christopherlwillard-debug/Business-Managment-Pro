ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "plaid_transaction_id" text;
CREATE UNIQUE INDEX IF NOT EXISTS "bank_transactions_plaid_id_unique" ON "bank_transactions" ("plaid_transaction_id") WHERE "plaid_transaction_id" IS NOT NULL;
