CREATE TABLE IF NOT EXISTS property_business_access (
  id serial PRIMARY KEY,
  property_id integer NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  permission text NOT NULL CHECK (permission IN ('view', 'measure', 'estimate', 'manage')),
  granted_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by text
);
CREATE UNIQUE INDEX IF NOT EXISTS property_business_access_active_unique
  ON property_business_access(property_id, business_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS property_business_access_business_idx
  ON property_business_access(business_id, revoked_at);
INSERT INTO property_business_access (property_id, business_id, permission)
SELECT id, business_id, 'manage' FROM properties
ON CONFLICT (property_id, business_id) WHERE revoked_at IS NULL DO NOTHING;
