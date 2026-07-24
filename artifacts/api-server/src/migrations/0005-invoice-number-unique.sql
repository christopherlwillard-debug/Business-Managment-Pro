-- Migration: invoice number integrity
-- 1. Unique index prevents duplicate invoice numbers at the database level.
--    Partial (WHERE NOT NULL) so multiple unnumbered drafts can coexist.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_number_unique
  ON invoices(invoice_number)
  WHERE invoice_number IS NOT NULL;

-- 2. Renumber the invoice that was incorrectly assigned Wil-1038 to Wil-1036,
--    filling the first gap. The prefix is preserved — only the numeric suffix changes.
--    Guard: only match invoice numbers that end in exactly "1038" preceded by a non-digit
--    (avoids touching hypothetical numbers like Wil-11038).
UPDATE invoices
SET invoice_number = REGEXP_REPLACE(invoice_number, '1038$', '1036')
WHERE invoice_number ~ '[^0-9]1038$';

-- 3. Set the counter to 1037 so the next accepted invoice continues the sequence.
UPDATE settings
SET invoice_next_number = 1037;
