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

# Invoice lifecycle columns: accepted_at, sent_at, sent_method
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ')
  .then(() => pool.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ'))
  .then(() => pool.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_method TEXT'))
  .then(() => { console.log('invoice lifecycle columns ensured'); pool.end(); })
  .catch(e => { console.error('invoice lifecycle columns migration error:', e.message); pool.end(); process.exit(1); });
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

# Task #423: add expense_id FK to mileage_logs (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE mileage_logs ADD COLUMN IF NOT EXISTS expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL')
  .then(() => { console.log('mileage_logs.expense_id ensured'); pool.end(); })
  .catch(e => { console.error('mileage_logs.expense_id migration error:', e.message); pool.end(); process.exit(1); });
")

# Tasks #111+: add job_id, client_id, prospect_id FKs to route_stops (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL')
  .then(() => pool.query('ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL'))
  .then(() => pool.query('ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS prospect_id INTEGER REFERENCES prospects(id) ON DELETE SET NULL'))
  .then(() => { console.log('route_stops FK columns ensured'); pool.end(); })
  .catch(e => { console.error('route_stops FK columns migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #427: add reminder_opt_out column to clients (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE clients ADD COLUMN IF NOT EXISTS reminder_opt_out boolean NOT NULL DEFAULT false')
  .then(() => { console.log('clients.reminder_opt_out ensured'); pool.end(); })
  .catch(e => { console.error('reminder_opt_out migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #465: add Plaid balance cache columns to plaid_connections (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE plaid_connections ADD COLUMN IF NOT EXISTS cached_balance_current numeric')
  .then(() => pool.query('ALTER TABLE plaid_connections ADD COLUMN IF NOT EXISTS cached_balance_available numeric'))
  .then(() => pool.query('ALTER TABLE plaid_connections ADD COLUMN IF NOT EXISTS cached_balance_currency text'))
  .then(() => pool.query('ALTER TABLE plaid_connections ADD COLUMN IF NOT EXISTS balance_cached_at timestamp'))
  .then(() => { console.log('plaid_connections balance cache columns ensured'); pool.end(); })
  .catch(e => { console.error('plaid balance cache migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #470: create bid_opportunities table (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS bid_opportunities (
    id serial PRIMARY KEY NOT NULL,
    notice_id text NOT NULL UNIQUE,
    title text NOT NULL,
    agency text,
    naics_code text,
    description text,
    posted_date text,
    response_deadline text,
    url text,
    status text NOT NULL DEFAULT 'new',
    created_at timestamp DEFAULT now() NOT NULL
  )
\`).then(() => { console.log('bid_opportunities table ensured'); pool.end(); })
  .catch(e => { console.error('bid_opportunities migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #473: add source and source_label columns to bid_opportunities (idempotent; must run after #470)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT \'federal\'')
  .then(() => pool.query('ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS source_label text'))
  .then(() => { console.log('bid_opportunities source columns ensured'); pool.end(); })
  .catch(e => { console.error('bid_opportunities source migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #474: add ai_summary and ai_summary_at columns to bid_opportunities (idempotent; must run after #473)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS ai_summary jsonb')
  .then(() => pool.query('ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS ai_summary_at timestamp'))
  .then(() => { console.log('bid_opportunities ai_summary columns ensured'); pool.end(); })
  .catch(e => { console.error('bid_opportunities ai_summary migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #744: add stage and notes columns to bid_opportunities (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS stage text')
  .then(() => pool.query('ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS notes text'))
  .then(() => pool.query(\`UPDATE bid_opportunities SET stage = 'reviewing' WHERE status = 'interested' AND stage IS NULL\`))
  .then(() => pool.query(\`UPDATE bid_opportunities SET stage = 'no_bid' WHERE status = 'dismissed' AND stage IS NULL\`))
  .then(() => pool.query(\`UPDATE bid_opportunities SET stage = 'new' WHERE stage IS NULL\`))
  .then(() => pool.query(\`ALTER TABLE bid_opportunities ALTER COLUMN stage SET DEFAULT 'new'\`))
  .then(() => pool.query(\`ALTER TABLE bid_opportunities ALTER COLUMN stage SET NOT NULL\`))
  .then(() => { console.log('bid_opportunities pipeline columns ensured'); pool.end(); })
  .catch(e => { console.error('bid_opportunities pipeline migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #560: add phases JSONB column to jobs (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS phases jsonb')
  .then(() => { console.log('jobs.phases column ensured'); pool.end(); })
  .catch(e => { console.error('jobs phases migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #565: add permit_checklist JSONB column to jobs (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS permit_checklist jsonb')
  .then(() => { console.log('jobs.permit_checklist column ensured'); pool.end(); })
  .catch(e => { console.error('jobs permit_checklist migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #559: create contacts table (address book, idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT,
    type TEXT,
    title TEXT,
    phone TEXT,
    fax TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
\`).then(() => { console.log('contacts table ensured'); pool.end(); })
  .catch(e => { console.error('contacts migration error:', e.message); pool.end(); process.exit(1); });
")

# Idempotent migration: add job_sub_hours_id to expenses (auto-expense from sub hours)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE expenses ADD COLUMN IF NOT EXISTS job_sub_hours_id integer REFERENCES job_sub_hours(id) ON DELETE SET NULL')
  .then(() => { console.log('expenses.job_sub_hours_id ensured'); pool.end(); })
  .catch(e => { console.error('job_sub_hours_id migration error:', e.message); pool.end(); process.exit(1); });
")

# Idempotent migration: create website_media table for media library
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS website_media (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    object_path VARCHAR(512) NOT NULL,
    url VARCHAR(512) NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
\`).then(() => { console.log('website_media table ensured'); pool.end(); })
  .catch(e => { console.error('website_media migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #752: create deposit_submissions table for website payment form (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS deposit_submissions (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    site_config_id INTEGER REFERENCES website_configs(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50),
    customer_notes TEXT,
    amount NUMERIC(12,2) NOT NULL,
    square_checkout_id VARCHAR(255),
    square_checkout_url VARCHAR(1024),
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
\`).then(() => { console.log('deposit_submissions table ensured'); pool.end(); })
  .catch(e => { console.error('deposit_submissions migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #775/#783: create client_errors table for crash reporting (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS client_errors (
    id serial PRIMARY KEY NOT NULL,
    message text NOT NULL,
    stack text,
    component_stack text,
    location text,
    user_agent text,
    created_at timestamp DEFAULT now() NOT NULL,
    count integer DEFAULT 1 NOT NULL
  )
\`).then(() => { console.log('client_errors table ensured'); pool.end(); })
  .catch(e => { console.error('client_errors migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #929: create checklist template tables (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS checklist_templates (
    id serial PRIMARY KEY NOT NULL,
    name text NOT NULL,
    category text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamp DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS checklist_template_sections (
    id serial PRIMARY KEY NOT NULL,
    template_id integer NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
    name text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS checklist_template_items (
    id serial PRIMARY KEY NOT NULL,
    section_id integer NOT NULL REFERENCES checklist_template_sections(id) ON DELETE CASCADE,
    title text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS job_checklists (
    id serial PRIMARY KEY NOT NULL,
    job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    template_id integer REFERENCES checklist_templates(id) ON DELETE SET NULL,
    template_name text NOT NULL,
    share_token text NOT NULL UNIQUE,
    share_enabled boolean NOT NULL DEFAULT true,
    status_override text,
    public_notes text,
    updated_at timestamp DEFAULT now() NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS job_checklist_sections (
    id serial PRIMARY KEY NOT NULL,
    job_checklist_id integer NOT NULL REFERENCES job_checklists(id) ON DELETE CASCADE,
    template_section_id integer,
    name text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    notes text,
    sort_order integer NOT NULL DEFAULT 0,
    percent_complete numeric(5,2) NOT NULL DEFAULT 0,
    completed_at timestamp
  );
  CREATE TABLE IF NOT EXISTS job_checklist_items (
    id serial PRIMARY KEY NOT NULL,
    job_checklist_id integer NOT NULL REFERENCES job_checklists(id) ON DELETE CASCADE,
    job_checklist_section_id integer NOT NULL REFERENCES job_checklist_sections(id) ON DELETE CASCADE,
    title text NOT NULL,
    completed boolean NOT NULL DEFAULT false,
    completed_at timestamp,
    completed_by_user_id text,
    completed_by_name text,
    skipped boolean NOT NULL DEFAULT false,
    skipped_at timestamp,
    notes text,
    sort_order integer NOT NULL DEFAULT 0
  );
\`).then(() => { console.log('checklist tables ensured'); pool.end(); })
  .catch(e => { console.error('checklist tables migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #940: seed Manufactured Home Trim-Out checklist template via API endpoint.
# The endpoint is idempotent — no-op if templates already exist.
# Use --max-time and --connect-timeout so curl never hangs when the API server isn't up.
# The whole block is || true — a missing server is not fatal for post-merge setup.
SEED_API_BASE="${API_BASE_URL:-http://localhost:8080}"
echo "Seeding checklist templates via ${SEED_API_BASE}/api/admin/migrations/seed-checklist-templates ..."
SEED_RESPONSE=$(curl -s --max-time 10 --connect-timeout 5 \
  -X POST "${SEED_API_BASE}/api/admin/migrations/seed-checklist-templates" \
  -H "x-migration-key: ${MIGRATION_KEY}" \
  -H "Content-Type: application/json") || SEED_RESPONSE=""
echo "Seed response: ${SEED_RESPONSE}"
if echo "${SEED_RESPONSE}" | grep -q '"error"'; then
  echo "Warning: checklist template seed returned an error — check logs. Continuing." >&2
fi

# Tasks #1101-#1104: checklist upgrades — start_notes column, new tables
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE job_checklists ADD COLUMN IF NOT EXISTS start_notes text')
  .then(() => pool.query(\`
    CREATE TABLE IF NOT EXISTS job_start_photos (
      id serial PRIMARY KEY NOT NULL,
      job_checklist_id integer NOT NULL REFERENCES job_checklists(id) ON DELETE CASCADE,
      object_path text NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    )
  \`))
  .then(() => pool.query(\`
    CREATE TABLE IF NOT EXISTS job_checklist_status_log (
      id serial PRIMARY KEY NOT NULL,
      job_checklist_id integer NOT NULL REFERENCES job_checklists(id) ON DELETE CASCADE,
      status text NOT NULL,
      started_at timestamp DEFAULT now() NOT NULL,
      ended_at timestamp,
      duration_min integer
    )
  \`))
  .then(() => pool.query(\`
    CREATE TABLE IF NOT EXISTS job_checklist_section_notes (
      id serial PRIMARY KEY NOT NULL,
      job_checklist_section_id integer NOT NULL REFERENCES job_checklist_sections(id) ON DELETE CASCADE,
      author_name text NOT NULL DEFAULT '',
      note text NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    )
  \`))
  .then(() => { console.log('checklist upgrade tables/columns ensured'); pool.end(); })
  .catch(e => { console.error('checklist upgrade migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #1107: create growth_fund_deployments table (idempotent)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS growth_fund_deployments (
    id serial PRIMARY KEY NOT NULL,
    business_id integer,
    created_by text,
    date text NOT NULL,
    description text NOT NULL,
    amount numeric(12, 2) NOT NULL,
    notes text,
    created_at timestamp DEFAULT now() NOT NULL
  )
\`).then(() => { console.log('growth_fund_deployments table ensured'); pool.end(); })
  .catch(e => { console.error('growth_fund_deployments migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #1142: add active column to mfh_models (missing from migration 0044 which only added it to mfh_manufacturers)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE mfh_models ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true')
  .then(() => { console.log('mfh_models.active ensured'); pool.end(); })
  .catch(e => { console.error('mfh_models.active migration error:', e.message); pool.end(); process.exit(1); });
")

# Task #1144: create business_trips table and add trip columns to expenses
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS business_trips (
    id SERIAL PRIMARY KEY,
    destination text NOT NULL,
    business_purpose text,
    start_date text,
    end_date text,
    job_id integer REFERENCES jobs(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'open',
    closed_at timestamptz,
    closed_by text,
    created_at timestamp NOT NULL DEFAULT now()
  )
\`).then(() => {
  return pool.query(\`
    ALTER TABLE expenses
      ADD COLUMN IF NOT EXISTS trip_id integer REFERENCES business_trips(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS overnight_travel boolean,
      ADD COLUMN IF NOT EXISTS is_potentially_nondeductible boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS meal_total numeric(12,2),
      ADD COLUMN IF NOT EXISTS deductible_amount numeric(12,2),
      ADD COLUMN IF NOT EXISTS non_deductible_amount numeric(12,2),
      ADD COLUMN IF NOT EXISTS tip_amount numeric(12,2),
      ADD COLUMN IF NOT EXISTS tax_amount numeric(12,2),
      ADD COLUMN IF NOT EXISTS num_people integer,
      ADD COLUMN IF NOT EXISTS paid_by text,
      ADD COLUMN IF NOT EXISTS receipt_status text DEFAULT 'uploaded',
      ADD COLUMN IF NOT EXISTS receipt_missing_explanation text
  \`);
}).then(() => { console.log('business_trips and expense trip columns ensured'); pool.end(); })
  .catch(e => { console.error('business_trips migration error:', e.message); pool.end(); process.exit(1); });
")

# Add CHECK constraints for business_trips status and expenses receipt_status
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  ALTER TABLE business_trips DROP CONSTRAINT IF EXISTS business_trips_status_check;
  ALTER TABLE business_trips ADD CONSTRAINT business_trips_status_check CHECK (status IN ('open', 'completed', 'archived'));
\`).then(() => pool.query(\`
  ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_receipt_status_check;
  ALTER TABLE expenses ADD CONSTRAINT expenses_receipt_status_check CHECK (receipt_status IN ('uploaded', 'missing'));
\`)).then(() => { console.log('DB check constraints applied'); pool.end(); })
  .catch(e => { console.error('constraint migration error:', e.message); pool.end(); });
")

# Investment tracking tables (Task #1253)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS investment_accounts (
    id SERIAL PRIMARY KEY,
    business_id INTEGER,
    name TEXT NOT NULL,
    institution TEXT,
    account_type TEXT NOT NULL DEFAULT 'Brokerage',
    business_or_personal TEXT NOT NULL DEFAULT 'business',
    active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    plaid_account_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS investment_transfers (
    id SERIAL PRIMARY KEY,
    business_id INTEGER,
    investment_account_id INTEGER NOT NULL REFERENCES investment_accounts(id) ON DELETE CASCADE,
    transfer_type TEXT NOT NULL DEFAULT 'deposit',
    date DATE NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    source_bank_account TEXT,
    notes TEXT,
    bank_transaction_id INTEGER REFERENCES bank_transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS investment_account_valuations (
    id SERIAL PRIMARY KEY,
    investment_account_id INTEGER NOT NULL REFERENCES investment_accounts(id) ON DELETE CASCADE,
    portfolio_value NUMERIC(14,2) NOT NULL,
    valuation_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS investment_tax_documents (
    id SERIAL PRIMARY KEY,
    investment_account_id INTEGER NOT NULL REFERENCES investment_accounts(id) ON DELETE CASCADE,
    tax_year INTEGER NOT NULL,
    document_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    object_path TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
  ALTER TABLE bank_transactions
    ADD COLUMN IF NOT EXISTS investment_transfer_id INTEGER REFERENCES investment_transfers(id) ON DELETE SET NULL;
  ALTER TABLE investment_accounts
    ALTER COLUMN business_id DROP NOT NULL;
\`).then(() => { console.log('Investment tables ensured'); pool.end(); })
  .catch(e => { console.error('Investment migration error:', e.message); pool.end(); });
")


# Idempotent: add measured_sq_ft to prospects table (schema added but migration never ran)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS measured_sq_ft INTEGER')
  .then(() => { console.log('prospects.measured_sq_ft ensured'); pool.end(); })
  .catch(e => { console.error('measured_sq_ft hotfix error:', e.message); pool.end(); });
")

# Idempotent: add active column to mfh_models table (schema added but migration never ran in prod)
(cd lib/db && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE mfh_models ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true')
  .then(() => { console.log('mfh_models.active ensured'); pool.end(); })
  .catch(e => { console.error('mfh_models.active hotfix error:', e.message); pool.end(); });
")
