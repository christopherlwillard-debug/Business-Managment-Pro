-- Add matched_sub_payment_id to bank_transactions (FK to sub_payment_records)
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS matched_sub_payment_id INTEGER
  REFERENCES sub_payment_records(id) ON DELETE SET NULL;

-- Junction table for one deposit → many invoices matching
CREATE TABLE IF NOT EXISTS bank_transaction_invoice_links (
  id SERIAL PRIMARY KEY,
  bank_transaction_id INTEGER NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btil_bank_transaction_id
  ON bank_transaction_invoice_links(bank_transaction_id);

CREATE INDEX IF NOT EXISTS idx_btil_invoice_id
  ON bank_transaction_invoice_links(invoice_id);
