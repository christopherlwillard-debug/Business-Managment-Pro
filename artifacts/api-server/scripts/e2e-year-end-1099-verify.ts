/* Authenticated browser verification for the year-end 1099 mobile card.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run verify:year-end-1099
 *
 * The check creates one temporary approved subcontractor with a W-9 and a
 * payment above the 1099 threshold, drives the real year-end report at 390px,
 * blocks every browser write, captures the card, and removes all fixture rows
 * and the development session on every exit path.
 */
import fs from "node:fs";
import { eq } from "drizzle-orm";
import type { Page } from "puppeteer";
import { db } from "@workspace/db";
import {
  businessesTable,
  jobSubcontractorsTable,
  jobsTable,
  sessionsTable,
  settingsTable,
  subPaymentRecordsTable,
  subcontractorsTable,
} from "@workspace/db/schema";
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:80";
const YEAR = new Date().getFullYear();
const PAYMENT_DATE = `${YEAR}-01-01`;
const SHOTS = "/tmp/e2e-year-end-1099";
const FIXTURE_PREFIX = `E2E-1099-${Date.now() % 1_000_000}`;

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Refusing to run year-end 1099 verification against a production deployment");
}

const baseUrl = new URL(BASE);
const baseHostname = baseUrl.hostname.replace(/^\[|\]$/g, "");
if (baseUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(baseHostname)) {
  throw new Error(
    `Refusing to run year-end 1099 verification against non-local target ${baseUrl.origin}. ` +
    "Set E2E_BASE_URL to a local development server.",
  );
}

const results: Array<{ name: string; pass: boolean; detail?: string }> = [];

function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

type VerificationBusiness = { id: number; slug: string };

type Fixture = {
  subcontractorId: number;
  jobId: number;
  paymentId: number;
  name: string;
  legalName: string;
  amount: number;
};

async function createFixture(business: VerificationBusiness): Promise<Fixture> {
  const name = `${FIXTURE_PREFIX} Approved Subcontractor Masonry & Restoration`;
  const legalName = `${FIXTURE_PREFIX} Masonry and Restoration Legal Entity LLC`;
  const amount = 725;
  let subcontractorId: number | undefined;
  let jobId: number | undefined;
  let paymentId: number | undefined;

  try {
    const [subcontractor] = await db.insert(subcontractorsTable).values({
      name,
      trade: "Temporary 1099 browser verification",
      w9OnFile: true,
      w9LegalName: legalName,
      portalApproved: true,
      notes: "Temporary development-only year-end 1099 fixture",
    }).returning({ id: subcontractorsTable.id });
    if (!subcontractor) throw new Error("Unable to create the 1099 subcontractor fixture");
    subcontractorId = subcontractor.id;

    const [job] = await db.insert(jobsTable).values({
      title: `${FIXTURE_PREFIX} Completed job`,
      status: "completed",
      startDate: PAYMENT_DATE,
      endDate: PAYMENT_DATE,
      businessLine: business.slug,
      businessId: business.id,
    }).returning({ id: jobsTable.id });
    if (!job) throw new Error("Unable to create the 1099 job fixture");
    jobId = job.id;

    await db.insert(jobSubcontractorsTable).values({
      jobId,
      subcontractorId,
      compensationType: "fixed",
      fixedAmount: String(amount),
      amountOwed: String(amount),
      amountPaid: String(amount),
      paidDate: PAYMENT_DATE,
      paidAt: new Date(`${PAYMENT_DATE}T12:00:00.000Z`),
      paymentStatus: "paid",
    });

    const [payment] = await db.insert(subPaymentRecordsTable).values({
      jobId,
      subcontractorId,
      businessLine: business.slug,
      amount: String(amount),
      paymentDate: PAYMENT_DATE,
      description: "Temporary year-end 1099 browser verification payment",
      createdFrom: "e2e-year-end-1099-verify",
      idempotencyKey: `${FIXTURE_PREFIX}-payment`,
      agreedOwedSnapshot: String(amount),
      netPaid: String(amount),
    }).returning({ id: subPaymentRecordsTable.id });
    if (!payment) throw new Error("Unable to create the 1099 payment fixture");
    paymentId = payment.id;
  } catch (error) {
    throw Object.assign(
      new Error(error instanceof Error ? error.message : "Unable to create 1099 fixtures"),
      { partialFixture: { subcontractorId, jobId, paymentId, name, legalName, amount } },
    );
  }

  return { subcontractorId, jobId, paymentId, name, legalName, amount };
}

