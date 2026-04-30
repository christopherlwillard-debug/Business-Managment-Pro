ALTER TABLE assets ADD COLUMN IF NOT EXISTS useful_life_years integer;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS salvage_value numeric(12,2) DEFAULT 0;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS depreciation_method text DEFAULT 'straight-line';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS bonus_depreciation_pct integer DEFAULT 60;
