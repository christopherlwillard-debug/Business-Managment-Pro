import cron from "node-cron";
import { db } from "@workspace/db";
import { plaidConnectionsTable, bankImportBatchesTable, bankTransactionsTable } from "@workspace/db";
import { getPlaidClient, isPlaidConfigured } from "../lib/plaid.js";
import { eq } from "drizzle-orm";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function plaidAccountLabel(connection: { institutionName: string | null; accountName: string | null }): string {
  if (connection.institutionName && connection.accountName) {
    return `${connection.institutionName} – ${connection.accountName}`;
  }
  return connection.institutionName ?? connection.accountName ?? "Connected Bank";
}

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
  const accountLabel = plaidAccountLabel(connection);
  const batchFileName = `plaid-conn-${connection.id}-${endDate}`;

  let batch = await db
    .select()
    .from(bankImportBatchesTable)
    .where(eq(bankImportBatchesTable.fileName, batchFileName))
    .then((rows) => rows[0] ?? null);

  if (!batch) {
    const [newBatch] = await db
      .insert(bankImportBatchesTable)
      .values({ accountName: accountLabel, fileName: batchFileName, rowCount: plaidTxns.length })
      .returning();
    batch = newBatch;
  } else {
    await db
      .update(bankImportBatchesTable)
      .set({ rowCount: plaidTxns.length, importedAt: new Date() })
      .where(eq(bankImportBatchesTable.id, batch.id));
  }

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
      if (existing.status === "unmatched") {
        await db
          .update(bankTransactionsTable)
          .set({ date: t.date, description, amount: absAmount, transactionType: txnType })
          .where(eq(bankTransactionsTable.id, existing.id));
        updatedCount++;
      }
    } else {
      await db.insert(bankTransactionsTable).values({
        importBatchId: batch.id,
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
