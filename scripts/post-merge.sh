#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Pre-push: idempotently align DB constraint names so drizzle-kit finds no diff
# (renames users_email_key → users_email_unique if old name still exists)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  DO \\\$\\\$
  DECLARE
    r RECORD;
    new_name TEXT;
  BEGIN
    FOR r IN
      SELECT conname, conrelid::regclass AS tablename
      FROM pg_constraint
      WHERE contype = 'u'
        AND conname LIKE '%_key'
        AND conrelid::regclass::text NOT LIKE 'pg\\_%'
    LOOP
      new_name := regexp_replace(r.conname, '_key\\\$', '_unique');
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = new_name) THEN
        EXECUTE format(
          'ALTER TABLE %s RENAME CONSTRAINT %I TO %I',
          r.tablename, r.conname, new_name
        );
      END IF;
    END LOOP;
  END \\\$\\\$
\`).then(() => { console.log('Constraint names aligned'); pool.end(); }).catch(e => { console.error('Pre-push error:', e.message); pool.end(); process.exit(1); });
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
# This inserts any (job_id, subcontractor_id) pairs that don't already exist.
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
