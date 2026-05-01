#!/bin/bash
set -e
pnpm install --frozen-lockfile

pnpm --filter @workspace/db run push-force </dev/null 2>&1 || true

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
      CHECK (status IN ('cold', 'contacted', 'quoted', 'won', 'serviced', 'lost'));
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

# Task #115: create bank_import_batches and bank_transactions tables
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS \"bank_import_batches\" (
    \"id\" serial PRIMARY KEY NOT NULL,
    \"account_name\" text NOT NULL,
    \"file_name\" text,
    \"row_count\" integer NOT NULL DEFAULT 0,
    \"imported_at\" timestamp DEFAULT now() NOT NULL,
    \"created_at\" timestamp DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS \"bank_transactions\" (
    \"id\" serial PRIMARY KEY NOT NULL,
    \"import_batch_id\" integer NOT NULL REFERENCES \"bank_import_batches\"(\"id\") ON DELETE CASCADE,
    \"date\" text NOT NULL,
    \"description\" text NOT NULL,
    \"amount\" numeric(12, 2) NOT NULL,
    \"transaction_type\" text NOT NULL,
    \"status\" text NOT NULL DEFAULT 'unmatched',
    \"matched_expense_id\" integer REFERENCES \"expenses\"(\"id\") ON DELETE SET NULL,
    \"matched_invoice_id\" integer REFERENCES \"invoices\"(\"id\") ON DELETE SET NULL,
    \"matched_other_income_id\" integer REFERENCES \"other_income\"(\"id\") ON DELETE SET NULL,
    \"suggested_match_type\" text,
    \"suggested_match_id\" integer,
    \"created_at\" timestamp DEFAULT now() NOT NULL
  )
