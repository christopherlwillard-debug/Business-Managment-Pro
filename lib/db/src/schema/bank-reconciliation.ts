import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { expensesTable } from "./expenses";
import { invoicesTable } from "./invoices";
import { otherIncomeTable } from "./other-income";

export const bankImportBatchesTable = pgTable("bank_import_batches", {
  id: serial("id").primaryKey(),
  accountName: text("account_name").notNull(),
  fileName: text("file_name"),
  rowCount: integer("row_count").notNull().default(0),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bankTransactionsTable = pgTable("bank_transactions", {
  id: serial("id").primaryKey(),
  importBatchId: integer("import_batch_id").notNull().references(() => bankImportBatchesTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  transactionType: text("transaction_type").notNull(),
  status: text("status").notNull().default("unmatched"),
  matchedExpenseId: integer("matched_expense_id").references(() => expensesTable.id, { onDelete: "set null" }),
  matchedInvoiceId: integer("matched_invoice_id").references(() => invoicesTable.id, { onDelete: "set null" }),
  matchedOtherIncomeId: integer("matched_other_income_id").references(() => otherIncomeTable.id, { onDelete: "set null" }),
  suggestedMatchType: text("suggested_match_type"),
  suggestedMatchId: integer("suggested_match_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BankImportBatch = typeof bankImportBatchesTable.$inferSelect;
export type BankTransaction = typeof bankTransactionsTable.$inferSelect;
