/* Authenticated browser verification for the close-job payout waterfall.
 *
 * Run:
 *   pnpm --filter @workspace/api-server exec tsx scripts/e2e-close-job-verify.ts
 *
 * This creates a temporary development job with a paid invoice, one allocation
 * worker, and a partial payment, drives the real Jobs page, then removes all
 * temporary records.
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

const BASE = "http://localhost:80";
const SHOTS = "/tmp/e2e-close-job-shots";
const SID = `e2e-close-${crypto.randomUUID()}`;

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run close-job E2E verification against a production deployment");
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

async function createFixture(business: VerificationBusiness, label: string): Promise<CloseJobFixture> {
  let subId: number | undefined;
  let jobId: number | undefined;
  let invoiceId: number | undefined;

  try {
    const [sub] = await db.insert(subcontractorsTable).values({
      name: `E2E ${label} Worker ${Date.now()}`,
      trade: "Automated verification",
      role: "member",
      notes: "Temporary development-only close-job regression fixture",
    }).returning();
    subId = sub.id;

    const [job] = await db.insert(jobsTable).values({
      title: `E2E ${label} Job ${Date.now()}`,
      status: "scheduled",
      businessLine: business.slug,
      businessId: business.id,
    }).returning();
    jobId = job.id;

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
    invoiceId = invoice.id;

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
    try {
      if (jobId != null) {
        await db.delete(subPaymentRecordsTable).where(eq(subPaymentRecordsTable.jobId, jobId));
        await db.delete(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, jobId));
      }
      if (invoiceId != null) await db.delete(invoicesTable).where(eq(invoicesTable.id, invoiceId));
      if (jobId != null) await db.delete(jobsTable).where(eq(jobsTable.id, jobId));
      if (subId != null) await db.delete(subcontractorsTable).where(eq(subcontractorsTable.id, subId));
    } catch {
      // Preserve the original fixture-creation error; the outer cleanup will retry known fixtures.
    }
    throw error;
  }
}

async function cleanupFixture(fixture: CloseJobFixture) {
  await db.delete(subPaymentRecordsTable).where(eq(subPaymentRecordsTable.jobId, fixture.jobId));
  await db.delete(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, fixture.jobId));
  await db.delete(invoicesTable).where(eq(invoicesTable.id, fixture.invoiceId));
  await db.delete(jobsTable).where(eq(jobsTable.id, fixture.jobId));
  await db.delete(subcontractorsTable).where(eq(subcontractorsTable.id, fixture.subId));
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
    await page.setCookie({ name: "sid", value: SID, domain: "localhost", path: "/" });
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

    await openCompletionDialog(markAllPaidFixture, "01-mark-all-paid");
    const clickedPay = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((candidate) => candidate.textContent?.includes("Mark All Paid Now"));
      button?.click();
      return !!button;
    });
    record("Mark All Paid Now is available", clickedPay);
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 15_000 }).catch(() => sleep(3000));
    await sleep(700);

    const paidAfter = await fetchAfterAction(markAllPaidFixture.jobId);
    const splitPool = Math.max(
      0,
      (Number(paidAfter.profit.grossInvoiced ?? 0) - Number(paidAfter.profit.jobExpenses ?? 0))
      - Number(paidAfter.profit.subLaborCost ?? 0),
    ) * 0.95;
    const expectedGrossAllocation = splitPool * 0.2;
    const paidWorker = paidAfter.subs.find((row: { subcontractorId: number }) => row.subcontractorId === markAllPaidFixture.subId);
    record("Job Financials split allocation is $190.00", Math.abs(expectedGrossAllocation - 190) < 0.01, `toSplit=${paidAfter.profit.toSplit}, allocation=${expectedGrossAllocation}`);
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
    await sleep(700);

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
  } finally {
    if (browser) await browser.close();
    for (const fixture of fixtures) await cleanupFixture(fixture);
    if (sessionCreated) await db.delete(sessionsTable).where(eq(sessionsTable.sid, SID));

    const remaining = await Promise.all(fixtures.map(async (fixture) => {
      const [[job], [sub], [invoice], payments, assignments] = await Promise.all([
        db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.id, fixture.jobId)),
        db.select({ id: subcontractorsTable.id }).from(subcontractorsTable).where(eq(subcontractorsTable.id, fixture.subId)),
        db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.id, fixture.invoiceId)),
        db.select({ id: subPaymentRecordsTable.id }).from(subPaymentRecordsTable).where(eq(subPaymentRecordsTable.jobId, fixture.jobId)),
        db.select({ subcontractorId: jobSubcontractorsTable.subcontractorId }).from(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, fixture.jobId)),
      ]);
      return job || sub || invoice || payments.length > 0 || assignments.length > 0;
    }));
    const sessionRows = await db.select({ sid: sessionsTable.sid }).from(sessionsTable).where(eq(sessionsTable.sid, SID));
    record("All temporary records are removed", remaining.every((leftover) => !leftover) && sessionRows.length === 0);
  }

  const failed = results.filter((result) => !result.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});