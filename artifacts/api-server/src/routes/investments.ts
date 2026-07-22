import { Router } from "express";
import { db } from "@workspace/db";
import {
  investmentAccountsTable,
  investmentTransfersTable,
  investmentAccountValuationsTable,
  investmentTaxDocumentsTable,
  bankTransactionsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import multer from "multer";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorage = new ObjectStorageService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function toServingUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("/objects/")) return `/api/storage/objects/${raw.slice("/objects/".length)}`;
  return raw;
}

function formatNumeric(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

async function computeAccountSummary(accountId: number) {
  const transfers = await db
    .select()
    .from(investmentTransfersTable)
    .where(eq(investmentTransfersTable.investmentAccountId, accountId))
    .orderBy(desc(investmentTransfersTable.date));

  let totalInvested = 0;
  for (const t of transfers) {
    const amt = parseFloat(t.amount ?? "0");
    if (t.transferType === "deposit") totalInvested += amt;
    else if (t.transferType === "return_of_principal") totalInvested -= amt;
  }

  const [latestValuation] = await db
    .select()
    .from(investmentAccountValuationsTable)
    .where(eq(investmentAccountValuationsTable.investmentAccountId, accountId))
    .orderBy(desc(investmentAccountValuationsTable.valuationDate), desc(investmentAccountValuationsTable.createdAt))
    .limit(1);

  const portfolioValue = latestValuation ? parseFloat(latestValuation.portfolioValue ?? "0") : null;
  const gainLoss = portfolioValue != null ? portfolioValue - totalInvested : null;
  const returnPct = totalInvested > 0 && gainLoss != null ? gainLoss / totalInvested : null;

  return {
    totalInvested,
    portfolioValue,
    gainLoss,
    returnPct,
    lastValuationDate: latestValuation?.valuationDate ?? null,
  };
}

function formatAccount(a: typeof investmentAccountsTable.$inferSelect) {
  return {
    ...a,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
  };
}

function formatTransfer(t: typeof investmentTransfersTable.$inferSelect) {
  return {
    ...t,
    amount: parseFloat(t.amount ?? "0"),
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
  };
}

function formatValuation(v: typeof investmentAccountValuationsTable.$inferSelect) {
  return {
    ...v,
    portfolioValue: parseFloat(v.portfolioValue ?? "0"),
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
  };
}

// ─── Investment Accounts ──────────────────────────────────────────────────────

router.get("/accounts", async (req, res) => {
  try {
    const { active } = req.query;
    let query: any = db.select().from(investmentAccountsTable);
    if (active === "true") {
      query = query.where(eq(investmentAccountsTable.active, true));
    } else if (active === "false") {
      query = query.where(eq(investmentAccountsTable.active, false));
    }
    const accounts = await query.orderBy(investmentAccountsTable.name);

    const withSummaries = await Promise.all(
      accounts.map(async (a: typeof investmentAccountsTable.$inferSelect) => {
        const summary = await computeAccountSummary(a.id);
        return { ...formatAccount(a), ...summary };
      })
    );

    res.json(withSummaries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch investment accounts" });
  }
});

router.get("/accounts/summary", async (req, res) => {
  try {
    const rawBid = req.query.businessId;
    const businessId = rawBid != null && String(rawBid) !== "" ? parseInt(String(rawBid)) : null;

    // Fetch ALL accounts (active + inactive) filtered by businessId when provided
    let allAccountsQuery: any = db.select().from(investmentAccountsTable);
    if (businessId != null && Number.isFinite(businessId)) {
      allAccountsQuery = allAccountsQuery.where(eq(investmentAccountsTable.businessId, businessId));
    }
    const allAccounts = await allAccountsQuery.orderBy(investmentAccountsTable.name);

    const withSummaries = await Promise.all(
      allAccounts.map(async (a: typeof investmentAccountsTable.$inferSelect) => {
        const summary = await computeAccountSummary(a.id);
        return { ...formatAccount(a), ...summary };
      })
    );

    // Aggregates are computed over active accounts only
    const activeWithSummaries = withSummaries.filter((a: any) => a.active);

    const totalInvested = activeWithSummaries.reduce((sum: number, a: any) => sum + a.totalInvested, 0);

    // Only aggregate portfolio value / gain-loss when at least one active account has a recorded valuation.
    // Accounts without a valuation have portfolioValue === null — treating null as 0 would fabricate a 100% loss.
    const accountsWithValuation = activeWithSummaries.filter((a: any) => a.portfolioValue != null);
    const hasValuation = accountsWithValuation.length > 0;
    const totalPortfolioValue = hasValuation
      ? accountsWithValuation.reduce((sum: number, a: any) => sum + (a.portfolioValue as number), 0)
      : null;
    const totalGainLoss = hasValuation && totalPortfolioValue != null ? totalPortfolioValue - totalInvested : null;
    const totalReturnPct = hasValuation && totalGainLoss != null && totalInvested > 0 ? totalGainLoss / totalInvested : null;
    const lastUpdate = activeWithSummaries
      .map((a: any) => a.lastValuationDate)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

    const largest = activeWithSummaries.length > 0
      ? activeWithSummaries.reduce((best: any, a: any) => (a.totalInvested > best.totalInvested ? a : best), activeWithSummaries[0])
      : null;
    const withPortfolio = activeWithSummaries.filter((a: any) => a.portfolioValue != null && a.totalInvested > 0);
    const best = withPortfolio.length > 0
      ? withPortfolio.reduce((b: any, a: any) => ((a.returnPct ?? -Infinity) > (b.returnPct ?? -Infinity) ? a : b), withPortfolio[0])
      : null;
    const worst = withPortfolio.length > 0
      ? withPortfolio.reduce((b: any, a: any) => ((a.returnPct ?? Infinity) < (b.returnPct ?? Infinity) ? a : b), withPortfolio[0])
      : null;

    res.json({
      accountCount: activeWithSummaries.length,
      totalInvested,
      totalPortfolioValue,
      totalGainLoss,
      totalReturnPct,
      lastUpdate,
      largestAccount: largest ? { id: largest.id, name: largest.name } : null,
      bestAccount: best ? { id: best.id, name: best.name, returnPct: best.returnPct } : null,
      worstAccount: worst ? { id: worst.id, name: worst.name, returnPct: worst.returnPct } : null,
      accounts: withSummaries, // includes both active and inactive
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch investment summary" });
  }
});

router.post("/accounts", async (req, res) => {
  try {
    const { businessId, name, institution, accountType, businessOrPersonal, notes, plaidAccountId } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const [account] = await db.insert(investmentAccountsTable).values({
      businessId: businessId ? parseInt(businessId) : null,
      name,
      institution: institution || null,
      accountType: accountType || "Brokerage",
      businessOrPersonal: businessOrPersonal || "business",
      notes: notes || null,
      plaidAccountId: plaidAccountId || null,
      active: true,
    }).returning();

    res.status(201).json(formatAccount(account));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create investment account" });
  }
});

router.get("/accounts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const [account] = await db.select().from(investmentAccountsTable).where(eq(investmentAccountsTable.id, id));
    if (!account) return res.status(404).json({ error: "Investment account not found" });
    const summary = await computeAccountSummary(id);
    res.json({ ...formatAccount(account), ...summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch investment account" });
  }
});

router.put("/accounts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const { businessId, name, institution, accountType, businessOrPersonal, notes, plaidAccountId, active } = req.body;

    const [updated] = await db.update(investmentAccountsTable).set({
      ...(businessId !== undefined && { businessId: businessId ? parseInt(businessId) : null }),
      ...(name !== undefined && { name }),
      ...(institution !== undefined && { institution: institution || null }),
      ...(accountType !== undefined && { accountType }),
      ...(businessOrPersonal !== undefined && { businessOrPersonal }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(plaidAccountId !== undefined && { plaidAccountId: plaidAccountId || null }),
      ...(active !== undefined && { active: !!active }),
    }).where(eq(investmentAccountsTable.id, id)).returning();

    if (!updated) return res.status(404).json({ error: "Investment account not found" });
    const summary = await computeAccountSummary(id);
    res.json({ ...formatAccount(updated), ...summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update investment account" });
  }
});

router.delete("/accounts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    await db.delete(investmentAccountsTable).where(eq(investmentAccountsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete investment account" });
  }
});

// ─── Investment Transfers ─────────────────────────────────────────────────────

router.get("/accounts/:id/transfers", async (req, res) => {
  try {
    const accountId = parseInt(req.params.id as string);
    const transfers = await db
      .select()
      .from(investmentTransfersTable)
      .where(eq(investmentTransfersTable.investmentAccountId, accountId))
      .orderBy(desc(investmentTransfersTable.date));
    res.json(transfers.map(formatTransfer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch transfers" });
  }
});

router.post("/accounts/:id/transfers", async (req, res) => {
  try {
    const accountId = parseInt(req.params.id as string);
    const [account] = await db.select({ id: investmentAccountsTable.id }).from(investmentAccountsTable).where(eq(investmentAccountsTable.id, accountId));
    if (!account) return res.status(404).json({ error: "Investment account not found" });

    const { businessId, transferType, date, amount, sourceBankAccount, notes, bankTransactionId } = req.body;
    if (!date || amount == null) return res.status(400).json({ error: "date and amount are required" });

    const validTypes = ["deposit", "return_of_principal", "adjustment"];
    const resolvedType = validTypes.includes(transferType) ? transferType : "deposit";

    const [transfer] = await db.insert(investmentTransfersTable).values({
      businessId: businessId ? parseInt(businessId) : null,
      investmentAccountId: accountId,
      transferType: resolvedType,
      date,
      amount: parseFloat(amount).toString(),
      sourceBankAccount: sourceBankAccount || null,
      notes: notes || null,
      bankTransactionId: bankTransactionId ? parseInt(bankTransactionId) : null,
    }).returning();

    // If a bank transaction is linked, mark it as investment_transfer
    if (transfer.bankTransactionId) {
      await db.update(bankTransactionsTable)
        .set({ status: "investment_transfer", investmentTransferId: transfer.id })
        .where(eq(bankTransactionsTable.id, transfer.bankTransactionId));
    }

    res.status(201).json(formatTransfer(transfer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create transfer" });
  }
});

router.delete("/transfers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const [transfer] = await db.select().from(investmentTransfersTable).where(eq(investmentTransfersTable.id, id));
    if (!transfer) return res.status(404).json({ error: "Transfer not found" });

    // Unlink bank transaction if linked
    if (transfer.bankTransactionId) {
      await db.update(bankTransactionsTable)
        .set({ status: "unmatched", investmentTransferId: null })
        .where(eq(bankTransactionsTable.id, transfer.bankTransactionId));
    }

    await db.delete(investmentTransfersTable).where(eq(investmentTransfersTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete transfer" });
  }
});

// Remove investment classification from a bank transaction.
// This is an intentional, user-initiated action — it deletes the linked
// investment_transfers record and resets the bank transaction to "unmatched".
// The UI must warn the user before calling this endpoint.
router.delete("/transactions/:txnId/investment-classification", async (req, res) => {
  try {
    const txnId = parseInt(req.params.txnId as string);
    if (isNaN(txnId)) return res.status(400).json({ error: "Invalid transaction ID" });

    const [txn] = await db
      .select()
      .from(bankTransactionsTable)
      .where(eq(bankTransactionsTable.id, txnId));

    if (!txn) return res.status(404).json({ error: "Transaction not found" });
    if (txn.status !== "investment_transfer" || !txn.investmentTransferId) {
      return res.status(409).json({ error: "Transaction is not classified as an investment transfer" });
    }

    await db.transaction(async (tx) => {
      // Delete the investment transfer record (source of truth)
      await tx
        .delete(investmentTransfersTable)
        .where(eq(investmentTransfersTable.id, txn.investmentTransferId!));

      // Reset the bank transaction
      await tx
        .update(bankTransactionsTable)
        .set({ status: "unmatched", investmentTransferId: null })
        .where(eq(bankTransactionsTable.id, txnId));
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove investment classification" });
  }
});

// Link a bank transaction to an investment account as a transfer
router.post("/transactions/:txnId/file-as-investment", async (req, res) => {
  try {
    const txnId = parseInt(req.params.txnId as string);
    const { investmentAccountId, transferType, sourceBankAccount, notes, businessId } = req.body;
    if (!investmentAccountId) return res.status(400).json({ error: "investmentAccountId is required" });

    const [txn] = await db.select().from(bankTransactionsTable).where(eq(bankTransactionsTable.id, txnId));
    if (!txn) return res.status(404).json({ error: "Transaction not found" });
    if (txn.status === "matched") return res.status(409).json({ error: "Transaction is already matched to an expense or income" });

    const [account] = await db.select({ id: investmentAccountsTable.id }).from(investmentAccountsTable).where(eq(investmentAccountsTable.id, parseInt(investmentAccountId)));
    if (!account) return res.status(404).json({ error: "Investment account not found" });

    const validTypes = ["deposit", "return_of_principal", "adjustment"];
    const resolvedType = validTypes.includes(transferType) ? transferType : "deposit";

    const result = await db.transaction(async (tx) => {
      // If already linked to an investment transfer, update it
      if (txn.investmentTransferId) {
        const [updated] = await tx
          .update(investmentTransfersTable)
          .set({
            investmentAccountId: parseInt(investmentAccountId),
            transferType: resolvedType,
            amount: txn.amount,
            date: txn.date,
            sourceBankAccount: sourceBankAccount || null,
            notes: notes || null,
          })
          .where(eq(investmentTransfersTable.id, txn.investmentTransferId))
          .returning();
        return { transfer: updated, updated: true };
      }

      const [transfer] = await tx.insert(investmentTransfersTable).values({
        businessId: businessId ? parseInt(businessId) : null,
        investmentAccountId: parseInt(investmentAccountId),
        transferType: resolvedType,
        date: txn.date,
        amount: txn.amount,
        sourceBankAccount: sourceBankAccount || null,
        notes: notes || null,
        bankTransactionId: txnId,
      }).returning();

      await tx.update(bankTransactionsTable)
        .set({ status: "investment_transfer", investmentTransferId: transfer.id })
        .where(eq(bankTransactionsTable.id, txnId));

      return { transfer, updated: false };
    });

    res.status(201).json({ ...formatTransfer(result.transfer), wasUpdate: result.updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to file transaction as investment transfer" });
  }
});

// ─── Portfolio Valuations ─────────────────────────────────────────────────────

router.get("/accounts/:id/valuations", async (req, res) => {
  try {
    const accountId = parseInt(req.params.id as string);
    const valuations = await db
      .select()
      .from(investmentAccountValuationsTable)
      .where(eq(investmentAccountValuationsTable.investmentAccountId, accountId))
      .orderBy(desc(investmentAccountValuationsTable.valuationDate), desc(investmentAccountValuationsTable.createdAt));
    res.json(valuations.map(formatValuation));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch valuations" });
  }
});

router.post("/accounts/:id/valuations", async (req, res) => {
  try {
    const accountId = parseInt(req.params.id as string);
    const [account] = await db.select({ id: investmentAccountsTable.id }).from(investmentAccountsTable).where(eq(investmentAccountsTable.id, accountId));
    if (!account) return res.status(404).json({ error: "Investment account not found" });

    const { portfolioValue, valuationDate, notes } = req.body;
    if (portfolioValue == null || !valuationDate) return res.status(400).json({ error: "portfolioValue and valuationDate are required" });

    const [valuation] = await db.insert(investmentAccountValuationsTable).values({
      investmentAccountId: accountId,
      portfolioValue: parseFloat(portfolioValue).toString(),
      valuationDate,
      notes: notes || null,
    }).returning();

    res.status(201).json(formatValuation(valuation));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create valuation" });
  }
});

router.delete("/valuations/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    await db.delete(investmentAccountValuationsTable).where(eq(investmentAccountValuationsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete valuation" });
  }
});

// ─── Tax Documents ────────────────────────────────────────────────────────────

router.get("/accounts/:id/tax-documents", async (req, res) => {
  try {
    const accountId = parseInt(req.params.id as string);
    const docs = await db
      .select()
      .from(investmentTaxDocumentsTable)
      .where(eq(investmentTaxDocumentsTable.investmentAccountId, accountId))
      .orderBy(desc(investmentTaxDocumentsTable.taxYear), desc(investmentTaxDocumentsTable.createdAt));

    res.json(docs.map(d => ({
      ...d,
      url: toServingUrl(d.objectPath),
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tax documents" });
  }
});

router.post("/accounts/:id/tax-documents", upload.single("document"), async (req, res) => {
  try {
    const accountId = parseInt(req.params.id as string);
    const [account] = await db.select({ id: investmentAccountsTable.id }).from(investmentAccountsTable).where(eq(investmentAccountsTable.id, accountId));
    if (!account) return res.status(404).json({ error: "Investment account not found" });

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { taxYear, documentType, notes } = req.body;
    if (!taxYear) return res.status(400).json({ error: "taxYear is required" });

    const objectPath = await objectStorage.uploadBufferWithFilename(
      req.file.buffer,
      req.file.mimetype,
      "uploads/investment-tax-docs",
      req.file.originalname,
    );

    const [doc] = await db.insert(investmentTaxDocumentsTable).values({
      investmentAccountId: accountId,
      taxYear: parseInt(taxYear),
      documentType: documentType || "Other",
      fileName: req.file.originalname,
      objectPath,
      notes: notes || null,
    }).returning();

    res.status(201).json({
      ...doc,
      url: toServingUrl(doc.objectPath),
      createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload tax document" });
  }
});

router.delete("/tax-documents/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const [doc] = await db.select().from(investmentTaxDocumentsTable).where(eq(investmentTaxDocumentsTable.id, id));
    if (!doc) return res.status(404).json({ error: "Document not found" });

    try {
      await objectStorage.deleteObject(doc.objectPath);
    } catch {
      // Best-effort deletion from storage
    }

    await db.delete(investmentTaxDocumentsTable).where(eq(investmentTaxDocumentsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete tax document" });
  }
});

export default router;
