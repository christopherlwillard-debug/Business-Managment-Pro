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

# Idempotent migration: create other_income table (Task #55)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS \"other_income\" (
    \"id\" serial PRIMARY KEY NOT NULL,
    \"business_id\" text,
    \"amount\" numeric(12, 2) NOT NULL,
    \"date\" text NOT NULL,
    \"description\" text NOT NULL,
    \"source\" text,
    \"payment_method\" text NOT NULL DEFAULT 'other',
    \"notes\" text,
    \"created_at\" timestamp DEFAULT now() NOT NULL
  )
\`).then(() => { console.log('other_income table ensured'); pool.end(); })
  .catch(e => { console.error('other_income migration error:', e.message); pool.end(); process.exit(1); });
")

# Idempotent migration: create featured_clients table (Task #104)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS \"featured_clients\" (
    \"id\" serial PRIMARY KEY NOT NULL,
    \"name\" text NOT NULL,
    \"logo_url\" text,
    \"website_url\" text,
    \"sort_order\" integer DEFAULT 0,
    \"active\" boolean DEFAULT true NOT NULL,
    \"created_at\" timestamp DEFAULT now() NOT NULL
  )
\`).then(() => { console.log('featured_clients table ensured'); pool.end(); })
  .catch(e => { console.error('featured_clients migration error:', e.message); pool.end(); process.exit(1); });
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

# Task #110: add exclude_from_net_profit column to expenses
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE expenses ADD COLUMN IF NOT EXISTS exclude_from_net_profit boolean NOT NULL DEFAULT false')
  .then(() => { console.log('expenses.exclude_from_net_profit ensured'); pool.end(); })
  .catch(e => { console.error('exclude_from_net_profit migration error:', e.message); pool.end(); process.exit(1); });
")
