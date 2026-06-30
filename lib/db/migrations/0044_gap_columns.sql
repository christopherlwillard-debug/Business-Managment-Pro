-- Migration 0044: Idempotent column additions for tables that predate explicit
-- migration tracking.
--
-- These columns exist in the TypeScript schema but were previously only added
-- to production via `drizzle-kit push --force`. Every statement is guarded by
-- IF NOT EXISTS so it is safe to re-run on any environment.
--
-- On a completely fresh database, 0042/0043 CREATE TABLE statements already
-- include all these columns. This file ensures existing production databases
-- receive the same columns without a full table recreate.
--
-- Depends on: 0042_base_schema.sql, 0043_extended_tables.sql

-- ── businesses ────────────────────────────────────────────────────────────────

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS sort_order       integer DEFAULT 0 NOT NULL;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS enabled_features jsonb;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS parent_business_id integer;

-- ── settings ──────────────────────────────────────────────────────────────────

ALTER TABLE settings ADD COLUMN IF NOT EXISTS dba_logo_url                   text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS entity_type                    text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ein                            text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS invoice_logo_position          text DEFAULT 'top-left';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS invoice_logo_size              text DEFAULT 'medium';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_host                      text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_port                      text DEFAULT '587';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_user                      text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_pass                      text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS smtp_secure                    integer DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS mileage_default_classification text DEFAULT 'business';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS mileage_units                  text DEFAULT 'miles';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS mileage_reminder_frequency     text DEFAULT 'daily';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS bottom_nav_items               text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS compliance_notification_email  text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS compliance_email_enabled       integer DEFAULT 1;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS invoice_reminder_enabled       integer DEFAULT 1;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS invoice_reminder_day1          integer DEFAULT 7;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS invoice_reminder_day2          integer DEFAULT 14;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tax_filing_frequency           text DEFAULT 'quarterly';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS calculator_defaults            jsonb;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS quick_links                    jsonb;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS signature_image                text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS owner_user_id                  text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS threshold_amount_1099          numeric(10, 2) DEFAULT '600';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS enabled_features               jsonb DEFAULT '["invoices","expenses","mileage","estimates","subcontractors","daily_logs","compliance","clients"]';

-- ── clients ───────────────────────────────────────────────────────────────────

ALTER TABLE clients ADD COLUMN IF NOT EXISTS next_service_date       date;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS service_interval_months integer;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_line           text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS square_customer_id      text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS reminder_opt_out        boolean NOT NULL DEFAULT false;

-- ── subcontractors ────────────────────────────────────────────────────────────

ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS w9_on_file             boolean NOT NULL DEFAULT false;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS portal_token           text UNIQUE;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS portal_approved        boolean NOT NULL DEFAULT false;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS w9_legal_name          text;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS w9_business_name       text;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS w9_tax_classification   text;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS w9_llc_type            text;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS w9_address             text;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS w9_city                text;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS w9_state               text;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS w9_zip                 text;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS w9_tax_id_type         text;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS w9_tax_id              text;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS w9_signature           text;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS w9_signed_at           text;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS portal_features        jsonb DEFAULT '["payments","income_report","jobs","expenses","mileage","w9","tax_reports","home_office"]';
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS portal_pin_hash        text;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS portal_pin_attempts    integer NOT NULL DEFAULT 0;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS portal_pin_locked_until timestamp;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS pay_rate               numeric(10, 2);
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS pay_type               text DEFAULT 'hourly';
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS role                   text NOT NULL DEFAULT 'hourly';
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS growth_pct             numeric(5, 4) NOT NULL DEFAULT '0';

