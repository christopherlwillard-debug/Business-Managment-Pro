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

  const [sub] = await db.insert(subcontractorsTable).values({
    name: `E2E Allocation Worker ${Date.now()}`,
    trade: "Automated verification",
    role: "member",
    notes: "Temporary development-only close-job regression fixture",
  }).returning();

  const [job] = await db.insert(jobsTable).values({
    title: `E2E Close Job ${Date.now()}`,
    status: "scheduled",
    businessLine: business.slug,
    businessId: business.id,
  }).returning();

  const invoiceNumber = `E2E-CLOSE-${job.id}`;
  const [invoice] = await db.insert(invoicesTable).values({
    invoiceNumber,
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

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setCookie({ name: "sid", value: SID, domain: "localhost", path: "/" });
    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.waitForFunction(
      (title) => document.body.innerText.includes(title),
      { timeout: 30_000 },
      job.title,
    ).catch(() => undefined);
    await sleep(500);
    const body = await page.evaluate(() => document.body.innerText);
    record("Jobs page loads authenticated", !/log in|sign in/i.test(body.slice(0, 500)) && body.includes("Jobs"));
    await page.screenshot({ path: `${SHOTS}/01-jobs.png` });

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
    }, job.title);
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
    }, job.title);
    record("Real job card opens completion flow", clicked);
    await sleep(800);
    const dialogText = await page.evaluate(() => document.body.innerText);
    record("Protected completion dialog is visible", dialogText.includes("Worker Pay Due") && dialogText.includes(sub.name ?? ""));
    record("Dialog preserves partial-payment deduction", dialogText.includes("20%") && dialogText.includes("$165.00"), dialogText.match(/20%[^\n]*/)?.[0] ?? "allocation line not found");
    await page.screenshot({ path: `${SHOTS}/02-close-dialog.png` });

    const clickedPay = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((candidate) => candidate.textContent?.includes("Mark All Paid Now"));
      button?.click();
      return !!button;
    });
    record("Mark All Paid Now is available", clickedPay);
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 15_000 }).catch(() => sleep(3000));
    await sleep(700);

    const after = await page.evaluate(async (jobId) => {
      const [jobRes, profitRes, subsRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}`),
        fetch(`/api/jobs/${jobId}/profit`),
        fetch(`/api/jobs/${jobId}/sub-payments`),
      ]);
      return {
        job: await jobRes.json(),
        profit: await profitRes.json(),
        subs: await subsRes.json(),
        text: document.body.innerText,
      };
    }, job.id);
    const splitPool = Math.max(
      0,
      (Number(after.profit.grossInvoiced ?? 0) - Number(after.profit.jobExpenses ?? 0))
      - Number(after.profit.subLaborCost ?? 0),
    ) * 0.95;
    const expectedGrossAllocation = splitPool * 0.2;
    const worker = after.subs.find((row: { subcontractorId: number }) => row.subcontractorId === sub.id);
    record("Job Financials split allocation is $190.00", Math.abs(expectedGrossAllocation - 190) < 0.01, `toSplit=${after.profit.toSplit}, allocation=${expectedGrossAllocation}`);
    record("Partial payment plus close payout settles at $190.00", worker?.paymentStatus === "paid" && Math.abs(Number(worker?.amountPaid) - 190) < 0.01, `status=${worker?.paymentStatus}, amountPaid=${worker?.amountPaid}`);
    const ledgerRows = await db.select({
      amount: subPaymentRecordsTable.amount,
      netPaid: subPaymentRecordsTable.netPaid,
      isReversal: subPaymentRecordsTable.isReversal,
    }).from(subPaymentRecordsTable).where(and(
      eq(subPaymentRecordsTable.jobId, job.id),
      eq(subPaymentRecordsTable.subcontractorId, sub.id),
    ));
    const activeAmounts = ledgerRows
      .filter((row) => row.isReversal !== true)
      .map((row) => Number(row.netPaid ?? row.amount))
      .sort((a, b) => a - b);
    record(
      "Ledger retains $25.00 partial and records only $165.00 remainder",
      activeAmounts.length === 2
        && Math.abs(activeAmounts[0] - 25) < 0.01
        && Math.abs(activeAmounts[1] - 165) < 0.01,
      `active payments=${activeAmounts.map((amount) => amount.toFixed(2)).join(", ")}`,
    );
    record("Job completes successfully", after.job.status === "completed" && /Job completed/i.test(after.text), `status=${after.job.status}`);
    await page.screenshot({ path: `${SHOTS}/03-completed.png` });
  } finally {
    await browser.close();
    await db.delete(subPaymentRecordsTable).where(eq(subPaymentRecordsTable.jobId, job.id));
    await db.delete(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, job.id));
    await db.delete(invoicesTable).where(eq(invoicesTable.id, invoice.id));
    await db.delete(jobsTable).where(eq(jobsTable.id, job.id));
    await db.delete(sessionsTable).where(eq(sessionsTable.sid, SID));
    await db.delete(subcontractorsTable).where(eq(subcontractorsTable.id, sub.id));
  }

  const failed = results.filter((result) => !result.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});