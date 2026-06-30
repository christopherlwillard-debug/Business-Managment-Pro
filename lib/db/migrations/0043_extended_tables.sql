-- Migration 0043: Explicit creation of all extended/secondary tables.
--
-- These tables were added after the initial application launch and were
-- previously created by `drizzle-kit push --force`. This file makes every
-- extended table creation idempotent and self-contained.
--
-- Depends on: 0042_base_schema.sql (base tables must exist first)
-- All statements use IF NOT EXISTS guards — safe to re-run on any environment.

-- ── Vendors ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendors (
  id         serial    PRIMARY KEY,
  name       text      NOT NULL UNIQUE,
  category   text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ── Materials ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS materials (
  id         serial    PRIMARY KEY,
  name       text      NOT NULL,
  description text,
  unit       text      NOT NULL DEFAULT 'ea',
  unit_cost  numeric(12, 2) NOT NULL DEFAULT '0',
  category   text,
  is_active  boolean   NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ── Material Lists ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS material_lists (
  id         serial    PRIMARY KEY,
  name       text      NOT NULL,
  user_id    text,
  job_id     integer   REFERENCES jobs(id) ON DELETE SET NULL,
  markup     numeric(5, 2) NOT NULL DEFAULT '40',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS material_list_items (
  id                  serial    PRIMARY KEY,
  list_id             integer   NOT NULL REFERENCES material_lists(id) ON DELETE CASCADE,
  material_id         integer   REFERENCES materials(id) ON DELETE SET NULL,
  name_snapshot       text      NOT NULL,
  unit_snapshot       text      NOT NULL DEFAULT 'ea',
  unit_cost_snapshot  numeric(12, 2) NOT NULL DEFAULT '0',
  qty                 numeric(10, 2) NOT NULL DEFAULT '1'
);

-- ── Job Sub Hours ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_sub_hours (
  id               serial    PRIMARY KEY,
  job_id           integer   NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  subcontractor_id integer   NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  date             text      NOT NULL,
  hours            numeric(6, 2) NOT NULL,
  description      text,
  rate_snapshot    numeric(10, 2),
  created_at       timestamp NOT NULL DEFAULT now()
);

-- ── Job Type Benchmarks ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_type_benchmarks (
  id                      serial    PRIMARY KEY,
  job_type                text      NOT NULL UNIQUE,
  estimated_hours         numeric(8, 2),
  estimated_labor_cost    numeric(12, 2),
  estimated_material_cost numeric(12, 2),
  notes                   text,
  created_at              timestamp NOT NULL DEFAULT now()
);

-- ── Generated 1099s ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS generated_1099s (
  id               serial    PRIMARY KEY,
  user_id          text      NOT NULL,
  subcontractor_id integer   REFERENCES subcontractors(id),
  tax_year         integer   NOT NULL,
  total_paid       numeric(12, 2) NOT NULL,
  pdf_data         text,
  generated_at     timestamp NOT NULL DEFAULT now()
);

-- ── Portfolio Photos ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portfolio_photos (
  id         serial    PRIMARY KEY,
  url        text      NOT NULL,
  caption    text,
  category   text,
  sort_order integer   DEFAULT 0,
  active     boolean   NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ── Compliance ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS compliance_items (
  id           serial    PRIMARY KEY,
  title        text      NOT NULL,
  category     text      NOT NULL DEFAULT 'Other',
  jurisdiction text,
  due_date     text      NOT NULL,
  recurrence   text      DEFAULT 'one-time',
  status       text      NOT NULL DEFAULT 'upcoming',
  notes        text,
  enabled      boolean   NOT NULL DEFAULT true,
  documents    jsonb     NOT NULL DEFAULT '[]',
  created_at   timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ky_filing_settings (
  filing_id  text      PRIMARY KEY,
  enabled    boolean   NOT NULL DEFAULT true,
  documents  jsonb     NOT NULL DEFAULT '[]',
  updated_at timestamp NOT NULL DEFAULT now()
);

-- ── Conversations & Messages ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
  id         serial    PRIMARY KEY,
  title      text      NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id              serial    PRIMARY KEY,
  conversation_id integer   NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            text      NOT NULL,
  content         text      NOT NULL,
  created_at      timestamp with time zone NOT NULL DEFAULT now()
);

-- ── Inquiries ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inquiries (
  id         serial    PRIMARY KEY,
  name       text      NOT NULL,
  phone      text,
  email      text,
  service    text,
  message    text,
  best_time  text,
  read       boolean   NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ── Registered Agents ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS registered_agents (
  id           serial    PRIMARY KEY,
  user_id      text      NOT NULL UNIQUE,
  agent_name   text,
  company_name text,
  address      text,
  phone        text,
  email        text,
  state        text,
  notes        text,
  created_at   timestamp NOT NULL DEFAULT now(),
  updated_at   timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS registered_agent_tasks (
  id                  serial    PRIMARY KEY,
  registered_agent_id integer   NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
  title               text      NOT NULL,
  recurrence          text      NOT NULL DEFAULT 'annual',
  notes               text,
  created_at          timestamp NOT NULL DEFAULT now()
);

-- ── Website Form Submissions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS website_form_submissions (
  id           serial        PRIMARY KEY,
  business_id  integer       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  site_slug    varchar(100)  NOT NULL,
  fields       jsonb         NOT NULL DEFAULT '{}',
  submitted_at timestamp     NOT NULL DEFAULT now()
);

-- ── Sub Payment Records ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sub_payment_records (
  id                    serial    PRIMARY KEY,
  job_id                integer   NOT NULL REFERENCES jobs(id),
  subcontractor_id      integer   NOT NULL REFERENCES subcontractors(id),
  business_line         text,
  amount                numeric(10, 2) NOT NULL,
  payment_date          date      NOT NULL,
  description           text,
  notes                 text,
  payment_method        text,
  reference_number      text,
  recorded_by           text,
  created_from          text      DEFAULT 'pay-worker',
  idempotency_key       text      UNIQUE,
  agreed_owed_snapshot  numeric(10, 2),
  is_reversal           boolean   DEFAULT false,
  reverses_payment_id   integer,
  bank_transaction_id   integer,
  created_at            timestamp NOT NULL DEFAULT now()
);

-- ── Job Checklist Extension Tables ───────────────────────────────────────────
-- (checklist_templates / job_checklists / etc. are created in post-merge.sh
--  Task #929 block; these are the additional photo/parts tables added later)

CREATE TABLE IF NOT EXISTS job_checklist_item_photos (
  id                    serial    PRIMARY KEY,
  job_checklist_item_id integer   NOT NULL REFERENCES job_checklist_items(id) ON DELETE CASCADE,
  object_path           text      NOT NULL,
  created_at            timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_checklist_item_parts (
  id                    serial    PRIMARY KEY,
  job_checklist_item_id integer   NOT NULL REFERENCES job_checklist_items(id) ON DELETE CASCADE,
  label                 text      NOT NULL DEFAULT '',
  sort_order            integer   NOT NULL DEFAULT 0,
  completed             boolean   NOT NULL DEFAULT false,
  completed_at          timestamp,
  completed_by_user_id  text,
  completed_by_name     text,
  created_at            timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_finished_photos (
  id               serial    PRIMARY KEY,
  job_checklist_id integer   NOT NULL REFERENCES job_checklists(id) ON DELETE CASCADE,
  object_path      text      NOT NULL,
  created_at       timestamp NOT NULL DEFAULT now()
);
