ALTER TABLE estimate_quote_events
  ADD COLUMN IF NOT EXISTS related_event_id integer
    REFERENCES estimate_quote_events(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS due_at timestamptz;

CREATE INDEX IF NOT EXISTS estimate_quote_events_related_event_idx
  ON estimate_quote_events (related_event_id);
CREATE INDEX IF NOT EXISTS estimate_quote_events_follow_up_due_idx
  ON estimate_quote_events (business_id, due_at)
  WHERE event_type = 'follow_up_scheduled' AND status = 'scheduled';

ALTER TABLE estimate_quote_events
  DROP CONSTRAINT IF EXISTS estimate_quote_events_type_status_check;
ALTER TABLE estimate_quote_events
  ADD CONSTRAINT estimate_quote_events_type_status_check CHECK (
    (event_type = 'revision' AND status IN ('snapshot', 'accepted'))
    OR (event_type = 'send_attempt' AND status IN ('pending', 'accepted', 'failed', 'unresolved'))
    OR (event_type = 'view' AND status = 'viewed')
    OR (event_type = 'response' AND status = 'recorded')
    OR (event_type = 'manual_response' AND status = 'recorded')
    OR (event_type = 'work_authorization' AND status = 'authorized')
    OR (event_type = 'follow_up_scheduled' AND status = 'scheduled')
    OR (event_type = 'follow_up_completed' AND status = 'completed')
    OR (event_type = 'archive' AND status = 'archived')
    OR (event_type = 'restore' AND status = 'restored')
  );

ALTER TABLE estimate_quote_events
  DROP CONSTRAINT IF EXISTS estimate_quote_events_response_shape_check;
ALTER TABLE estimate_quote_events
  ADD CONSTRAINT estimate_quote_events_response_shape_check CHECK (
    (event_type IN ('response', 'manual_response') AND response_type IS NOT NULL)
    OR (event_type NOT IN ('response', 'manual_response') AND response_type IS NULL)
  );
