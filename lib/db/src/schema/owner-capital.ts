import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const ownerCapitalEntriesTable = pgTable("owner_capital_entries", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id"),
  date: text("date").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type OwnerCapitalEntry = typeof ownerCapitalEntriesTable.$inferSelect;
