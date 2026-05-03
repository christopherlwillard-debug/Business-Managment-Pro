import { Router } from "express";
import { db } from "@workspace/db";
import {
  plaidConnectionsTable,
  bankImportBatchesTable,
  bankTransactionsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getPlaidClient, isPlaidConfigured } from "../lib/plaid.js";
import { CountryCode, Products } from "plaid";
import { wrapAsync, getOwnerId, getRequestUserId } from "./guards.js";

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

router.get("/status", (req, res) => {
  res.json({ configured: isPlaidConfigured() });
});

router.post("/link-token", wrapAsync(async (req, res) => {
  if (!isPlaidConfigured()) {
    res.status(503).json({ error: "Plaid is not configured. Set PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV in environment secrets." });
    return;
  }
  const client = getPlaidClient();
  const response = await client.linkTokenCreate({
    user: { client_user_id: "willard-gc" },
    client_name: "Willard's General Contracting",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: "en",
  });
  res.json({ link_token: response.data.link_token });
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

  await db.delete(plaidConnectionsTable).where(eq(plaidConnectionsTable.id, plaidConnectionsTable.id));

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

router.get("/balance", wrapAsync(async (req, res) => {
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
  const response = await client.accountsGet({ access_token: connection.accessToken });

  const account = connection.accountId
    ? response.data.accounts.find((a) => a.account_id === connection.accountId)
    : response.data.accounts[0];

  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  res.json({
    available: account.balances.available,
    current: account.balances.current,
    currency: account.balances.iso_currency_code ?? "USD",
  });
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

  const transactions = response.data.transactions;

  const accountName = connection.institutionName
    ? `${connection.institutionName} – ${connection.accountName ?? "Account"}`
    : (connection.accountName ?? "Connected Bank");

  const [batch] = await db
    .insert(bankImportBatchesTable)
    .values({
      accountName,
      fileName: `plaid-sync-${endDate}`,
      rowCount: transactions.length,
    })
    .returning();

  if (transactions.length > 0) {
    await db.insert(bankTransactionsTable).values(
      transactions.map((t) => ({
        importBatchId: batch.id,
        date: t.date,
        description: t.merchant_name ?? t.name,
        amount: String(-t.amount),
        transactionType: t.amount < 0 ? "credit" : "debit",
        status: "unmatched" as const,
      }))
    );
  }

  await db
    .update(plaidConnectionsTable)
    .set({ lastSyncedAt: new Date() })
    .where(eq(plaidConnectionsTable.id, connection.id));

  res.json({ synced: transactions.length, batchId: batch.id });
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

  await db.delete(plaidConnectionsTable).where(eq(plaidConnectionsTable.id, connection.id));

  res.json({ ok: true });
}));

export default router;
