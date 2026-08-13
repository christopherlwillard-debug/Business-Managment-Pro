import { boolean, date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";

// ── Crew members ──────────────────────────────────────────────────────────────
export const crewMembersTable = pgTable("crew_members", {
  id:         serial("id").primaryKey(),
  businessId: integer("business_id").references(() => businessesTable.id, { onDelete: "cascade" }),
  name:       text("name").notNull(),
  role:       text("role").notNull().default("crew"),   // owner | crew | subcontractor
  title:      text("title"),
  email:      text("email"),
  phone:      text("phone"),
  notes:      text("notes"),
  active:     boolean("active").notNull().default(true),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
  updatedAt:  timestamp("updated_at").defaultNow().notNull(),
});

export type CrewMember       = typeof crewMembersTable.$inferSelect;
export type InsertCrewMember = typeof crewMembersTable.$inferInsert;

// ── Crew certifications ───────────────────────────────────────────────────────
export const crewCertificationsTable = pgTable("crew_certifications", {
  id:                  serial("id").primaryKey(),
  crewMemberId:        integer("crew_member_id").notNull().references(() => crewMembersTable.id, { onDelete: "cascade" }),
  certificationName:   text("certification_name").notNull(),
  issuingBody:         text("issuing_body"),
  certNumber:          text("cert_number"),
  issuedDate:          date("issued_date"),
  expiresAt:           date("expires_at"),
  // active | expiring_soon | expired | unknown
  status:              text("status").notNull().default("unknown"),
  notes:               text("notes"),
  createdAt:           timestamp("created_at").defaultNow().notNull(),
  updatedAt:           timestamp("updated_at").defaultNow().notNull(),
});

export type CrewCertification       = typeof crewCertificationsTable.$inferSelect;
export type InsertCrewCertification = typeof crewCertificationsTable.$inferInsert;
