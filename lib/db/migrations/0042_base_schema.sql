-- Migration 0042: Explicit creation of all original base tables.
--
-- These tables were originally created by `drizzle-kit push --force` before
-- explicit migration tracking began. This file makes every base table
-- creation idempotent and machine-readable so that:
--   1. A completely fresh database can be built from migrations alone.
--   2. The Replit Publish validator never needs to call drizzle-kit push.
--
-- All statements use IF NOT EXISTS / IF NOT EXISTS guards so this file is
-- safe to re-run on any environment, including production.
--
-- Architectural rule: never rename or restructure production tables via
-- automatic schema inference. All renames must be explicit migrations.

-- ── Auth ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  sid     varchar   PRIMARY KEY,
  sess    jsonb     NOT NULL,
  expire  timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);

CREATE TABLE IF NOT EXISTS users (
  id                varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
  email             varchar   UNIQUE,
  first_name        varchar,
  last_name         varchar,
  profile_image_url varchar,
  created_at        timestamp with time zone NOT NULL DEFAULT now(),
  updated_at        timestamp with time zone NOT NULL DEFAULT now()
);

-- ── Access Requests ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS access_requests (
  id                  serial    PRIMARY KEY,
  user_id             text      NOT NULL,
  user_name           text      NOT NULL DEFAULT '',
  user_email          text,
  profile_image_url   text,
  status              text      NOT NULL DEFAULT 'pending',
  permissions         jsonb,
  requested_at        timestamp NOT NULL DEFAULT now(),
  resolved_at         timestamp,
  CONSTRAINT access_requests_user_id_unique UNIQUE (user_id),
  CONSTRAINT access_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'invited'))
);

-- ── Businesses ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS businesses (
  id               serial   PRIMARY KEY,
  name             text     NOT NULL,
  slug             text     NOT NULL UNIQUE,
  type             text     NOT NULL DEFAULT 'other',
  logo_url         text,
  address          text,
  city             text,
  state            text,
  zip              text,
  phone            text,
  email            text,
  license_number   text,
  tax_id           text,
  sort_order       integer  NOT NULL DEFAULT 0,
  enabled_features jsonb,
  parent_business_id integer,
  created_at       timestamp NOT NULL DEFAULT now()
);

-- ── Settings ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
  id                             serial    PRIMARY KEY,
  company_name                   text,
  company_address                text,
  company_city                   text,
  company_state                  text,
  company_zip                    text,
  company_phone                  text,
  company_email                  text,
  logo_url                       text,
  dba_logo_url                   text,
  default_tax_rate               numeric(5, 2),
  default_payment_terms          text,
  late_fee_percent               numeric(5, 2),
  invoice_prefix                 text,
  invoice_next_number            integer   DEFAULT 1001,
  mileage_rate                   numeric(5, 3) DEFAULT '0.725',
  currency                       text      DEFAULT 'USD',
  enabled_features               jsonb     DEFAULT '["invoices","expenses","mileage","estimates","subcontractors","daily_logs","compliance","clients"]',
  threshold_amount_1099          numeric(10, 2) DEFAULT '600',
  entity_type                    text,
  ein                            text,
  invoice_logo_position          text      DEFAULT 'top-left',
  invoice_logo_size              text      DEFAULT 'medium',
  smtp_host                      text,
  smtp_port                      text      DEFAULT '587',
  smtp_user                      text,
  smtp_pass                      text,
  smtp_secure                    integer   DEFAULT 0,
  mileage_default_classification text      DEFAULT 'business',
  mileage_units                  text      DEFAULT 'miles',
  mileage_reminder_frequency     text      DEFAULT 'daily',
  bottom_nav_items               text,
  compliance_notification_email  text,
  compliance_email_enabled       integer   DEFAULT 1,
  invoice_reminder_enabled       integer   DEFAULT 1,
  invoice_reminder_day1          integer   DEFAULT 7,
  invoice_reminder_day2          integer   DEFAULT 14,
  tax_filing_frequency           text      DEFAULT 'quarterly',
  calculator_defaults            jsonb,
  quick_links                    jsonb,
  signature_image                text,
  owner_user_id                  text,
  created_at                     timestamp NOT NULL DEFAULT now(),
  updated_at                     timestamp NOT NULL DEFAULT now()
);

