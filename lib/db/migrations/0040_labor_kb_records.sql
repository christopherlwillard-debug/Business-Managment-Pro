CREATE TABLE IF NOT EXISTS job_labor_entries (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  worker_type TEXT NOT NULL DEFAULT 'sub',
  linked_subcontractor_id INTEGER REFERENCES subcontractors(id) ON DELETE SET NULL,
  productive_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  travel_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_knowledge_records (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  mfh_model_id INTEGER REFERENCES mfh_models(id) ON DELETE SET NULL,
  builder_id INTEGER REFERENCES mfh_manufacturers(id) ON DELETE SET NULL,
  builder_name_snapshot TEXT,
  model_name_snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  taught_at TIMESTAMP,
  productive_hours NUMERIC(8,2),
  travel_hours NUMERIC(8,2),
  crew_size INTEGER,
  days_on_site INTEGER,
  invoice_amount NUMERIC(12,2),
  material_cost NUMERIC(12,2),
  consumables_cost NUMERIC(12,2),
  gross_profit NUMERIC(12,2),
  net_profit NUMERIC(12,2),
  callbacks INTEGER NOT NULL DEFAULT 0,
  warranty_visit BOOLEAN NOT NULL DEFAULT FALSE,
  missing_materials_notes TEXT,
  factory_defect_notes TEXT,
  original_productive_hours NUMERIC(8,2),
  original_values JSONB,
  edit_reason TEXT,
  edited_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_knowledge_record_versions (
  id SERIAL PRIMARY KEY,
  knowledge_record_id INTEGER NOT NULL REFERENCES job_knowledge_records(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMP NOT NULL DEFAULT NOW(),
  edit_reason TEXT,
  before_values JSONB NOT NULL,
  after_values JSONB NOT NULL
);
