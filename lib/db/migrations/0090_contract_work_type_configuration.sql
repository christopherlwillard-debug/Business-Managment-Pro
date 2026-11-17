ALTER TABLE contract_client_programs
  ADD COLUMN IF NOT EXISTS invoice_submission_email text,
  ADD COLUMN IF NOT EXISTS invoice_submission_deadline_hours integer,
  ADD COLUMN IF NOT EXISTS invoice_submission_instructions text;

ALTER TABLE checklist_templates
  ADD COLUMN IF NOT EXISTS business_id integer REFERENCES businesses(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS checklist_templates_business_active_idx
  ON checklist_templates (business_id, active);

ALTER TABLE checklist_template_items
  ADD COLUMN IF NOT EXISTS requirement_key text,
  ADD COLUMN IF NOT EXISTS evidence_type text,
  ADD COLUMN IF NOT EXISTS requirement_status text NOT NULL DEFAULT 'required',
  ADD COLUMN IF NOT EXISTS condition_key text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_template_items_requirement_status_check') THEN
    ALTER TABLE checklist_template_items ADD CONSTRAINT checklist_template_items_requirement_status_check
      CHECK (requirement_status IN ('required', 'recommended', 'conditional'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_template_items_evidence_type_check') THEN
    ALTER TABLE checklist_template_items ADD CONSTRAINT checklist_template_items_evidence_type_check
      CHECK (evidence_type IS NULL OR evidence_type IN ('image', 'document'));
  END IF;
END $$;

ALTER TABLE job_checklist_items
  ADD COLUMN IF NOT EXISTS requirement_key text,
  ADD COLUMN IF NOT EXISTS requirement_status text NOT NULL DEFAULT 'required',
  ADD COLUMN IF NOT EXISTS condition_key text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_checklist_items_requirement_status_check') THEN
    ALTER TABLE job_checklist_items ADD CONSTRAINT job_checklist_items_requirement_status_check
      CHECK (requirement_status IN ('required', 'recommended', 'conditional'));
  END IF;
END $$;

ALTER TABLE job_checklists
  ADD COLUMN IF NOT EXISTS contract_invoice_submission_email text,
  ADD COLUMN IF NOT EXISTS contract_invoice_submission_deadline_hours integer,
  ADD COLUMN IF NOT EXISTS contract_invoice_submission_instructions text;

CREATE TABLE IF NOT EXISTS contract_client_work_types (
  id serial PRIMARY KEY,
  program_id integer NOT NULL REFERENCES contract_client_programs(id) ON DELETE CASCADE,
  key text NOT NULL,
  display_name text NOT NULL,
  checklist_template_id integer NOT NULL REFERENCES checklist_templates(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, key)
);

CREATE INDEX IF NOT EXISTS contract_client_work_types_program_active_idx
  ON contract_client_work_types (program_id, active);

ALTER TABLE contract_work_orders
  ADD COLUMN IF NOT EXISTS work_type_id integer REFERENCES contract_client_work_types(id) ON DELETE RESTRICT;