-- ── Clients ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clients (
  id                      serial    PRIMARY KEY,
  name                    text      NOT NULL,
  email                   text,
  phone                   text,
  address                 text,
  city                    text,
  state                   text,
  zip                     text,
  notes                   text,
  next_service_date       date,
  service_interval_months integer,
  business_line           text,
  square_customer_id      text,
  reminder_opt_out        boolean   NOT NULL DEFAULT false,
  created_at              timestamp NOT NULL DEFAULT now()
);

-- ── Subcontractors ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subcontractors (
  id                    serial    PRIMARY KEY,
  name                  text      NOT NULL,
  email                 text,
  phone                 text,
  trade                 text,
  license_number        text,
  license_expiry        text,
  insurance_expiry      text,
  w9_on_file            boolean   NOT NULL DEFAULT false,
  ytd_payments          numeric(12, 2) NOT NULL DEFAULT '0',
  address               text,
  notes                 text,
  portal_token          text      UNIQUE,
  portal_approved       boolean   NOT NULL DEFAULT false,
  w9_legal_name         text,
  w9_business_name      text,
  w9_tax_classification text,
  w9_llc_type           text,
  w9_address            text,
  w9_city               text,
  w9_state              text,
  w9_zip                text,
  w9_tax_id_type        text,
  w9_tax_id             text,
  w9_signature          text,
  w9_signed_at          text,
  portal_features       jsonb     DEFAULT '["payments","income_report","jobs","expenses","mileage","w9","tax_reports","home_office"]',
  portal_pin_hash       text,
  portal_pin_attempts   integer   NOT NULL DEFAULT 0,
  portal_pin_locked_until timestamp,
  pay_rate              numeric(10, 2),
  pay_type              text      DEFAULT 'hourly',
  role                  text      NOT NULL DEFAULT 'hourly',
  growth_pct            numeric(5, 4) NOT NULL DEFAULT '0',
  created_at            timestamp NOT NULL DEFAULT now()
);

-- ── Jobs ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jobs (
  id                 serial    PRIMARY KEY,
  title              text      NOT NULL,
  description        text,
  client_id          integer   REFERENCES clients(id),
  subcontractor_id   integer   REFERENCES subcontractors(id),
  status             text      NOT NULL DEFAULT 'scheduled',
  job_type           text,
  address            text,
  city               text,
  state              text,
  start_date         text,
  end_date           text,
  location_name      text,
  notes              text,
  business_line      text,
  sub_paid           boolean   NOT NULL DEFAULT false,
  sq_ft              integer,
  coats              smallint  DEFAULT 1,
  phases             jsonb,
  permit_checklist   jsonb,
  home_model         text,
  mfh_series_id      integer,
  mfh_model_id       integer,
  mfh_model_year     integer,
  mfh_dealer_price   numeric(12, 2),
  mfh_quoted_price   numeric(12, 2),
  mfh_guide_name     text,
  mfh_selected_addons jsonb,
  mfh_travel_days    integer,
  closed_at          date,
  job_number         integer,
  owner_pay_included boolean   NOT NULL DEFAULT true,
  created_at         timestamp NOT NULL DEFAULT now()
);

-- ── Job Subcontractors ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_subcontractors (
  job_id              integer   NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  subcontractor_id    integer   NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  amount_owed         numeric(12, 2),
  amount_paid         numeric(12, 2),
  paid_date           text,
  paid_notes          text,
  compensation_type   text      NOT NULL DEFAULT 'hourly',
  hourly_rate         numeric(10, 2),
  fixed_amount        numeric(10, 2),
  allocation_pct      numeric(5, 2),
  payment_status      text      NOT NULL DEFAULT 'unpaid',
  paid_at             timestamp,
  last_paid_at        timestamp,
  PRIMARY KEY (job_id, subcontractor_id)
);

