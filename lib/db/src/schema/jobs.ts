import { pgTable, serial, text, timestamp, integer, smallint, boolean, jsonb, date, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { subcontractorsTable } from "./subcontractors";

export const phaseItemSchema = z.object({
  name: z.string(),
  completed: z.boolean(),
});
export type PhaseItem = z.infer<typeof phaseItemSchema>;

export const permitChecklistItemSchema = z.object({
  label: z.string(),
  checked: z.boolean(),
});
export type PermitChecklistItem = z.infer<typeof permitChecklistItemSchema>;

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  clientId: integer("client_id").references(() => clientsTable.id),
  subcontractorId: integer("subcontractor_id").references(() => subcontractorsTable.id),
  status: text("status").notNull().default("scheduled"),
  jobType: text("job_type"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  locationName: text("location_name"),
  notes: text("notes"),
  businessLine: text("business_line"),
  subPaid: boolean("sub_paid").notNull().default(false),
  sqFt: integer("sq_ft"),
  coats: smallint("coats").default(1),
  phases: jsonb("phases").$type<PhaseItem[]>(),
  permitChecklist: jsonb("permit_checklist").$type<PermitChecklistItem[]>(),
  homeModel: text("home_model"),
  mfhManufacturerId: integer("mfh_manufacturer_id"),
  mfhModelId: integer("mfh_model_id"),
  mfhModelYear: integer("mfh_model_year"),
  mfhDealerPrice: numeric("mfh_dealer_price", { precision: 12, scale: 2 }),
  mfhQuotedPrice: numeric("mfh_quoted_price", { precision: 12, scale: 2 }),
  mfhGuideName: text("mfh_guide_name"),
  closedAt: date("closed_at"),
  jobNumber: integer("job_number"),
  ownerPayIncluded: boolean("owner_pay_included").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true, createdAt: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
