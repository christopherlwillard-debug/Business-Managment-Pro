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
import { businessesTable, mileageLogsTable, expensesTable } from "@workspace/db/schema";
import { isNull, and, inArray, asc } from "drizzle-orm";

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

// One-time cleanup: delete expense rows created by the pay-worker dual-write
// (Task #888 Phase 1 → Phase 2). The pay-worker route no longer writes to
// expenses (Task #892), but any rows created before that deploy still exist.
// This runs at every startup and is a no-op once the rows are gone.
async function deletePayworkerExpenses(): Promise<void> {
  try {
    const result = await db.execute<{ id: number; description: string; amount: string }>(
      `DELETE FROM expenses
       WHERE subcontractor_id IS NOT NULL
         AND job_sub_hours_id IS NULL
         AND (
           description LIKE '%— Labor Pay'
           OR description LIKE '%— Fixed Pay'
           OR description LIKE '%— Allocation Pay'
         )
       RETURNING id, description, amount`
    );
    const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
    if (rows.length > 0) {
      console.log(`[startup] Deleted ${rows.length} pay-worker expense row(s):`, rows.map((r: any) => `#${r.id} ${r.description} $${r.amount}`).join(", "));
    }
  } catch (err) {
    console.error("[startup] deletePayworkerExpenses failed (non-fatal):", err);
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

async function start() {
  await seedDefaultBusinesses();
  await backfillMileageBusiness();
  await deletePayworkerExpenses();
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
