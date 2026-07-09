-- Migration: Make invoice_number nullable to support draft invoices without assigned numbers.
-- Draft invoices do not get a number until they are sent or otherwise transition out of draft.
-- This was applied to the dev database on 2026-07-09.
ALTER TABLE invoices ALTER COLUMN invoice_number DROP NOT NULL;
