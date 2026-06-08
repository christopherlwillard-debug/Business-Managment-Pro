import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const clientErrorsTable = pgTable("client_errors", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  stack: text("stack"),
  componentStack: text("component_stack"),
  location: text("location"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  count: integer("count").notNull().default(1),
});

export type ClientError = typeof clientErrorsTable.$inferSelect;
