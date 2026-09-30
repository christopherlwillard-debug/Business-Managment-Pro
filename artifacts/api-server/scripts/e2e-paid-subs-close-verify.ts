/* Authenticated development-only check: paid invoice + settled subs can be closed.
 * Run: pnpm --filter @workspace/api-server run verify:paid-subs-close
 * Browser API writes are denied except for the one exact close request on the settled fixture.
 * Fixtures and the test session are created and removed directly.
 */
import { launchBrowser } from "../src/lib/launchBrowser";
import { db } from "@workspace/db";
import {
  businessesTable, invoicesTable, jobsTable, jobSubcontractorsTable,
  sessionsTable, settingsTable, subPaymentRecordsTable, subcontractorsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:80";
const url = new URL(BASE);
if (
  process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT ||
  url.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(url.hostname.replace(/^\[|\]$/g, ""))
) {
  throw new Error("This verifier only runs against a local development preview");
}

const sid = `e2e-paid-subs-close-${crypto.randomUUID()}`;
type Fixture = { jobId: number; subId: number; invoiceId?: number; title: string; subName: string };
const targets: Partial<Fixture>[] = [];
const checks: { label: string; passed: boolean }[] = [];
function check(label: string, passed: boolean, detail?: string) {
  checks.push({ label, passed });
  console.log(`${passed ? "PASS" : "FAIL"}: ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) throw new Error(label);
}

async function createFixture(business: { id: number; slug: string }, settled: boolean): Promise<Fixture> {
  const target: Partial<Fixture> = {};
  targets.push(target);
  const suffix = crypto.randomUUID().slice(0, 8);
  const title = `E2E ${settled ? "Settled" : "Outstanding"} Close ${suffix}`;
  const [sub] = await db.insert(subcontractorsTable).values({
    name: `E2E Worker ${suffix}`, trade: "Automated verification", role: "member",
    notes: "Temporary development-only close-job fixture",
  }).returning();
  target.subId = sub.id;
  target.subName = sub.name ?? "";
  const [job] = await db.insert(jobsTable).values({
    title, status: "completed", businessId: business.id, businessLine: business.slug,
  }).returning();
  target.jobId = job.id;
  target.title = title;
  const [invoice] = await db.insert(invoicesTable).values({
    invoiceNumber: `E2E-PAID-CLOSE-${job.id}`,
    jobId: job.id,
    status: "paid",
    issueDate: new Date().toISOString().slice(0, 10),
    subtotal: "1000.00", total: "1000.00", amountPaid: "1000.00",
    businessId: business.id, businessLine: business.slug,
    lineItems: [{ id: 1, description: "Verification work", quantity: 1, unitPrice: 1000, total: 1000 }],
  }).returning();
  target.invoiceId = invoice.id;
  const paid = settled ? "190.00" : "25.00";
  await db.insert(jobSubcontractorsTable).values({
    jobId: job.id, subcontractorId: sub.id,
    compensationType: "allocation", allocationPct: "20.00",
    amountOwed: "190.00", amountPaid: paid,
    paymentStatus: "partial", // Deliberately stale for the fully paid fixture.
  });
  await db.insert(subPaymentRecordsTable).values({
    jobId: job.id, subcontractorId: sub.id, businessLine: business.slug,
    amount: paid, netPaid: paid,
    paymentDate: new Date().toISOString().slice(0, 10),
    description: "E2E close eligibility payment",
    createdFrom: "e2e-paid-subs-close-verify",
    idempotencyKey: `e2e-paid-subs-close-${job.id}`,
    agreedOwedSnapshot: "190.00",
  });
  return target as Fixture;
}

async function cleanup() {
  const failures: string[] = [];
  const attempt = async (label: string, action: () => Promise<unknown>) => {
    try { await action(); } catch (error) { failures.push(`${label}: ${String(error)}`); }
  };
  for (const target of targets) {
    if (target.jobId != null) {
      const id = target.jobId;
      await attempt("payment", () => db.delete(subPaymentRecordsTable).where(eq(subPaymentRecordsTable.jobId, id)));
      await attempt("assignment", () => db.delete(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, id)));
    }
    if (target.invoiceId != null) {
      const id = target.invoiceId;
      await attempt("invoice", () => db.delete(invoicesTable).where(eq(invoicesTable.id, id)));
    }
    if (target.jobId != null) {
      const id = target.jobId;
      await attempt("job", () => db.delete(jobsTable).where(eq(jobsTable.id, id)));
    }
    if (target.subId != null) {
      const id = target.subId;
      await attempt("subcontractor", () => db.delete(subcontractorsTable).where(eq(subcontractorsTable.id, id)));
    }
  }
  await attempt("session", () => db.delete(sessionsTable).where(eq(sessionsTable.sid, sid)));
  for (const target of targets) {
    if (target.jobId != null) {
      const id = target.jobId;
      const [jobs, invoices, assignments, payments] = await Promise.all([
        db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.id, id)),
        db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.jobId, id)),
        db.select({ id: jobSubcontractorsTable.jobId }).from(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, id)),
        db.select({ id: subPaymentRecordsTable.id }).from(subPaymentRecordsTable).where(eq(subPaymentRecordsTable.jobId, id)),
      ]);
      if (jobs.length || invoices.length || assignments.length || payments.length) failures.push(`job ${id} has leftovers`);
    }
    if (target.subId != null) {
      const subs = await db.select({ id: subcontractorsTable.id }).from(subcontractorsTable).where(eq(subcontractorsTable.id, target.subId));
      if (subs.length) failures.push(`sub ${target.subId} has leftovers`);
    }
  }
  if ((await db.select({ sid: sessionsTable.sid }).from(sessionsTable).where(eq(sessionsTable.sid, sid))).length) {
    failures.push("session has leftovers");
  }
  return failures;
}

async function main() {
  const [[settings], [business]] = await Promise.all([
    db.select({ ownerUserId: settingsTable.ownerUserId }).from(settingsTable).limit(1),
    db.select({ id: businessesTable.id, slug: businessesTable.slug })
      .from(businessesTable).where(eq(businessesTable.slug, "general_contracting")).limit(1),
  ]);
  if (!settings?.ownerUserId || !business) throw new Error("Development owner and general_contracting business required");
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  let page: Awaited<ReturnType<Awaited<ReturnType<typeof launchBrowser>>["newPage"]>> | undefined;
  let failure: unknown;
  try {
    await db.insert(sessionsTable).values({
      sid,
      sess: {
        user: { id: settings.ownerUserId, email: "e2e-close@example.invalid", firstName: "E2E", lastName: "Verifier", profileImageUrl: null },
        access_token: "dummy",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
      expire: new Date(Date.now() + 3600_000),
    });
    const settled = await createFixture(business, true);
    const outstanding = await createFixture(business, false);
    let closeRequestAllowed = false;
    let closeRequestInfo: string | null = null;
    const blockedWrites: string[] = [];
    browser = await launchBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setCookie({ name: "sid", value: sid, url: BASE, path: "/" });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const requestPath = new URL(request.url()).pathname;
      const isMutatingApi = requestPath.startsWith("/api/") && !["GET", "HEAD"].includes(request.method());
      if (!isMutatingApi) {
        void request.continue();
        return;
      }

      let body: unknown = null;
      try { body = JSON.parse(request.postData() ?? ""); } catch {}
      const isExactCloseBody = body != null
        && typeof body === "object"
        && !Array.isArray(body)
        && Object.keys(body).length === 1
        && (body as Record<string, unknown>).status === "closed";
      const isAllowedClose = !closeRequestAllowed
        && request.method() === "PUT"
        && requestPath === `/api/jobs/${settled.jobId}`
        && isExactCloseBody;
      if (isAllowedClose) {
        closeRequestAllowed = true;
        closeRequestInfo = `${request.method()} ${requestPath} ${request.postData() ?? ""}`;
        void request.continue();
        return;
      }

      blockedWrites.push(`${request.method()} ${requestPath} body=${request.postData() ?? ""}`);
      void request.abort("blockedbyclient");
    });
    await page.goto(`${BASE}/jobs`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("h2", { timeout: 30_000 });
    check("Authenticated Jobs page", !(await page.evaluate(() => document.body.innerText)).includes("Sign in to access"));

    await page.waitForFunction(() => Array.from(document.querySelectorAll("h2")).some(h => h.textContent?.trim() === "Paid"), { timeout: 30_000 });
    await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll("h2")).find(h => h.textContent?.trim() === "Paid");
      heading?.closest("button")?.click();
    });

    for (const fixture of [settled, outstanding]) {
      await page.waitForSelector(`[data-testid="compact-job-row-${fixture.jobId}"]`, { timeout: 30_000 });
      await page.click(`[data-testid="job-card-open-${fixture.jobId}"]`);
      const workspace = `[data-testid="job-workspace-${fixture.jobId}"]`;
      await page.waitForSelector(workspace, { timeout: 30_000 });
      await page.click(`${workspace} [role="tab"]:first-child`);
      await page.waitForSelector(`[data-testid="job-workspace-job-${fixture.jobId}"]`, { timeout: 30_000 });
      const closeButton = `${workspace} button`;
      await page.waitForFunction((id, expected) => {
        const root = document.querySelector(`[data-testid="job-workspace-${id}"]`);
        if (!root) return false;
        const hasClose = Array.from(root.querySelectorAll("button")).some(b => b.textContent?.trim() === "Close Job");
        return hasClose === expected && root.textContent?.includes("Invoice");
      }, { timeout: 30_000 }, fixture.jobId, fixture.jobId === settled.jobId);
      const hasClose = await page.$$eval(closeButton, buttons => buttons.some(b => b.textContent?.trim() === "Close Job"));
      check(`${fixture.title}: Close Job ${fixture.jobId === settled.jobId ? "visible" : "blocked"}`, hasClose === (fixture.jobId === settled.jobId));

      if (fixture.jobId === settled.jobId) {
        await page.evaluate((id) => {
          const root = document.querySelector(`[data-testid="job-workspace-${id}"]`);
          Array.from(root?.querySelectorAll("button") ?? []).find(b => b.textContent?.trim() === "Open financial details")?.click();
        }, fixture.jobId);
        await page.waitForSelector('[data-testid="job-financials-panel"]', { timeout: 30_000 });
        await page.waitForFunction((name) => {
          const root = document.querySelector('[data-testid="job-financials-panel"]');
          return !!root && root.textContent?.includes(name) && root.textContent?.includes("✓ Settled");
        }, { timeout: 30_000 }, fixture.subName);
        check("Job Financials shows settled subcontractor", true);
        await page.evaluate(() => document.querySelector('[data-testid="job-financials-panel"] button')?.click());
        await page.waitForFunction(() => !document.querySelector('[data-testid="job-financials-panel"]'), { timeout: 10_000 });

        const readiness = await page.evaluate(async (id) => {
          const response = await fetch(`/api/jobs/${id}/outstanding-sub-payments`, { credentials: "include" });
          return { status: response.status, body: await response.text() };
        }, fixture.jobId);
        let readinessRows: unknown = null;
        try { readinessRows = JSON.parse(readiness.body); } catch {}
        check(
          "Settled job close preflight is clear",
          readiness.status === 200 && Array.isArray(readinessRows) && readinessRows.length === 0,
          `HTTP ${readiness.status}; response=${readiness.body}`,
        );

        const invoiceBefore = await db.select().from(invoicesTable).where(eq(invoicesTable.jobId, fixture.jobId));
        const paymentsBefore = await db.select().from(subPaymentRecordsTable).where(eq(subPaymentRecordsTable.jobId, fixture.jobId));
        const closeResponsePromise = page.waitForResponse(response =>
          response.request().method() === "PUT"
          && new URL(response.url()).pathname === `/api/jobs/${fixture.jobId}`,
        { timeout: 30_000 });
        await page.evaluate((id) => {
          const root = document.querySelector(`[data-testid="job-workspace-${id}"]`);
          const button = Array.from(root?.querySelectorAll("button") ?? []).find(b => b.textContent?.trim() === "Close Job");
          if (!button) throw new Error("Close Job button disappeared before the click");
          button.click();
        }, fixture.jobId);
        const closeResponse = await closeResponsePromise;
        const closeResponseBody = await closeResponse.text();
        check(
          "Settled job close request succeeds",
          closeResponse.status() === 200,
          `HTTP ${closeResponse.status()}; response=${closeResponseBody.slice(0, 500)}`,
        );

        const [closedJob] = await db.select({
          status: jobsTable.status,
          closedAt: jobsTable.closedAt,
          businessId: jobsTable.businessId,
          businessLine: jobsTable.businessLine,
        }).from(jobsTable).where(eq(jobsTable.id, fixture.jobId)).limit(1);
        check(
          "Close request persists Closed status and preserves business ownership",
          closedJob?.status === "closed" && closedJob.closedAt != null
            && closedJob.businessId === business.id && closedJob.businessLine === business.slug,
          `status=${closedJob?.status}; closedAt=${closedJob?.closedAt}; businessId=${closedJob?.businessId}; businessLine=${closedJob?.businessLine}`,
        );

        const [invoiceAfter, paymentsAfter] = await Promise.all([
          db.select().from(invoicesTable).where(eq(invoicesTable.jobId, fixture.jobId)),
          db.select().from(subPaymentRecordsTable).where(eq(subPaymentRecordsTable.jobId, fixture.jobId)),
        ]);
        check(
          "Close leaves invoice rows unchanged",
          JSON.stringify(invoiceAfter) === JSON.stringify(invoiceBefore),
          `invoice rows before=${invoiceBefore.length}, after=${invoiceAfter.length}`,
        );
        check(
          "Close leaves subcontractor payment ledger rows unchanged",
          JSON.stringify(paymentsAfter) === JSON.stringify(paymentsBefore),
          `payment rows before=${paymentsBefore.length}, after=${paymentsAfter.length}`,
        );

        await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForFunction(() => Array.from(document.querySelectorAll("h2")).some(h => h.textContent?.trim() === "Closed Jobs"), { timeout: 30_000 });
        await page.evaluate(() => {
          Array.from(document.querySelectorAll("h2")).find(h => h.textContent?.trim() === "Closed Jobs")?.closest("button")?.click();
        });
        const archiveRow = `[data-testid="compact-job-row-${fixture.jobId}"]`;
        await page.waitForSelector(archiveRow, { timeout: 30_000 });
        const archivedTitleVisible = await page.$eval(
          archiveRow,
          (row, title) => row.textContent?.includes(title) ?? false,
          fixture.title,
        );
        check("Settled job appears in Closed Jobs after reload", archivedTitleVisible);

        await page.evaluate(() => {
          Array.from(document.querySelectorAll("h2")).find(h => h.textContent?.trim() === "Paid")?.closest("button")?.click();
        });
      } else {
        await page.click(`${workspace} header button[aria-label="Close job workspace"]`);
      }
    }
    check(
      "Browser writes were limited to one exact settled-job close",
      closeRequestAllowed && blockedWrites.length === 0,
      `allowed=${closeRequestInfo ?? "none"}; blocked=${blockedWrites.join("; ") || "none"}`,
    );
    const statuses = await page.evaluate(async (ids) => {
      const response = await fetch(`/api/jobs/outstanding-sub-balances?jobIds=${ids.join(",")}`);
      if (!response.ok) throw new Error(`Batch close gate returned ${response.status}`);
      return response.json() as Promise<Record<string, boolean>>;
    }, [settled.jobId, outstanding.jobId]);
    check("Batch close gate agrees with both cards", statuses[settled.jobId] === false && statuses[outstanding.jobId] === true);
  } catch (error) {
    failure = error;
    if (page) {
      const state = await page.evaluate(() => ({
        headings: Array.from(document.querySelectorAll("h2")).map(h => h.textContent?.trim()),
        fixtureRows: Array.from(document.querySelectorAll("[data-testid^='compact-job-row-']")).filter(el => el.textContent?.includes("E2E")).length,
        authPrompt: document.body.innerText.includes("Sign in to access"),
        workspace: Array.from(document.querySelectorAll("[data-testid^='job-workspace-']")).map(root => ({
          id: root.getAttribute("data-testid"),
          buttons: Array.from(root.querySelectorAll("button")).map(b => b.textContent?.trim()).filter(Boolean).slice(-35),
          text: root.textContent?.slice(-1500),
        })),
      })).catch(() => null);
      console.error("Verifier page state:", state);
    }
    console.error("Verifier write state:", {
      closeRequestAllowed,
      closeRequestInfo,
      blockedWrites,
    });
  } finally {
    try { await browser?.close(); } catch (error) { failure ??= error; }
    const leftovers = await cleanup();
    if (leftovers.length) failure = new Error(`Fixture cleanup failed: ${leftovers.join("; ")}${failure ? `; initial error: ${String(failure)}` : ""}`);
    else console.log("PASS: All temporary fixture and session records removed");
  }
  if (failure) throw failure;
  console.log(`${checks.length} paid-sub close checks passed`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });