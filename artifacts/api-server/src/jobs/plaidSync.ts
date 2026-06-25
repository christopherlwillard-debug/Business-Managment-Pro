import cron from "node-cron";
import { db } from "@workspace/db";
import { plaidConnectionsTable, bankTransactionsTable } from "@workspace/db";
import { getPlaidClient, isPlaidConfigured } from "../lib/plaid.js";
import { eq, and, gte, lte, sql } from "drizzle-orm";

// Extract a payment reference code from a description (e.g. "JPM99clqfe2r" from Zelle).
// Returns the code in lowercase, or null if none found.
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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function syncTransactions(connection: typeof plaidConnectionsTable.$inferSelect): Promise<void> {
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

    // Check for existing row by the posted transaction_id
    const existing = await db
      .select({ id: bankTransactionsTable.id, status: bankTransactionsTable.status })
      .from(bankTransactionsTable)
      .where(eq(bankTransactionsTable.plaidTransactionId, t.transaction_id))
      .then((rows) => rows[0] ?? null);

    if (existing) {
      if (existing.status === "unmatched") {
        await db
          .update(bankTransactionsTable)
          .set({ date: t.date, description, amount: absAmount, transactionType: txnType })
          .where(eq(bankTransactionsTable.id, existing.id));
        updatedCount++;
      }
    } else if (t.pending_transaction_id) {
      // This is a posted transaction that replaces a pending one — update the pending row
      // instead of inserting a duplicate
      const pendingRow = await db
        .select({ id: bankTransactionsTable.id, status: bankTransactionsTable.status })
        .from(bankTransactionsTable)
        .where(eq(bankTransactionsTable.plaidTransactionId, t.pending_transaction_id))
        .then((rows) => rows[0] ?? null);

      if (pendingRow) {
        // Always update the core posted fields regardless of match status,
        // so the row reflects the settled transaction (date, description, amount).
        // Preserve any existing matched linkage (matchedExpenseId, etc.).
        await db
          .update(bankTransactionsTable)
          .set({ plaidTransactionId: t.transaction_id, date: t.date, description, amount: absAmount, transactionType: txnType })
          .where(eq(bankTransactionsTable.id, pendingRow.id));
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
    } else {
      // Fuzzy dedup fallback: Plaid's transactionsGet sometimes omits
      // pending_transaction_id for settled transactions. If we find an existing
      // unmatched row with the same amount, type, and similar description within
      // ±5 days, treat it as the pending version and update it instead of inserting.
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

  await db
    .update(plaidConnectionsTable)
    .set({ lastSyncedAt: new Date() })
    .where(eq(plaidConnectionsTable.id, connection.id));

  console.log(`[plaid-sync] Transactions: ${plaidTxns.length} fetched, ${insertedCount} new, ${updatedCount} updated`);
}

async function refreshBalanceIfStale(connection: typeof plaidConnectionsTable.$inferSelect): Promise<void> {
  const now = Date.now();
  const cacheAge = connection.balanceCachedAt
    ? now - new Date(connection.balanceCachedAt).getTime()
    : Infinity;

  if (cacheAge < THIRTY_DAYS_MS) {
    console.log("[plaid-sync] Balance cache is fresh, skipping Plaid balance call");
    return;
  }

  const client = getPlaidClient();
  const response = await client.accountsGet({ access_token: connection.accessToken });

  const account = connection.accountId
    ? response.data.accounts.find((a) => a.account_id === connection.accountId)
    : response.data.accounts[0];

  if (!account) {
    console.warn("[plaid-sync] Balance refresh: account not found in Plaid response");
    return;
  }

  await db
    .update(plaidConnectionsTable)
    .set({
      cachedBalanceCurrent: account.balances.current != null ? String(account.balances.current) : null,
      cachedBalanceAvailable: account.balances.available != null ? String(account.balances.available) : null,
      cachedBalanceCurrency: account.balances.iso_currency_code ?? "USD",
      balanceCachedAt: new Date(),
    })
    .where(eq(plaidConnectionsTable.id, connection.id));

  console.log("[plaid-sync] Balance cache refreshed from Plaid");
}

async function runPlaidSync(): Promise<void> {
  if (!isPlaidConfigured()) {
    console.log("[plaid-sync] Plaid not configured, skipping");
    return;
  }

  const connections = await db.select().from(plaidConnectionsTable);
  if (connections.length === 0) {
    console.log("[plaid-sync] No connections found, skipping");
    return;
  }

  for (const connection of connections) {
    try {
      await syncTransactions(connection);
    } catch (err) {
      console.error(`[plaid-sync] Transaction sync failed for connection #${connection.id}:`, err);
    }
    try {
      await refreshBalanceIfStale(connection);
    } catch (err) {
      console.error(`[plaid-sync] Balance refresh failed for connection #${connection.id}:`, err);
    }
  }
}

export function startPlaidSyncJob(): void {
  cron.schedule("0 6 * * *", runPlaidSync);
  console.log("[plaid-sync] Daily sync job scheduled at 6:00 AM");
}
