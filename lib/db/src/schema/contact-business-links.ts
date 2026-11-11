import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { clientsTable } from "./clients";
import { contactsTable } from "./contacts";

export const contactBusinessLinksTable = pgTable("contact_business_links", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contactsTable.id, { onDelete: "cascade" }),
  legalBusinessId: integer("legal_business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  role: text("role").notNull().default("associated"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("contact_business_links_legal_business_id_idx").on(table.legalBusinessId),
  uniqueIndex("contact_business_links_contact_business_no_client_uq")
    .on(table.contactId, table.legalBusinessId, table.role)
    .where(sql`${table.clientId} IS NULL`),
  uniqueIndex("contact_business_links_contact_business_client_uq")
    .on(table.contactId, table.legalBusinessId, table.clientId, table.role)
    .where(sql`${table.clientId} IS NOT NULL`),
]);

export const insertContactBusinessLinkSchema = createInsertSchema(contactBusinessLinksTable)
  .omit({ id: true, createdAt: true });
export type InsertContactBusinessLink = z.infer<typeof insertContactBusinessLinkSchema>;
export type ContactBusinessLink = typeof contactBusinessLinksTable.$inferSelect;