-- ── jobs ──────────────────────────────────────────────────────────────────────

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS business_line      text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sub_paid           boolean NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sq_ft              integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS coats              smallint DEFAULT 1;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS phases             jsonb;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS permit_checklist   jsonb;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS home_model         text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_series_id      integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_model_id       integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_model_year     integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_dealer_price   numeric(12, 2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_quoted_price   numeric(12, 2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_guide_name     text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_selected_addons jsonb;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mfh_travel_days    integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS closed_at          date;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_number         integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS owner_pay_included boolean NOT NULL DEFAULT true;
-- Drop columns that were removed from schema (idempotent)
ALTER TABLE jobs DROP COLUMN IF EXISTS estimated_amount;
ALTER TABLE jobs DROP COLUMN IF EXISTS actual_amount;
ALTER TABLE jobs DROP COLUMN IF EXISTS mfh_manufacturer_id;

-- ── expenses ──────────────────────────────────────────────────────────────────

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurring_expense_id     integer REFERENCES recurring_expenses(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS exclude_from_net_profit  boolean NOT NULL DEFAULT false;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS business_line            text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS business_id              integer;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS job_sub_hours_id         integer REFERENCES job_sub_hours(id) ON DELETE SET NULL;

-- ── invoices ──────────────────────────────────────────────────────────────────

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS business_line             text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_payment_link_id    text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_payment_link_url   text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_payment_intent_id  text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_paid_at            timestamp;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS square_payment_link_id    text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS square_payment_link_url   text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS square_paid_at            timestamp;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pay_token                 text UNIQUE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminders_sent_at         jsonb DEFAULT '[]';

-- ── estimates ─────────────────────────────────────────────────────────────────

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS business_line            text;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS stripe_payment_link_id   text;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS stripe_payment_link_url  text;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS square_payment_link_id   text;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS square_payment_link_url  text;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_paid_at          timestamp;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_paid_amount      numeric(12, 2);
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS mfh_dealer_price         numeric(12, 2);
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS mfh_quoted_price         numeric(12, 2);
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS mfh_guide_name           text;

-- ── quick_charges ─────────────────────────────────────────────────────────────

ALTER TABLE quick_charges ADD COLUMN IF NOT EXISTS stripe_payment_link_id   text;
ALTER TABLE quick_charges ADD COLUMN IF NOT EXISTS stripe_payment_link_url  text;
ALTER TABLE quick_charges ADD COLUMN IF NOT EXISTS stripe_price_id          text;
ALTER TABLE quick_charges ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE quick_charges ADD COLUMN IF NOT EXISTS stripe_session_id        text;
ALTER TABLE quick_charges ADD COLUMN IF NOT EXISTS square_payment_link_id   text;
ALTER TABLE quick_charges ADD COLUMN IF NOT EXISTS square_payment_link_url  text;
ALTER TABLE quick_charges ADD COLUMN IF NOT EXISTS square_paid_at           timestamp;
ALTER TABLE quick_charges ADD COLUMN IF NOT EXISTS pay_token                text UNIQUE;
ALTER TABLE quick_charges ADD COLUMN IF NOT EXISTS qr_code_data_url        text;

-- ── daily_logs ────────────────────────────────────────────────────────────────

ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS photo_urls       jsonb DEFAULT '[]';
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS material_list_id integer REFERENCES material_lists(id) ON DELETE SET NULL;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS author_name      text;

-- ── bank_transactions ─────────────────────────────────────────────────────────

ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS plaid_transaction_id text;

-- ── square_payments ───────────────────────────────────────────────────────────

ALTER TABLE square_payments ADD COLUMN IF NOT EXISTS client_id integer REFERENCES clients(id) ON DELETE SET NULL;

-- ── bid_opportunities ─────────────────────────────────────────────────────────

ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS business_id  integer REFERENCES businesses(id) ON DELETE SET NULL;
ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS source        text NOT NULL DEFAULT 'federal';
ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS source_label  text;
ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS ai_summary    jsonb;
ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS ai_summary_at timestamp;
ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS stage         text NOT NULL DEFAULT 'new';
ALTER TABLE bid_opportunities ADD COLUMN IF NOT EXISTS notes         text;

-- ── mileage_logs ──────────────────────────────────────────────────────────────

ALTER TABLE mileage_logs ADD COLUMN IF NOT EXISTS business_id integer REFERENCES businesses(id) ON DELETE SET NULL;
ALTER TABLE mileage_logs ADD COLUMN IF NOT EXISTS expense_id   integer REFERENCES expenses(id) ON DELETE SET NULL;
ALTER TABLE mileage_logs ADD COLUMN IF NOT EXISTS import_id    integer REFERENCES mileage_imports(id) ON DELETE SET NULL;

-- ── other_income ──────────────────────────────────────────────────────────────

ALTER TABLE other_income ADD COLUMN IF NOT EXISTS business_line text;
ALTER TABLE other_income ADD COLUMN IF NOT EXISTS client_id     integer REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE other_income ADD COLUMN IF NOT EXISTS job_id        integer REFERENCES jobs(id) ON DELETE SET NULL;
ALTER TABLE other_income ADD COLUMN IF NOT EXISTS city          text;
ALTER TABLE other_income ADD COLUMN IF NOT EXISTS state         text;

-- ── prospects ─────────────────────────────────────────────────────────────────

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS city                   text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS state                  text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS zip                    text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS contact_email          text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS follow_up_date         date;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS serviced_at            date;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS linked_invoice_id      integer REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS client_id              integer REFERENCES clients(id);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS stripe_payment_link_id text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS stripe_payment_link_url text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS square_payment_link_id text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS square_payment_link_url text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS deposit_paid_at        timestamp;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS deposit_paid_amount    numeric(12, 2);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_paid_at           timestamp;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS measured_sq_ft         integer;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS source                 text DEFAULT 'manual';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS business_line          text;

-- ── route_stops ───────────────────────────────────────────────────────────────

ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS block_number integer;
ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS crew_label   text;
ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS client_id    integer REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS prospect_id  integer REFERENCES prospects(id) ON DELETE SET NULL;
ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS job_id       integer REFERENCES jobs(id) ON DELETE SET NULL;

-- ── plaid_connections ─────────────────────────────────────────────────────────

ALTER TABLE plaid_connections ADD COLUMN IF NOT EXISTS cached_balance_current   numeric;
ALTER TABLE plaid_connections ADD COLUMN IF NOT EXISTS cached_balance_available numeric;
ALTER TABLE plaid_connections ADD COLUMN IF NOT EXISTS cached_balance_currency  text;
ALTER TABLE plaid_connections ADD COLUMN IF NOT EXISTS balance_cached_at        timestamp;

-- ── job_checklists ────────────────────────────────────────────────────────────

ALTER TABLE job_checklists ADD COLUMN IF NOT EXISTS finished_notes text;

-- ── website_media ─────────────────────────────────────────────────────────────

ALTER TABLE website_media ADD COLUMN IF NOT EXISTS folder_id    integer REFERENCES website_media_folders(id) ON DELETE SET NULL;
ALTER TABLE website_media ADD COLUMN IF NOT EXISTS display_name varchar(255);

-- ── assets ────────────────────────────────────────────────────────────────────

ALTER TABLE assets ADD COLUMN IF NOT EXISTS useful_life_years      integer;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS salvage_value          numeric(12, 2) DEFAULT '0';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS depreciation_method    text DEFAULT 'straight-line';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS bonus_depreciation_pct integer DEFAULT 60;

-- ── mfh_home_series ───────────────────────────────────────────────────────────
-- After 0041 rename, home_series has these columns that need ensuring:

ALTER TABLE mfh_home_series ADD COLUMN IF NOT EXISTS benchmark_id          integer REFERENCES job_type_benchmarks(id) ON DELETE SET NULL;
ALTER TABLE mfh_home_series ADD COLUMN IF NOT EXISTS checklist_template_id integer REFERENCES checklist_templates(id) ON DELETE SET NULL;
ALTER TABLE mfh_home_series ADD COLUMN IF NOT EXISTS default_addon_keys    jsonb DEFAULT '[]';
ALTER TABLE mfh_home_series ADD COLUMN IF NOT EXISTS notes                 text;
ALTER TABLE mfh_home_series ADD COLUMN IF NOT EXISTS active                boolean NOT NULL DEFAULT true;
ALTER TABLE mfh_home_series ADD COLUMN IF NOT EXISTS introduced_year       integer;
ALTER TABLE mfh_home_series ADD COLUMN IF NOT EXISTS discontinued_year     integer;
