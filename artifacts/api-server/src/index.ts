import puppeteer from "puppeteer";
import { existsSync } from "node:fs";
import { execSync, execFileSync } from "node:child_process";
import { join } from "node:path";
import app from "./app";
import { startRecurringExpensesJob } from "./jobs/recurringExpenses.js";
import { startInvoiceReminderJob } from "./jobs/invoiceReminders.js";
import { startPlaidSyncJob } from "./jobs/plaidSync.js";
import { startBidSyncJob } from "./jobs/bidSync.js";
import { startComplianceReminderJob } from "./jobs/complianceReminders.js";
import { db } from "@workspace/db";
import { businessesTable, mileageLogsTable, expensesTable, clientsTable, clientBillingProfilesTable } from "@workspace/db/schema";
import { invoicesTable, jobSubcontractorsTable, subPaymentRecordsTable, settingsTable } from "@workspace/db/schema";
import { isNull, isNotNull, and, inArray, asc, sql, ilike, eq } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function ensureChrome(): Promise<void> {
  // Prefer the bundled Chromium that ships with the `puppeteer` package — it is
  // version-matched and reliably launches in containerised production environments.
  // The Nix system binary passes an existence check but cannot start its DevTools
  // WebSocket in the production container, causing a 30 s timeout on every launch.
  const bundledPath = puppeteer.executablePath();
  if (bundledPath && existsSync(bundledPath)) {
    console.log(`Chrome (bundled) ready at ${bundledPath}`);
    return;
  }

  // Fall back to system chromium (works in the Nix dev environment).
  try {
    const nixChrome = execSync("which chromium", { encoding: "utf8" }).trim();
    if (nixChrome && existsSync(nixChrome)) {
      console.log(`Chrome (system) ready at ${nixChrome}`);
      return;
    }
  } catch {}


  console.log(`Chrome not found — downloading now (this may take a minute)...`);
  const candidates = [
    join(process.cwd(), "node_modules/puppeteer/install.mjs"),
    join(process.cwd(), "artifacts/api-server/node_modules/puppeteer/install.mjs"),
  ];
  const installScript = candidates.find(existsSync);
  if (!installScript) {
    throw new Error(
      `Cannot find puppeteer install.mjs. Tried:\n${candidates.join("\n")}`
    );
  }
  execFileSync(process.execPath, [installScript], { stdio: "inherit" });
  console.log("Chrome download complete.");
}

async function backfillMileageBusiness(): Promise<void> {
  try {
    const orphans = await db
      .select({ id: mileageLogsTable.id, expenseId: mileageLogsTable.expenseId })
      .from(mileageLogsTable)
      .where(and(isNull(mileageLogsTable.businessId), isNull(mileageLogsTable.subcontractorId)));

    if (orphans.length === 0) return;

    const [primary] = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .orderBy(asc(businessesTable.sortOrder), asc(businessesTable.id))
      .limit(1);

    if (!primary) return;

    const ids = orphans.map(r => r.id);
    const expenseIds = orphans.map(r => r.expenseId).filter((x): x is number => x != null);

    await db.update(mileageLogsTable).set({ businessId: primary.id }).where(inArray(mileageLogsTable.id, ids));
    if (expenseIds.length > 0) {
      await db.update(expensesTable).set({ businessId: primary.id }).where(inArray(expensesTable.id, expenseIds));
    }

    console.log(`[startup] Backfilled ${ids.length} mileage log(s) and ${expenseIds.length} linked expense(s) → businessId=${primary.id}`);
  } catch (err) {
    console.error("[startup] Mileage backfill failed (non-fatal):", err);
  }
}

async function seedDefaultBusinesses(): Promise<void> {
  try {
    const existing = await db.select({ id: businessesTable.id }).from(businessesTable).limit(1);
    if (existing.length === 0) {
      await db.insert(businessesTable).values([
        { name: "General Contracting", slug: "general_contracting", type: "general_contracting" },
        { name: "Asphalt Sealing",     slug: "asphalt_sealing",     type: "asphalt_sealing"     },
      ]);
      console.log("Seeded default businesses.");
    }
  } catch (err) {
    console.error("Business seed failed (non-fatal):", err);
  }
}




// One-time startup migration: drop NOT NULL on invoice_number (if still present)
// and clear any numbers from draft invoices so they receive sequential numbers
// when sent (not when created). Idempotent — safe to run on every boot.
async function clearDraftInvoiceNumbers(): Promise<void> {
  try {
    // Drop NOT NULL constraint if it still exists (production may still have it)
    await db.execute(sql`
      ALTER TABLE invoices ALTER COLUMN invoice_number DROP NOT NULL;
    `);
  } catch {
    // Already nullable — ignore
  }

  try {
    const draftsWithNumbers = await db
      .select({ id: invoicesTable.id })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.status, "draft"), isNotNull(invoicesTable.invoiceNumber)));

    if (draftsWithNumbers.length === 0) {
      console.log("[startup] clearDraftInvoiceNumbers: no draft invoices with numbers — skipped.");
      return;
    }

    const ids = draftsWithNumbers.map(r => r.id);
    await db.update(invoicesTable)
      .set({ invoiceNumber: null })
      .where(inArray(invoicesTable.id, ids));

    console.log(`[startup] clearDraftInvoiceNumbers: cleared invoice numbers from ${ids.length} draft invoice(s).`);
  } catch (err) {
    console.error("[startup] clearDraftInvoiceNumbers failed (non-fatal):", err);
  }
}


