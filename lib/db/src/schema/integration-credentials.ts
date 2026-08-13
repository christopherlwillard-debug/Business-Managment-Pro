import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";

export const integrationCredentialsTable = pgTable("integration_credentials", {
  id:                  serial("id").primaryKey(),
  slug:                text("slug").notNull(),
  scope:               text("scope").notNull().default("platform"),
  businessId:          integer("business_id").references(() => businessesTable.id, { onDelete: "cascade" }),

  // ── Primary credential (API key or password) ──────────────────────────────
  encryptedValue:      text("encrypted_value"),        // AES-256-GCM: iv:tag:ciphertext (base64)
  keyHint:             text("key_hint"),               // last 4 chars only — safe to return to browser

  // ── Secondary credential (username for username/password portals) ─────────
  encryptedUsername:   text("encrypted_username"),     // AES-256-GCM: iv:tag:ciphertext — NEVER returned to browser
  usernameHint:        text("username_hint"),          // safe hint for display (e.g. "john@…" or "••••uname")

  // ── Portal metadata ────────────────────────────────────────────────────────
  portalUrl:           text("portal_url"),             // user-saved portal URL — safe to return to browser

  // ── Status & health ────────────────────────────────────────────────────────
  status:              text("status").notNull().default("unconfigured"),
  lastVerifiedAt:      timestamp("last_verified_at", { withTimezone: true }),
  lastVerifyError:     text("last_verify_error"),
  lastUsedAt:          timestamp("last_used_at", { withTimezone: true }),
  expiresAt:           timestamp("expires_at", { withTimezone: true }),
  renewalReminderDays: integer("renewal_reminder_days").default(30),
  notes:               text("notes"),

  // ── Audit ──────────────────────────────────────────────────────────────────
  createdAt:           timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type IntegrationCredential       = typeof integrationCredentialsTable.$inferSelect;
export type InsertIntegrationCredential = typeof integrationCredentialsTable.$inferInsert;
