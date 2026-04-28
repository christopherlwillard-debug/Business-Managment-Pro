ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS block_number integer;
ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS crew_label text;
