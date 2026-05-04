import { pgTable, serial, text, timestamp, numeric } from "drizzle-orm/pg-core";

export const plaidConnectionsTable = pgTable("plaid_connections", {
  id: serial("id").primaryKey(),
  accessToken: text("access_token").notNull(),
  itemId: text("item_id").notNull().unique(),
  institutionId: text("institution_id"),
  institutionName: text("institution_name"),
  accountId: text("account_id"),
  accountName: text("account_name"),
  accountMask: text("account_mask"),
  accountType: text("account_type"),
  lastSyncedAt: timestamp("last_synced_at"),
  cachedBalanceCurrent: numeric("cached_balance_current"),
  cachedBalanceAvailable: numeric("cached_balance_available"),
  cachedBalanceCurrency: text("cached_balance_currency"),
  balanceCachedAt: timestamp("balance_cached_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PlaidConnection = typeof plaidConnectionsTable.$inferSelect;
