-- Add base_price to mfh_models
ALTER TABLE mfh_models ADD COLUMN IF NOT EXISTS base_price NUMERIC(12,2);

-- Create mfh_client_pricing table
CREATE TABLE IF NOT EXISTS mfh_client_pricing (
  id SERIAL PRIMARY KEY,
  model_id INTEGER NOT NULL REFERENCES mfh_models(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  price NUMERIC(12,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS mfh_client_pricing_model_client_uniq
  ON mfh_client_pricing (model_id, client_id);
