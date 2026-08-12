-- Personal to-do / task list for the dashboard.
-- businessId is nullable: NULL = platform-level task (government forms, API renewals, etc.)
-- Business-scoped tasks are filtered to the relevant business on the dashboard.

CREATE TABLE IF NOT EXISTS dashboard_tasks (
  id           SERIAL PRIMARY KEY,
  title        TEXT    NOT NULL,
  notes        TEXT,
  priority     TEXT    NOT NULL DEFAULT 'medium', -- 'high' | 'medium' | 'low'
  due_date     DATE,
  business_id  INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_tasks_completed
  ON dashboard_tasks (completed_at)
  WHERE completed_at IS NULL;

-- Seed the SAS-63 task. This is the one-time initial task for the user.
-- Seeded in the migration so it exists on first deploy and is never re-inserted.
INSERT INTO dashboard_tasks (title, priority, notes)
VALUES (
  'Complete Kentucky SAS-63 form for electronic vendor payments/deposit setup',
  'high',
  'Required by the state of Kentucky to receive electronic vendor payments and set up direct deposit. Contact the Finance Cabinet or check ky.gov for the form.'
);
