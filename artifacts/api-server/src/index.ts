import puppeteer from "puppeteer";
import { existsSync } from "node:fs";
import { execSync, execFileSync } from "node:child_process";
import { join } from "node:path";
import app from "./app";
import { startRecurringExpensesJob } from "./jobs/recurringExpenses.js";
import { startInvoiceReminderJob } from "./jobs/invoiceReminders.js";
import { startPlaidSyncJob } from "./jobs/plaidSync.js";
import { startBidSyncJob } from "./jobs/bidSync.js";
import { seedBidSourceCatalog } from "./lib/bidSourceSeeds.js";
import { seedGrantSourceCatalog } from "./lib/grantSourceSeeds.js";
import { startComplianceReminderJob } from "./jobs/complianceReminders.js";
import { db } from "@workspace/db";
import { businessesTable, mileageLogsTable, expensesTable, clientsTable, clientBillingProfilesTable } from "@workspace/db/schema";
import { invoicesTable, jobSubcontractorsTable, subPaymentRecordsTable, settingsTable, bidOpportunitiesTable } from "@workspace/db/schema";
import { isNull, isNotNull, and, inArray, asc, sql, ilike, eq } from "drizzle-orm";
import { classifyOpportunityScope, isScopeCompatibleWithBusiness } from "./lib/bidScopeClassifier.js";

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




/**
 * Startup scope cleanup — runs every boot, completes in milliseconds.
 *
 * Deletes bid_opportunities rows whose scope_category is incompatible with
 * the business they are assigned to, as long as the row has NOT been actively
 * worked (stage = 'new' or 'no_bid'). This self-heals any rows that slipped
 * through before the Phase 7 scope gate was in place (e.g. COUNTY PAVING PROGRAM
 * under Willard's Flooring) without needing a manual sync.
 *
 * Conservative: re-classifies scope from title + NAICS (same logic as sync-time
 * pruning) so confidence is correctly applied — low-confidence matches are never
 * deleted.
 */
async function ensureBidScopeCleanup(): Promise<void> {
  try {
    // Single join query: pull every un-reviewed bid together with its business type.
    // We re-run the classifier (pure JS, no extra DB calls) to get confidence,
    // then batch-delete incompatible rows in one statement.
    const candidates = await db
      .select({
        id:           bidOpportunitiesTable.id,
        title:        bidOpportunitiesTable.title,
        naicsCode:    bidOpportunitiesTable.naicsCode,
        source:       bidOpportunitiesTable.source,
        businessType: businessesTable.type,
      })
      .from(bidOpportunitiesTable)
      .innerJoin(businessesTable, eq(bidOpportunitiesTable.businessId, businessesTable.id))
      .where(inArray(bidOpportunitiesTable.stage, ["new", "no_bid"]));

    const toDelete: number[] = [];
    for (const row of candidates) {
      if (!row.businessType) continue; // no type set — skip safely
      const scope = classifyOpportunityScope(row.title, row.naicsCode, row.source ?? "unknown");
      if (!isScopeCompatibleWithBusiness(scope.primaryCategory, scope.confidence, row.businessType)) {
        toDelete.push(row.id);
        console.log(
          `[startup] bid-scope-cleanup: removing "${row.title.slice(0, 60)}" ` +
          `(scope: ${scope.primaryCategory ?? "unknown"}, confidence: ${scope.confidence}) ` +
          `from ${row.businessType}`
        );
      }
    }

    if (toDelete.length > 0) {
      await db.delete(bidOpportunitiesTable).where(inArray(bidOpportunitiesTable.id, toDelete));
    }

    console.log(`[startup] bid-scope-cleanup: removed ${toDelete.length} wrong-business row(s).`);
  } catch (err) {
    console.error("[startup] ensureBidScopeCleanup failed (non-fatal):", err);
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

async function ensureTripNotesColumn() {
  try {
    await db.execute(sql`ALTER TABLE business_trips ADD COLUMN IF NOT EXISTS notes TEXT`);
    console.log("[startup] ensureTripNotesColumn: notes column OK.");
  } catch (err) {
    console.error("[startup] ensureTripNotesColumn failed (non-fatal):", err);
  }
}

/** M16: AI Marketing Assistant — create marketing_content table if missing. */
async function ensureWebsiteTemplatesTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS website_templates (
        id SERIAL PRIMARY KEY,
        business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        brand_color VARCHAR(20) NOT NULL DEFAULT '#1a1a2e',
        settings JSONB NOT NULL DEFAULT '{}',
        sections JSONB NOT NULL DEFAULT '[]',
        ai_generated BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log("[startup] ensureWebsiteTemplatesTable: website_templates OK.");
  } catch (err) {
    console.error("[startup] ensureWebsiteTemplatesTable failed (non-fatal):", err);
  }
}

async function ensureMarketingContentTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS marketing_content (
        id SERIAL PRIMARY KEY,
        business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        promo_hint TEXT,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log("[startup] ensureMarketingContentTable: marketing_content OK.");
  } catch (err) {
    console.error("[startup] ensureMarketingContentTable failed (non-fatal):", err);
  }
}

