import { Router } from "express";
import { db } from "@workspace/db";
import {
  plaidConnectionsTable,
  bankImportBatchesTable,
  bankTransactionsTable,
  bankTransactionInvoiceLinksTable,
  bankTransactionExpenseLinksTable,
} from "@workspace/db";
import { expensesTable, otherIncomeTable, invoicesTable, clientsTable, subPaymentRecordsTable, subcontractorsTable, jobsTable } from "@workspace/db/schema";
import { eq, like, isNotNull, isNull, and, gte, lte, notInArray, sql, inArray } from "drizzle-orm";
import { getSuggestions, attemptAutoMatch } from "../lib/matchingEngine.js";

import { getPlaidClient, isPlaidConfigured, extractPlaidError } from "../lib/plaid.js";
import { CountryCode, Products } from "plaid";
import { wrapAsync, getOwnerId, getRequestUserId } from "./guards.js";
import { resolveMutationBusiness, belongsToBusiness } from "../lib/business-scope.js";

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
  res.json({
    configured: isPlaidConfigured(),
    environment: process.env.PLAID_ENV ?? null,
  });
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
          : plaidErr.error_code === "UNAUTHORIZED_ENVIRONMENT"
            ? "This Plaid production account isn't authorized for the current environment. Complete production approval in your Plaid dashboard."
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

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Diagnostic: log total rows in the table so we can see prod vs filtered counts.
  const [countRow] = await db
    .select({ total: sql<string>`COUNT(*)` })
    .from(bankTransactionsTable)
    .where(isNotNull(bankTransactionsTable.plaidTransactionId));
  const totalPlaidRows = parseInt(countRow?.total ?? "0", 10);

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
      investmentTransferId: bankTransactionsTable.investmentTransferId,
    })
    .from(bankTransactionsTable)
    .leftJoin(expensesTable, eq(bankTransactionsTable.matchedExpenseId, expensesTable.id))
    .where(
      and(
        isNotNull(bankTransactionsTable.plaidTransactionId),
        // Cast to date to handle any timestamp storage differences between dev/prod
        sql`${bankTransactionsTable.date}::date >= ${ninetyDaysAgo}::date`
      )
    )
    .orderBy(bankTransactionsTable.date);

  console.log(`[plaid/transactions] plaidId rows: ${totalPlaidRows}, after 90d filter: ${txns.length}`);

  // Fetch multi-invoice links for matched credit transactions.
  // Wrapped in try/catch — if the junction table is missing in an older prod schema,
  // we still return transactions (just without the multi-invoice breakdown).
  const matchedTxnIds = txns
    .filter(t => t.status === "matched" && t.matchedInvoiceId != null)
    .map(t => t.id);

  let multiInvoiceMap = new Map<number, Array<{ invoiceNumber: string | null; total: string; clientName: string | null }>>();
  if (matchedTxnIds.length > 0) {
    try {
      const links = await db
        .select({
          bankTransactionId: bankTransactionInvoiceLinksTable.bankTransactionId,
          invoiceNumber: invoicesTable.invoiceNumber,
          total: invoicesTable.total,
          clientName: clientsTable.name,
        })
        .from(bankTransactionInvoiceLinksTable)
        .leftJoin(invoicesTable, eq(bankTransactionInvoiceLinksTable.invoiceId, invoicesTable.id))
        .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
        .where(inArray(bankTransactionInvoiceLinksTable.bankTransactionId, matchedTxnIds));

      for (const link of links) {
        const arr = multiInvoiceMap.get(link.bankTransactionId) ?? [];
        arr.push({ invoiceNumber: link.invoiceNumber, total: link.total ?? "0", clientName: link.clientName });
        multiInvoiceMap.set(link.bankTransactionId, arr);
      }
    } catch (linkErr) {
      // Table may not exist in this environment — log and continue without invoice links
      console.error("[plaid/transactions] bank_transaction_invoice_links query failed (non-fatal):", linkErr);
    }
  }

  // Fetch multi-expense links for matched debit transactions.
  // Wrapped in try/catch — defensive against missing table on older prod schema.
  const matchedDebitIds = txns
    .filter(t => t.status === "matched" && t.matchedExpenseId == null)
    .map(t => t.id);

  let multiExpenseMap = new Map<number, Array<{ description: string | null; category: string | null; vendor: string | null; amount: string }>>();
  if (matchedDebitIds.length > 0) {
    try {
      const expLinks = await db
        .select({
          bankTransactionId: bankTransactionExpenseLinksTable.bankTransactionId,
          description: expensesTable.description,
          category: expensesTable.category,
          vendor: expensesTable.vendor,
          amount: expensesTable.amount,
        })
        .from(bankTransactionExpenseLinksTable)
        .leftJoin(expensesTable, eq(bankTransactionExpenseLinksTable.expenseId, expensesTable.id))
        .where(inArray(bankTransactionExpenseLinksTable.bankTransactionId, matchedDebitIds));

      for (const link of expLinks) {
        const arr = multiExpenseMap.get(link.bankTransactionId) ?? [];
        arr.push({ description: link.description, category: link.category, vendor: link.vendor, amount: link.amount ?? "0" });
        multiExpenseMap.set(link.bankTransactionId, arr);
      }
    } catch (expLinkErr) {
      console.error("[plaid/transactions] bank_transaction_expense_links query failed (non-fatal):", expLinkErr);
    }
  }

  const result = txns.map(t => ({
    ...t,
    linkedInvoices: multiInvoiceMap.get(t.id) ?? null,
    linkedExpenses: multiExpenseMap.get(t.id) ?? null,
  }));

  res.json(result);
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
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

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
        const [pendingInserted] = await db.insert(bankTransactionsTable).values({
          importBatchId: null, date: t.date, description, amount: absAmount,
          transactionType: txnType, status: "unmatched", plaidTransactionId: t.transaction_id,
        }).returning({ id: bankTransactionsTable.id });
        insertedCount++;
        // Attempt auto-match for debit transactions only
        if (txnType === "debit" && pendingInserted) {
          const matchedExpenseId = await attemptAutoMatch(pendingInserted.id);
          if (matchedExpenseId !== null) {
            await db.update(bankTransactionsTable)
              .set({ status: "matched", matchedExpenseId })
              .where(eq(bankTransactionsTable.id, pendingInserted.id));
          }
        }
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
        const [fuzzyInserted] = await db.insert(bankTransactionsTable).values({
          importBatchId: null,
          date: t.date,
          description,
          amount: absAmount,
          transactionType: txnType,
          status: "unmatched",
          plaidTransactionId: t.transaction_id,
        }).returning({ id: bankTransactionsTable.id });
        insertedCount++;
        // Attempt auto-match for debit transactions only
        if (txnType === "debit" && fuzzyInserted) {
          const matchedExpenseId = await attemptAutoMatch(fuzzyInserted.id);
          if (matchedExpenseId !== null) {
            await db.update(bankTransactionsTable)
              .set({ status: "matched", matchedExpenseId })
              .where(eq(bankTransactionsTable.id, fuzzyInserted.id));
          }
        }
      }
    }
  }

  await db.update(plaidConnectionsTable).set({ lastSyncedAt: new Date() }).where(eq(plaidConnectionsTable.id, connection.id));

  res.json({ synced: plaidTxns.length, plaidReturned: plaidTxns.length, inserted: insertedCount, updated: updatedCount });
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
  const ownership = await resolveMutationBusiness(req);
  if (!ownership.ok) { res.status(400).json({ error: ownership.error }); return; }
  const owner = ownership.business;

  const VALID_CATEGORIES = [
    "Materials", "Advertising", "Fuel/Travel", "Travel/Lodging", "Meals", "Parking/Tolls",
    "Subcontractor", "Insurance", "Professional Services", "Office/Admin", "Rent/Lease",
    "Repairs/Maintenance", "Tools/Equipment", "Utilities", "Other",
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
  if (jobId) {
    const [job] = await db.select({ businessId: jobsTable.businessId, businessLine: jobsTable.businessLine })
      .from(jobsTable).where(eq(jobsTable.id, Number(jobId))).limit(1);
    if (!job || !belongsToBusiness(job, owner)) { res.status(404).json({ error: "Job not found" }); return; }
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
        businessLine: owner.slug,
        businessId: owner.id,
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
  const ownership = await resolveMutationBusiness(req);
  if (!ownership.ok) { res.status(400).json({ error: ownership.error }); return; }
  const owner = ownership.business;

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
          businessLine: owner.slug,
          businessId: String(owner.id),
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

router.get("/transactions/:txnId/suggestions", wrapAsync(async (req, res) => {
  const txnId = parseInt(String(req.params.txnId), 10);
  if (isNaN(txnId)) { res.status(400).json({ error: "Invalid transaction ID" }); return; }
  const suggestions = await getSuggestions(txnId);
  res.json(suggestions);
}));

router.post("/transactions/:txnId/match-invoices", wrapAsync(async (req, res) => {
  const txnId = parseInt(String(req.params.txnId), 10);
  if (isNaN(txnId)) {
    res.status(400).json({ error: "Invalid transaction ID" });
    return;
  }

  const { invoiceIds } = req.body as { invoiceIds?: number[] };
  if (!Array.isArray(invoiceIds) || invoiceIds.length < 2) {
    res.status(400).json({ error: "invoiceIds must be an array of at least 2 invoice IDs" });
    return;
  }
  if (invoiceIds.some(id => isNaN(Number(id)))) {
    res.status(400).json({ error: "All invoiceIds must be valid numbers" });
    return;
  }
  const ids = invoiceIds.map(Number);

  const [txn] = await db
    .select()
    .from(bankTransactionsTable)
    .where(eq(bankTransactionsTable.id, txnId));

  if (!txn) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  if (txn.status === "matched") {
    res.status(409).json({ error: "Transaction is already matched" });
    return;
  }
  if (txn.status === "investment_transfer") {
    res.status(409).json({ error: "Transaction is already categorized as an investment transfer" });
    return;
  }
  if (txn.transactionType !== "credit") {
    res.status(400).json({ error: "Only credit (deposit) transactions can be matched to invoices" });
    return;
  }

  // Fetch all requested invoices
  const invoices = await db
    .select({ id: invoicesTable.id, total: invoicesTable.total, amountPaid: invoicesTable.amountPaid, status: invoicesTable.status, invoiceNumber: invoicesTable.invoiceNumber })
    .from(invoicesTable)
    .where(inArray(invoicesTable.id, ids));

  if (invoices.length !== ids.length) {
    res.status(404).json({ error: "One or more invoices not found" });
    return;
  }

  // Reject any invoice that is not in an open/payable state.
  // Invoices already marked paid must not be re-matched (would corrupt payment history).
  const PAYABLE_STATUSES = ["approved", "sent", "partiallyPaid", "overdue"] as const;
  const nonPayable = invoices.filter(inv => !PAYABLE_STATUSES.includes(inv.status as any));
  if (nonPayable.length > 0) {
    const nums = nonPayable.map(inv => inv.invoiceNumber ?? `#${inv.id}`).join(", ");
    res.status(400).json({
      error: `Cannot match invoices in their current state: ${nums}. Only approved, sent, partial, or overdue invoices can be matched to a deposit.`,
    });
    return;
  }

  const txnAmt = parseFloat(txn.amount ?? "0");
  // Use remaining balance (total − amountPaid) so partiallyPaid invoices contribute correctly
  const invoiceRemaining = invoices.reduce((sum, inv) => {
    const total = parseFloat(inv.total ?? "0");
    const paid  = parseFloat(inv.amountPaid ?? "0");
    return sum + Math.max(total - paid, 0);
  }, 0);
  const diff = Math.abs(txnAmt - invoiceRemaining);

  if (diff > 0.05) {
    res.status(400).json({
      error: `Outstanding invoice balances (${invoiceRemaining.toFixed(2)}) do not match the deposit amount (${txnAmt.toFixed(2)}). Difference: $${diff.toFixed(2)}.`,
    });
    return;
  }

  const result = await db.transaction(async (tx) => {
    // Re-check status inside transaction
    const [fresh] = await tx.select({ status: bankTransactionsTable.status }).from(bankTransactionsTable).where(eq(bankTransactionsTable.id, txnId));
    if (fresh?.status === "matched") return { conflict: true } as const;

    // Mark each invoice fully paid (deposit covers the remaining balance)
    for (const inv of invoices) {
      const total = parseFloat(inv.total ?? "0");
      await tx.update(invoicesTable)
        .set({ status: "paid", amountPaid: String(total) })
        .where(eq(invoicesTable.id, inv.id));
    }

    // Insert junction table rows
    await tx.insert(bankTransactionInvoiceLinksTable).values(
      ids.map(invId => ({ bankTransactionId: txnId, invoiceId: invId }))
    );

    // Mark transaction as matched (use first invoice as primary matchedInvoiceId for backward compat)
    await tx.update(bankTransactionsTable)
      .set({ status: "matched", matchedInvoiceId: ids[0] })
      .where(eq(bankTransactionsTable.id, txnId));

    return { ok: true, invoiceIds: ids };
  });

  if (result && "conflict" in result) {
    res.status(409).json({ error: "Transaction is already matched" });
    return;
  }

  res.status(201).json(result);
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

// ── GET /sub-payments/unlinked — list all sub payment records not yet linked to a bank transaction ──
router.get("/sub-payments/unlinked", wrapAsync(async (req, res) => {
  const rows = await db
    .select({
      id: subPaymentRecordsTable.id,
      amount: subPaymentRecordsTable.amount,
      paymentDate: subPaymentRecordsTable.paymentDate,
      description: subPaymentRecordsTable.description,
      subcontractorName: subcontractorsTable.name,
      jobTitle: jobsTable.title,
    })
    .from(subPaymentRecordsTable)
    .leftJoin(subcontractorsTable, eq(subPaymentRecordsTable.subcontractorId, subcontractorsTable.id))
    .leftJoin(jobsTable, eq(subPaymentRecordsTable.jobId, jobsTable.id))
    .where(isNull(subPaymentRecordsTable.bankTransactionId))
    .orderBy(subPaymentRecordsTable.paymentDate);
  res.json(rows);
}));

// ── POST /transactions/:txnId/split-match-expenses — link multiple expenses to one bank txn ──
router.post("/transactions/:txnId/split-match-expenses", wrapAsync(async (req, res) => {
  const txnId = parseInt(String(req.params.txnId), 10);
  if (isNaN(txnId)) { res.status(400).json({ error: "Invalid transaction ID" }); return; }

  const { expenseIds } = req.body as { expenseIds?: number[] };
  if (!Array.isArray(expenseIds) || expenseIds.length < 2) {
    res.status(400).json({ error: "expenseIds must be an array of at least 2 IDs" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [txn] = await tx.select().from(bankTransactionsTable).where(eq(bankTransactionsTable.id, txnId));
    if (!txn) return { notFound: true } as const;
    if (txn.status === "matched") return { conflict: true } as const;

    // Verify all expenses exist
    const expenses = await tx
      .select({ id: expensesTable.id })
      .from(expensesTable)
      .where(sql`${expensesTable.id} = ANY(${expenseIds})`);
    if (expenses.length !== expenseIds.length) return { expenseNotFound: true } as const;

    // Insert junction rows
    await tx.insert(bankTransactionExpenseLinksTable).values(
      expenseIds.map(expenseId => ({ bankTransactionId: txnId, expenseId }))
    );

    const [updated] = await tx.update(bankTransactionsTable)
      .set({ status: "matched" })
      .where(eq(bankTransactionsTable.id, txnId))
      .returning();
    return { transaction: updated, linkedCount: expenses.length };
  });

  if ("notFound" in result) { res.status(404).json({ error: "Transaction not found" }); return; }
  if ("conflict" in result) { res.status(409).json({ error: "Transaction is already matched" }); return; }
  if ("expenseNotFound" in result) { res.status(404).json({ error: "One or more expenses not found" }); return; }
  res.json(result);
}));

// ── POST /transactions/:txnId/split-match-sub-payments — link multiple sub payment records to one bank txn ──
router.post("/transactions/:txnId/split-match-sub-payments", wrapAsync(async (req, res) => {
  const txnId = parseInt(String(req.params.txnId), 10);
  if (isNaN(txnId)) { res.status(400).json({ error: "Invalid transaction ID" }); return; }

  const { subPaymentIds } = req.body as { subPaymentIds?: number[] };
  if (!Array.isArray(subPaymentIds) || subPaymentIds.length < 2) {
    res.status(400).json({ error: "subPaymentIds must be an array of at least 2 IDs" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [txn] = await tx.select().from(bankTransactionsTable).where(eq(bankTransactionsTable.id, txnId));
    if (!txn) return { notFound: true } as const;
    if (txn.status === "matched") return { conflict: true } as const;

    // Verify all sub payment records exist and are unlinked
    const sprs = await tx
      .select({ id: subPaymentRecordsTable.id, amount: subPaymentRecordsTable.amount, bankTransactionId: subPaymentRecordsTable.bankTransactionId })
      .from(subPaymentRecordsTable)
      .where(sql`${subPaymentRecordsTable.id} = ANY(${subPaymentIds})`);

    if (sprs.length !== subPaymentIds.length) return { sprNotFound: true } as const;
    const alreadyLinked = sprs.find(s => s.bankTransactionId != null);
    if (alreadyLinked) return { alreadyLinked: alreadyLinked.id } as const;

    // Update all sub payment records to reference this bank transaction
    await tx.update(subPaymentRecordsTable)
      .set({ bankTransactionId: txnId })
      .where(sql`${subPaymentRecordsTable.id} = ANY(${subPaymentIds})`);

    const [updated] = await tx.update(bankTransactionsTable)
      .set({ status: "matched" })
      .where(eq(bankTransactionsTable.id, txnId))
      .returning();
    return { transaction: updated, linkedCount: sprs.length };
  });

  if ("notFound" in result) { res.status(404).json({ error: "Transaction not found" }); return; }
  if ("conflict" in result) { res.status(409).json({ error: "Transaction is already matched" }); return; }
  if ("sprNotFound" in result) { res.status(404).json({ error: "One or more sub payment records not found" }); return; }
  if ("alreadyLinked" in result) { res.status(409).json({ error: `Sub payment #${(result as any).alreadyLinked} is already linked to another bank transaction` }); return; }
  res.json(result);
}));

router.post("/transactions/:txnId/match-sub-payment", wrapAsync(async (req, res) => {
  const txnId = parseInt(String(req.params.txnId), 10);
  if (isNaN(txnId)) { res.status(400).json({ error: "Invalid transaction ID" }); return; }

  const { subPaymentId } = req.body as { subPaymentId?: number };
  if (!subPaymentId || isNaN(Number(subPaymentId))) {
    res.status(400).json({ error: "subPaymentId is required" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [txn] = await tx.select().from(bankTransactionsTable).where(eq(bankTransactionsTable.id, txnId));
    if (!txn) return { notFound: true } as const;
    if (txn.status === "matched") return { conflict: true } as const;

    const [spr] = await tx.select({ id: subPaymentRecordsTable.id })
      .from(subPaymentRecordsTable)
      .where(eq(subPaymentRecordsTable.id, Number(subPaymentId)));
    if (!spr) return { sprNotFound: true } as const;

    const [alreadyLinked] = await tx.select({ id: bankTransactionsTable.id })
      .from(bankTransactionsTable)
      .where(eq(bankTransactionsTable.matchedSubPaymentId, Number(subPaymentId)));
    if (alreadyLinked) return { alreadyLinked: true } as const;

    await tx.update(subPaymentRecordsTable)
      .set({ bankTransactionId: txnId })
      .where(eq(subPaymentRecordsTable.id, Number(subPaymentId)));

    const [updated] = await tx.update(bankTransactionsTable)
      .set({ status: "matched", matchedSubPaymentId: Number(subPaymentId) })
      .where(eq(bankTransactionsTable.id, txnId))
      .returning();
    return updated;
  });

  if ("notFound" in result) { res.status(404).json({ error: "Transaction not found" }); return; }
  if ("conflict" in result) { res.status(409).json({ error: "Transaction is already matched" }); return; }
  if ("sprNotFound" in result) { res.status(404).json({ error: "Sub payment record not found" }); return; }
  if ("alreadyLinked" in result) { res.status(409).json({ error: "This sub payment is already linked to another bank transaction" }); return; }
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

  // Clear bankTransactionId on any sub payment records linked to this transaction
  await db.update(subPaymentRecordsTable)
    .set({ bankTransactionId: null })
    .where(eq(subPaymentRecordsTable.bankTransactionId, txnId));

  // Clear any multi-invoice links
  await db
    .delete(bankTransactionInvoiceLinksTable)
    .where(eq(bankTransactionInvoiceLinksTable.bankTransactionId, txnId));

  // Clear any multi-expense links
  try {
    await db
      .delete(bankTransactionExpenseLinksTable)
      .where(eq(bankTransactionExpenseLinksTable.bankTransactionId, txnId));
  } catch {
    // Table may not exist in older prod — non-fatal
  }

  const [updated] = await db
    .update(bankTransactionsTable)
    .set({ status: "unmatched", matchedExpenseId: null, matchedInvoiceId: null, matchedOtherIncomeId: null, matchedSubPaymentId: null })
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
