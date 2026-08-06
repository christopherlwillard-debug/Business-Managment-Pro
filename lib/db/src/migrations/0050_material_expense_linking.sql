-- Auto-linking pattern: source_type + source_id identify auto-generated expenses.
-- source_type = 'Material List' means the expense was created by a material list item.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source_id integer;

-- Per-line "Add Cost to Job Expenses" flag and back-reference to the linked expense.
ALTER TABLE material_list_items ADD COLUMN IF NOT EXISTS add_to_job_expenses boolean NOT NULL DEFAULT false;
ALTER TABLE material_list_items ADD COLUMN IF NOT EXISTS expense_id integer REFERENCES expenses(id) ON DELETE SET NULL;
