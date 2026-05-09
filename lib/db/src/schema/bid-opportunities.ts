import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const bidOpportunitiesTable = pgTable("bid_opportunities", {
  id: serial("id").primaryKey(),
  noticeId: text("notice_id").notNull().unique(),
  title: text("title").notNull(),
  agency: text("agency"),
  naicsCode: text("naics_code"),
  description: text("description"),
  postedDate: text("posted_date"),
  responseDeadline: text("response_deadline"),
  url: text("url"),
  status: text("status").notNull().default("new"),
  source: text("source").notNull().default("federal"),
  sourceLabel: text("source_label"),
  aiSummary: jsonb("ai_summary"),
  aiSummaryAt: timestamp("ai_summary_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BidOpportunity = typeof bidOpportunitiesTable.$inferSelect;
export type InsertBidOpportunity = typeof bidOpportunitiesTable.$inferInsert;
