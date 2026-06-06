import { integer, pgTable, serial, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";

export const bidOpportunitiesTable = pgTable("bid_opportunities", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").references(() => businessesTable.id, { onDelete: "set null" }),
  noticeId: text("notice_id").notNull(),
  title: text("title").notNull(),
  agency: text("agency"),
  naicsCode: text("naics_code"),
  description: text("description"),
  postedDate: text("posted_date"),
  responseDeadline: text("response_deadline"),
  url: text("url"),
  status: text("status").notNull().default("new"),
  stage: text("stage").notNull().default("new"),
  notes: text("notes"),
  source: text("source").notNull().default("federal"),
  sourceLabel: text("source_label"),
  aiSummary: jsonb("ai_summary"),
  aiSummaryAt: timestamp("ai_summary_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  noticeBusinessUniq: uniqueIndex("bid_opportunities_notice_id_business_id_unique").on(table.noticeId, table.businessId),
}));

export type BidOpportunity = typeof bidOpportunitiesTable.$inferSelect;
export type InsertBidOpportunity = typeof bidOpportunitiesTable.$inferInsert;
