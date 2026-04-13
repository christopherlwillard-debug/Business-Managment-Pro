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

# Task #111: create route_stops table
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS \"route_stops\" (
    \"id\" serial PRIMARY KEY NOT NULL,
    \"title\" text,
    \"address\" text NOT NULL,
    \"lat\" double precision,
    \"lng\" double precision,
    \"notes\" text,
    \"scheduled_date\" text,
    \"status\" text NOT NULL DEFAULT 'prospect',
    \"estimated_duration_minutes\" integer DEFAULT 60,
    \"sort_order\" integer DEFAULT 0,
    \"created_at\" timestamp DEFAULT now() NOT NULL
  )
\`).then(() => { console.log('route_stops table ensured'); pool.end(); })
  .catch(e => { console.error('route_stops migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #121: create prospects table with check constraints
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS \"prospects\" (
    \"id\" serial PRIMARY KEY NOT NULL,
    \"address\" text NOT NULL,
    \"property_type\" text NOT NULL DEFAULT 'Other',
    \"estimated_sqft\" integer,
    \"rough_quote\" numeric(12, 2),
    \"contact_name\" text,
    \"contact_phone\" text,
    \"notes\" text,
    \"status\" text NOT NULL DEFAULT 'cold',
    \"linked_estimate_id\" integer REFERENCES estimates(id),
    \"created_at\" timestamp DEFAULT now() NOT NULL,
    \"updated_at\" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT prospects_status_check CHECK (status IN ('cold', 'contacted', 'quoted', 'won', 'lost')),
    CONSTRAINT prospects_property_type_check CHECK (property_type IN ('Church', 'Retail', 'Apartment', 'Industrial', 'Other'))
  )
\`).then(() => {
  console.log('prospects table ensured');
  return pool.query(\`
    ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_status_check;
    ALTER TABLE prospects ADD CONSTRAINT prospects_status_check
      CHECK (status IN ('cold', 'contacted', 'quoted', 'won', 'lost'));
    ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_property_type_check;
    ALTER TABLE prospects ADD CONSTRAINT prospects_property_type_check
      CHECK (property_type IN ('Church', 'Retail', 'Apartment', 'Industrial', 'Other'));
  \`);
}).then(() => { console.log('prospects constraints ensured'); pool.end(); })
  .catch(e => { console.error('prospects migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #114: create estimated_tax_payments table + add amount_due column (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS \"estimated_tax_payments\" (
    \"id\" serial PRIMARY KEY NOT NULL,
    \"year\" integer NOT NULL,
    \"quarter\" integer NOT NULL,
    \"level\" text NOT NULL DEFAULT 'federal',
    \"amount_due\" numeric(12, 2),
    \"amount_paid\" numeric(12, 2),
    \"paid_date\" text,
    \"payment_method\" text,
    \"notes\" text,
    \"created_at\" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT estimated_tax_payments_quarter_check CHECK (quarter BETWEEN 1 AND 4),
    CONSTRAINT estimated_tax_payments_level_check CHECK (level IN ('federal', 'state', 'combined'))
  );
  ALTER TABLE \"estimated_tax_payments\" ADD COLUMN IF NOT EXISTS \"amount_due\" numeric(12, 2);
\`).then(() => { console.log('estimated_tax_payments table ensured'); pool.end(); })
  .catch(e => { console.error('estimated_tax_payments migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #120: add business_line column to invoices and estimates
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS business_line text')
  .then(() => pool.query('ALTER TABLE estimates ADD COLUMN IF NOT EXISTS business_line text'))
  .then(() => { console.log('invoices.business_line and estimates.business_line ensured'); pool.end(); })
  .catch(e => { console.error('business_line migration error:', e.message); pool.end(); process.exit(1); });
")
