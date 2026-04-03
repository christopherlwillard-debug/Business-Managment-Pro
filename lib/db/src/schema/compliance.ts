import { pgTable, serial, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export interface ComplianceDocument {
  objectPath: string;
  fileName: string;
  uploadedAt: string;
}

export const complianceItemsTable = pgTable("compliance_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull().default("Other"),
  jurisdiction: text("jurisdiction"),
  dueDate: text("due_date").notNull(),
  recurrence: text("recurrence").default("one-time"),
  status: text("status").notNull().default("upcoming"),
  notes: text("notes"),
  enabled: boolean("enabled").notNull().default(true),
  documents: jsonb("documents").$type<ComplianceDocument[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ComplianceItem = typeof complianceItemsTable.$inferSelect;

export const kyFilingSettingsTable = pgTable("ky_filing_settings", {
  filingId: text("filing_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  documents: jsonb("documents").$type<ComplianceDocument[]>().notNull().default([]),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type KyFilingSetting = typeof kyFilingSettingsTable.$inferSelect;