async function deleteFixture(fixture: Partial<Fixture>) {
  if (fixture.paymentId != null) {
    await db.delete(subPaymentRecordsTable).where(eq(subPaymentRecordsTable.id, fixture.paymentId));
  }
  if (fixture.jobId != null) {
    await db.delete(jobSubcontractorsTable).where(eq(jobSubcontractorsTable.jobId, fixture.jobId));
    await db.delete(jobsTable).where(eq(jobsTable.id, fixture.jobId));
  }
  if (fixture.subcontractorId != null) {
    await db.delete(subcontractorsTable).where(eq(subcontractorsTable.id, fixture.subcontractorId));
  }
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
  if (!settings?.ownerUserId) throw new Error("No configured owner is available for authenticated verification");
  if (!business) throw new Error("The general_contracting development business is required for verification");

  let fixture: Partial<Fixture> | undefined;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  let sessionId: string | undefined;
  const unexpectedWrites: string[] = [];
  const pageErrors: string[] = [];

  try {
    try {
      fixture = await createFixture(business);
    } catch (error) {
      fixture = (error as { partialFixture?: Partial<Fixture> }).partialFixture;
      throw error;
    }

    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", request => {
      const method = request.method().toUpperCase();
      if (["GET", "HEAD", "OPTIONS"].includes(method)) {
        void request.continue();
        return;
      }
      unexpectedWrites.push(`${method} ${request.url()}`);
      void request.abort("blockedbyclient");
    });

    await page.evaluateOnNewDocument(businessId => {
      localStorage.setItem("buildpro_selection_mode", String(businessId));
    }, business.id);

    const returnTo = `/accounting?tab=year-end&year=${YEAR}`;
    const proof = createTestLoginProof(returnTo);
    const loginParams = new URLSearchParams({ returnTo, ...proof });
    await page.goto(`${BASE}/api/dev-test-login?${loginParams}`, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });
    sessionId = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sessionId) throw new Error("Development login did not create a session cookie");

    if (!fixture.name || !fixture.legalName) throw new Error("1099 fixture data is incomplete");
    await page.waitForFunction(
      ({ name, legalName, amount }) => document.body.innerText.includes(name)
        && document.body.innerText.includes(legalName)
        && document.body.innerText.includes(`$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`),
      { timeout: 30_000 },
      { name: fixture.name, legalName: fixture.legalName, amount: fixture.amount },
    );

    const cardState = await page.evaluate(({ name, legalName, amount }) => {
      const mobileCard = [...document.querySelectorAll("div")]
        .find(element => element.classList.contains("md:hidden")
          && element.textContent?.includes(name)
          && element.textContent?.includes(legalName));
      const rect = mobileCard?.getBoundingClientRect();
      const text = mobileCard?.textContent ?? "";
      return {
        text,
        visible: !!rect && rect.width > 0 && rect.height > 0,
        cardWidth: rect?.width ?? 0,
        cardScrollWidth: mobileCard?.scrollWidth ?? 0,
        cardClientWidth: mobileCard?.clientWidth ?? 0,
        bodyScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        hasName: text.includes(name),
        hasLegalName: text.includes(`W-9 legal name: ${legalName}`),
        hasTotal: text.includes(`$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`),
        has1099Status: text.includes("1099 Required"),
        hasW9Status: text.includes("W-9 on file"),
      };
    }, { name: fixture.name, legalName: fixture.legalName, amount: fixture.amount });

    record(
      "Authenticated session renders the populated 1099 mobile card",
      cardState.visible && cardState.hasName && cardState.hasLegalName,
      `visible=${cardState.visible}, name=${cardState.hasName}, legalName=${cardState.hasLegalName}`,
    );
    record(
      "1099 card shows payment total and both statuses",
      cardState.hasTotal && cardState.has1099Status && cardState.hasW9Status,
      `total=${cardState.hasTotal}, 1099=${cardState.has1099Status}, w9=${cardState.hasW9Status}`,
    );
    record(
      "1099 card fits the 390px viewport without horizontal overflow",
      cardState.cardWidth <= cardState.viewportWidth
        && cardState.cardScrollWidth <= cardState.cardClientWidth
        && cardState.bodyScrollWidth <= cardState.viewportWidth,
      `card=${cardState.cardWidth}/${cardState.cardClientWidth}, body=${cardState.bodyScrollWidth}/${cardState.viewportWidth}`,
    );
    record(
      "Authenticated browser made no unexpected writes or page errors",
      unexpectedWrites.length === 0 && pageErrors.length === 0,
      [...unexpectedWrites, ...pageErrors].join(", "),
    );

    await page.screenshot({ path: `${SHOTS}/year-end-1099-mobile.png`, fullPage: true });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        record(
          "Browser session closes cleanly",
          false,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    if (fixture) {
      try {
        await deleteFixture(fixture);
      } catch (error) {
        record(
          "Temporary 1099 fixture rows are removed",
          false,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    if (sessionId) {
      await deleteSession(sessionId).catch(error => {
        record(
          "Temporary browser session is removed",
          false,
          error instanceof Error ? error.message : String(error),
        );
      });
    }

    if (fixture?.subcontractorId != null || fixture?.jobId != null || fixture?.paymentId != null) {
      const [remainingSubs, remainingJobs, remainingAssignments, remainingPayments, remainingSessions] = await Promise.all([
        fixture.subcontractorId == null
          ? Promise.resolve([])
          : db.select({ id: subcontractorsTable.id }).from(subcontractorsTable)
            .where(eq(subcontractorsTable.id, fixture.subcontractorId)),
        fixture.jobId == null
          ? Promise.resolve([])
          : db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.id, fixture.jobId)),
        fixture.jobId == null
          ? Promise.resolve([])
          : db.select({ jobId: jobSubcontractorsTable.jobId }).from(jobSubcontractorsTable)
            .where(eq(jobSubcontractorsTable.jobId, fixture.jobId)),
        fixture.paymentId == null
          ? Promise.resolve([])
          : db.select({ id: subPaymentRecordsTable.id }).from(subPaymentRecordsTable)
            .where(eq(subPaymentRecordsTable.id, fixture.paymentId)),
        sessionId
          ? db.select({ sid: sessionsTable.sid }).from(sessionsTable).where(eq(sessionsTable.sid, sessionId))
          : Promise.resolve([]),
      ]);
      record(
        "Temporary 1099 fixture and session are fully removed",
        remainingSubs.length === 0
          && remainingJobs.length === 0
          && remainingAssignments.length === 0
          && remainingPayments.length === 0
          && remainingSessions.length === 0,
        `subs=${remainingSubs.length}, jobs=${remainingJobs.length}, assignments=${remainingAssignments.length}, payments=${remainingPayments.length}, sessions=${remainingSessions.length}`,
      );
    }
  }

  const failures = results.filter(result => !result.pass);
  if (failures.length > 0) {
    process.exitCode = 1;
    console.error(`\n${failures.length} year-end 1099 browser check(s) failed.`);
  } else {
    console.log(`\nAll ${results.length} year-end 1099 browser checks passed.`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});