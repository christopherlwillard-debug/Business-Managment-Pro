CREATE TABLE IF NOT EXISTS expense_division_allocations (
  id SERIAL PRIMARY KEY,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL CONSTRAINT expense_division_allocations_amount_check CHECK (amount > 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT expense_division_allocations_expense_business_unique UNIQUE (expense_id, business_id)
);

CREATE INDEX IF NOT EXISTS expense_division_allocations_business_idx
  ON expense_division_allocations (business_id);
