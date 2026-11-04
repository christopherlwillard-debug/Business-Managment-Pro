import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { materialListsTable } from "./material-lists";

export const materialListInvoiceEventsTable = pgTable("material_list_invoice_events", {
  id: serial("id").primaryKey(),
  materialListId: integer("material_list_id").references(() => materialListsTable.id, { onDelete: "set null" }),
  materialListNameSnapshot: text("material_list_name_snapshot").notNull(),
  action: text("action").notNull(),
  previousInvoiceId: integer("previous_invoice_id"),
  previousInvoiceLabel: text("previous_invoice_label"),
  destinationInvoiceId: integer("destination_invoice_id"),
  destinationInvoiceLabel: text("destination_invoice_label"),
  actorUserId: text("actor_user_id"),
  confirmedAfterFinalized: boolean("confirmed_after_finalized").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MaterialListInvoiceEvent = typeof materialListInvoiceEventsTable.$inferSelect;