/** Vehicle Profiles: creates vehicles table and seeds a default vehicle from settings if none exists. */
async function ensureVehiclesTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vehicles (
        id SERIAL PRIMARY KEY,
        business_id INTEGER,
        nickname TEXT NOT NULL DEFAULT 'My Truck',
        year INTEGER,
        make TEXT,
        model TEXT,
        avg_mpg INTEGER NOT NULL DEFAULT 17,
        fuel_price_per_gallon NUMERIC(6,3),
        fuel_price_updated_at TIMESTAMP,
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    // Seed a default vehicle from settings if none exists yet.
    // This handles fresh deployments and production environments that skipped the SQL migration.
    await db.execute(sql`
      INSERT INTO vehicles (nickname, avg_mpg, fuel_price_per_gallon, fuel_price_updated_at, is_default)
      SELECT 'My Truck', COALESCE(vehicle_mpg, 17), fuel_price_per_gallon, fuel_price_updated_at, true
      FROM settings
      WHERE NOT EXISTS (SELECT 1 FROM vehicles WHERE is_default = true)
      LIMIT 1;
    `);
    console.log("[startup] ensureVehiclesTable: vehicles OK.");
  } catch (err) {
    console.error("[startup] ensureVehiclesTable failed (non-fatal):", err);
  }
}

/** Owner capital ledger: source (audit trail) + expense_id (dedup FK) columns on owner_capital_entries. */
async function ensureOwnerCapitalLedgerSchema(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE owner_capital_entries
        ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'capital_entry',
        ADD COLUMN IF NOT EXISTS expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS owner_capital_entries_expense_id_unique
        ON owner_capital_entries(expense_id)
        WHERE expense_id IS NOT NULL
    `);
    console.log("[startup] ensureOwnerCapitalLedgerSchema: OK.");
  } catch (err) {
    console.error("[startup] ensureOwnerCapitalLedgerSchema failed (non-fatal):", err);
  }
}

/**
 * One-time data migration: backfill historical owner-pay expenses into owner_capital_entries.
 * Runs on every boot but is effectively a no-op once all 9 historical expenses are migrated
 * (the NOT IN / expense_id IS NOT NULL guard makes it idempotent).
 *
 * Background: Task #1923 introduced owner_capital_entries as the canonical owner-pay ledger.
 * Historical owner-draw/compensation/withdrawal expenses (pre-migration) were recorded only
 * in the expenses table. This function migrates them into the ledger so the My Pay screen
 * shows the correct lifetime total.
 */
async function ensureOwnerPayLedgerMigrated(): Promise<void> {
  try {
    // Insert all owner-category expenses not yet linked to owner_capital_entries.
    // IS NOT DISTINCT FROM handles NULL job_id correctly (avoids "= NULL" pitfall).
    // ON CONFLICT DO NOTHING on the unique partial index (expense_id IS NOT NULL) makes
    // this fully idempotent — re-running never creates duplicate rows.
    const result = await db.execute(sql`
      INSERT INTO owner_capital_entries (date, description, amount, source, expense_id, job_id)
      SELECT
        e.date,
        e.description,
        -(e.amount::numeric),
        'migrated_expense',
        e.id,
        e.job_id
      FROM expenses e
      WHERE e.category IN ('Owner Draw', 'Owner Compensation', 'Owner Withdrawal')
        AND e.id NOT IN (
          SELECT expense_id FROM owner_capital_entries WHERE expense_id IS NOT NULL
        )
      ON CONFLICT DO NOTHING
    `);
    const migrated = (result as any).rowCount ?? 0;
    if (migrated > 0) {
      console.log(`[startup] ensureOwnerPayLedgerMigrated: backfilled ${migrated} owner-pay expense(s) into owner_capital_entries.`);
    }
  } catch (err) {
    console.error("[startup] ensureOwnerPayLedgerMigrated failed (non-fatal):", err);
  }
}

/** Wage-advance flag: is_wage_advance boolean on expenses.
 *  Used by Accounting/dashboard routes to exclude hourly-sub advance pre-payments from
 *  business-expense totals (the wages are already captured in jsh auto-expense accruals). */
async function ensureWageAdvanceColumn(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE expenses
        ADD COLUMN IF NOT EXISTS is_wage_advance boolean NOT NULL DEFAULT false
    `);
    console.log("[startup] ensureWageAdvanceColumn: is_wage_advance OK.");
  } catch (err) {
    console.error("[startup] ensureWageAdvanceColumn failed (non-fatal):", err);
  }
}

