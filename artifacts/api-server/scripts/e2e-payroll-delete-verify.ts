/* E2E verification: sub-payment deletion reflects correctly on the payroll screen.
 *
 * Tests that after deleting a payment for an hourly subcontractor via the
 * WorkerPayCard UI, the status badge updates correctly without a page reload.
 *
 * Run: SID=<session-id> pnpm --filter @workspace/api-server exec tsx scripts/e2e-payroll-delete-verify.ts
 *
 * The script creates its own test job via SQL/DB + API, runs the browser flow,
 * then cleans up the job afterward.
 */
import { launchBrowser } from "../src/lib/launchBrowser";
import { db } from "@workspace/db";
import {
  jobsTable,
  jobSubcontractorsTable,
  jobSubHoursTable,
  subcontractorsTable,
  subPaymentRecordsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import fs from "node:fs";
import type { Page } from "puppeteer";

const BASE  = "http://localhost:80";
const API   = `${BASE}/api`;
const SHOTS = "/tmp/e2e-payroll-shots";
const SID   = process.env.SID;

if (!SID) {
  console.error("FATAL: SID env var required");
  process.exit(1);
}

const results: { name: string; pass: boolean; detail: string }[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── API helpers (cookie-authenticated) ──────────────────────────────────────

async function apiFetch(method: string, path: string, body?: unknown): Promise<any> {
  const opts: RequestInit = {
    method,
    headers: {
      Cookie: `sid=${SID}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const r = await fetch(`${API}${path}`, opts);
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 300)}`);
  }
  if (r.status === 204) return null;
  return r.json();
}

const apiPost   = (p: string, b: unknown) => apiFetch("POST",   p, b);
const apiDelete = (p: string)             => apiFetch("DELETE", p);

// ── Test-data setup via DB + API ─────────────────────────────────────────────

let createdJobId: number | null = null;

async function setupTestData() {
  // Find first available subcontractor
  const [sub] = await db.select().from(subcontractorsTable).limit(1);
  if (!sub) throw new Error("No subcontractors in DB — add one first");

  const subId    = sub.id;
  const hourRate = Number(sub.hourlyRate ?? 25);
  const today    = new Date().toISOString().split("T")[0];
  console.log(`Using sub: ${sub.name} (id=${subId}, $${hourRate}/hr)`);

  // Create test job directly in DB
  const [job] = await db
    .insert(jobsTable)
    .values({ title: `E2E PayrollDelete ${Date.now()}`, status: "scheduled", businessLine: "Contractor" })
    .returning();
  createdJobId = job.id;
  console.log(`Created job id=${job.id}`);

  // Link sub as hourly
  await db.insert(jobSubcontractorsTable).values({
    jobId: job.id,
    subcontractorId: subId,
    compensationType: "hourly",
    hourlyRate: String(hourRate),
  });
  console.log(`Linked sub (hourly @ $${hourRate}/hr)`);

  // Log 4 work hours (with rateSnapshot for the computed-owed query)
  await db.insert(jobSubHoursTable).values({
    jobId: job.id,
    subcontractorId: subId,
    date: today,
    hours: "4",
    hourType: "work",
    rateSnapshot: String(hourRate),
  } as any);
  console.log("Logged 4 work hours");

  // Record a full payment via the pay-worker API (this exercises the real route)
  const grossOwed = 4 * hourRate;
  const payRes = await apiPost(`/jobs/${job.id}/pay-worker/${subId}`, {
    subName: sub.name,
    idempotencyKey: `e2e-del-${Date.now()}`,
    agreedOwed: grossOwed,
    workHours: 4,
    workRate: hourRate,
  });
  console.log(`Recorded $${grossOwed} payment → paymentStatus=${payRes.paymentStatus ?? "(see DB)"}`);

  // Confirm the payment landed
  const [jobSubRow] = await db
    .select({ paymentStatus: jobSubcontractorsTable.paymentStatus, amountPaid: jobSubcontractorsTable.amountPaid })
    .from(jobSubcontractorsTable)
    .where(and(eq(jobSubcontractorsTable.jobId, job.id), eq(jobSubcontractorsTable.subcontractorId, subId)));
  console.log(`DB paymentStatus=${jobSubRow?.paymentStatus}, amountPaid=${jobSubRow?.amountPaid}`);

  // Get the payment record ID (for reference / verification)
  const [payRecord] = await db
    .select({ id: subPaymentRecordsTable.id })
    .from(subPaymentRecordsTable)
    .where(and(
      eq(subPaymentRecordsTable.jobId, job.id),
      eq(subPaymentRecordsTable.subcontractorId, subId),
    ));
  if (!payRecord) throw new Error("Payment record not found after pay-worker call");
  console.log(`Payment record id=${payRecord.id}`);

  return { jobId: job.id, subId, paymentId: payRecord.id, paymentStatus: jobSubRow?.paymentStatus };
}

async function cleanupJob(jobId: number) {
  try {
    // Cascade-clean related records
    await db.delete(subPaymentRecordsTable).where(eq(subPaymentRecordsTable.jobId, jobId));
    await db.delete(jobSubHoursTable).where(eq(jobSubHoursTable.jobId, jobId));
    await db.delete(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, jobId));
    await db.delete(jobsTable).where(eq(jobsTable.id, jobId));
    console.log(`Cleaned up job ${jobId}`);
  } catch (e) {
    console.warn(`Cleanup warning: ${e}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });

  // 1. Seed test data
  console.log("\n=== Setting up test data ===");
  const { jobId, paymentStatus } = await setupTestData();
  console.log(`Test job ${jobId} ready, paymentStatus=${paymentStatus}`);

  // 2. Browser flow
  console.log("\n=== Running browser test ===");
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.setCookie({ name: "sid", value: SID!, domain: "localhost", path: "/" });

    // Auto-accept the delete confirmation dialog
    await page.evaluateOnNewDocument(() => { window.confirm = () => true; });

    // ── Step 1: Load payroll page ────────────────────────────────────────────
    const url = `${BASE}/jobs/${jobId}/payroll`;
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(1500);
    await page.screenshot({ path: `${SHOTS}/01-payroll-loaded.png` });

    const bodyText = await page.evaluate(() => document.body.innerText);
    const authenticated = !/log in|sign in/i.test(bodyText.slice(0, 400));
    const hasPayrollContent = /payroll|hours|earnings/i.test(bodyText);
    record("Payroll page loaded (authenticated)",
      authenticated && hasPayrollContent,
      bodyText.slice(0, 100).replace(/\n/g, " | "));

    // ── Step 2: Verify initial "Paid" badge ─────────────────────────────────
    const initialBadge = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll<HTMLElement>("span"));
      if (spans.some(s => /✓\s*Paid/.test(s.textContent ?? ""))) return "paid";
      if (spans.some(s => /^Partial$/.test((s.textContent ?? "").trim()))) return "partial";
      return "unpaid";
    });
    record(
      "Initial status badge shows 'paid' after recording full hourly payment",
      initialBadge === "paid",
      `badge=${initialBadge}`,
    );
    await page.screenshot({ path: `${SHOTS}/02-initial-badge.png` });

    // ── Step 3: Find the delete-payment button (title="Delete payment") ──────
    // The button is in the payment history accordion which auto-opens when
    // paymentHistory.length > 0 (useEffect in WorkerPayCard, line 186).
    const deleteBtnHandle = await page.waitForSelector(
      'button[title="Delete payment"]',
      { timeout: 10000 },
    ).catch(() => null);

    record("Delete payment button visible in payment history", !!deleteBtnHandle);
    await page.screenshot({ path: `${SHOTS}/03-history-with-delete.png` });

    // ── Step 4: Click delete → wait for onRefresh() network round-trip ───────
    // Track navigation events to assert no full-page reload occurs
    let navigationCount = 0;
    const onNav = () => { navigationCount++; };
    page.on("framenavigated", onNav);

    if (deleteBtnHandle) {
      await deleteBtnHandle.click();
      console.log("Clicked delete button — waiting for API + re-render...");
      // onRefresh() hits GET /api/jobs/:id/sub-payments; wait for network idle
      await page.waitForNetworkIdle({ timeout: 15000, idleTime: 800 }).catch(() => sleep(4000));
      await sleep(400); // final React render tick
    }
    page.off("framenavigated", onNav);

    record(
      "No page navigation occurred during delete (pure React state update)",
      navigationCount === 0,
      `navigations=${navigationCount}`,
    );
    await page.screenshot({ path: `${SHOTS}/04-after-delete.png` });

    // ── Step 5: Verify badge updates to "unpaid" ─────────────────────────────
    const updatedBadge = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll<HTMLElement>("span"));
      if (spans.some(s => /✓\s*Paid/.test(s.textContent ?? ""))) return "paid";
      if (spans.some(s => /^Partial$/.test((s.textContent ?? "").trim()))) return "partial";
      return "unpaid";
    });
    record(
      "Badge updates to 'unpaid' after deleting the only payment — no page reload",
      updatedBadge === "unpaid",
      `badge=${updatedBadge}`,
    );
    record(
      "'✓ Paid' badge removed from DOM",
      updatedBadge !== "paid",
      `stillPaid=${updatedBadge === "paid"}`,
    );

    // ── Step 6: Verify payment form re-appears (worker is unpaid again) ───────
    const formReAppeared = await page.evaluate(() => {
      const body = document.body.innerText;
      return /Work Hours|Earnings|Review\s*&\s*Record/i.test(body);
    });
    record("Payment form re-appears (sub returned to payable state)", formReAppeared);
    await page.screenshot({ path: `${SHOTS}/05-final-state.png` });

    // ── Step 7: Verify DB state matches UI (server-side confirmation) ─────────
    // Confirm the DB was actually updated by the DELETE route
    const [dbRow] = await db
      .select({ paymentStatus: jobSubcontractorsTable.paymentStatus, amountPaid: jobSubcontractorsTable.amountPaid })
      .from(jobSubcontractorsTable)
      .where(eq(jobSubcontractorsTable.jobId, jobId));
    const dbStatus = dbRow?.paymentStatus ?? "unpaid";
    record(
      "DB paymentStatus matches UI badge after deletion",
      dbStatus === updatedBadge,
      `db=${dbStatus}, ui=${updatedBadge}`,
    );
    record("DB amountPaid is null after full payment deletion", dbRow?.amountPaid == null, `amountPaid=${dbRow?.amountPaid}`);

    console.log(`\nScreenshots saved to ${SHOTS}/`);

  } finally {
    await browser.close();
  }

  // 3. Cleanup
  console.log("\n=== Cleaning up ===");
  await cleanupJob(jobId);

  // 4. Summary
  const failed = results.filter(r => !r.pass);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  if (failed.length) {
    console.log("FAILED:", failed.map(f => `${f.name} (${f.detail})`).join("\n  "));
    process.exit(1);
  }
}

main().catch(async err => {
  console.error("SCRIPT ERROR:", err);
  if (createdJobId) await cleanupJob(createdJobId).catch(() => {});
  process.exit(1);
});
