CREATE TABLE IF NOT EXISTS properties (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  client_id integer REFERENCES clients(id) ON DELETE SET NULL,
  label text NOT NULL,
  street text,
  city text,
  state text,
  zip text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS properties_business_client_idx ON properties(business_id, client_id);

CREATE TABLE IF NOT EXISTS property_measurement_revisions (
  id serial PRIMARY KEY,
  property_id integer NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  source text NOT NULL CHECK (source IN ('manual', 'on_site')),
  entries jsonb NOT NULL,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS property_measurement_revisions_property_revision_unique
  ON property_measurement_revisions(property_id, revision);
CREATE INDEX IF NOT EXISTS property_measurement_revisions_property_created_idx
  ON property_measurement_revisions(property_id, created_at);

CREATE TABLE IF NOT EXISTS service_pricing_profile_versions (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  service_key text NOT NULL,
  version integer NOT NULL,
  display_name text NOT NULL,
  rules jsonb NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS service_pricing_profile_versions_business_service_version_unique
  ON service_pricing_profile_versions(business_id, service_key, version);
CREATE INDEX IF NOT EXISTS service_pricing_profile_versions_business_service_idx
  ON service_pricing_profile_versions(business_id, service_key);

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS property_id integer REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS calculation_snapshot jsonb;