\`).then(() => { console.log('bank reconciliation tables ensured'); pool.end(); })
  .catch(e => { console.error('bank reconciliation migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #116: create assets table
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS \"assets\" (
    \"id\" serial PRIMARY KEY NOT NULL,
    \"name\" text NOT NULL,
    \"asset_type\" text NOT NULL DEFAULT 'Other',
    \"purchase_date\" text NOT NULL,
    \"purchase_price\" numeric(12, 2) NOT NULL,
    \"vendor\" text,
    \"serial_number\" text,
    \"notes\" text,
    \"receipt_url\" text,
    \"section_179_eligible\" boolean NOT NULL DEFAULT false,
    \"status\" text NOT NULL DEFAULT 'active',
    \"sale_date\" text,
    \"sale_price\" numeric(12, 2),
    \"created_at\" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT assets_status_check CHECK (status IN ('active', 'sold', 'retired')),
    CONSTRAINT assets_type_check CHECK (asset_type IN ('Vehicle', 'Equipment', 'Tool', 'Trailer', 'Other'))
  )
\`).then(() => { console.log('assets table ensured'); pool.end(); })
  .catch(e => { console.error('assets migration error:', e.message); pool.end(); process.exit(1); });
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

# Task #118: add business_line column to expenses and other_income
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE expenses ADD COLUMN IF NOT EXISTS business_line text')
  .then(() => pool.query('ALTER TABLE other_income ADD COLUMN IF NOT EXISTS business_line text'))
  .then(() => { console.log('expenses.business_line and other_income.business_line ensured'); pool.end(); })
  .catch(e => { console.error('expenses/other_income business_line migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #123: add dba_logo_url column to settings
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE settings ADD COLUMN IF NOT EXISTS dba_logo_url text')
  .then(() => { console.log('settings.dba_logo_url ensured'); pool.end(); })
  .catch(e => { console.error('dba_logo_url migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #124: add business_line column to jobs
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS business_line text')
  .then(() => { console.log('jobs.business_line ensured'); pool.end(); })
  .catch(e => { console.error('jobs.business_line migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #125: add bottom_nav_items column to settings
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE settings ADD COLUMN IF NOT EXISTS bottom_nav_items text')
  .then(() => { console.log('settings.bottom_nav_items ensured'); pool.end(); })
  .catch(e => { console.error('bottom_nav_items migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #143: add compliance_notification_email and compliance_email_enabled columns to settings
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE settings ADD COLUMN IF NOT EXISTS compliance_notification_email text')
  .then(() => pool.query('ALTER TABLE settings ADD COLUMN IF NOT EXISTS compliance_email_enabled integer DEFAULT 1'))
  .then(() => { console.log('settings.compliance_notification_email and compliance_email_enabled ensured'); pool.end(); })
  .catch(e => { console.error('compliance email columns migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #171: add contact_email and follow_up_date columns to prospects
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS contact_email text')
  .then(() => pool.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS follow_up_date date'))
  .then(() => { console.log('prospects.contact_email and follow_up_date ensured'); pool.end(); })
  .catch(e => { console.error('prospects contact_email/follow_up_date migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #171: create prospect_events table for status history tracking
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS \"prospect_events\" (
    \"id\" serial PRIMARY KEY NOT NULL,
    \"prospect_id\" integer NOT NULL REFERENCES \"prospects\"(\"id\") ON DELETE CASCADE,
    \"type\" text NOT NULL DEFAULT 'status_change',
    \"old_value\" text,
    \"new_value\" text,
    \"created_at\" timestamp DEFAULT now() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS prospect_events_prospect_id_idx ON prospect_events (prospect_id);
  CREATE INDEX IF NOT EXISTS prospect_events_created_at_idx ON prospect_events (created_at);
\`).then(() => { console.log('prospect_events table and indexes ensured'); pool.end(); })
  .catch(e => { console.error('prospect_events migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #202: add serviced_at and follow_up_date columns to prospects; update status constraint
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS serviced_at date')
  .then(() => pool.query('ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_status_check'))
  .then(() => pool.query(\`ALTER TABLE prospects ADD CONSTRAINT prospects_status_check CHECK (status IN ('cold', 'contacted', 'quoted', 'won', 'serviced', 'lost'))\`))
  .then(() => { console.log('prospects.serviced_at and status constraint ensured'); pool.end(); })
  .catch(e => { console.error('prospects serviced_at migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #206: create prospect_service_visits table and backfill from servicedAt
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS prospect_service_visits (
    id SERIAL PRIMARY KEY,
    prospect_id INTEGER NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    serviced_at DATE NOT NULL,
    notes TEXT,
    price NUMERIC(12, 2),
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS psv_prospect_id_idx ON prospect_service_visits (prospect_id, serviced_at DESC);
  INSERT INTO prospect_service_visits (prospect_id, serviced_at, created_at)
  SELECT p.id, p.serviced_at::date, COALESCE(p.updated_at, p.created_at)
  FROM prospects p
  WHERE p.serviced_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM prospect_service_visits v WHERE v.prospect_id = p.id
    );
\`).then(() => { console.log('prospect_service_visits table ensured'); pool.end(); })
  .catch(e => { console.error('prospect_service_visits migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #190: add pay_token columns to invoices and quick_charges
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pay_token text')
  .then(() => pool.query('CREATE UNIQUE INDEX IF NOT EXISTS invoices_pay_token_unique ON invoices (pay_token) WHERE pay_token IS NOT NULL'))
  .then(() => pool.query('ALTER TABLE quick_charges ADD COLUMN IF NOT EXISTS pay_token text'))
  .then(() => pool.query('CREATE UNIQUE INDEX IF NOT EXISTS quick_charges_pay_token_unique ON quick_charges (pay_token) WHERE pay_token IS NOT NULL'))
  .then(() => { console.log('pay_token columns ensured'); pool.end(); })
  .catch(e => { console.error('pay_token migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #237: final idempotent fix — ensure prospects_status_check includes 'serviced'
# Earlier blocks re-applied the old constraint without 'serviced'; this block always wins.
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_status_check')
  .then(() => pool.query(\"ALTER TABLE prospects ADD CONSTRAINT prospects_status_check CHECK (status IN ('cold', 'contacted', 'quoted', 'won', 'serviced', 'lost'))\"))
  .then(() => { console.log('prospects_status_check (with serviced) ensured'); pool.end(); })
  .catch(e => { console.error('prospects_status_check fix error:', e.message); pool.end(); process.exit(1); });
")

# Task #238: add linked_invoice_id column to prospects (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS linked_invoice_id integer REFERENCES invoices(id) ON DELETE SET NULL')
  .then(() => { console.log('prospects.linked_invoice_id ensured'); pool.end(); })
  .catch(e => { console.error('linked_invoice_id migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #241: add Square payment columns to invoices, estimates, prospects, quick_charges (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS square_payment_link_id text')
  .then(() => pool.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS square_payment_link_url text'))
  .then(() => pool.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS square_paid_at timestamp'))
  .then(() => pool.query('ALTER TABLE estimates ADD COLUMN IF NOT EXISTS square_payment_link_id text'))
  .then(() => pool.query('ALTER TABLE estimates ADD COLUMN IF NOT EXISTS square_payment_link_url text'))
  .then(() => pool.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS square_payment_link_id text'))
  .then(() => pool.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS square_payment_link_url text'))
  .then(() => pool.query('ALTER TABLE quick_charges ADD COLUMN IF NOT EXISTS square_payment_link_id text'))
  .then(() => pool.query('ALTER TABLE quick_charges ADD COLUMN IF NOT EXISTS square_payment_link_url text'))
  .then(() => { console.log('Square payment columns ensured on all tables'); pool.end(); })
  .catch(e => { console.error('Square columns migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #258: add client_id column to other_income (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE other_income ADD COLUMN IF NOT EXISTS client_id integer REFERENCES clients(id) ON DELETE SET NULL')
  .then(() => { console.log('other_income.client_id ensured'); pool.end(); })
  .catch(e => { console.error('other_income.client_id migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #244: create square_payments table (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS square_payments (
    id serial PRIMARY KEY,
    square_payment_id text NOT NULL UNIQUE,
    amount_cents integer NOT NULL,
    description text,
    invoice_id integer REFERENCES invoices(id),
    invoice_number text,
    client_name text,
    paid_at timestamp DEFAULT now() NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL
  )
\`)
  .then(() => { console.log('square_payments table ensured'); pool.end(); })
  .catch(e => { console.error('square_payments migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #293: add measured_sq_ft column to prospects (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS measured_sq_ft integer')
  .then(() => { console.log('prospects.measured_sq_ft ensured'); pool.end(); })
  .catch(e => { console.error('measured_sq_ft migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #324: add square_customer_id column to clients (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE clients ADD COLUMN IF NOT EXISTS square_customer_id text')
  .then(() => { console.log('clients.square_customer_id ensured'); pool.end(); })
  .catch(e => { console.error('square_customer_id migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #333: add block_number and crew_label columns to route_stops (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS block_number integer')
  .then(() => pool.query('ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS crew_label text'))
  .then(() => { console.log('route_stops.block_number and crew_label ensured'); pool.end(); })
  .catch(e => { console.error('route_stops block columns migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #367: create asset_business_use table (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS asset_business_use (
    id serial PRIMARY KEY NOT NULL,
    asset_id integer NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    year integer NOT NULL,
    business_use_pct integer NOT NULL DEFAULT 100,
    created_at timestamp DEFAULT now() NOT NULL,
    CONSTRAINT asset_business_use_asset_year_unique UNIQUE (asset_id, year)
  )
\`)
  .then(() => { console.log('asset_business_use table ensured'); pool.end(); })
  .catch(e => { console.error('asset_business_use migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #389: drop estimated_amount column from jobs (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE jobs DROP COLUMN IF EXISTS estimated_amount')
  .then(() => { console.log('jobs.estimated_amount dropped'); pool.end(); })
  .catch(e => { console.error('drop estimated_amount error:', e.message); pool.end(); process.exit(1); });
")

# Task #391: drop actual_amount column from jobs (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE jobs DROP COLUMN IF EXISTS actual_amount')
  .then(() => { console.log('jobs.actual_amount dropped'); pool.end(); })
  .catch(e => { console.error('drop actual_amount error:', e.message); pool.end(); process.exit(1); });
")
