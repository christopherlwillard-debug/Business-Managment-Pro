-- Task #1287: Separate "Save Changes" from "Review & Record Payment" on the Sub Payment screen
-- Adds five draft payroll columns to job_subcontractors so bonus, advancement, and payment
-- info can be persisted without creating a payment ledger entry. accrued_bonus is immediately
-- included in subLaborCost on the profit endpoints so job profitability is accurate before cash
-- changes hands.

ALTER TABLE "job_subcontractors"
  ADD COLUMN IF NOT EXISTS "accrued_bonus"           NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS "accrued_bonus_note"      TEXT,
  ADD COLUMN IF NOT EXISTS "accrued_advancement"     NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS "payment_method_draft"    TEXT,
  ADD COLUMN IF NOT EXISTS "payment_reference_draft" TEXT;