-- ── Legacy Subcontractor Payments ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id              serial    PRIMARY KEY,
  subcontractor_id integer  REFERENCES subcontractors(id),
  amount          numeric(12, 2) NOT NULL,
  payment_date    text      NOT NULL,
  year            integer   NOT NULL,
  description     text,
  invoice_number  text,
  notes           text,
  payment_method  text,
  created_at      timestamp NOT NULL DEFAULT now()
);

-- ── Recurring Expenses ────────────────────────────────────────────────────────
-- (placed here because expenses FK references it)

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id            serial    PRIMARY KEY,
  description   text      NOT NULL,
  amount        numeric(12, 2) NOT NULL,
  category      text      NOT NULL,
  vendor        text,
  job_id        integer   REFERENCES jobs(id),
  notes         text,
  frequency     text      NOT NULL,
  start_date    text      NOT NULL,
  end_date      text,
  next_due_date text      NOT NULL,
  active        boolean   NOT NULL DEFAULT true,
  business_id   integer,
  created_at    timestamp NOT NULL DEFAULT now()
);

-- ── Expenses ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expenses (
  id                     serial    PRIMARY KEY,
  description            text      NOT NULL,
  amount                 numeric(12, 2) NOT NULL,
  category               text      NOT NULL,
  date                   text      NOT NULL,
  vendor                 text,
  job_id                 integer   REFERENCES jobs(id),
  subcontractor_id       integer,
  receipt_url            text,
  notes                  text,
  recurring_expense_id   integer   REFERENCES recurring_expenses(id) ON DELETE SET NULL,
  exclude_from_net_profit boolean  NOT NULL DEFAULT false,
  business_line          text,
  business_id            integer,
  job_sub_hours_id       integer,
  created_at             timestamp NOT NULL DEFAULT now()
);

-- ── Invoices ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id                      serial    PRIMARY KEY,
  invoice_number          text      NOT NULL UNIQUE,
  client_id               integer   REFERENCES clients(id),
  job_id                  integer   REFERENCES jobs(id),
  status                  text      NOT NULL DEFAULT 'draft',
  issue_date              text      NOT NULL,
  due_date                text,
  subtotal                numeric(12, 2) NOT NULL DEFAULT '0',
  tax_rate                numeric(5, 2),
  tax_amount              numeric(12, 2),
  total                   numeric(12, 2) NOT NULL DEFAULT '0',
  amount_paid             numeric(12, 2),
  location_name           text,
  city                    text,
  state                   text,
  notes                   text,
  terms                   text,
  line_items              jsonb     DEFAULT '[]',
  attachments             jsonb     DEFAULT '[]',
  business_line           text,
  stripe_payment_link_id  text,
  stripe_payment_link_url text,
  stripe_payment_intent_id text,
  stripe_paid_at          timestamp,
  square_payment_link_id  text,
  square_payment_link_url text,
  square_paid_at          timestamp,
  pay_token               text      UNIQUE,
  reminders_sent_at       jsonb     DEFAULT '[]',
  created_at              timestamp NOT NULL DEFAULT now()
);

-- ── Estimates ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS estimates (
  id                      serial    PRIMARY KEY,
  title                   text      NOT NULL,
  client_id               integer   REFERENCES clients(id),
  template                text,
  status                  text      NOT NULL DEFAULT 'draft',
  subtotal                numeric(12, 2) NOT NULL DEFAULT '0',
  markup_percent          numeric(5, 2),
  contingency_percent     numeric(5, 2),
  total                   numeric(12, 2) NOT NULL DEFAULT '0',
  job_type                text,
  notes                   text,
  line_items              jsonb     DEFAULT '[]',
  job_id                  integer   REFERENCES jobs(id),
  business_line           text,
  stripe_payment_link_id  text,
  stripe_payment_link_url text,
  square_payment_link_id  text,
  square_payment_link_url text,
  deposit_paid_at         timestamp,
  deposit_paid_amount     numeric(12, 2),
  mfh_dealer_price        numeric(12, 2),
  mfh_quoted_price        numeric(12, 2),
  mfh_guide_name          text,
  created_at              timestamp NOT NULL DEFAULT now()
);

