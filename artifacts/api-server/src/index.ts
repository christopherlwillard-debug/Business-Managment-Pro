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
import { isNull, and, inArray, asc, sql, ilike, eq } from "drizzle-orm";

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

async function ensureInvoiceLifecycleColumns(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE invoices
        ADD COLUMN IF NOT EXISTS accepted_at  TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS sent_at      TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS sent_method  TEXT;
    `);
    console.log("[startup] Invoice lifecycle columns ensured.");
  } catch (err) {
    console.error("[startup] ensureInvoiceLifecycleColumns failed (non-fatal):", err);
  }
}

async function ensureJobsManHours(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS man_hours NUMERIC(8,2);
    `);
    console.log("[startup] jobs.man_hours column ensured.");
  } catch (err) {
    console.error("[startup] ensureJobsManHours failed (non-fatal):", err);
  }
}

// Idempotent: creates Clayton Homes of Evansville client (if missing) and
// inserts the Factory Billback billing profile. Safe to run on every boot.
async function seedClaytonBillback(): Promise<void> {
  try {
    // 1. Ensure client exists
    let clientId: number;
    const existing = await db.select({ id: clientsTable.id })
      .from(clientsTable)
      .where(ilike(clientsTable.name, "Clayton Homes of Evansville"))
      .limit(1);

    if (existing.length > 0) {
      clientId = existing[0].id;
    } else {
      const [inserted] = await db.insert(clientsTable).values({
        name: "Clayton Homes of Evansville",
        address: "19410 US-41",
        city: "Evansville",
        state: "IN",
        zip: "47725",
      }).returning({ id: clientsTable.id });
      clientId = inserted.id;
      console.log(`[startup] Created Clayton Homes of Evansville client id=${clientId}`);
    }

    // 2. Ensure billing profile exists
    const existingProfile = await db.select({ id: clientBillingProfilesTable.id })
      .from(clientBillingProfilesTable)
      .where(and(
        eq(clientBillingProfilesTable.clientId, clientId),
        ilike(clientBillingProfilesTable.name, "Factory Billback"),
      ))
      .limit(1);

    if (existingProfile.length === 0) {
      await db.insert(clientBillingProfilesTable).values({
        clientId,
        name: "Factory Billback",
        repairRate1Tech: "33.00",
        repairRate2Tech: "50.00",
        driveRate1Tech: "15.00",
        driveRate2Tech: "30.00",
        mileageRate: "0.35",
        partsReimbursable: true,
        defaultTechCount: 2,
        billingNotes: "All work must be completed before billing. Pictures required for all repairs — send to Michelle/Service @ (812)215-9619. Mileage calculated from home center to customer site. No mileage on contracted work unless >60 miles from Home Center ($150/Day).",
        active: true,
      });
      console.log(`[startup] Created Factory Billback billing profile for clientId=${clientId}`);
    }
  } catch (err) {
    console.error("[startup] seedClaytonBillback failed (non-fatal):", err);
  }
}

async function start() {
  await ensureInvoiceLifecycleColumns();
  await ensureJobsManHours();
  await seedDefaultBusinesses();
  await seedClaytonBillback();
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
