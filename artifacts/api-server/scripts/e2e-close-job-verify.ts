/* Authenticated browser verification for the close-job payout waterfall.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run verify:close-job
 *
 * This creates a temporary development job with a paid invoice, one allocation
 * worker, and a partial payment, drives the real Jobs page, then removes all
 * temporary records.
 *
 * Browser/runtime:
 *   The command uses the shared launchBrowser helper. It prefers an explicit
 *   PUPPETEER_EXECUTABLE_PATH, then the Nix Chromium wrapper, then Puppeteer's
 *   version-matched browser from PUPPETEER_CACHE_DIR.
 *
 * Target:
 *   E2E_BASE_URL defaults to the local Replit preview proxy at
 *   http://localhost:80. Override it only for another local development
 *   server; production deployments are rejected.
 */
import { launchBrowser } from "../src/lib/launchBrowser";
import { db } from "@workspace/db";
import {
  businessesTable,
  invoicesTable,
  jobsTable,
  jobSubcontractorsTable,
  sessionsTable,
  settingsTable,
  subPaymentRecordsTable,
  subcontractorsTable,
} from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import fs from "node:fs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:80";
const SHOTS = "/tmp/e2e-close-job-shots";
const SID = `e2e-close-${crypto.randomUUID()}`;

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run close-job E2E verification against a production deployment");
}

const baseUrl = new URL(BASE);
const baseHostname = baseUrl.hostname.replace(/^\[|\]$/g, "");
if (baseUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(baseHostname)) {
  throw new Error(
    `Refusing to run close-job E2E verification against non-local target ${baseUrl.origin}. ` +
    "Set E2E_BASE_URL to a local development server.",
  );
}

