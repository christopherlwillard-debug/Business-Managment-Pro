import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const ownerCapitalEntriesTable = pgTable("owner_capital_entries", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id"),
  // Nullable job link: when set, this entry was recorded from a specific job's
  // Pay Breakdown tab. When null, it was recorded from the Accounting page.
  // ON DELETE SET NULL — if the job is deleted the entry stays in the ledger.
  jobId: integer("job_id"),
  date: text("date").notNull(),
  description: text("description").notNull(),
  // Sign convention (canonical, enforced server-side):
  //   amount > 0  →  capital contribution / investment (owner puts money IN)
  //   amount < 0  →  withdrawal / distribution (owner takes money OUT)
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  // Audit trail: which path created this row.
  // Values: 'job_financials' | 'job_payroll' | 'accounting_overview' | 'banking' |
  //         'capital_entry_withdrawal' | 'capital_entry_injection' |
  //         'migrated_expense' | 'capital_entry' (legacy default)
  source: text("source").default("capital_entry"),
  // Dedup FK: links this row to the corresponding expenses row (when both exist).
  // Set whenever an owner-category expense and an owner_capital_entries row represent
  // the same cash event. My Pay reads ONLY from this table — expenseId prevents
  // double-counting in future audit queries but is never included in aggregations.
  expenseId: integer("expense_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type OwnerCapitalEntry = typeof ownerCapitalEntriesTable.$inferSelect;
