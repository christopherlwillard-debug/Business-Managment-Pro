-- Migration 0053: move legacy owner-pay expense rows into the canonical
-- owner_capital_entries ledger without deleting financial history.
--
-- Rows already linked through owner_capital_entries.expense_id were created by
-- the previous dual-write path and must not be copied a second time.
INSERT INTO owner_capital_entries (
  business_id, job_id, date, description, amount, source, expense_id, created_at
)
SELECT
  COALESCE(e.business_id, j.business_id),
  e.job_id,
  e.date,
  COALESCE(NULLIF(TRIM(e.description), ''), 'Owner Pay'),
  -ABS(e.amount),
  'migrated_expense',
  e.id,
  COALESCE(e.created_at, NOW())
FROM expenses e
LEFT JOIN jobs j ON j.id = e.job_id
WHERE e.category IN ('Owner Draw', 'Owner Compensation', 'Owner Withdrawal', 'Owner Pay')
  AND e.voided_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM owner_capital_entries oce
    WHERE oce.expense_id = e.id
  );

-- Preserve the source rows for audit/history, but remove their accounting
-- effect so they cannot appear as operating expenses.
UPDATE expenses e
SET voided_at = COALESCE(e.voided_at, NOW()),
    void_reason = COALESCE(e.void_reason, 'Migrated to owner_capital_entries as owner pay'),
    exclude_from_net_profit = true
WHERE e.category IN ('Owner Draw', 'Owner Compensation', 'Owner Withdrawal', 'Owner Pay')
  AND e.voided_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM owner_capital_entries oce
    WHERE oce.expense_id = e.id
      AND oce.voided_at IS NULL
  );