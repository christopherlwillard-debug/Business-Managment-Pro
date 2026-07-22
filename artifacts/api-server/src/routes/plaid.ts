import { Router } from "express";
import { db } from "@workspace/db";
import {
  plaidConnectionsTable,
  bankImportBatchesTable,
  bankTransactionsTable,
} from "@workspace/db";
import { expensesTable, otherIncomeTable, invoicesTable } from "@workspace/db/schema";
import { eq, like, isNotNull, isNull, and, gte, lte, notInArray, sql } from "drizzle-orm";

import { getPlaidClient, isPlaidConfigured, extractPlaidError } from "../lib/plaid.js";
import { CountryCode, Products } from "plaid";
import { wrapAsync, getOwnerId, getRequestUserId } from "./guards.js";

// Extract a payment reference code from a description (e.g. "JPM99clqfe2r" from Zelle).
function extractRefCode(desc: string): string | null {
  const m = desc.match(/\b([A-Z0-9]{8,})\b/i);
  return m ? m[1].toLowerCase() : null;
}

// Build date strings ±N days around a YYYY-MM-DD date string.
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const router = Router();

function requireOwnerMiddleware() {
  return wrapAsync(async (req, res, next) => {
    const userId = getRequestUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const ownerId = await getOwnerId();
    if (ownerId !== userId) { res.status(403).json({ error: "Owner access required" }); return; }
    next();
  });
}

router.use(requireOwnerMiddleware());

function plaidAccountLabel(connection: { institutionName: string | null; accountName: string | null }): string {
  if (connection.institutionName && connection.accountName) {
    return `${connection.institutionName} – ${connection.accountName}`;
  }
  return connection.institutionName ?? connection.accountName ?? "Connected Bank";
}

async function deletePlaidDataForConnection(connectionId: number): Promise<void> {
  // Delete Plaid-sourced transactions EXCEPT those linked to an investment transfer.
  // Investment transfer records are permanent accounting entries — the bank transaction
  // is their audit trail and must be preserved even when the Plaid connection changes.
  await db
    .delete(bankTransactionsTable)
    .where(
      and(
        isNotNull(bankTransactionsTable.plaidTransactionId),
        isNull(bankTransactionsTable.investmentTransferId),
      )
    );

  // Also clean up any legacy plaid-auto batches (and their transactions via cascade)
  const legacyBatches = await db
    .select({ id: bankImportBatchesTable.id })
    .from(bankImportBatchesTable)
    .where(like(bankImportBatchesTable.fileName, `plaid-conn-${connectionId}-%`));

  for (const b of legacyBatches) {
    await db
      .delete(bankImportBatchesTable)
      .where(eq(bankImportBatchesTable.id, b.id));
  }
}

router.get("/status", (req, res) => {
  res.json({ configured: isPlaidConfigured() });
});

