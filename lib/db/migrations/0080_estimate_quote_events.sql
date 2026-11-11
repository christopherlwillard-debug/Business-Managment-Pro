CREATE TABLE IF NOT EXISTS estimate_quote_events (
  id serial PRIMARY KEY,
  estimate_id integer NOT NULL REFERENCES estimates(id) ON DELETE RESTRICT,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  revision_snapshot_id integer REFERENCES estimate_quote_events(id) ON DELETE RESTRICT,
  revision integer NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL,
  recipient text,
  actor_user_id text,
  actor_name text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  provider text,
  provider_message_id text,
  provider_thread_id text,
  idempotency_key text,
  error_code text,
  error_message text,
  response_type text,
  response_text text,
  token_hash text,
  token_expires_at timestamptz,
  token_activated_at timestamptz,
  token_revoked_at timestamptz,
  content_hash text,
  customer_snapshot jsonb,
  pdf_object_path text,
  logo_object_path text,
  logo_content_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estimate_quote_events_revision_ref_check CHECK (
    (event_type = 'revision' AND revision_snapshot_id IS NULL)
    OR (event_type <> 'revision' AND revision_snapshot_id IS NOT NULL)
  ),
  CONSTRAINT estimate_quote_events_response_type_check CHECK (
    response_type IS NULL OR response_type IN ('approved', 'declined', 'changes_requested')
  ),
  CONSTRAINT estimate_quote_events_revision_positive_check CHECK (revision > 0),
  CONSTRAINT estimate_quote_events_type_status_check CHECK (
    (event_type = 'revision' AND status IN ('snapshot', 'accepted'))
    OR (event_type = 'send_attempt' AND status IN ('pending', 'accepted', 'failed', 'unresolved'))
    OR (event_type = 'view' AND status = 'viewed')
    OR (event_type = 'response' AND status = 'recorded')
  ),
  CONSTRAINT estimate_quote_events_response_shape_check CHECK (
    (event_type = 'response' AND response_type IS NOT NULL)
    OR (event_type <> 'response' AND response_type IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS estimate_quote_events_estimate_requested_idx
  ON estimate_quote_events (estimate_id, requested_at);
CREATE INDEX IF NOT EXISTS estimate_quote_events_business_requested_idx
  ON estimate_quote_events (business_id, requested_at);
CREATE INDEX IF NOT EXISTS estimate_quote_events_revision_snapshot_idx
  ON estimate_quote_events (revision_snapshot_id);
CREATE UNIQUE INDEX IF NOT EXISTS estimate_quote_events_idempotency_key_unique
  ON estimate_quote_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS estimate_quote_events_token_hash_unique
  ON estimate_quote_events (token_hash)
  WHERE token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS estimate_quote_events_one_response_per_revision
  ON estimate_quote_events (revision_snapshot_id)
  WHERE event_type = 'response';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_quote_events_revision_positive_check') THEN
    ALTER TABLE estimate_quote_events ADD CONSTRAINT estimate_quote_events_revision_positive_check CHECK (revision > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_quote_events_type_status_check') THEN
    ALTER TABLE estimate_quote_events ADD CONSTRAINT estimate_quote_events_type_status_check CHECK (
      (event_type = 'revision' AND status IN ('snapshot', 'accepted'))
      OR (event_type = 'send_attempt' AND status IN ('pending', 'accepted', 'failed', 'unresolved'))
      OR (event_type = 'view' AND status = 'viewed')
      OR (event_type = 'response' AND status = 'recorded')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_quote_events_response_shape_check') THEN
    ALTER TABLE estimate_quote_events ADD CONSTRAINT estimate_quote_events_response_shape_check CHECK (
      (event_type = 'response' AND response_type IS NOT NULL)
      OR (event_type <> 'response' AND response_type IS NULL)
    );
  END IF;
END $$;