const results: { name: string; pass: boolean; detail?: string }[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type CloseJobFixture = {
  subId: number;
  subName: string;
  jobId: number;
  jobTitle: string;
  invoiceId: number;
};

type VerificationBusiness = { id: number; slug: string };

const fixtures: CloseJobFixture[] = [];
type CleanupTarget = {
  subId?: number;
  jobId?: number;
  invoiceId?: number;
};
const cleanupTargets: CleanupTarget[] = [];

async function createFixture(business: VerificationBusiness, label: string): Promise<CloseJobFixture> {
  const target: CleanupTarget = {};
  cleanupTargets.push(target);

  try {
    const [sub] = await db.insert(subcontractorsTable).values({
      name: `E2E ${label} Worker ${Date.now()}`,
      trade: "Automated verification",
      role: "member",
      notes: "Temporary development-only close-job regression fixture",
    }).returning();
    target.subId = sub.id;

    const [job] = await db.insert(jobsTable).values({
      title: `E2E ${label} Job ${Date.now()}`,
      status: "scheduled",
      businessLine: business.slug,
      businessId: business.id,
    }).returning();
    target.jobId = job.id;

    const [invoice] = await db.insert(invoicesTable).values({
      invoiceNumber: `E2E-CLOSE-${job.id}`,
      jobId: job.id,
      status: "paid",
      issueDate: new Date().toISOString().slice(0, 10),
      subtotal: "1000.00",
      total: "1000.00",
      amountPaid: "1000.00",
      businessLine: business.slug,
      businessId: business.id,
      lineItems: [{ id: 1, description: "Verification work", quantity: 1, unitPrice: 1000, total: 1000 }],
    }).returning();
    target.invoiceId = invoice.id;

    await db.insert(jobSubcontractorsTable).values({
      jobId: job.id,
      subcontractorId: sub.id,
      compensationType: "allocation",
      allocationPct: "20.00",
      amountOwed: "190.00",
      amountPaid: "25.00",
      paymentStatus: "partial",
    });
    await db.insert(subPaymentRecordsTable).values({
      jobId: job.id,
      subcontractorId: sub.id,
      businessLine: business.slug,
      amount: "25.00",
      paymentDate: new Date().toISOString().slice(0, 10),
      description: "E2E partial payment",
      createdFrom: "e2e-close-job-verify",
      idempotencyKey: `e2e-close-partial-${job.id}`,
      agreedOwedSnapshot: "190.00",
      netPaid: "25.00",
    });

    const fixture = {
      subId: sub.id,
      subName: sub.name ?? "",
      jobId: job.id,
      jobTitle: job.title,
      invoiceId: invoice.id,
    };
    fixtures.push(fixture);
    return fixture;
  } catch (error) {
    // The target remains registered so the outer finally block retries every
    // cleanup step even if fixture creation failed partway through.
    throw error;
  }
}

async function cleanupTarget(target: CleanupTarget): Promise<string[]> {
  const failures: string[] = [];
  const attempt = async (label: string, operation: () => Promise<unknown>) => {
    try {
      await operation();
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  if (target.jobId != null) {
    await attempt("sub_payment_records", () =>
      db.delete(subPaymentRecordsTable).where(eq(subPaymentRecordsTable.jobId!, target.jobId!)),
    );
    await attempt("job_subcontractors", () =>
      db.delete(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, target.jobId!)),
    );
  }
  if (target.invoiceId != null) {
    await attempt("invoices", () =>
      db.delete(invoicesTable).where(eq(invoicesTable.id, target.invoiceId!)),
    );
  }
  if (target.jobId != null) {
    await attempt("jobs", () =>
      db.delete(jobsTable).where(eq(jobsTable.id, target.jobId!)),
    );
  }
  if (target.subId != null) {
    await attempt("subcontractors", () =>
      db.delete(subcontractorsTable).where(eq(subcontractorsTable.id, target.subId!)),
    );
  }
  return failures;
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const [[settings], [business]] = await Promise.all([
    db.select({ ownerUserId: settingsTable.ownerUserId }).from(settingsTable).limit(1),
    db.select({ id: businessesTable.id, slug: businessesTable.slug })
      .from(businessesTable)
      .where(eq(businessesTable.slug, "general_contracting"))
      .limit(1),
  ]);
  if (!settings?.ownerUserId) throw new Error("No configured owner available for authenticated verification");
  if (!business) throw new Error("The general_contracting development business is required for verification");

  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  let sessionCreated = false;
  try {
    await db.insert(sessionsTable).values({
      sid: SID,
      sess: {
        user: {
          id: settings.ownerUserId,
          email: "e2e-close-job@example.invalid",
          firstName: "E2E",
          lastName: "Verifier",
          profileImageUrl: null,
        },
        access_token: "dummy",
        expires_at: Math.floor(Date.now() / 1000) + 86_400,
      },
      expire: new Date(Date.now() + 86_400_000),
    });
    sessionCreated = true;

    const markAllPaidFixture = await createFixture(business, "Mark All Paid");
    const keepOutstandingFixture = await createFixture(business, "Keep Outstanding");

    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setCookie({ name: "sid", value: SID, url: BASE, path: "/" });
    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    const closeAttempts = await page.evaluate(async ({ jobId, businessId, businessLine }) => {
      const responses = [];
      for (const status of ["closed", "completed"]) {
        const response = await fetch(`/api/jobs/${jobId}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, businessId, businessLine }),
        });
        const body = await response.json();
        responses.push({ status: response.status, code: body.code });
      }
      const jobResponse = await fetch(`/api/jobs/${jobId}`, { credentials: "include" });
      const job = await jobResponse.json() as { status?: string };
      return { responses, jobStatus: job.status };
    }, {
      jobId: markAllPaidFixture.jobId,
      businessId: business.id,
      businessLine: business.slug,
    });
    record(
      "Server rejects completion and closure while subcontractor pay remains",
      closeAttempts.responses.length === 2 && closeAttempts.responses.every(
        response => response.status === 409 && response.code === "SUBCONTRACTOR_BALANCE_UNRESOLVED",
      ),
      JSON.stringify(closeAttempts.responses),
    );
    record("Rejected transitions leave job open", closeAttempts.jobStatus === "scheduled", `status=${closeAttempts.jobStatus}`);
    await db.update(jobsTable)
      .set({ status: "completed", closedAt: "2026-11-11" })
      .where(eq(jobsTable.id, markAllPaidFixture.jobId));
    const reopened = await page.evaluate(async ({ jobId, businessId, businessLine }) => {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed", businessId, businessLine }),
      });
      const body = await response.json() as { status?: string; closedAt?: string | null; error?: string };
      return { httpStatus: response.status, status: body.status, closedAt: body.closedAt, error: body.error };
    }, {
      jobId: markAllPaidFixture.jobId,
      businessId: business.id,
      businessLine: business.slug,
    });
    record(
      "Explicit reopen clears the closed date without recording payment",
      reopened.httpStatus === 200 && reopened.status === "completed" && reopened.closedAt == null,
      JSON.stringify(reopened),
    );
    const jobsPageSource = fs.readFileSync(new URL("../../contractor-app/src/pages/Jobs.tsx", import.meta.url), "utf8");
    record(
      "Completion dialog routes unpaid work to payroll without recording payments",
      jobsPageSource.includes("Open Job Payroll")
        && !jobsPageSource.includes("Mark All Paid Now")
        && !jobsPageSource.includes("Complete Job &amp; Keep As Outstanding"),
    );
    // The legacy browser interaction below targets the removed "keep outstanding"
    // workflow. It remains opt-in for debugging old screenshots, not as a release check.
    if (process.env.RUN_LEGACY_CLOSE_JOB_UI_CHECKS === "1") {
    const openCompletionDialog = async (fixture: CloseJobFixture, screenshotName: string) => {
      await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
      await page.waitForFunction(
        (title) => document.body.innerText.includes(title),
        { timeout: 30_000 },
        fixture.jobTitle,
      ).catch(() => undefined);
      await sleep(500);
      const body = await page.evaluate(() => document.body.innerText);
      record("Jobs page loads authenticated", !/log in|sign in/i.test(body.slice(0, 500)) && body.includes("Jobs"));
      await page.screenshot({ path: `${SHOTS}/${screenshotName}-jobs.png` });

      const openedCard = await page.evaluate((title) => {
        const titleNodes = Array.from(document.querySelectorAll<HTMLElement>("h3"))
          .filter((node) => node.textContent?.trim() === title);
        for (const titleNode of titleNodes) {
          let parent: HTMLElement | null = titleNode;
          for (let i = 0; parent && i < 15; i++, parent = parent.parentElement) {
            const button = Array.from(parent.querySelectorAll<HTMLButtonElement>("button"))
              .find((candidate) => candidate.textContent?.includes("Open Job Card"));
            if (button) {
              button.click();
              return true;
            }
          }
        }
        return false;
      }, fixture.jobTitle);
      record("Temporary job card opens from compact view", openedCard);
      await sleep(500);

      const clicked = await page.evaluate((title) => {
        const titleNodes = Array.from(document.querySelectorAll<HTMLElement>("h3"))
          .filter((node) => node.textContent?.trim() === title);
        for (const titleNode of titleNodes) {
          let parent: HTMLElement | null = titleNode;
          for (let i = 0; parent && i < 15; i++, parent = parent.parentElement) {
            const button = Array.from(parent.querySelectorAll<HTMLButtonElement>("button"))
              .find((candidate) => candidate.textContent?.includes("Mark Completed"));
            if (button) {
              button.click();
              return true;
            }
          }
        }
        return false;
      }, fixture.jobTitle);
      record("Real job card opens completion flow", clicked);
      await sleep(800);
      const dialogText = await page.evaluate(() => document.body.innerText);
      record("Protected completion dialog is visible", dialogText.includes("Worker Pay Due") && dialogText.includes(fixture.subName));
      record("Dialog preserves partial-payment deduction", dialogText.includes("20%") && dialogText.includes("$165.00"), dialogText.match(/20%[^\n]*/)?.[0] ?? "allocation line not found");
      await page.screenshot({ path: `${SHOTS}/${screenshotName}-close-dialog.png` });
    };

    const fetchAfterAction = async (jobId: number) => page.evaluate(async (id) => {
      const [jobRes, profitRes, subsRes, outstandingRes] = await Promise.all([
        fetch(`/api/jobs/${id}`),
        fetch(`/api/jobs/${id}/profit`),
        fetch(`/api/jobs/${id}/sub-payments`),
        fetch(`/api/jobs/${id}/outstanding-sub-payments`),
      ]);
      return {
        job: await jobRes.json(),
        profit: await profitRes.json(),
        subs: await subsRes.json(),
        outstanding: await outstandingRes.json(),
        text: document.body.innerText,
      };
    }, jobId);

    const waitForJobStatus = async (jobId: number, expectedStatus: string) => {
      await page.waitForFunction(async (id, status) => {
        try {
          const response = await fetch(`/api/jobs/${id}`);
          if (!response.ok) return false;
          const job = await response.json() as { status?: string };
          return job.status === status;
        } catch {
          return false;
        }
      }, { timeout: 15_000 }, jobId, expectedStatus);
    };

    await openCompletionDialog(markAllPaidFixture, "01-mark-all-paid");
    const clickedPay = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((candidate) => candidate.textContent?.includes("Mark All Paid Now"));
      button?.click();
      return !!button;
    });
    record("Mark All Paid Now is available", clickedPay);
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 15_000 }).catch(() => sleep(3000));
    await waitForJobStatus(markAllPaidFixture.jobId, "completed");

    const paidAfter = await fetchAfterAction(markAllPaidFixture.jobId);
    const splitPool = Number.isFinite(Number(paidAfter.profit.splitPool))
      ? Number(paidAfter.profit.splitPool)
      : Math.max(
          0,
          (Number(paidAfter.profit.grossInvoiced ?? 0) - Number(paidAfter.profit.jobExpenses ?? 0))
          - Number(paidAfter.profit.subLaborCost ?? 0),
        ) * 0.95;
    const expectedGrossAllocation = splitPool * 0.2;
    const paidWorker = paidAfter.subs.find((row: { subcontractorId: number }) => row.subcontractorId === markAllPaidFixture.subId);
    record("Job Financials split allocation is $190.00", Math.abs(expectedGrossAllocation - 190) < 0.01, `toSplit=${splitPool}, allocation=${expectedGrossAllocation}`);
    record("Partial payment plus close payout settles at $190.00", paidWorker?.paymentStatus === "paid" && Math.abs(Number(paidWorker?.amountPaid) - 190) < 0.01, `status=${paidWorker?.paymentStatus}, amountPaid=${paidWorker?.amountPaid}`);
    const paidLedgerRows = await db.select({
      amount: subPaymentRecordsTable.amount,
      netPaid: subPaymentRecordsTable.netPaid,
      isReversal: subPaymentRecordsTable.isReversal,
    }).from(subPaymentRecordsTable).where(and(
      eq(subPaymentRecordsTable.jobId, markAllPaidFixture.jobId),
      eq(subPaymentRecordsTable.subcontractorId, markAllPaidFixture.subId),
    ));
    const paidActiveAmounts = paidLedgerRows
      .filter((row) => row.isReversal !== true)
      .map((row) => Number(row.netPaid ?? row.amount))
      .sort((a, b) => a - b);
    record(
      "Ledger retains $25.00 partial and records only $165.00 remainder",
      paidActiveAmounts.length === 2
        && Math.abs(paidActiveAmounts[0] - 25) < 0.01
        && Math.abs(paidActiveAmounts[1] - 165) < 0.01,
      `active payments=${paidActiveAmounts.map((amount) => amount.toFixed(2)).join(", ")}`,
    );
    record("Job completes successfully", paidAfter.job.status === "completed" && /Job completed/i.test(paidAfter.text), `status=${paidAfter.job.status}`);
    await page.screenshot({ path: `${SHOTS}/01-mark-all-paid-completed.png` });

    await openCompletionDialog(keepOutstandingFixture, "02-keep-outstanding");
    const clickedOutstanding = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((candidate) => candidate.textContent?.includes("Complete Job & Keep As Outstanding"));
      button?.click();
      return !!button;
    });
    record("Complete Job & Keep As Outstanding is available", clickedOutstanding);
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 15_000 }).catch(() => sleep(3000));
    await waitForJobStatus(keepOutstandingFixture.jobId, "completed");

    const outstandingAfter = await fetchAfterAction(keepOutstandingFixture.jobId);
    const outstandingWorker = outstandingAfter.subs.find(
      (row: { subcontractorId: number }) => row.subcontractorId === keepOutstandingFixture.subId,
    );
    const outstandingRow = outstandingAfter.outstanding.find(
      (row: { subcontractorId: number }) => row.subcontractorId === keepOutstandingFixture.subId,
    );
    const outstandingBalance = Number(outstandingRow?.amountOwed ?? 0) - Number(outstandingRow?.amountPaid ?? 0);
    record(
      "Keep As Outstanding leaves worker partial with $25.00 paid and $165.00 outstanding",
      outstandingWorker?.paymentStatus === "partial"
        && Math.abs(Number(outstandingWorker?.amountPaid) - 25) < 0.01
        && Math.abs(outstandingBalance - 165) < 0.01,
      `status=${outstandingWorker?.paymentStatus}, paid=${outstandingWorker?.amountPaid}, outstanding=${outstandingBalance}`,
    );
    const outstandingLedgerRows = await db.select({
      amount: subPaymentRecordsTable.amount,
      netPaid: subPaymentRecordsTable.netPaid,
      isReversal: subPaymentRecordsTable.isReversal,
    }).from(subPaymentRecordsTable).where(and(
      eq(subPaymentRecordsTable.jobId, keepOutstandingFixture.jobId),
      eq(subPaymentRecordsTable.subcontractorId, keepOutstandingFixture.subId),
    ));
    const outstandingActiveAmounts = outstandingLedgerRows
      .filter((row) => row.isReversal !== true)
      .map((row) => Number(row.netPaid ?? row.amount));
    record(
      "Keep As Outstanding creates no new subcontractor payment record",
      outstandingLedgerRows.length === 1
        && outstandingActiveAmounts.length === 1
        && Math.abs(outstandingActiveAmounts[0] - 25) < 0.01,
      `payment rows=${outstandingLedgerRows.length}, active amounts=${outstandingActiveAmounts.map((amount) => amount.toFixed(2)).join(", ")}`,
    );
    record("Keep As Outstanding completes the job", outstandingAfter.job.status === "completed" && /Job completed/i.test(outstandingAfter.text), `status=${outstandingAfter.job.status}`);
    await page.screenshot({ path: `${SHOTS}/02-keep-outstanding-completed.png` });

     // The completed job moves into the Paid section because its invoice is paid.
     // Revisit the page as a fresh session state and expand that section so the
     // card's outstanding balance is verified after the list has been rebuilt.
     await page.reload({ waitUntil: "networkidle2", timeout: 60_000 });
     await page.waitForFunction(
       () => document.body.innerText.includes("Paid"),
       { timeout: 30_000 },
     ).catch(() => undefined);
     await sleep(700);
     const expandedPaidSection = await page.evaluate(() => {
       const heading = Array.from(document.querySelectorAll<HTMLElement>("h2"))
         .find(node => node.textContent?.trim() === "Paid");
       const button = heading?.closest("button");
       button?.click();
       return !!button;
     });
     record("Paid jobs section can be reopened after reload", expandedPaidSection);
     await page.waitForFunction(
       (title) => document.body.innerText.includes(title),
       { timeout: 30_000 },
       keepOutstandingFixture.jobTitle,
     ).catch(() => undefined);
     await sleep(700);

     const reloadedText = await page.evaluate(() => document.body.innerText);
     record(
       "Reloaded completed card shows $25.00 paid and $165.00 outstanding",
       reloadedText.includes(keepOutstandingFixture.subName)
         && reloadedText.includes("$25.00 paid")
         && reloadedText.includes("$165.00 outstanding"),
       reloadedText.match(/\$25\.00 paid[^\n]*/)?.[0] ?? "paid/outstanding balance text not found",
     );
     const outstandingAfterReload = await fetchAfterAction(keepOutstandingFixture.jobId);
     const reloadedWorker = outstandingAfterReload.subs.find(
       (row: { subcontractorId: number }) => row.subcontractorId === keepOutstandingFixture.subId,
     );
     const reloadedOutstandingRow = outstandingAfterReload.outstanding.find(
       (row: { subcontractorId: number }) => row.subcontractorId === keepOutstandingFixture.subId,
     );
      const reloadedOutstandingBalance = Number(reloadedOutstandingRow?.amountOwed ?? 0)
       - Number(reloadedOutstandingRow?.amountPaid ?? 0);
     record(
       "Reload preserves $25.00 paid and $165.00 outstanding in the API",
       reloadedWorker?.paymentStatus === "partial"
         && Math.abs(Number(reloadedWorker?.amountPaid) - 25) < 0.01
         && Math.abs(reloadedOutstandingBalance - 165) < 0.01,
        `reload balance pair: paid=$${Number(reloadedWorker?.amountPaid ?? 0).toFixed(2)}, outstanding=$${reloadedOutstandingBalance.toFixed(2)}`,
     );
     const outstandingLedgerRowsAfterReload = await db.select({
       amount: subPaymentRecordsTable.amount,
       netPaid: subPaymentRecordsTable.netPaid,
       isReversal: subPaymentRecordsTable.isReversal,
     }).from(subPaymentRecordsTable).where(and(
       eq(subPaymentRecordsTable.jobId, keepOutstandingFixture.jobId),
       eq(subPaymentRecordsTable.subcontractorId, keepOutstandingFixture.subId),
     ));
     const outstandingActiveAmountsAfterReload = outstandingLedgerRowsAfterReload
       .filter((row) => row.isReversal !== true)
       .map((row) => Number(row.netPaid ?? row.amount))
       .sort((a, b) => a - b);
     record(
       "Reload preserves the subcontractor ledger-count invariant",
       outstandingLedgerRowsAfterReload.length === outstandingLedgerRows.length
         && outstandingActiveAmountsAfterReload.length === outstandingActiveAmounts.length
         && outstandingActiveAmountsAfterReload.every((amount, index) =>
           Math.abs(amount - outstandingActiveAmounts[index]) < 0.01),
       `ledger rows: before=${outstandingLedgerRows.length}, after=${outstandingLedgerRowsAfterReload.length}; active rows: before=${outstandingActiveAmounts.length}, after=${outstandingActiveAmountsAfterReload.length}`,
     );
      console.log(
        `Reload balance pair: paid=$${Number(reloadedWorker?.amountPaid ?? 0).toFixed(2)}, ` +
          `outstanding=$${reloadedOutstandingBalance.toFixed(2)}`,
      );
      console.log(
        `Ledger-count invariant: rows ${outstandingLedgerRows.length} → ${outstandingLedgerRowsAfterReload.length}; ` +
          `active ${outstandingActiveAmounts.length} → ${outstandingActiveAmountsAfterReload.length}`,
      );
     await page.screenshot({ path: `${SHOTS}/02-keep-outstanding-reloaded.png` });
    }
  } finally {
    const cleanupFailures: string[] = [];
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        cleanupFailures.push(`browser: ${error instanceof Error ? error.message : String(error)}`);
     }
    }
    for (const target of cleanupTargets) {
      cleanupFailures.push(...await cleanupTarget(target));
    }
    try {
      // Delete by the unique test SID even if session insertion did not
      // return successfully; this makes retries safe after partial failure.
      await db.delete(sessionsTable).where(eq(sessionsTable.sid, SID));
    } catch (error) {
      cleanupFailures.push(`sessions: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
     const remaining = await Promise.all(cleanupTargets.map(async (target) => {
       const [[job], [sub], [invoice], payments, assignments] = await Promise.all([
         target.jobId == null
           ? Promise.resolve([] as { id: number }[])
           : db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.id, target.jobId)),
         target.subId == null
           ? Promise.resolve([] as { id: number }[])
           : db.select({ id: subcontractorsTable.id }).from(subcontractorsTable).where(eq(subcontractorsTable.id, target.subId)),
         target.invoiceId == null
           ? Promise.resolve([] as { id: number }[])
           : db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.id, target.invoiceId)),
         target.jobId == null
           ? Promise.resolve([] as { id: number }[])
           : db.select({ id: subPaymentRecordsTable.id }).from(subPaymentRecordsTable).where(eq(subPaymentRecordsTable.jobId, target.jobId)),
         target.jobId == null
           ? Promise.resolve([] as { subcontractorId: number }[])
           : db.select({ subcontractorId: jobSubcontractorsTable.subcontractorId }).from(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, target.jobId)),
       ]);
       return job || sub || invoice || payments.length > 0 || assignments.length > 0;
     }));
     const sessionRows = await db.select({ sid: sessionsTable.sid }).from(sessionsTable).where(eq(sessionsTable.sid, SID));
     const cleanupPassed = cleanupFailures.length === 0 && remaining.every((leftover) => !leftover) && sessionRows.length === 0;
     record(
       "All temporary jobs, subcontractors, payments, assignments, and session records are removed",
       cleanupPassed,
       cleanupFailures.length
         ? cleanupFailures.join("; ")
         : `fixtures=${cleanupTargets.length}, sessionRows=${sessionRows.length}`,
     );
     if (sessionCreated && !cleanupPassed) {
       console.error("Close-job verification cleanup did not reach a clean state.");
     }
    } catch (error) {
      record(
        "All temporary jobs, subcontractors, payments, assignments, and session records are removed",
        false,
        `cleanup verification query failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const failed = results.filter((result) => !result.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});