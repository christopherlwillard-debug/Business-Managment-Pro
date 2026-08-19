-- Migration 0046: enforce one generated client/business mileage leg per job.
--
-- Generated mileage did not exist before this migration, but reconcile any
-- duplicate rows defensively so the unique index can be installed safely on
-- databases that received early builds of the feature.

-- Remove expenses linked only to an older duplicate generated row. Deleting
-- the expense first clears mileage_logs.expense_id through ON DELETE SET NULL.
WITH ranked AS (
  SELECT
    id,
    expense_id,
    ROW_NUMBER() OVER (
      PARTITION BY job_id, source
      ORDER BY id DESC
    ) AS row_number
  FROM mileage_logs
  WHERE job_id IS NOT NULL
    AND source IN ('job_client_route', 'job_business_route')
),
duplicate_expenses AS (
  SELECT id AS mileage_log_id, expense_id
  FROM ranked
  WHERE row_number > 1
    AND expense_id IS NOT NULL
)
DELETE FROM expenses AS expense
USING duplicate_expenses AS duplicate
WHERE expense.id = duplicate.expense_id
  AND NOT EXISTS (
    SELECT 1
    FROM mileage_logs AS other_log
    WHERE other_log.expense_id = expense.id
      AND other_log.id <> duplicate.mileage_log_id
  );

-- Keep the newest generated row for each job/source pair.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY job_id, source
      ORDER BY id DESC
    ) AS row_number
  FROM mileage_logs
  WHERE job_id IS NOT NULL
    AND source IN ('job_client_route', 'job_business_route')
)
DELETE FROM mileage_logs
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE row_number > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS mileage_logs_job_generated_source_unique
  ON mileage_logs (job_id, source)
  WHERE job_id IS NOT NULL
    AND source IN ('job_client_route', 'job_business_route');