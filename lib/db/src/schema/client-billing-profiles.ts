import { pgTable, serial, text, timestamp, integer, smallint, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const clientBillingProfilesTable = pgTable("client_billing_profiles", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id).notNull(),
  name: text("name").notNull(),
  repairRate1Tech: numeric("repair_rate_1tech", { precision: 10, scale: 2 }),
  repairRate2Tech: numeric("repair_rate_2tech", { precision: 10, scale: 2 }),
  driveRate1Tech: numeric("drive_rate_1tech", { precision: 10, scale: 2 }),
  driveRate2Tech: numeric("drive_rate_2tech", { precision: 10, scale: 2 }),
  mileageRate: numeric("mileage_rate", { precision: 10, scale: 2 }),
  partsReimbursable: boolean("parts_reimbursable").notNull().default(true),
  defaultTechCount: smallint("default_tech_count").notNull().default(2),
  billingNotes: text("billing_notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertClientBillingProfileSchema = createInsertSchema(clientBillingProfilesTable).omit({ id: true, createdAt: true });
export type InsertClientBillingProfile = z.infer<typeof insertClientBillingProfileSchema>;
export type ClientBillingProfile = typeof clientBillingProfilesTable.$inferSelect;
