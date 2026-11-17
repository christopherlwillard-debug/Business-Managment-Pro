ALTER TABLE contract_client_programs
  ADD COLUMN IF NOT EXISTS requires_installation_photos boolean NOT NULL DEFAULT false;

ALTER TABLE contract_client_programs
  ADD COLUMN IF NOT EXISTS requires_completion_documentation boolean NOT NULL DEFAULT false;
