import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";

export const growthFundDeploymentsTable = pgTable("growth_fund_deployments", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").references(() => businessesTable.id, { onDelete: "set null" }),
  createdBy: text("created_by"),
  date: text("date").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type GrowthFundDeployment = typeof growthFundDeploymentsTable.$inferSelect;