/** Prospect CRM field expansion: company name, website, dual address fields added Aug 2026. */
async function ensureProspectsSchema(): Promise<void> {
  try {
    await db.execute(sql`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS company_name text`);
    await db.execute(sql`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS website text`);
    await db.execute(sql`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS company_address text`);
    await db.execute(sql`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS company_city text`);
    await db.execute(sql`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS company_state text`);
    await db.execute(sql`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS company_zip text`);
    await db.execute(sql`ALTER TABLE prospects ALTER COLUMN address SET DEFAULT ''`);
    console.log("[startup] ensureProspectsSchema: OK.");
  } catch (err) {
    console.error("[startup] ensureProspectsSchema failed (non-fatal):", err);
  }
}

/** Material expense linking: source_type/source_id on expenses + add_to_job_expenses/expense_id on material_list_items. */
async function ensureMaterialExpenseLinkingSchema(): Promise<void> {
  try {
    await db.execute(sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source_type text`);
    await db.execute(sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source_id integer`);
    await db.execute(sql`ALTER TABLE material_list_items ADD COLUMN IF NOT EXISTS add_to_job_expenses boolean NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE material_list_items ADD COLUMN IF NOT EXISTS expense_id integer REFERENCES expenses(id) ON DELETE SET NULL`);
    console.log("[startup] ensureMaterialExpenseLinkingSchema: OK.");
  } catch (err) {
    console.error("[startup] ensureMaterialExpenseLinkingSchema failed (non-fatal):", err);
  }
}

async function ensureServiceAddonPromptsTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS service_addon_prompts (
        id SERIAL PRIMARY KEY,
        business_id INTEGER,
        trigger_service_type_id INTEGER NOT NULL
          REFERENCES production_service_types(id) ON DELETE CASCADE,
        addon_service_type_id INTEGER NOT NULL
          REFERENCES production_service_types(id) ON DELETE CASCADE,
        prompt_label TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    // Add business_id column if the table already existed without it.
    await db.execute(sql`
      ALTER TABLE service_addon_prompts
        ADD COLUMN IF NOT EXISTS business_id INTEGER;
    `);
    // Enforce one prompt per trigger per business scope (nulls treated as -1 for uniqueness).
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_addon_prompt_trigger
        ON service_addon_prompts (trigger_service_type_id, COALESCE(business_id, -1));
    `);
    console.log("[startup] ensureServiceAddonPromptsTable: service_addon_prompts OK.");
  } catch (err) {
    console.error("[startup] ensureServiceAddonPromptsTable failed (non-fatal):", err);
  }
}

// One-time backfill: set opportunity_type = 'award_intelligence' on existing
// usa-spending rows that were inserted before that column was populated.
async function backfillUsaSpendingOpportunityType(): Promise<void> {
  try {
    const result = await db
      .update(bidOpportunitiesTable)
      .set({ opportunityType: "award_intelligence" })
      .where(and(
        eq(bidOpportunitiesTable.source, "usa-spending"),
        isNull(bidOpportunitiesTable.opportunityType),
      ));
    const count = (result as unknown as { rowCount?: number }).rowCount ?? 0;
    if (count > 0) {
      console.log(`[startup] backfillUsaSpendingOpportunityType: backfilled ${count} row(s).`);
    }
  } catch (err) {
    console.error("[startup] backfillUsaSpendingOpportunityType failed (non-fatal):", err);
  }
}

async function start() {
  // Bind before the startup backfills and seed checks. Autoscale probes the
  // service while it is starting; the lightweight health route must be able to
  // answer before database initialization finishes.
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });

  // Load encrypted API credentials from DB into memory before any routes use them.
  // Non-fatal: if the table doesn't exist yet (pre-migration), getCredential falls back to process.env.
  const { init: initCredentials } = await import("./lib/credentialManager.js");
  await initCredentials();

  await ensureOwnerCapitalLedgerSchema();
  await ensureOwnerPayLedgerMigrated();
  await ensureBankingSchema();
  await ensureTripNotesColumn();
  await ensureMarketingContentTable();
  await ensureWebsiteTemplatesTable();
  await ensureVehiclesTable();
  await ensureMaterialExpenseLinkingSchema();
  await ensureWageAdvanceColumn();
  await ensureProspectsSchema();
  await ensureServiceAddonPromptsTable();
  await backfillUsaSpendingOpportunityType();
  await clearDraftInvoiceNumbers();
  await syncInvoiceCounter();
  await recomputePartialSubPaymentStatuses();
  await seedDefaultBusinesses();
  await seedBidSourceCatalog();
  await seedGrantSourceCatalog();
  const { seedEquipmentSources } = await import("./lib/equipmentSourceSeeds.js");
  await seedEquipmentSources();

  await ensureBidScopeCleanup();
  await backfillMileageBusiness();
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
}

start().catch((err) => {
  console.error("Server startup failed:", err);
  process.exit(1);
});
