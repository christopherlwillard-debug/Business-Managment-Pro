import { boolean, integer, pgTable, serial, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
// NOTE: contract_type, scope_size, license_flags, out_of_scope_flags added in migration 0059
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
  // Phase 1 — capability-aware engine
  noticeType:        text("notice_type"),           // solicitation|sources_sought|presolicitation|combined_synopsis|award|other
  opportunityScore:  integer("opportunity_score"),   // 0–100 computed at sync time
  capabilityMatches: jsonb("capability_matches"),    // string[] of matched capabilityKey values
  // Phase 2 — opportunity classification
  opportunityType:   text("opportunity_type"),       // solicitation|sources_sought|presolicitation|subcontracting|forecast|award_intelligence
  setAsideType:      text("set_aside_type"),          // raw SAM.gov typeOfSetAside code stored at sync time (e.g. "SBA", "SDVOSB")
  // Phase 3 — education analysis
  educationSummary:  jsonb("education_summary"),     // EducationSummary JSON
  educationSummaryAt: timestamp("education_summary_at"),
  // Phase 4 — recommendation engine + official source lookup
  recommendation:           text("recommendation"),            // 'bid'|'review'|'pass'
  recommendationFactors:    jsonb("recommendation_factors"),   // RecommendationFactor[] JSON
  officialSourceUrl:        text("official_source_url"),       // resolved .gov URL when found
  officialSourceStatus:     text("official_source_status").notNull().default("not_checked"),
  officialSourceCheckedAt:  timestamp("official_source_checked_at"),
  // Phase 5 — industrial maintenance / contract-type intelligence (migration 0059)
  contractType:     text("contract_type"),                    // T&M | labor_hour | idiq | task_order | on_call | shutdown_turnaround | fixed_price | unknown
  scopeSize:        text("scope_size"),                       // small | medium | large | unknown
  licenseFlags:     jsonb("license_flags").default([]),       // string[] — items needing licensing verification
  outOfScopeFlags:  jsonb("out_of_scope_flags").default([]), // string[] — out-of-scope negative matches (shown, not hidden)
  // Phase 6 — qualification analysis + private opportunities (migration 0060)
  industrialQualSummary:     jsonb("industrial_qual_summary"),    // IndustrialQualSummary JSON — cached AI qualification analysis
  industrialQualSummaryAt:   timestamp("industrial_qual_summary_at"),
  isPrivateOpportunity:      boolean("is_private_opportunity").notNull().default(false),
  privateOpportunityContact: text("private_opportunity_contact"),
  privateSourceType:         text("private_source_type"),         // subcontract|direct_service|prequalification|on_call_list|purchasing_portal
  // Phase 7 — scope classification + data completeness (migration 0061)
  scopeCategory:             text("scope_category"),               // primary capability scope: asphalt|flooring|general_contracting|industrial_maintenance|mfg_homes|site_work|dump_waste|subcontracting
  dataCompleteness:          text("data_completeness").notNull().default("unknown"), // complete|partial|needs_verification|unknown
  sourceReferenceId:         text("source_reference_id"),          // external source's own ID (SAM.gov noticeId, BidNet solicitation id, etc.)
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  noticeBusinessUniq: uniqueIndex("bid_opportunities_notice_id_business_id_unique").on(table.noticeId, table.businessId),
}));

export type BidOpportunity = typeof bidOpportunitiesTable.$inferSelect;
export type InsertBidOpportunity = typeof bidOpportunitiesTable.$inferInsert;
