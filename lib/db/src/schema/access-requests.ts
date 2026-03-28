import { pgTable, serial, text, timestamp, jsonb, unique } from "drizzle-orm/pg-core";

export const accessRequestsTable = pgTable(
  "access_requests",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull().default(""),
    userEmail: text("user_email"),
    profileImageUrl: text("profile_image_url"),
    status: text("status").notNull().default("pending"),
    permissions: jsonb("permissions"),
    requestedAt: timestamp("requested_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => [unique("access_requests_user_id_unique").on(table.userId)],
);

export type AccessRequest = typeof accessRequestsTable.$inferSelect;
