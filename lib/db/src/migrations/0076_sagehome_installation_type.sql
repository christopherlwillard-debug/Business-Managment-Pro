ALTER TABLE contract_work_orders
  ADD COLUMN IF NOT EXISTS installation_type text;
