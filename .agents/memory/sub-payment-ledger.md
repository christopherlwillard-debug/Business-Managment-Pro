---
name: Sub Payment Ledger
description: Architecture of sub_payment_records table, its relationship to expenses, and portal read paths
---

# Sub Payment Ledger Architecture

## Rule
`sub_payment_records` is the canonical ledger for all payments made to subcontractors via pay-worker. Portal income-report and tax-report read from this table, not from `expenses`.

**Why:** pay-worker was inserting into `expenses` causing double-counting in P&L (expenses table is also used for job costs). Phase 1 creates a dedicated ledger with dual-write; Phase 2 (future) removes the expense insert.

**How to apply:**
- Pay-worker (jobs.ts) inserts into BOTH `expensesTable` (backward-compat) AND `subPaymentRecordsTable` (Phase 1 dual-write)
- Portal `/income-report` reads `subPaymentRecordsTable` (source="ledger") + `paymentsTable` (source="payment") — NOT expenses
- Portal `/tax-report` qualifyingIncome = paymentsTable sum + subPaymentRecordsTable sum (NOT expenses WHERE category=subcontractor)
- DDL applied directly via psql (drizzle push needs interactive TTY)
- Schema at `lib/db/src/schema/sub-payment-records.ts`, exported from `lib/db/src/schema/index.ts`
- Key columns: job_id (NOT NULL), subcontractor_id (NOT NULL), amount, payment_date (TEXT YYYY-MM-DD), idempotency_key (UNIQUE nullable), agreed_owed_snapshot, created_from DEFAULT 'pay-worker'

## Phase 2 (future)
Remove `expensesTable` insert from pay-worker once sub_payment_records reads have been stable for a release cycle.
