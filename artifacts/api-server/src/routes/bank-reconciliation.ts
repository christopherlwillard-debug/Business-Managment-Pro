import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, bankImportBatchesTable, bankTransactionsTable, expensesTable, invoicesTable, otherIncomeTable } from "@workspace/db";
import { eq, and, gte, lte, sql, notLike } from "drizzle-orm";
import { wrapAsync } from "./guards";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function normalizeDate(raw: string | number | undefined): string | null {
  if (!raw && raw !== 0) return null;
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    return null;
  }
  const s = String(raw).trim();
  if (!s) return null;
  const mmddyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mmddyyyy) {
    const [, m, d, y] = mmddyyyy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const mmddyyyy2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (mmddyyyy2) {
    const [, m, d, y] = mmddyyyy2;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function normalizeAmount(raw: unknown): number {
  if (typeof raw === "number") return raw;
  const s = String(raw).replace(/[$,\s]/g, "");
  return parseFloat(s) || 0;
}

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  transactionType: "debit" | "credit";
}

function parseCSVTransactions(buffer: Buffer): ParsedTransaction[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (rows.length < 2) return [];

  const headers: string[] = (rows[0] as unknown[]).map((h) => String(h).trim().toLowerCase());

  function findCol(names: string[]): number {
    return headers.findIndex(h => names.some(n => h.includes(n)));
  }

  const colDate = findCol(["date", "posted", "trans date", "transaction date"]);
  const colDesc = findCol(["description", "desc", "memo", "payee", "detail", "transaction"]);
  const colAmount = findCol(["amount", "transaction amount"]);
  const colDebit = findCol(["debit", "withdrawal", "out"]);
  const colCredit = findCol(["credit", "deposit", "in"]);

  const transactions: ParsedTransaction[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const rawDate = colDate >= 0 ? row[colDate] : "";
    const rawDesc = colDesc >= 0 ? row[colDesc] : row[1] ?? "";
    const description = String(rawDesc).trim();
    if (!description) continue;

    const date = normalizeDate(rawDate as string | number);
    if (!date) continue;

    let amount = 0;
    let transactionType: "debit" | "credit" = "debit";

    if (colDebit >= 0 && colCredit >= 0) {
      const debitVal = normalizeAmount(row[colDebit]);
      const creditVal = normalizeAmount(row[colCredit]);
      if (creditVal > 0) {
        amount = creditVal;
        transactionType = "credit";
      } else {
        amount = debitVal;
        transactionType = "debit";
      }
    } else if (colAmount >= 0) {
      const raw = normalizeAmount(row[colAmount]);
      if (raw < 0) {
        amount = Math.abs(raw);
        transactionType = "debit";
      } else {
        amount = raw;
        transactionType = "credit";
      }
    } else {
      continue;
    }

    if (amount <= 0) continue;
    transactions.push({ date, description, amount, transactionType });
  }

  return transactions;
}

function dateToTs(dateStr: string): number {
  return new Date(dateStr + "T00:00:00Z").getTime();
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

async function autoMatch(transactions: ParsedTransaction[]): Promise<{ suggestedMatchType: string | null; suggestedMatchId: number | null }[]> {
  if (transactions.length === 0) return [];

  const dates = transactions.map(t => t.date).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  const windowMin = new Date(new Date(minDate + "T00:00:00Z").getTime() - THREE_DAYS_MS).toISOString().slice(0, 10);
  const windowMax = new Date(new Date(maxDate + "T00:00:00Z").getTime() + THREE_DAYS_MS).toISOString().slice(0, 10);

  const [expenses, invoices, otherIncome] = await Promise.all([
    db.select({ id: expensesTable.id, amount: expensesTable.amount, date: expensesTable.date })
      .from(expensesTable)
      .where(and(gte(expensesTable.date, windowMin), lte(expensesTable.date, windowMax))),
    db.select({ id: invoicesTable.id, total: invoicesTable.total, issueDate: invoicesTable.issueDate, status: invoicesTable.status })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.status, "paid"), gte(invoicesTable.issueDate, windowMin), lte(invoicesTable.issueDate, windowMax))),
    db.select({ id: otherIncomeTable.id, amount: otherIncomeTable.amount, date: otherIncomeTable.date })
      .from(otherIncomeTable)
      .where(and(gte(otherIncomeTable.date, windowMin), lte(otherIncomeTable.date, windowMax))),
  ]);

  return transactions.map(tx => {
    const txTs = dateToTs(tx.date);

    if (tx.transactionType === "debit") {
      for (const exp of expenses) {
        const expAmt = Math.abs(parseFloat(exp.amount ?? "0"));
        const expTs = dateToTs(exp.date);
        if (Math.abs(expAmt - tx.amount) < 0.02 && Math.abs(expTs - txTs) <= THREE_DAYS_MS) {
          return { suggestedMatchType: "expense", suggestedMatchId: exp.id };
        }
      }
    } else {
      for (const inv of invoices) {
        const invAmt = parseFloat(inv.total ?? "0");
        const invTs = dateToTs(inv.issueDate);
        if (Math.abs(invAmt - tx.amount) < 0.02 && Math.abs(invTs - txTs) <= THREE_DAYS_MS) {
          return { suggestedMatchType: "invoice", suggestedMatchId: inv.id };
        }
      }
      for (const oi of otherIncome) {
        const oiAmt = parseFloat(oi.amount ?? "0");
        const oiTs = dateToTs(oi.date);
        if (Math.abs(oiAmt - tx.amount) < 0.02 && Math.abs(oiTs - txTs) <= THREE_DAYS_MS) {
          return { suggestedMatchType: "other_income", suggestedMatchId: oi.id };
        }
      }
    }

    return { suggestedMatchType: null, suggestedMatchId: null };
  });
}

