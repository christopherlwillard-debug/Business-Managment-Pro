import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { invoicesTable } from "./invoices";
import { businessesTable } from "./businesses";

export const invoiceCommunicationEventsTable = pgTable("invoice_communication_events", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoicesTable.id, { onDelete: "cascade" }),
  businessId: integer("business_id")
    .references(() => businessesTable.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  channel: text("channel").notNull(),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("pending"),
  recipient: text("recipient"),
  subject: text("subject"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  source: text("source").notNull().default("user"),
  actorUserId: text("actor_user_id"),
  actorName: text("actor_name"),
  providerMessageId: text("provider_message_id"),
  providerThreadId: text("provider_thread_id"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").default({}),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("invoice_communication_events_idempotency_key_unique")
    .on(table.idempotencyKey)
    .where(sql`${table.idempotencyKey} IS NOT NULL`),
]);

export const insertInvoiceCommunicationEventSchema = createInsertSchema(invoiceCommunicationEventsTable)
  .omit({ id: true, createdAt: true });
export type InsertInvoiceCommunicationEvent = z.infer<typeof insertInvoiceCommunicationEventSchema>;
export type InvoiceCommunicationEvent = typeof invoiceCommunicationEventsTable.$inferSelect;