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

# Idempotent fix: cast mileage_auto_track to integer with explicit USING clause
# (drizzle-kit push cannot handle type change without explicit cast on existing data)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\"SELECT data_type FROM information_schema.columns WHERE table_name='settings' AND column_name='mileage_auto_track'\")
  .then(r => {
    const dtype = r.rows[0] && r.rows[0].data_type;
    if (dtype === 'integer') { console.log('mileage_auto_track already integer, skipping'); pool.end(); return; }
    return pool.query('ALTER TABLE settings ALTER COLUMN mileage_auto_track TYPE integer USING mileage_auto_track::integer')
      .then(() => { console.log('mileage_auto_track cast to integer'); pool.end(); });
  })
  .catch(e => { console.error('mileage_auto_track cast error:', e.message); pool.end(); process.exit(1); });
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