// POST /api/bank-reconciliation/parse — parse CSV, return preview (no DB save)
router.post("/parse", upload.single("file"), wrapAsync(async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  try {
    const transactions = parseCSVTransactions(req.file.buffer);
    const suggestions = await autoMatch(transactions);
    const rows = transactions.map((t, i) => ({ ...t, ...suggestions[i] }));
    res.json({ rows, fileName: req.file.originalname, rowCount: rows.length });
  } catch (err) {
    res.status(400).json({ error: "Failed to parse CSV. Please check the file format." });
  }
}));

// POST /api/bank-reconciliation/batches — confirm and save a batch
router.post("/batches", wrapAsync(async (req, res) => {
  const { accountName, fileName, transactions } = req.body as {
    accountName: string;
    fileName?: string;
    transactions: Array<{
      date: string;
      description: string;
      amount: number;
      transactionType: string;
      suggestedMatchType?: string | null;
      suggestedMatchId?: number | null;
    }>;
  };
  if (!accountName || !Array.isArray(transactions) || transactions.length === 0) {
    res.status(400).json({ error: "accountName and transactions are required" });
    return;
  }

  const [batch] = await db.insert(bankImportBatchesTable).values({
    accountName,
    fileName: fileName ?? null,
    rowCount: transactions.length,
  }).returning();

  await db.insert(bankTransactionsTable).values(
    transactions.map(t => ({
      importBatchId: batch.id,
      date: t.date,
      description: t.description,
      amount: String(t.amount),
      transactionType: t.transactionType,
      status: "unmatched" as const,
      suggestedMatchType: t.suggestedMatchType ?? null,
      suggestedMatchId: t.suggestedMatchId ?? null,
    }))
  );

  res.status(201).json(batch);
}));

// GET /api/bank-reconciliation/batches — list all batches with counts (excludes Plaid-auto batches)
router.get("/batches", wrapAsync(async (req, res) => {
  const batches = await db.select().from(bankImportBatchesTable)
    .where(notLike(bankImportBatchesTable.fileName, "plaid-conn-%"))
    .orderBy(sql`${bankImportBatchesTable.importedAt} DESC`);

  const batchesWithCounts = await Promise.all(batches.map(async b => {
    const txs = await db.select().from(bankTransactionsTable).where(eq(bankTransactionsTable.importBatchId, b.id));
    const matched = txs.filter(t => t.status === "matched").length;
    const ignored = txs.filter(t => t.status === "ignored").length;
    const unmatched = txs.filter(t => t.status === "unmatched").length;
    return { ...b, matched, ignored, unmatched, total: txs.length };
  }));

  res.json(batchesWithCounts);
}));

// GET /api/bank-reconciliation/batches/:id/transactions — list transactions for a batch
router.get("/batches/:id/transactions", wrapAsync(async (req, res) => {
  const batchId = parseInt(req.params.id as string);
  if (isNaN(batchId)) { res.status(400).json({ error: "Invalid batch id" }); return; }

  const txs = await db.select().from(bankTransactionsTable)
    .where(eq(bankTransactionsTable.importBatchId, batchId))
    .orderBy(sql`${bankTransactionsTable.date} ASC, ${bankTransactionsTable.id} ASC`);

  res.json(txs.map(t => ({
    ...t,
    amount: parseFloat(t.amount as string),
  })));
}));

// PATCH /api/bank-reconciliation/transactions/:id — update status/match
router.patch("/transactions/:id", wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { status, matchedExpenseId, matchedInvoiceId, matchedOtherIncomeId } = req.body;
  const ALLOWED_STATUSES = ["unmatched", "matched", "ignored"];
  if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
    res.status(400).json({ error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(", ")}` });
    return;
  }
  const updates: Partial<typeof bankTransactionsTable.$inferInsert> = {};

  if (status !== undefined) updates.status = status;
  if (matchedExpenseId !== undefined) {
    updates.matchedExpenseId = matchedExpenseId;
    if (matchedExpenseId) { updates.status = "matched"; updates.matchedInvoiceId = null; updates.matchedOtherIncomeId = null; }
  }
  if (matchedInvoiceId !== undefined) {
    updates.matchedInvoiceId = matchedInvoiceId;
    if (matchedInvoiceId) { updates.status = "matched"; updates.matchedExpenseId = null; updates.matchedOtherIncomeId = null; }
  }
  if (matchedOtherIncomeId !== undefined) {
    updates.matchedOtherIncomeId = matchedOtherIncomeId;
    if (matchedOtherIncomeId) { updates.status = "matched"; updates.matchedExpenseId = null; updates.matchedInvoiceId = null; }
  }

  const [row] = await db.update(bankTransactionsTable).set(updates).where(eq(bankTransactionsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, amount: parseFloat(row.amount as string) });
}));

// DELETE /api/bank-reconciliation/batches/:id — delete batch + cascade transactions
router.delete("/batches/:id", wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(bankImportBatchesTable).where(eq(bankImportBatchesTable.id, id));
  res.status(204).end();
}));

export default router;
