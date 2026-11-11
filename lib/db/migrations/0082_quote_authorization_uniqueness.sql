CREATE UNIQUE INDEX IF NOT EXISTS estimate_quote_events_one_work_authorization_per_revision
  ON estimate_quote_events (revision_snapshot_id)
  WHERE event_type = 'work_authorization';
