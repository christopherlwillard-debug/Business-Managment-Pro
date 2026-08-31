CREATE TABLE IF NOT EXISTS invoice_communication_events (
  id serial PRIMARY KEY,
  invoice_id integer NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  business_id integer REFERENCES businesses(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  channel text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  recipient text,
  subject text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  source text NOT NULL DEFAULT 'user',
  actor_user_id text,
  actor_name text,
  provider_message_id text,
  provider_thread_id text,
  error_code text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_communication_events_invoice_requested_idx
  ON invoice_communication_events (invoice_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS invoice_communication_events_business_requested_idx
  ON invoice_communication_events (business_id, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_communication_events_idempotency_key_unique
  ON invoice_communication_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Preserve the evidence available in legacy invoice fields without inventing
-- recipients, providers, or actors that the old columns did not store.
INSERT INTO invoice_communication_events (
  invoice_id, business_id, event_type, channel, provider, status,
  recipient, requested_at, completed_at, source, metadata
)
SELECT
  i.id, i.business_id, 'initial_invoice', 'legacy', 'legacy', 'accepted',
  NULL, i.sent_at, i.sent_at, 'legacy',
  jsonb_build_object('backfilledFrom', 'invoices.sent_at', 'sentMethod', i.sent_method)
FROM invoices i
WHERE i.sent_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM invoice_communication_events e
    WHERE e.invoice_id = i.id
      AND e.event_type = 'initial_invoice'
      AND e.requested_at = i.sent_at
  );

INSERT INTO invoice_communication_events (
  invoice_id, business_id, event_type, channel, provider, status,
  recipient, requested_at, completed_at, source, metadata
)
SELECT
  i.id, i.business_id, 'manual_reminder', 'legacy', 'legacy', 'accepted',
  NULL, reminder.sent_at::timestamptz, reminder.sent_at::timestamptz, 'legacy',
  jsonb_build_object('backfilledFrom', 'invoices.reminders_sent_at')
FROM invoices i
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(i.reminders_sent_at) = 'array' THEN i.reminders_sent_at ELSE '[]'::jsonb END
) AS reminder(sent_at)
WHERE reminder.sent_at IS NOT NULL
  AND reminder.sent_at ~ '^\d{4}-\d{2}-\d{2}T'
  AND NOT EXISTS (
    SELECT 1
    FROM invoice_communication_events e
    WHERE e.invoice_id = i.id
      AND e.event_type = 'manual_reminder'
      AND e.requested_at = reminder.sent_at::timestamptz
  );