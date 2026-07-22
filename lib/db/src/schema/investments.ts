import { pgTable, serial, text, timestamp, numeric, boolean, integer } from "drizzle-orm/pg-core";

export const investmentAccountsTable = pgTable("investment_accounts", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id"),
  name: text("name").notNull(),
  institution: text("institution"),
  accountType: text("account_type").notNull().default("Brokerage"),
  businessOrPersonal: text("business_or_personal").notNull().default("business"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  plaidAccountId: text("plaid_account_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type InvestmentAccount = typeof investmentAccountsTable.$inferSelect;
export type InsertInvestmentAccount = typeof investmentAccountsTable.$inferInsert;

export const investmentTransfersTable = pgTable("investment_transfers", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id"),
  investmentAccountId: integer("investment_account_id").notNull().references(() => investmentAccountsTable.id, { onDelete: "cascade" }),
  transferType: text("transfer_type").notNull().default("deposit"),
  date: text("date").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  sourceBankAccount: text("source_bank_account"),
  notes: text("notes"),
  bankTransactionId: integer("bank_transaction_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type InvestmentTransfer = typeof investmentTransfersTable.$inferSelect;
export type InsertInvestmentTransfer = typeof investmentTransfersTable.$inferInsert;

export const investmentAccountValuationsTable = pgTable("investment_account_valuations", {
  id: serial("id").primaryKey(),
  investmentAccountId: integer("investment_account_id").notNull().references(() => investmentAccountsTable.id, { onDelete: "cascade" }),
  portfolioValue: numeric("portfolio_value", { precision: 12, scale: 2 }).notNull(),
  valuationDate: text("valuation_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type InvestmentAccountValuation = typeof investmentAccountValuationsTable.$inferSelect;
export type InsertInvestmentAccountValuation = typeof investmentAccountValuationsTable.$inferInsert;

export const investmentTaxDocumentsTable = pgTable("investment_tax_documents", {
  id: serial("id").primaryKey(),
  investmentAccountId: integer("investment_account_id").notNull().references(() => investmentAccountsTable.id, { onDelete: "cascade" }),
  taxYear: integer("tax_year").notNull(),
  documentType: text("document_type").notNull().default("Other"),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type InvestmentTaxDocument = typeof investmentTaxDocumentsTable.$inferSelect;
export type InsertInvestmentTaxDocument = typeof investmentTaxDocumentsTable.$inferInsert;
