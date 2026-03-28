#!/bin/bash
set -e
pnpm install --frozen-lockfile

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
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  INSERT INTO job_subcontractors (job_id, subcontractor_id)
  SELECT id, subcontractor_id FROM jobs
  WHERE subcontractor_id IS NOT NULL
  ON CONFLICT (job_id, subcontractor_id) DO NOTHING
\`).then(() => pool.end()).catch(e => { console.error('Backfill error:', e.message); pool.end(); process.exit(1); });
")

# Idempotent migration: add 'invited' to access_requests status check constraint (Task #54)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  ALTER TABLE access_requests DROP CONSTRAINT IF EXISTS access_requests_status_check;
  ALTER TABLE access_requests ADD CONSTRAINT access_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'invited'));
\`).then(() => { console.log('access_requests_status_check updated'); pool.end(); })
  .catch(e => { console.error('Status constraint migration error:', e.message); pool.end(); process.exit(1); });
")
