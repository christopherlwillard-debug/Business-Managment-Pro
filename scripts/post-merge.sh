#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Targeted pre-push fix: DB has mileage columns as boolean but schema expects integer.
# Cast them to integer so drizzle-kit push-force does not fail on type mismatch.
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  DO \\\$\\\$ BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'settings'
        AND column_name = 'mileage_auto_track'
        AND data_type = 'boolean'
    ) THEN
      ALTER TABLE settings
        ALTER COLUMN mileage_auto_track DROP DEFAULT,
        ALTER COLUMN mileage_battery_saving DROP DEFAULT;
      ALTER TABLE settings
        ALTER COLUMN mileage_auto_track TYPE integer
          USING (CASE WHEN mileage_auto_track THEN 1 ELSE 0 END),
        ALTER COLUMN mileage_battery_saving TYPE integer
          USING (CASE WHEN mileage_battery_saving THEN 1 ELSE 0 END);
      ALTER TABLE settings
        ALTER COLUMN mileage_auto_track SET DEFAULT 0,
        ALTER COLUMN mileage_battery_saving SET DEFAULT 0;
    END IF;
  END \\\$\\\$
\`).then(() => { console.log('Mileage column types aligned'); pool.end(); }).catch(e => { console.error('Column align error:', e.message); pool.end(); process.exit(1); });
")

pnpm --filter db push-force

# Idempotent hotfix: ensure daily_logs.author_name column exists (added in Task #35,
# migration failed on original post-merge run)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS author_name TEXT')
  .then(() => { console.log('daily_logs.author_name ensured'); pool.end(); })
  .catch(e => { console.error('author_name hotfix error:', e.message); pool.end(); process.exit(1); });
")

# Idempotent backfill: migrate legacy jobs.subcontractor_id → job_subcontractors
# Uses WHERE NOT EXISTS instead of ON CONFLICT to avoid needing a PK constraint.
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  INSERT INTO job_subcontractors (job_id, subcontractor_id)
  SELECT j.id, j.subcontractor_id FROM jobs j
  WHERE j.subcontractor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM job_subcontractors js
      WHERE js.job_id = j.id AND js.subcontractor_id = j.subcontractor_id
    )
\`).then(() => { console.log('Backfill done'); pool.end(); }).catch(e => { console.error('Backfill error:', e.message); pool.end(); process.exit(1); });
")
