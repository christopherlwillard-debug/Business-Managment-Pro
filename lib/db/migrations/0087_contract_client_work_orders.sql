CREATE TABLE IF NOT EXISTS contract_client_programs (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  payer_client_id integer NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contract_client_programs_business_payer_name_uq
  ON contract_client_programs (business_id, payer_client_id, name);
CREATE INDEX IF NOT EXISTS contract_client_programs_business_active_idx
  ON contract_client_programs (business_id, active);

CREATE TABLE IF NOT EXISTS contract_work_orders (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  program_id integer NOT NULL REFERENCES contract_client_programs(id) ON DELETE RESTRICT,
  external_order_number text NOT NULL,
  title text NOT NULL,
  scope text,
  homeowner_contact_id integer REFERENCES contacts(id) ON DELETE SET NULL,
  property_id integer REFERENCES properties(id) ON DELETE SET NULL,
  agreed_price numeric(12, 2),
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'accepted', 'declined', 'cancelled')),
  job_id integer REFERENCES jobs(id) ON DELETE RESTRICT,
  accepted_at timestamptz,
  accepted_by_user_id text,
  declined_at timestamptz,
  declined_by_user_id text,
  decline_reason text,
  cancelled_at timestamptz,
  cancelled_by_user_id text,
  cancellation_reason text,
  created_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (agreed_price IS NULL OR agreed_price >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS contract_work_orders_program_external_number_uq
  ON contract_work_orders (program_id, external_order_number);
CREATE UNIQUE INDEX IF NOT EXISTS contract_work_orders_job_uq
  ON contract_work_orders (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contract_work_orders_business_status_created_idx
  ON contract_work_orders (business_id, status, created_at);
CREATE INDEX IF NOT EXISTS contract_work_orders_property_id_idx
  ON contract_work_orders (property_id);
