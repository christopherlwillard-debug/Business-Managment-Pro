import { createInsertSchema } from "drizzle-zod";
import {
  index,
  integer,
  jsonb,
  check,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { estimatesTable } from "./estimates";

export const estimateQuoteEventsTable = pgTable("estimate_quote_events", {
  id: serial("id").primaryKey(),
  estimateId: integer("estimate_id")
    .notNull()
    .references(() => estimatesTable.id, { onDelete: "restrict" }),
  businessId: integer("business_id")
    .notNull()
    .references(() => businessesTable.id, { onDelete: "restrict" }),
  revisionSnapshotId: integer("revision_snapshot_id")
    .references((): AnyPgColumn => estimateQuoteEventsTable.id, { onDelete: "restrict" }),
  relatedEventId: integer("related_event_id")
    .references((): AnyPgColumn => estimateQuoteEventsTable.id, { onDelete: "restrict" }),
  revision: integer("revision").notNull(),
  eventType: text("event_type").notNull(),
  status: text("status").notNull(),
  recipient: text("recipient"),
  actorUserId: text("actor_user_id"),
  actorName: text("actor_name"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  provider: text("provider"),
  providerMessageId: text("provider_message_id"),
  providerThreadId: text("provider_thread_id"),
  idempotencyKey: text("idempotency_key"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  responseType: text("response_type"),
  responseText: text("response_text"),
  tokenHash: text("token_hash"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  tokenActivatedAt: timestamp("token_activated_at", { withTimezone: true }),
  tokenRevokedAt: timestamp("token_revoked_at", { withTimezone: true }),
  contentHash: text("content_hash"),
  customerSnapshot: jsonb("customer_snapshot"),
  pdfObjectPath: text("pdf_object_path"),
  logoObjectPath: text("logo_object_path"),
  logoContentType: text("logo_content_type"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("estimate_quote_events_revision_positive_check", sql`${table.revision} > 0`),
  check("estimate_quote_events_type_status_check", sql`(
    (${table.eventType} = 'revision' AND ${table.status} IN ('snapshot', 'accepted'))
    OR (${table.eventType} = 'send_attempt' AND ${table.status} IN ('pending', 'accepted', 'failed', 'unresolved'))
    OR (${table.eventType} = 'view' AND ${table.status} = 'viewed')
    OR (${table.eventType} = 'response' AND ${table.status} = 'recorded')
    OR (${table.eventType} = 'manual_response' AND ${table.status} = 'recorded')
    OR (${table.eventType} = 'work_authorization' AND ${table.status} = 'authorized')
    OR (${table.eventType} = 'follow_up_scheduled' AND ${table.status} = 'scheduled')
    OR (${table.eventType} = 'follow_up_completed' AND ${table.status} = 'completed')
    OR (${table.eventType} = 'archive' AND ${table.status} = 'archived')
    OR (${table.eventType} = 'restore' AND ${table.status} = 'restored')
  )`),
  check("estimate_quote_events_response_shape_check", sql`(
    (${table.eventType} IN ('response', 'manual_response') AND ${table.responseType} IS NOT NULL)
    OR (${table.eventType} NOT IN ('response', 'manual_response') AND ${table.responseType} IS NULL)
  )`),
  index("estimate_quote_events_estimate_requested_idx").on(table.estimateId, table.requestedAt),
  index("estimate_quote_events_business_requested_idx").on(table.businessId, table.requestedAt),
  index("estimate_quote_events_revision_snapshot_idx").on(table.revisionSnapshotId),
  index("estimate_quote_events_related_event_idx").on(table.relatedEventId),
  index("estimate_quote_events_follow_up_due_idx")
    .on(table.businessId, table.dueAt)
    .where(sql`${table.eventType} = 'follow_up_scheduled' AND ${table.status} = 'scheduled'`),
  uniqueIndex("estimate_quote_events_idempotency_key_unique")
    .on(table.idempotencyKey)
    .where(sql`${table.idempotencyKey} IS NOT NULL`),
  uniqueIndex("estimate_quote_events_token_hash_unique")
    .on(table.tokenHash)
    .where(sql`${table.tokenHash} IS NOT NULL`),
  uniqueIndex("estimate_quote_events_one_response_per_revision")
    .on(table.revisionSnapshotId)
    .where(sql`${table.eventType} = 'response'`),
]);

export const insertEstimateQuoteEventSchema = createInsertSchema(estimateQuoteEventsTable)
  .omit({ id: true, createdAt: true });
export type InsertEstimateQuoteEvent = z.infer<typeof insertEstimateQuoteEventSchema>;
export type EstimateQuoteEvent = typeof estimateQuoteEventsTable.$inferSelect;
