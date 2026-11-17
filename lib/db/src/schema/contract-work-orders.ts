import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";
import { clientsTable } from "./clients";
import { contactsTable } from "./contacts";
import { jobsTable } from "./jobs";
import { propertiesTable } from "./properties";
import { checklistTemplatesTable } from "./job-checklists";

export const contractClientProgramsTable = pgTable("contract_client_programs", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "restrict" }),
  payerClientId: integer("payer_client_id").notNull().references(() => clientsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  requiresInstallationPhotos: boolean("requires_installation_photos").notNull().default(false),
  requiresCompletionDocumentation: boolean("requires_completion_documentation").notNull().default(false),
  invoiceSubmissionEmail: text("invoice_submission_email"),
  invoiceSubmissionDeadlineHours: integer("invoice_submission_deadline_hours"),
  invoiceSubmissionInstructions: text("invoice_submission_instructions"),
  active: boolean("active").notNull().default(true),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("contract_client_programs_business_payer_name_uq").on(table.businessId, table.payerClientId, table.name),
  index("contract_client_programs_business_active_idx").on(table.businessId, table.active),
]);

export const insertContractClientProgramSchema = createInsertSchema(contractClientProgramsTable)
  .omit({ id: true, createdAt: true });
export type InsertContractClientProgram = z.infer<typeof insertContractClientProgramSchema>;
export type ContractClientProgram = typeof contractClientProgramsTable.$inferSelect;

export const contractClientWorkTypesTable = pgTable("contract_client_work_types", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => contractClientProgramsTable.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  displayName: text("display_name").notNull(),
  checklistTemplateId: integer("checklist_template_id").notNull().references(() => checklistTemplatesTable.id, { onDelete: "restrict" }),
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("contract_client_work_types_program_key_uq").on(table.programId, table.key),
  index("contract_client_work_types_program_active_idx").on(table.programId, table.active),
]);

export const CONTRACT_WORK_ORDER_STATUSES = ["pending_review", "accepted", "declined", "cancelled"] as const;
export const CONTRACT_INSTALLATION_TYPES = ["shower", "standard_tub", "walk_in_tub", "tub_to_shower_conversion"] as const;
export type ContractInstallationType = typeof CONTRACT_INSTALLATION_TYPES[number];

export const contractWorkOrdersTable = pgTable("contract_work_orders", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "restrict" }),
  programId: integer("program_id").notNull().references(() => contractClientProgramsTable.id, { onDelete: "restrict" }),
  externalOrderNumber: text("external_order_number").notNull(),
  title: text("title").notNull(),
  scope: text("scope"),
  installationType: text("installation_type"),
  workTypeId: integer("work_type_id").references(() => contractClientWorkTypesTable.id, { onDelete: "restrict" }),
  homeownerContactId: integer("homeowner_contact_id").references(() => contactsTable.id, { onDelete: "set null" }),
  propertyId: integer("property_id").references(() => propertiesTable.id, { onDelete: "set null" }),
  agreedPrice: numeric("agreed_price", { precision: 12, scale: 2 }),
  status: text("status").notNull().default("pending_review"),
  jobId: integer("job_id").references(() => jobsTable.id, { onDelete: "restrict" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedByUserId: text("accepted_by_user_id"),
  declinedAt: timestamp("declined_at", { withTimezone: true }),
  declinedByUserId: text("declined_by_user_id"),
  declineReason: text("decline_reason"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledByUserId: text("cancelled_by_user_id"),
  cancellationReason: text("cancellation_reason"),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  check("contract_work_orders_status_check", sql`${table.status} IN ('pending_review', 'accepted', 'declined', 'cancelled')`),
  check("contract_work_orders_price_nonnegative_check", sql`${table.agreedPrice} IS NULL OR ${table.agreedPrice} >= 0`),
  uniqueIndex("contract_work_orders_program_external_number_uq").on(table.programId, table.externalOrderNumber),
  uniqueIndex("contract_work_orders_job_uq").on(table.jobId).where(sql`${table.jobId} IS NOT NULL`),
  index("contract_work_orders_business_status_created_idx").on(table.businessId, table.status, table.createdAt),
  index("contract_work_orders_property_id_idx").on(table.propertyId),
]);

export const insertContractWorkOrderSchema = createInsertSchema(contractWorkOrdersTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContractWorkOrder = z.infer<typeof insertContractWorkOrderSchema>;
export type ContractWorkOrder = typeof contractWorkOrdersTable.$inferSelect;
