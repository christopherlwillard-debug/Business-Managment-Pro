import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const complianceItemsTable = pgTable("compliance_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull().default("Other"),
  jurisdiction: text("jurisdiction"),
  dueDate: text("due_date").notNull(),
  recurrence: text("recurrence").default("one-time"),
  status: text("status").notNull().default("upcoming"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ComplianceItem = typeof complianceItemsTable.$inferSelect;
