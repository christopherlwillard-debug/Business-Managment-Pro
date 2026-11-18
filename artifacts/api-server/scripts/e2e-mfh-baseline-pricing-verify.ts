/* Authenticated, development-only end-to-end check for MFH model baseline and
 * client-specific override pricing. All created records are temporary fixtures.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  businessesTable,
  clientsTable,
  estimatesTable,
  jobsTable,
  mfhClientPricingTable,
  mfhConstructionTypesTable,
  mfhManufacturersTable,
  mfhModelsTable,
} from "@workspace/db/schema";
import { createTestLoginProof, deleteSession, SESSION_COOKIE } from "../src/lib/auth";
import { launchBrowser } from "../src/lib/launchBrowser";
import type { HTTPRequest, Page } from "puppeteer";

const BASE = process.env.BUILDPRO_E2E_BASE_URL ?? "http://localhost:80";
const target = new URL(BASE);
if (
  process.env.NODE_ENV === "production"
  || process.env.REPLIT_DEPLOYMENT
  || target.protocol !== "http:"
  || !["localhost", "127.0.0.1", "::1"].includes(target.hostname.replace(/^\[|\]$/g, ""))
) {
  throw new Error(`Refusing MFH pricing verification against non-local target ${target.origin}`);
}

const BASELINE_PRICE = 12_345;
const CLIENT_OVERRIDE = 8_765;
const jobIds = new Set<number>();
const applyAllowedJobIds = new Set<number>();
const browserWrites: string[] = [];
const blockedWrites: string[] = [];
const results: Array<{ name: string; pass: boolean; detail?: string }> = [];

type Fixture = {
  businessId?: number;
  businessLine?: string;
  constructionTypeId?: number;
  manufacturerId?: number;
  modelId?: number;
  clientIds: number[];
  clientPricingId?: number;
  jobIds: number[];
  suffix: string;
};

const fixture: Fixture = {
  clientIds: [],
  jobIds: [],
  suffix: `${Date.now()}-${process.pid}`,
};

function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function createFixture() {
  const [business] = await db.select({
    id: businessesTable.id,
    slug: businessesTable.slug,
  }).from(businessesTable).orderBy(businessesTable.id).limit(1);
  if (!business) throw new Error("No development business is available for a disposable pricing fixture");
  fixture.businessId = business.id;
  fixture.businessLine = business.slug;

  const [constructionType] = await db.insert(mfhConstructionTypesTable)
    .values({ name: `E2E Pricing ${fixture.suffix}` })
    .returning({ id: mfhConstructionTypesTable.id });
  fixture.constructionTypeId = constructionType.id;

  const [manufacturer] = await db.insert(mfhManufacturersTable)
    .values({ name: `E2E Pricing Builder ${fixture.suffix}`, active: true })
    .returning({ id: mfhManufacturersTable.id });
  fixture.manufacturerId = manufacturer.id;

  const [model] = await db.insert(mfhModelsTable)
    .values({
      manufacturerId: manufacturer.id,
      name: `E2E Pricing Model ${fixture.suffix}`,
      constructionTypeId: constructionType.id,
      basePrice: String(BASELINE_PRICE),
      active: true,
    })
    .returning({ id: mfhModelsTable.id });
  fixture.modelId = model.id;

  const [baselineClient] = await db.insert(clientsTable)
    .values({
      name: `E2E Baseline Client ${fixture.suffix}`,
      businessId: business.id,
    })
    .returning({ id: clientsTable.id });
  fixture.clientIds.push(baselineClient.id);

  const [overrideClient] = await db.insert(clientsTable)
    .values({
      name: `E2E Override Client ${fixture.suffix}`,
      businessId: business.id,
    })
    .returning({ id: clientsTable.id });
  fixture.clientIds.push(overrideClient.id);

  const [override] = await db.insert(mfhClientPricingTable)
    .values({
      modelId: model.id,
      clientId: overrideClient.id,
      price: String(CLIENT_OVERRIDE),
      notes: "Disposable authenticated pricing verification",
    })
    .returning({ id: mfhClientPricingTable.id });
  fixture.clientPricingId = override.id;

  const [{ maxJobNumber }] = await db.select({
    maxJobNumber: sql<number>`COALESCE(MAX(${jobsTable.jobNumber}), 0)`,
  }).from(jobsTable);
  const clients = [
    { id: baselineClient.id, label: "baseline" },
    { id: overrideClient.id, label: "override" },
  ];
  for (const [index, client] of clients.entries()) {
    const [job] = await db.insert(jobsTable).values({
      title: `E2E MFH ${client.label} pricing ${fixture.suffix}`,
      clientId: client.id,
      businessId: business.id,
      businessLine: business.slug,
      jobNumber: Number(maxJobNumber) + index + 1,
      status: "scheduled",
      jobType: "Manufactured Home",
      workflow: "mh_production",
      includeMileageInJobCosts: true,
    }).returning({ id: jobsTable.id });
    fixture.jobIds.push(job.id);
    jobIds.add(job.id);
    applyAllowedJobIds.add(job.id);
  }

  record("Disposable pricing fixtures created", true, "one model, two clients, one override, two jobs");
}

async function chooseOption(page: Page, index: number, value: number) {
  await page.waitForFunction(
    ({ expectedIndex, optionValue }) => {
      const select = document.querySelectorAll<HTMLSelectElement>("div.fixed.inset-0.z-40 select")[expectedIndex];
      return Boolean(select && Array.from(select.options).some(option => option.value === String(optionValue)));
    },
    { timeout: 15_000 },
    { expectedIndex: index, optionValue: value },
  );
  const selects = await page.$$("div.fixed.inset-0.z-40 select");
  const selectedValues = await selects[index]?.select(String(value));
  if (!selectedValues?.includes(String(value))) {
    throw new Error(`Expected MFH pricing option ${value} was not selected`);
  }
}

async function verifyPricingCase(
  page: Page,
  jobId: number,
  title: string,
  expectedPrice: number,
  isClientOverride: boolean,
) {
  await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle2", timeout: 60_000 });
  await page.waitForSelector('input[placeholder*="Search jobs"]', { timeout: 20_000 });
  await page.type('input[placeholder*="Search jobs"]', title);
  await page.waitForSelector(`[data-testid="job-card-open-${jobId}"]`, { timeout: 30_000 });
  await page.click(`[data-testid="job-card-open-${jobId}"]`);
  await page.waitForSelector('[data-testid^="job-workspace-unified-"]', { timeout: 20_000 });

  const opened = await page.evaluate(() => {
    const workspace = document.querySelector('[data-testid^="job-workspace-unified-"]');
    const button = Array.from(workspace?.querySelectorAll("button") ?? [])
      .find(element => {
        const text = (element.textContent ?? "").trim();
        return text.includes("Other job details") || text.includes("Manufactured Home");
      }) as HTMLButtonElement | undefined;
    button?.click();
    return Boolean(button);
  });
  if (!opened) {
    const visibleButtons = await page.$$eval(
      '[data-testid^="job-workspace-unified-"] button',
      buttons => buttons.map(button => button.textContent?.trim()).filter(Boolean).join(" | "),
    );
    throw new Error(`Manufactured Home panel action was not available for job ${jobId}: ${visibleButtons}`);
  }
  const panelReady = await page.waitForFunction(() => {
    const panel = Array.from(document.querySelectorAll("div.fixed.inset-0.z-40"))
      .find(element => element.textContent?.includes("Manufactured Home") && element.querySelector("select"));
    return Boolean(panel
      && panel.querySelector("select"));
  }, { timeout: 15_000 }).then(() => true).catch(() => false);
  if (!panelReady) {
    const dialogs = await page.$$eval("div.fixed.inset-0", nodes =>
      nodes.map(node => ({
        classes: node.className,
        text: node.textContent?.slice(0, 180),
        selects: node.querySelectorAll("select").length,
      })),
    );
    throw new Error(`MFH pricing panel did not open for job ${jobId}: ${JSON.stringify(dialogs)}`);
  }
  await chooseOption(page, 0, fixture.manufacturerId!);
  await chooseOption(page, 1, fixture.modelId!);

  const expectedRateLabel = isClientOverride ? "Client-specific rate:" : "Clayton baseline:";
  const pricingVisible = await page.waitForFunction(({ expectedRateLabel, expectedPrice }) => {
    const panel = Array.from(document.querySelectorAll("div.fixed.inset-0.z-40"))
      .find(element => element.textContent?.includes("Manufactured Home"));
    if (!panel?.textContent?.includes(expectedRateLabel)) return false;
    return Array.from(panel.querySelectorAll<HTMLInputElement>('input[type="number"]'))
      .some(input => Number(input.value) === expectedPrice);
  }, { timeout: 4_000 }, { expectedRateLabel, expectedPrice }).then(() => true).catch(() => false);
  if (!pricingVisible) {
    const debug = await page.evaluate(() => {
      const panel = Array.from(document.querySelectorAll("div.fixed.inset-0.z-40"))
        .find(element => element.textContent?.includes("Manufactured Home"));
      return {
        text: panel?.innerText ?? "",
        selects: Array.from(panel?.querySelectorAll<HTMLSelectElement>("select") ?? [])
          .map(select => ({ value: select.value, label: select.selectedOptions[0]?.textContent })),
        numberInputs: Array.from(panel?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? [])
          .map(input => ({ value: input.value, placeholder: input.placeholder })),
      };
    });
    throw new Error(`Expected ${expectedRateLabel} at $${expectedPrice}; panel state: ${JSON.stringify(debug)}`);
  }

  const beforeApply = await page.evaluate(() => {
    const panel = Array.from(document.querySelectorAll("div.fixed.inset-0.z-40"))
      .find(element => element.textContent?.includes("Manufactured Home"));
    const text = panel?.innerText ?? "";
    const inputs = Array.from(panel?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? [])
      .map(input => input.value);
    const apply = Array.from(panel?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find(button => button.textContent?.includes("Apply Pricing"));
    return { text, inputs, applyDisabled: apply?.disabled ?? true };
  });
  const correctRateKind = beforeApply.text.includes(expectedRateLabel)
    && (isClientOverride
      ? !beforeApply.text.includes("Clayton baseline:")
      : !beforeApply.text.includes("Client-specific rate:"));
  const priceInputPresent = beforeApply.inputs.some(value => Number(value) === expectedPrice);
  record(
    isClientOverride ? "Client-specific model override is shown in the pricing panel" : "Model baseline is shown when no client override exists",
    correctRateKind && priceInputPresent && !beforeApply.applyDisabled,
    `${expectedRateLabel} $${expectedPrice}; numeric inputs=${beforeApply.inputs.join(",")}`,
  );

  const clickedApply = await page.evaluate(() => {
    const panel = Array.from(document.querySelectorAll("div.fixed.inset-0.z-40"))
      .find(element => element.textContent?.includes("Manufactured Home"));
    const button = Array.from(panel?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find(element => element.textContent?.includes("Apply Pricing"));
    button?.click();
    return Boolean(button && !button.disabled);
  });
  if (!clickedApply) throw new Error(`Apply Pricing was not enabled for job ${jobId}`);
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("div.fixed.inset-0.z-40"))
      .some(panel => panel.textContent?.includes("Manufactured Home") && panel.textContent.includes("Applied ✓")),
  { timeout: 20_000 });

  const [job] = await db.select({
    dealerPrice: jobsTable.mfhDealerPrice,
    quotedPrice: jobsTable.mfhQuotedPrice,
  }).from(jobsTable).where(eq(jobsTable.id, jobId)).limit(1);
  const [estimate] = await db.select({
    subtotal: estimatesTable.subtotal,
    total: estimatesTable.total,
    lineItems: estimatesTable.lineItems,
  }).from(estimatesTable).where(eq(estimatesTable.jobId, jobId)).limit(1);
  const mfhLines = Array.isArray(estimate?.lineItems)
    ? (estimate.lineItems as Array<Record<string, unknown>>).filter(line => line.generatedBy === "MFH")
    : [];
  const lineTotal = mfhLines.reduce((sum, line) =>
    sum + Number(line.quantity ?? 1) * Number(line.unitCost ?? 0), 0);
  record(
    isClientOverride ? "Client override is saved to the job and estimate" : "Model baseline is saved to the job and estimate",
    Number(job?.dealerPrice) === expectedPrice
      && Number(job?.quotedPrice) === expectedPrice
      && Number(estimate?.subtotal) === expectedPrice
      && Number(estimate?.total) === expectedPrice
      && mfhLines.length > 0
      && lineTotal === expectedPrice,
    `job dealer/quoted=${job?.dealerPrice ?? "missing"}/${job?.quotedPrice ?? "missing"}; estimate subtotal/total=${estimate?.subtotal ?? "missing"}/${estimate?.total ?? "missing"}; MFH line total=${lineTotal}`,
  );
}

async function cleanupFixture() {
  for (const jobId of fixture.jobIds) {
    await db.delete(estimatesTable).where(eq(estimatesTable.jobId, jobId));
    await db.delete(jobsTable).where(eq(jobsTable.id, jobId));
  }
  if (fixture.clientPricingId) {
    await db.delete(mfhClientPricingTable).where(eq(mfhClientPricingTable.id, fixture.clientPricingId));
  }
  for (const clientId of fixture.clientIds) {
    await db.delete(clientsTable).where(eq(clientsTable.id, clientId));
  }
  if (fixture.modelId) await db.delete(mfhModelsTable).where(eq(mfhModelsTable.id, fixture.modelId));
  if (fixture.manufacturerId) {
    await db.delete(mfhManufacturersTable).where(eq(mfhManufacturersTable.id, fixture.manufacturerId));
  }
  if (fixture.constructionTypeId) {
    await db.delete(mfhConstructionTypesTable).where(eq(mfhConstructionTypesTable.id, fixture.constructionTypeId));
  }

  const remaining = await Promise.all([
    ...fixture.jobIds.map(id => db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.id, id))),
    ...fixture.clientIds.map(id => db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.id, id))),
    fixture.modelId ? db.select({ id: mfhModelsTable.id }).from(mfhModelsTable).where(eq(mfhModelsTable.id, fixture.modelId)) : [],
    fixture.manufacturerId ? db.select({ id: mfhManufacturersTable.id }).from(mfhManufacturersTable).where(eq(mfhManufacturersTable.id, fixture.manufacturerId)) : [],
    fixture.constructionTypeId ? db.select({ id: mfhConstructionTypesTable.id }).from(mfhConstructionTypesTable).where(eq(mfhConstructionTypesTable.id, fixture.constructionTypeId)) : [],
    fixture.clientPricingId ? db.select({ id: mfhClientPricingTable.id }).from(mfhClientPricingTable).where(eq(mfhClientPricingTable.id, fixture.clientPricingId)) : [],
  ]);
  const clean = remaining.every(rows => rows.length === 0);
  record("Temporary MFH pricing fixtures were removed", clean);
  if (!clean) throw new Error("Temporary MFH pricing fixtures remain after cleanup");
}

async function main() {
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  let sessionId: string | undefined;
  try {
    await createFixture();
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setRequestInterception(true);
    page.on("request", (request: HTTPRequest) => {
      const method = request.method().toUpperCase();
      if (["GET", "HEAD", "OPTIONS"].includes(method)) {
        void request.continue();
        return;
      }
      const path = new URL(request.url()).pathname.replace(/\/$/, "");
      const applyMatch = path.match(/^\/api\/mfh\/jobs\/(\d+)\/apply$/);
      if (method === "POST" && applyMatch && applyAllowedJobIds.has(Number(applyMatch[1]))) {
        browserWrites.push(`${method} ${path}`);
        void request.continue();
        return;
      }
      blockedWrites.push(`${method} ${path}`);
      void request.abort("blockedbyclient");
    });

    const returnTo = "/jobs";
    const proof = createTestLoginProof(returnTo);
    const loginParams = new URLSearchParams({ returnTo, ...proof });
    await page.goto(`${BASE}/api/dev-test-login?${loginParams}`, { waitUntil: "networkidle2", timeout: 60_000 });
    sessionId = (await page.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value;
    if (!sessionId) throw new Error("Development test login did not create a session");
    record("Authenticated development session was created", true);

    const baselineJobId = fixture.jobIds[0];
    const overrideJobId = fixture.jobIds[1];
    const baselineTitle = `E2E MFH baseline pricing ${fixture.suffix}`;
    const overrideTitle = `E2E MFH override pricing ${fixture.suffix}`;
    await verifyPricingCase(page, baselineJobId, baselineTitle, BASELINE_PRICE, false);
    await verifyPricingCase(page, overrideJobId, overrideTitle, CLIENT_OVERRIDE, true);

    record("Browser writes stayed within the pricing-apply allowlist",
      blockedWrites.length === 0 && browserWrites.length === 2,
      `allowed=${browserWrites.length}; blocked=${blockedWrites.join(", ") || "none"}`);
  } finally {
    if (browser) await browser.close();
    if (sessionId) await deleteSession(sessionId).catch(() => undefined);
    await cleanupFixture();
  }

  const failed = results.filter(result => !result.pass);
  console.log(`\n=== ${results.length - failed.length}/${results.length} pricing checks passed ===`);
  if (failed.length > 0 || blockedWrites.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error("MFH PRICING VERIFICATION FAILED:", error);
  process.exitCode = 1;
});
