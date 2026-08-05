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
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type OwnerCapitalEntry = typeof ownerCapitalEntriesTable.$inferSelect;