-- ── Quick Charges ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quick_charges (
  id                       serial    PRIMARY KEY,
  label                    text      NOT NULL,
  amount                   numeric(12, 2) NOT NULL,
  customer_name            text,
  customer_email           text,
  notes                    text,
  stripe_payment_link_id   text,
  stripe_payment_link_url  text,
  stripe_price_id          text,
  stripe_payment_intent_id text,
  stripe_session_id        text,
  square_payment_link_id   text,
  square_payment_link_url  text,
  square_paid_at           timestamp,
  pay_token                text      UNIQUE,
  status                   text      NOT NULL DEFAULT 'pending',
  paid_at                  timestamp,
  qr_code_data_url         text,
  created_at               timestamp NOT NULL DEFAULT now()
);

-- ── Daily Logs ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_logs (
  id               serial    PRIMARY KEY,
  job_id           integer   REFERENCES jobs(id),
  date             text      NOT NULL,
  weather          text,
  crew_count       integer,
  work_completed   text,
  issues           text,
  materials_used   text,
  hours_worked     numeric(5, 2),
  notes            text,
  photo_urls       jsonb     DEFAULT '[]',
  material_list_id integer,
  author_name      text,
  created_at       timestamp NOT NULL DEFAULT now()
);

-- ── Mileage ───────────────────────────────────────────────────────────────────
-- Placed in this file (not 0043) because existing post-merge.sh inline blocks
-- ADD COLUMN to mileage_logs and must run after the table is created.

CREATE TABLE IF NOT EXISTS mileage_imports (
  id                  serial    PRIMARY KEY,
  business_id         integer   REFERENCES businesses(id) ON DELETE CASCADE,
  user_id             text,
  source              text      NOT NULL DEFAULT 'mileiq',
  filename            text      NOT NULL,
  file_hash           text,
  status              text      NOT NULL DEFAULT 'completed',
  trips_found         integer   NOT NULL DEFAULT 0,
  trips_imported      integer   NOT NULL DEFAULT 0,
  duplicates_skipped  integer   NOT NULL DEFAULT 0,
  total_miles         numeric(10, 2),
  estimated_deduction numeric(10, 2),
  error_summary       text,
  rolled_back_at      timestamp,
  imported_at         timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mileage_logs (
  id               serial    PRIMARY KEY,
  date             text      NOT NULL,
  start_location   text,
  end_location     text,
  miles            numeric(8, 2) NOT NULL,
  purpose          text,
  job_id           integer   REFERENCES jobs(id),
  subcontractor_id integer,
  business_id      integer   REFERENCES businesses(id) ON DELETE SET NULL,
  classification   text      NOT NULL DEFAULT 'business',
  rate_per_mile    numeric(5, 3) NOT NULL DEFAULT '0.725',
  deduction_amount numeric(10, 2) NOT NULL DEFAULT '0',
  notes            text,
  source           text      NOT NULL DEFAULT 'gps',
  expense_id       integer   REFERENCES expenses(id) ON DELETE SET NULL,
  import_id        integer   REFERENCES mileage_imports(id) ON DELETE SET NULL,
  created_at       timestamp NOT NULL DEFAULT now()
);

-- ── Plaid Connections ─────────────────────────────────────────────────────────
-- Placed in this file (not 0043) because existing post-merge.sh inline blocks
-- ADD COLUMN to plaid_connections and must run after the table is created.

CREATE TABLE IF NOT EXISTS plaid_connections (
  id                        serial    PRIMARY KEY,
  access_token              text      NOT NULL,
  item_id                   text      NOT NULL UNIQUE,
  institution_id            text,
  institution_name          text,
  account_id                text,
  account_name              text,
  account_mask              text,
  account_type              text,
  last_synced_at            timestamp,
  cached_balance_current    numeric,
  cached_balance_available  numeric,
  cached_balance_currency   text,
  balance_cached_at         timestamp,
  created_at                timestamp NOT NULL DEFAULT now(),
  updated_at                timestamp NOT NULL DEFAULT now()
);
