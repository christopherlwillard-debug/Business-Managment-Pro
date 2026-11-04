ALTER TABLE material_lists
  ADD COLUMN IF NOT EXISTS invoice_id integer REFERENCES invoices(id) ON DELETE SET NULL;

ALTER TABLE material_lists
  ADD COLUMN IF NOT EXISTS invoice_assignment_initialized boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS material_lists_invoice_id_idx
  ON material_lists(invoice_id);

CREATE TABLE IF NOT EXISTS material_list_invoice_events (
  id serial PRIMARY KEY,
  material_list_id integer REFERENCES material_lists(id) ON DELETE SET NULL,
  material_list_name_snapshot text NOT NULL,
  action text NOT NULL CHECK (action IN ('attach', 'reassign', 'detach')),
  previous_invoice_id integer,
  previous_invoice_label text,
  destination_invoice_id integer,
  destination_invoice_label text,
  actor_user_id text,
  confirmed_after_finalized boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_list_invoice_events_list_created_idx
  ON material_list_invoice_events(material_list_id, created_at DESC);
