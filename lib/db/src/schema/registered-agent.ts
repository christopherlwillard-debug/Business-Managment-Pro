import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const registeredAgentsTable = pgTable("registered_agents", {
  id: serial("id").primaryKey(),
  agentName: text("agent_name"),
  companyName: text("company_name"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  state: text("state"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type RegisteredAgent = typeof registeredAgentsTable.$inferSelect;

export const registeredAgentTasksTable = pgTable("registered_agent_tasks", {
  id: serial("id").primaryKey(),
  registeredAgentId: integer("registered_agent_id")
    .notNull()
    .references(() => registeredAgentsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  recurrence: text("recurrence").notNull().default("annual"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type RegisteredAgentTask = typeof registeredAgentTasksTable.$inferSelect;
