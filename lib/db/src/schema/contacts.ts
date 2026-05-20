import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const CONTACT_TYPES = [
  "Vendor",
  "Supplier",
  "Electrician",
  "Plumber",
  "Inspector",
  "Subcontractor",
  "Government",
  "Client",
  "Other",
] as const;

export type ContactType = (typeof CONTACT_TYPES)[number];

export const contactsTable = pgTable("contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  type: text("type"),
  title: text("title"),
  phone: text("phone"),
  fax: text("fax"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Contact = typeof contactsTable.$inferSelect;
export type NewContact = typeof contactsTable.$inferInsert;