async function recomputePartialSubPaymentStatuses(): Promise<void> {
  try {
    const partialRows = await db
      .select({
        jobId: jobSubcontractorsTable.jobId,
        subId: jobSubcontractorsTable.subcontractorId,
        amountOwed: jobSubcontractorsTable.amountOwed,
      })
      .from(jobSubcontractorsTable)
      .where(eq(jobSubcontractorsTable.paymentStatus, "partial"));

    let fixed = 0;
    for (const row of partialRows) {
      const [sumRow] = await db
        .select({
          cashPaid: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.amount}), '0')`,
          advancesApplied: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.advanceAmount}), '0')`,
        })
        .from(subPaymentRecordsTable)
        .where(and(
          eq(subPaymentRecordsTable.jobId, row.jobId),
          eq(subPaymentRecordsTable.subcontractorId, row.subId),
          sql`(${subPaymentRecordsTable.isReversal} IS NULL OR ${subPaymentRecordsTable.isReversal} = false)`,
        ));
      const cashPaid = parseFloat(sumRow?.cashPaid ?? "0");
      const advances = parseFloat(sumRow?.advancesApplied ?? "0");
      const effectivePaid = cashPaid + advances;
      const owedAmt = row.amountOwed != null ? parseFloat(String(row.amountOwed)) : null;
      if (owedAmt != null) {
        const newStatus = effectivePaid > owedAmt + 0.005 ? "overpaid" : effectivePaid >= owedAmt - 0.005 ? "paid" : null;
        if (newStatus) {
          await db.update(jobSubcontractorsTable)
            .set({ paymentStatus: newStatus })
            .where(and(
              eq(jobSubcontractorsTable.jobId, row.jobId),
              eq(jobSubcontractorsTable.subcontractorId, row.subId),
            ));
          fixed++;
        }
      }
    }

    // Promote "paid" records that are actually overpaid (paid > owed + $0.005)
    const paidRows = await db
      .select({
        jobId: jobSubcontractorsTable.jobId,
        subId: jobSubcontractorsTable.subcontractorId,
        amountOwed: jobSubcontractorsTable.amountOwed,
        amountPaid: jobSubcontractorsTable.amountPaid,
      })
      .from(jobSubcontractorsTable)
      .where(eq(jobSubcontractorsTable.paymentStatus, "paid"));

    let promoted = 0;
    for (const row of paidRows) {
      const paid = row.amountPaid != null ? parseFloat(String(row.amountPaid)) : 0;
      const owed = row.amountOwed != null ? parseFloat(String(row.amountOwed)) : null;
      if (owed != null && paid > owed + 0.005) {
        await db.update(jobSubcontractorsTable)
          .set({ paymentStatus: "overpaid" })
          .where(and(
            eq(jobSubcontractorsTable.jobId, row.jobId),
            eq(jobSubcontractorsTable.subcontractorId, row.subId),
          ));
        promoted++;
      }
    }

    // Correct "overpaid" records where the entire overpayment is explained by
    // legitimate bonuses — these should be "paid", not "overpaid".
    // This fixes records created before the pay-worker bonus-ceiling fix.
    const overpaidRows = await db
      .select({
        jobId: jobSubcontractorsTable.jobId,
        subId: jobSubcontractorsTable.subcontractorId,
        amountOwed: jobSubcontractorsTable.amountOwed,
        amountPaid: jobSubcontractorsTable.amountPaid,
        compensationType: jobSubcontractorsTable.compensationType,
      })
      .from(jobSubcontractorsTable)
      .where(eq(jobSubcontractorsTable.paymentStatus, "overpaid"));

    let corrected = 0;
    for (const row of overpaidRows) {
      // Only correct hourly subs — fixed/allocation owed amounts are exact and
      // bonuses don't apply to them in the same way.
      if ((row.compensationType ?? "hourly") !== "hourly") continue;
      const paid = row.amountPaid != null ? parseFloat(String(row.amountPaid)) : 0;
      const owed = row.amountOwed != null ? parseFloat(String(row.amountOwed)) : null;
      if (owed == null) continue;
      const overpayment = paid - owed;
      if (overpayment <= 0.005) continue; // not actually overpaid
      // Sum all bonuses paid to this sub on this job
      const [bonusRow] = await db
        .select({ total: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.bonusAmount}), '0')` })
        .from(subPaymentRecordsTable)
        .where(and(
          eq(subPaymentRecordsTable.jobId, row.jobId),
          eq(subPaymentRecordsTable.subcontractorId, row.subId),
          sql`(${subPaymentRecordsTable.isReversal} IS NULL OR ${subPaymentRecordsTable.isReversal} = false)`,
        ));
      const totalBonuses = parseFloat(bonusRow?.total ?? "0");
      // If the overpayment is fully covered by bonuses, restore to "paid"
      if (totalBonuses >= overpayment - 0.005) {
        await db.update(jobSubcontractorsTable)
          .set({ paymentStatus: "paid" })
          .where(and(
            eq(jobSubcontractorsTable.jobId, row.jobId),
            eq(jobSubcontractorsTable.subcontractorId, row.subId),
          ));
        corrected++;
      }
    }

    if (fixed > 0 || promoted > 0 || corrected > 0) {
      console.log(`[startup] recomputeSubPaymentStatuses: ${fixed} partial promoted, ${promoted} paid→overpaid, ${corrected} overpaid→paid (bonus correction).`);
    }
  } catch (err) {
    console.error("[startup] recomputePartialSubPaymentStatuses failed (non-fatal):", err);
  }
}

/**
 * Advance the invoice counter past any existing invoice numbers so
 * the next accept never collides with a previously-used number
 * (e.g. after a counter reset or cancelled-invoice accumulation).
 */
async function syncInvoiceCounter(): Promise<void> {
  try {
    // Find the highest numeric suffix from any existing invoice number
    const rows = await db
      .select({ invoiceNumber: invoicesTable.invoiceNumber })
      .from(invoicesTable)
      .where(isNotNull(invoicesTable.invoiceNumber));

    let maxNum = 0;
    for (const row of rows) {
      const m = row.invoiceNumber?.match(/(\d+)$/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }

    if (maxNum === 0) return; // no existing invoices

    const [settings] = await db.select({ invoiceNextNumber: settingsTable.invoiceNextNumber }).from(settingsTable).limit(1);
    const current = settings?.invoiceNextNumber ?? 1001;

    if (current <= maxNum) {
      const newCounter = maxNum + 1;
      await db.update(settingsTable).set({ invoiceNextNumber: newCounter });
      console.log(`[startup] syncInvoiceCounter: advanced counter ${current} → ${newCounter} (max existing: ${maxNum})`);
    }
  } catch (err) {
    console.error("[startup] syncInvoiceCounter failed (non-fatal):", err);
  }
}

/**
 * Ensure the bank_transaction_invoice_links junction table exists in production.
 * It was added after the initial banking schema; production may be missing it.
 * Also ensures plaid_transaction_id column exists on bank_transactions.
 */
async function ensureBankingSchema(): Promise<void> {
  try {
    // plaid_transaction_id on bank_transactions (TEXT, nullable)
    await db.execute(sql`
      ALTER TABLE bank_transactions
        ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT;
    `);
  } catch (err) {
    console.error("[startup] ensureBankingSchema: plaid_transaction_id column check failed (non-fatal):", err);
  }

  try {
    // bank_transaction_invoice_links junction table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bank_transaction_invoice_links (
        id SERIAL PRIMARY KEY,
        bank_transaction_id INTEGER NOT NULL
          REFERENCES bank_transactions(id) ON DELETE CASCADE,
        invoice_id INTEGER NOT NULL
          REFERENCES invoices(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log("[startup] ensureBankingSchema: bank_transaction_invoice_links OK.");
  } catch (err) {
    console.error("[startup] ensureBankingSchema: bank_transaction_invoice_links failed (non-fatal):", err);
  }

  try {
    // bank_transaction_expense_links junction table (split expense matching)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bank_transaction_expense_links (
        id SERIAL PRIMARY KEY,
        bank_transaction_id INTEGER NOT NULL
          REFERENCES bank_transactions(id) ON DELETE CASCADE,
        expense_id INTEGER NOT NULL
          REFERENCES expenses(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log("[startup] ensureBankingSchema: bank_transaction_expense_links OK.");
  } catch (err) {
    console.error("[startup] ensureBankingSchema: bank_transaction_expense_links failed (non-fatal):", err);
  }
}

async function start() {
  await ensureBankingSchema();
  await clearDraftInvoiceNumbers();
  await syncInvoiceCounter();
  await recomputePartialSubPaymentStatuses();
  await seedDefaultBusinesses();

  await backfillMileageBusiness();
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    startRecurringExpensesJob();
    startInvoiceReminderJob();
    startPlaidSyncJob();
    startBidSyncJob();
    startComplianceReminderJob();
    // Warm Chrome in the background so PDF generation is ready without
    // blocking the server from accepting requests (and passing healthchecks).
    ensureChrome().catch(err =>
      console.error("[startup] Chrome warm-up failed (non-fatal):", err)
    );
  });
}

start().catch((err) => {
  console.error("Server startup failed:", err);
  process.exit(1);
});