router.post("/link-token", wrapAsync(async (req, res) => {
  if (!isPlaidConfigured()) {
    res.status(503).json({ error: "Plaid is not configured. Set PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV in environment secrets." });
    return;
  }
  const client = getPlaidClient();
  try {
    const response = await client.linkTokenCreate({
      user: { client_user_id: "willard-gc" },
      client_name: "Willard's General Contracting",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    const plaidErr = extractPlaidError(err);
    if (plaidErr) {
      const rawData = (err as { response?: { data?: unknown } }).response?.data;
      console.error("[Plaid] link-token error (raw):", JSON.stringify(rawData, null, 2));
      console.error("[Plaid] link-token error (parsed):", JSON.stringify(plaidErr, null, 2));
      const userMessage =
        plaidErr.error_code === "INVALID_PRODUCT"
          ? "The Transactions product hasn't been approved for your Plaid production account yet. Complete the production approval in your Plaid dashboard."
          : plaidErr.display_message ?? `Plaid error: ${plaidErr.error_code} — ${plaidErr.error_message}`;
      res.status(502).json({ error: userMessage, plaid_error_code: plaidErr.error_code, plaid_error_type: plaidErr.error_type });
    } else {
      console.error("[Plaid] link-token unexpected error:", err);
      throw err;
    }
  }
}));

router.post("/exchange-token", wrapAsync(async (req, res) => {
  if (!isPlaidConfigured()) {
    res.status(503).json({ error: "Plaid is not configured." });
    return;
  }
  const { public_token, metadata } = req.body as {
    public_token: string;
    metadata: {
      institution?: { institution_id?: string; name?: string };
      accounts?: Array<{ id: string; name: string; mask: string; type: string }>;
    };
  };

  if (!public_token) {
    res.status(400).json({ error: "public_token is required" });
    return;
  }

  const client = getPlaidClient();
  const exchangeResponse = await client.itemPublicTokenExchange({ public_token });
  const { access_token, item_id } = exchangeResponse.data;

  const account = metadata?.accounts?.[0];
  const institution = metadata?.institution;

  const existing = await db.select().from(plaidConnectionsTable);
  for (const conn of existing) {
    try {
      if (isPlaidConfigured()) {
        const c = getPlaidClient();
        await c.itemRemove({ access_token: conn.accessToken });
      }
    } catch {
    }
    await deletePlaidDataForConnection(conn.id);
    await db.delete(plaidConnectionsTable).where(eq(plaidConnectionsTable.id, conn.id));
  }

  const [connection] = await db
    .insert(plaidConnectionsTable)
    .values({
      accessToken: access_token,
      itemId: item_id,
      institutionId: institution?.institution_id ?? null,
      institutionName: institution?.name ?? null,
      accountId: account?.id ?? null,
      accountName: account?.name ?? null,
      accountMask: account?.mask ?? null,
      accountType: account?.type ?? null,
    })
    .returning();

  res.json({
    id: connection.id,
    institutionName: connection.institutionName,
    accountName: connection.accountName,
    accountMask: connection.accountMask,
    accountType: connection.accountType,
  });
}));

router.get("/connection", wrapAsync(async (req, res) => {
  const connections = await db.select().from(plaidConnectionsTable).limit(1);
  if (connections.length === 0) {
    res.json(null);
    return;
  }
  const c = connections[0];
  res.json({
    id: c.id,
    institutionName: c.institutionName,
    accountName: c.accountName,
    accountMask: c.accountMask,
    accountType: c.accountType,
    lastSyncedAt: c.lastSyncedAt,
    createdAt: c.createdAt,
  });
}));

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

router.get("/balance", wrapAsync(async (req, res) => {
  const connections = await db.select().from(plaidConnectionsTable).limit(1);
  if (connections.length === 0) {
    res.status(404).json({ error: "No bank account connected" });
    return;
  }

  const connection = connections[0];
  const forceRefresh = req.query.force === "true";

  // Return cached balance if it's less than 30 days old (unless force-refreshed)
  const cacheAge = connection.balanceCachedAt
    ? Date.now() - new Date(connection.balanceCachedAt).getTime()
    : Infinity;

  if (!forceRefresh && cacheAge < THIRTY_DAYS_MS && connection.cachedBalanceCurrent != null) {
    res.json({
      available: connection.cachedBalanceAvailable != null ? parseFloat(connection.cachedBalanceAvailable) : null,
      current: parseFloat(connection.cachedBalanceCurrent),
      currency: connection.cachedBalanceCurrency ?? "USD",
      cachedAt: connection.balanceCachedAt,
    });
    return;
  }

  // Cache is stale or missing — fetch live from Plaid and store it
  if (!isPlaidConfigured()) {
    res.status(503).json({ error: "Plaid is not configured." });
    return;
  }

  const client = getPlaidClient();
  const response = await client.accountsGet({ access_token: connection.accessToken });

  const account = connection.accountId
    ? response.data.accounts.find((a) => a.account_id === connection.accountId)
    : response.data.accounts[0];

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const now = new Date();
  await db
    .update(plaidConnectionsTable)
    .set({
      cachedBalanceCurrent: account.balances.current != null ? String(account.balances.current) : null,
      cachedBalanceAvailable: account.balances.available != null ? String(account.balances.available) : null,
      cachedBalanceCurrency: account.balances.iso_currency_code ?? "USD",
      balanceCachedAt: now,
    })
    .where(eq(plaidConnectionsTable.id, connection.id));

  res.json({
    available: account.balances.available,
    current: account.balances.current,
    currency: account.balances.iso_currency_code ?? "USD",
    cachedAt: now,
  });
}));

router.get("/transactions", wrapAsync(async (req, res) => {
  const connections = await db.select().from(plaidConnectionsTable).limit(1);
  if (connections.length === 0) {
    res.json([]);
    return;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const txns = await db
    .select({
      id: bankTransactionsTable.id,
      date: bankTransactionsTable.date,
      description: bankTransactionsTable.description,
      amount: bankTransactionsTable.amount,
      transactionType: bankTransactionsTable.transactionType,
      status: bankTransactionsTable.status,
      matchedExpenseId: bankTransactionsTable.matchedExpenseId,
      matchedInvoiceId: bankTransactionsTable.matchedInvoiceId,
      matchedOtherIncomeId: bankTransactionsTable.matchedOtherIncomeId,
      matchedExpenseDescription: expensesTable.description,
      matchedExpenseCategory: expensesTable.category,
      matchedExpenseDate: expensesTable.date,
      matchedExpenseVendor: expensesTable.vendor,
      matchedExpenseAmount: expensesTable.amount,
      matchedExpenseJobId: expensesTable.jobId,
    })
    .from(bankTransactionsTable)
    .leftJoin(expensesTable, eq(bankTransactionsTable.matchedExpenseId, expensesTable.id))
    .where(
      and(
        isNotNull(bankTransactionsTable.plaidTransactionId),
        gte(bankTransactionsTable.date, thirtyDaysAgo)
      )
    )
    .orderBy(bankTransactionsTable.date);

  res.json(txns);
}));

router.post("/sync", wrapAsync(async (req, res) => {
  const connections = await db.select().from(plaidConnectionsTable).limit(1);
  if (connections.length === 0) {
    res.status(404).json({ error: "No bank account connected" });
    return;
  }
  if (!isPlaidConfigured()) {
    res.status(503).json({ error: "Plaid is not configured." });
    return;
  }
  const connection = connections[0];
  const client = getPlaidClient();

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const response = await client.transactionsGet({
    access_token: connection.accessToken,
    start_date: startDate,
    end_date: endDate,
    options: {
      count: 500,
      offset: 0,
      account_ids: connection.accountId ? [connection.accountId] : undefined,
    },
  });

  const plaidTxns = response.data.transactions;
  let insertedCount = 0;
  let updatedCount = 0;

  for (const t of plaidTxns) {
    const absAmount = String(Math.abs(t.amount));
    const txnType: "debit" | "credit" = t.amount > 0 ? "debit" : "credit";
    const description = t.merchant_name ?? t.name;

    const existing = await db
      .select({ id: bankTransactionsTable.id, status: bankTransactionsTable.status })
      .from(bankTransactionsTable)
      .where(eq(bankTransactionsTable.plaidTransactionId, t.transaction_id))
      .then((rows) => rows[0] ?? null);

    if (existing) {
      // IMPORTANT (data integrity): only update fields on unmatched rows.
      // Rows with status "matched", "investment_transfer", etc. are permanent
      // accounting records and must never be overwritten during re-sync.
      if (existing.status === "unmatched") {
        await db
          .update(bankTransactionsTable)
          .set({ date: t.date, description, amount: absAmount, transactionType: txnType })
          .where(eq(bankTransactionsTable.id, existing.id));
        updatedCount++;
      }
    } else if (t.pending_transaction_id) {
      // Posted transaction replacing a known pending one
      const pendingRow = await db
        .select({ id: bankTransactionsTable.id })
        .from(bankTransactionsTable)
        .where(eq(bankTransactionsTable.plaidTransactionId, t.pending_transaction_id))
        .then((rows) => rows[0] ?? null);
      if (pendingRow) {
        await db
          .update(bankTransactionsTable)
          .set({ plaidTransactionId: t.transaction_id, date: t.date, description, amount: absAmount, transactionType: txnType })
          .where(eq(bankTransactionsTable.id, pendingRow.id));
        updatedCount++;
      } else {
        await db.insert(bankTransactionsTable).values({
          importBatchId: null, date: t.date, description, amount: absAmount,
          transactionType: txnType, status: "unmatched", plaidTransactionId: t.transaction_id,
        });
        insertedCount++;
      }
    } else {
      // Fuzzy dedup fallback: Plaid's transactionsGet sometimes omits
      // pending_transaction_id. Check for a matching unmatched row within ±5 days.
      const refCode = extractRefCode(description);
      const isDeposit = /deposit/i.test(description);
      let fuzzyRow: { id: number } | null = null;
      if (refCode || isDeposit) {
        const descCond = refCode && !isDeposit
          ? sql`LOWER(${bankTransactionsTable.description}) LIKE ${'%' + refCode + '%'}`
          : sql`LOWER(${bankTransactionsTable.description}) LIKE '%deposit%'`;
        const rows = await db
          .select({ id: bankTransactionsTable.id })
          .from(bankTransactionsTable)
          .where(and(
            eq(bankTransactionsTable.amount, absAmount),
            eq(bankTransactionsTable.transactionType, txnType),
            eq(bankTransactionsTable.status, "unmatched"),
            gte(bankTransactionsTable.date, shiftDate(t.date, -5)),
            lte(bankTransactionsTable.date, shiftDate(t.date, 5)),
            descCond,
          ))
          .limit(1);
        fuzzyRow = rows[0] ?? null;
      }
      if (fuzzyRow) {
        await db
          .update(bankTransactionsTable)
          .set({ plaidTransactionId: t.transaction_id, date: t.date, description, amount: absAmount, transactionType: txnType })
          .where(eq(bankTransactionsTable.id, fuzzyRow.id));
        updatedCount++;
      } else {
        await db.insert(bankTransactionsTable).values({
          importBatchId: null,
          date: t.date,
          description,
          amount: absAmount,
          transactionType: txnType,
          status: "unmatched",
          plaidTransactionId: t.transaction_id,
        });
        insertedCount++;
      }
    }
  }

  await db.update(plaidConnectionsTable).set({ lastSyncedAt: new Date() }).where(eq(plaidConnectionsTable.id, connection.id));

  res.json({ synced: plaidTxns.length, inserted: insertedCount, updated: updatedCount });
}));

router.post("/transactions/:txnId/file-as-expense", wrapAsync(async (req, res) => {
  const txnId = parseInt(String(req.params.txnId), 10);
  if (isNaN(txnId)) {
    res.status(400).json({ error: "Invalid transaction ID" });
    return;
  }

  const { description, vendor, category, jobId, businessLine, notes, countsTowardJobProfit } = req.body as {
    description?: string;
    vendor?: string;
    category: string;
    jobId?: number | null;
    businessLine?: string | null;
    notes?: string | null;
    countsTowardJobProfit?: boolean;
  };

  const VALID_CATEGORIES = [
    "Materials", "Advertising", "Fuel/Travel", "Travel/Lodging", "Meals", "Parking/Tolls",
    "Subcontractor", "Insurance", "Professional Services", "Office/Admin", "Rent/Lease",
    "Repairs/Maintenance", "Tools/Equipment", "Utilities", "Other", "Owner Draw",
  ];
  const VALID_BUSINESS_LINES = ["", "general_contracting", "asphalt_sealing"];

  if (!category?.trim() || !VALID_CATEGORIES.includes(category)) {
    res.status(400).json({ error: `Category must be one of: ${VALID_CATEGORIES.join(", ")}` });
    return;
  }

  if (businessLine !== undefined && businessLine !== null && !VALID_BUSINESS_LINES.includes(businessLine)) {
    res.status(400).json({ error: "Invalid businessLine value" });
    return;
  }

  const [txn] = await db
    .select()
    .from(bankTransactionsTable)
    .where(eq(bankTransactionsTable.id, txnId));

  if (!txn) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  if (txn.status === "matched") {
    res.status(409).json({ error: "Transaction is already filed as an expense" });
    return;
  }

  if (txn.status === "investment_transfer") {
    res.status(409).json({ error: "Transaction is already categorized as an investment transfer. Remove that categorization first." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [fresh] = await tx
      .select({ status: bankTransactionsTable.status })
      .from(bankTransactionsTable)
      .where(eq(bankTransactionsTable.id, txnId));

    if (fresh?.status === "matched" || fresh?.status === "investment_transfer") {
      return { conflict: true } as const;
    }

    const [newExpense] = await tx
      .insert(expensesTable)
      .values({
        description: description?.trim() || txn.description,
        amount: txn.amount,
        category,
        date: txn.date,
        vendor: vendor?.trim() || null,
        jobId: jobId || null,
        businessLine: businessLine || null,
        notes: notes?.trim() || null,
        countsTowardJobProfit: countsTowardJobProfit === false ? false : true,
      })
      .returning();

    await tx
      .update(bankTransactionsTable)
      .set({ status: "matched", matchedExpenseId: newExpense.id })
      .where(eq(bankTransactionsTable.id, txnId));

    return newExpense;
  });

  if ("conflict" in result) {
    res.status(409).json({ error: "Transaction is already filed as an expense" });
    return;
  }

  res.status(201).json(result);
}));

router.post("/transactions/:txnId/file-as-income", wrapAsync(async (req, res) => {
  const txnId = parseInt(String(req.params.txnId), 10);
  if (isNaN(txnId)) {
    res.status(400).json({ error: "Invalid transaction ID" });
    return;
  }

  const { invoiceId, description, source, notes, businessLine, jobId } = req.body as {
    invoiceId?: number | null;
    description?: string;
    source?: string | null;
    notes?: string | null;
    businessLine?: string | null;
    jobId?: number | null;
  };

  const [txn] = await db
    .select()
    .from(bankTransactionsTable)
    .where(eq(bankTransactionsTable.id, txnId));

  if (!txn) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  if (txn.status === "matched") {
    res.status(409).json({ error: "Transaction is already filed" });
    return;
  }

  if (txn.status === "investment_transfer") {
    res.status(409).json({ error: "Transaction is already categorized as an investment transfer. Remove that categorization first." });
    return;
  }

  if (txn.transactionType !== "credit") {
    res.status(400).json({ error: "Only credit (deposit) transactions can be filed as income" });
    return;
  }

  if (invoiceId) {
    // Validate invoice exists before entering the transaction
    const [invCheck] = await db
      .select({ id: invoicesTable.id, total: invoicesTable.total, amountPaid: invoicesTable.amountPaid })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, invoiceId));
    if (!invCheck) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    // Match deposit to an existing invoice
    const result = await db.transaction(async (tx) => {
      const [fresh] = await tx
        .select({ status: bankTransactionsTable.status })
        .from(bankTransactionsTable)
        .where(eq(bankTransactionsTable.id, txnId));
      if (fresh?.status === "matched") return { conflict: true } as const;

      // Re-fetch invoice inside transaction for consistency
      const [inv] = await tx
        .select({ id: invoicesTable.id, total: invoicesTable.total, amountPaid: invoicesTable.amountPaid, status: invoicesTable.status })
        .from(invoicesTable)
        .where(eq(invoicesTable.id, invoiceId));
      if (!inv) return { conflict: true } as const;

      const existingPaid = parseFloat(inv.amountPaid ?? "0");
      const total = parseFloat(inv.total ?? "0");
      const alreadyPaid = inv.status === "paid" || existingPaid >= total;

      if (!alreadyPaid) {
        const depositAmount = parseFloat(txn.amount ?? "0");
        const newAmountPaid = existingPaid + depositAmount;
        const newStatus = newAmountPaid >= total ? "paid" : "partial";

        await tx
          .update(invoicesTable)
          .set({ status: newStatus, amountPaid: String(newAmountPaid) })
          .where(eq(invoicesTable.id, invoiceId));
      }

      await tx
        .update(bankTransactionsTable)
        .set({ status: "matched", matchedInvoiceId: invoiceId })
        .where(eq(bankTransactionsTable.id, txnId));

      return { ok: true, matchedInvoiceId: invoiceId, alreadyPaid };
    });

    if (result && "conflict" in result) {
      res.status(409).json({ error: "Transaction is already filed" });
      return;
    }
    res.status(201).json(result);
  } else {
    // Log as other income
    const result = await db.transaction(async (tx) => {
      const [fresh] = await tx
        .select({ status: bankTransactionsTable.status })
        .from(bankTransactionsTable)
        .where(eq(bankTransactionsTable.id, txnId));
      if (fresh?.status === "matched") return { conflict: true } as const;

      const [income] = await tx
        .insert(otherIncomeTable)
        .values({
          amount: txn.amount,
          date: txn.date,
          description: description?.trim() || txn.description,
          source: source?.trim() || null,
          paymentMethod: "bank_transfer",
          notes: notes?.trim() || null,
          businessLine: businessLine || null,
          jobId: jobId ?? null,
        })
        .returning();

      await tx
        .update(bankTransactionsTable)
        .set({ status: "matched", matchedOtherIncomeId: income.id })
        .where(eq(bankTransactionsTable.id, txnId));

      return income;
    });

    if (result && "conflict" in result) {
      res.status(409).json({ error: "Transaction is already filed" });
      return;
    }
    res.status(201).json(result);
  }
}));

router.get("/expenses/unmatched", wrapAsync(async (req, res) => {
  const { dateRange } = req.query as { dateRange?: string };

  const matchedRows = await db
    .select({ id: bankTransactionsTable.matchedExpenseId })
    .from(bankTransactionsTable)
    .where(isNotNull(bankTransactionsTable.matchedExpenseId));

  const matchedIds = matchedRows
    .map((r) => r.id)
    .filter((id): id is number => id !== null);

  const conditions = [];

  if (matchedIds.length > 0) {
    conditions.push(notInArray(expensesTable.id, matchedIds));
  }

  if (dateRange) {
    const days = parseInt(dateRange, 10) || 30;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    conditions.push(gte(expensesTable.date, from));
  }

  const expenses = await db
    .select({
      id: expensesTable.id,
      date: expensesTable.date,
      description: expensesTable.description,
      category: expensesTable.category,
      amount: expensesTable.amount,
      vendor: expensesTable.vendor,
      jobId: expensesTable.jobId,
    })
    .from(expensesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(expensesTable.date);

  res.json(expenses);
}));

router.post("/transactions/:txnId/match-expense", wrapAsync(async (req, res) => {
  const txnId = parseInt(String(req.params.txnId), 10);
  if (isNaN(txnId)) {
    res.status(400).json({ error: "Invalid transaction ID" });
    return;
  }

  const { expenseId } = req.body as { expenseId?: number };
  if (!expenseId || isNaN(Number(expenseId))) {
    res.status(400).json({ error: "expenseId is required" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [txn] = await tx
      .select()
      .from(bankTransactionsTable)
      .where(eq(bankTransactionsTable.id, txnId));

    if (!txn) return { notFound: true } as const;
    if (txn.status === "matched") return { conflict: true } as const;
    if (txn.status === "investment_transfer") return { investmentTransfer: true } as const;

    const [expense] = await tx
      .select({ id: expensesTable.id })
      .from(expensesTable)
      .where(eq(expensesTable.id, Number(expenseId)));

    if (!expense) return { expenseNotFound: true } as const;

    const [alreadyLinked] = await tx
      .select({ id: bankTransactionsTable.id })
      .from(bankTransactionsTable)
      .where(eq(bankTransactionsTable.matchedExpenseId, Number(expenseId)));

    if (alreadyLinked) return { alreadyLinked: true } as const;

    const [updated] = await tx
      .update(bankTransactionsTable)
      .set({ status: "matched", matchedExpenseId: Number(expenseId) })
      .where(eq(bankTransactionsTable.id, txnId))
      .returning();

    return updated;
  });

  if ("notFound" in result) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  if ("conflict" in result) {
    res.status(409).json({ error: "Transaction is already matched" });
    return;
  }
  if ("investmentTransfer" in result) {
    res.status(409).json({ error: "Transaction is already categorized as an investment transfer. Remove that categorization first." });
    return;
  }
  if ("expenseNotFound" in result) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  if ("alreadyLinked" in result) {
    res.status(409).json({ error: "This expense is already linked to another bank transaction" });
    return;
  }

  res.json(result);
}));

router.post("/transactions/:txnId/unmatch", wrapAsync(async (req, res) => {
  const txnId = Number(req.params.txnId);
  if (isNaN(txnId)) {
    res.status(400).json({ error: "Invalid transaction id" });
    return;
  }

  const [txn] = await db
    .select()
    .from(bankTransactionsTable)
    .where(eq(bankTransactionsTable.id, txnId));

  if (!txn) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  if (txn.status !== "matched") {
    res.status(409).json({ error: "Transaction is not currently matched" });
    return;
  }

  const [updated] = await db
    .update(bankTransactionsTable)
    .set({ status: "unmatched", matchedExpenseId: null, matchedInvoiceId: null, matchedOtherIncomeId: null })
    .where(eq(bankTransactionsTable.id, txnId))
    .returning();

  res.json({ ok: true, transaction: updated });
}));

router.delete("/transactions/:id", wrapAsync(async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid transaction ID" }); return; }

  const [txn] = await db
    .select({ id: bankTransactionsTable.id, status: bankTransactionsTable.status })
    .from(bankTransactionsTable)
    .where(eq(bankTransactionsTable.id, id));

  if (!txn) { res.status(404).json({ error: "Transaction not found" }); return; }
  if (txn.status !== "unmatched") {
    res.status(403).json({ error: "Only unmatched transactions can be deleted" });
    return;
  }

  await db.delete(bankTransactionsTable).where(eq(bankTransactionsTable.id, id));
  res.json({ ok: true });
}));

router.delete("/connection", wrapAsync(async (req, res) => {
  const connections = await db.select().from(plaidConnectionsTable).limit(1);
  if (connections.length === 0) {
    res.status(404).json({ error: "No bank account connected" });
    return;
  }
  const connection = connections[0];

  if (isPlaidConfigured()) {
    try {
      const client = getPlaidClient();
      await client.itemRemove({ access_token: connection.accessToken });
    } catch (err) {
      console.warn("Plaid item/remove failed (best-effort):", err);
    }
  }

  await deletePlaidDataForConnection(connection.id);
  await db.delete(plaidConnectionsTable).where(eq(plaidConnectionsTable.id, connection.id));

  res.json({ ok: true });
}));

export default router;
