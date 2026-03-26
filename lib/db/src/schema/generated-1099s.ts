import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { subcontractorsTable } from "./subcontractors";

export const generated1099sTable = pgTable("generated_1099s", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  subcontractorId: integer("subcontractor_id").notNull().references(() => subcontractorsTable.id),
  taxYear: integer("tax_year").notNull(),
  totalPaid: numeric("total_paid", { precision: 12, scale: 2 }).notNull(),
  pdfData: text("pdf_data"), // base64-encoded PDF blob
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

export const insertGenerated1099Schema = createInsertSchema(generated1099sTable).omit({ id: true, generatedAt: true });
export type InsertGenerated1099 = z.infer<typeof insertGenerated1099Schema>;
export type Generated1099 = typeof generated1099sTable.$inferSelect;
