import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { Readable } from "node:stream";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  businessesTable,
  clientsTable,
  estimateQuoteEventsTable,
  estimatesTable,
} from "@workspace/db/schema";
import { getEstimateQuoteToken, hashEstimateQuoteToken } from "../lib/estimateQuoteDelivery.js";

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  uploadBuffer: vi.fn(async (_buffer: Buffer, _mimeType: string, path: string) => `private-test/${path}`),
  deleteObject: vi.fn(async () => undefined),
  getObjectEntityFile: vi.fn(async () => ({
    download: async () => [Buffer.from("postgres-quote-pdf")],
    createReadStream: () => Readable.from(Buffer.from("postgres-quote-pdf")),
  })),
  storedPdf: Buffer.from("postgres-quote-pdf"),
}));

vi.mock("../lib/sendEmail.js", () => ({
  EmailProviderRejectedError: class EmailProviderRejectedError extends Error {},
  escapeHtml: (value: string) => value,
  sendEmail: mocks.sendEmail,
}));
vi.mock("../lib/objectStorage.js", () => ({
  ObjectStorageService: class {
    uploadBuffer = mocks.uploadBuffer;
    deleteObject = mocks.deleteObject;
    getObjectEntityFile = mocks.getObjectEntityFile;
  },
}));
vi.mock("../lib/estimateQuoteSnapshot.js", () => ({
  buildEstimateQuoteSnapshot: async ({ revision }: { revision: number }) => ({
    contentHash: "postgres-integration-quote-v1",
    customerSnapshot: {
      revision,
      quoteNumber: "Q-TEST-POSTGRES",
      title: "PostgreSQL integration quote",
      customerName: "Test Customer",
      items: [{ description: "Test work", amount: 132 }],
      total: 132,
      terms: "Development-only test terms",
      brand: { name: "Test Contractor", address: "1 Test Way", city: "Testville", state: "IL", zip: "60000" },
    },
    pdfDocument: { title: "PostgreSQL integration quote" },
    logo: null,
  }),
}));
vi.mock("../lib/generateEstimateQuotePdf.js", () => ({
  generateEstimateQuotePdf: async () => Buffer.from("postgres-quote-pdf"),
}));
vi.mock("./guards.js", () => ({
  getRequestUser: () => ({ firstName: "Integration", lastName: "Owner" }),
  getRequestUserId: () => "quote-postgres-integration-owner",
  getOwnerId: async () => "quote-postgres-integration-owner",
}));
vi.mock("../lib/business-scope.js", () => ({
  requestedBusinessReadScope: async (req: express.Request) => ({
    businessIds: [Number(req.get("x-test-business"))],
    businessLines: [],
  }),
  invalidBusinessScope: () => false,
  hasRequestedBusiness: () => true,
  belongsToBusinessReadScope: (record: { businessId?: number | null }, scope: { businessIds: number[] }) =>
    record.businessId != null && scope.businessIds.includes(record.businessId),
}));

const { default: deliveryRouter } = await import("./estimate-quote-delivery.js");
const { default: publicQuotesRouter } = await import("./public-quotes.js");
const { default: estimatesRouter } = await import("./estimates.js");
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = {
    id: "quote-postgres-integration-owner",
    email: "quote-postgres-integration@example.test",
    firstName: "Integration",
    lastName: "Owner",
    profileImageUrl: null,
  };
  next();
});
app.use("/estimates", deliveryRouter);
app.use("/estimates", estimatesRouter);
app.use("/api/public/quotes", publicQuotesRouter);

type TestRecords = { businessId: number; clientId: number; estimateId: number };
const created: TestRecords[] = [];

async function createTestRecords(label: string): Promise<TestRecords> {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const [business] = await db.insert(businessesTable).values({
    name: `Quote integration ${label}`,
    slug: `quote-integration-${label}-${suffix}`,
    type: "general_contracting",
    defaultQuoteTerms: "Development-only test terms",
  }).returning({ id: businessesTable.id });
  const [client] = await db.insert(clientsTable).values({
    name: "Test Customer",
    email: "quote-integration@example.test",
    businessId: business.id,
    businessLine: `quote-integration-${label}-${suffix}`,
  }).returning({ id: clientsTable.id });
  const [estimate] = await db.insert(estimatesTable).values({
    title: "PostgreSQL integration quote",
    clientId: client.id,
    status: "draft",
    subtotal: "132",
    total: "132",
    lineItems: [{ description: "Test work", quantity: 1, unitPrice: 132, category: "Labor" }],
    businessId: business.id,
    businessLine: `quote-integration-${label}-${suffix}`,
    customerNotes: "Development-only test terms",
    quoteExpiresAt: "2027-12-31",
  }).returning({ id: estimatesTable.id });
  const records = { businessId: business.id, clientId: client.id, estimateId: estimate.id };
  created.push(records);
  return records;
}

function estimatePost(records: TestRecords, path: string) {
  return request(app).post(path).set("Host", "localhost").set("X-Test-Business", String(records.businessId));
}

function estimateDelete(records: TestRecords, path: string) {
  return request(app).delete(path).set("Host", "localhost").set("X-Test-Business", String(records.businessId));
}

function cleanupTestRecords(records: TestRecords) {
  return db.transaction(async tx => {
    await tx.delete(estimateQuoteEventsTable).where(eq(estimateQuoteEventsTable.estimateId, records.estimateId));
    await tx.delete(estimatesTable).where(eq(estimatesTable.id, records.estimateId));
    await tx.delete(clientsTable).where(eq(clientsTable.id, records.clientId));
    await tx.delete(businessesTable).where(eq(businessesTable.id, records.businessId));
  });
}

beforeAll(() => {
  process.env.REPLIT_DEV_DOMAIN = "localhost";
  process.env.SESSION_SECRET = "quote-postgres-integration-test-only";
});

afterEach(async () => {
  for (const records of created.splice(0)) await cleanupTestRecords(records);
  mocks.sendEmail.mockReset();
  mocks.uploadBuffer.mockClear();
  mocks.deleteObject.mockClear();
  mocks.getObjectEntityFile.mockClear();
});

describe("quote delivery with real development PostgreSQL transactions", () => {
  it("serializes concurrent sends and prevents deletion after provider acceptance", async () => {
    const records = await createTestRecords("concurrent-send");
    let releaseProvider!: () => void;
    let signalProviderEntered!: () => void;
    const providerEntered = new Promise<void>(resolve => { signalProviderEntered = resolve; });
    const providerGate = new Promise<void>(resolve => { releaseProvider = resolve; });
    let sendCount = 0;
    mocks.sendEmail.mockImplementation(async () => {
      sendCount += 1;
      signalProviderEntered();
      await providerGate;
      return { provider: "gmail", messageId: "mock-concurrent-message", threadId: "mock-thread" };
    });

    const firstRequest = estimatePost(records, `/estimates/${records.estimateId}/send`)
      .send({ recipient: "quote-integration@example.test", idempotencyKey: "concurrent-key-first-0001" })
      .then(response => response);
    await providerEntered;
    const secondResponse = await estimatePost(records, `/estimates/${records.estimateId}/send`)
      .send({ recipient: "quote-integration@example.test", idempotencyKey: "concurrent-key-second-0002" });
    expect(secondResponse.status).toBe(409);
    releaseProvider();
    const firstResponse = await firstRequest;
    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.status).toBe("accepted");
    expect(sendCount).toBe(1);

    const events = await db.select().from(estimateQuoteEventsTable)
      .where(eq(estimateQuoteEventsTable.estimateId, records.estimateId));
    expect(events.filter(event => event.eventType === "send_attempt")).toHaveLength(1);
    expect(events.find(event => event.eventType === "send_attempt")?.status).toBe("accepted");
    expect(events.find(event => event.eventType === "revision")?.tokenActivatedAt).toBeTruthy();
    expect(mocks.uploadBuffer).toHaveBeenCalledTimes(1);

    await estimateDelete(records, `/estimates/${records.estimateId}`).expect(409);
    expect(await db.select({ id: estimatesTable.id }).from(estimatesTable)
      .where(eq(estimatesTable.id, records.estimateId))).toHaveLength(1);
  });

  it("reconciles an uncertain send transactionally and records one response on its frozen revision", async () => {
    const records = await createTestRecords("reconcile-response");
    mocks.sendEmail.mockRejectedValueOnce(new Error("simulated connection loss after provider handoff"));

    const sent = await estimatePost(records, `/estimates/${records.estimateId}/send`)
      .send({ recipient: "quote-integration@example.test", idempotencyKey: "reconcile-key-first-0001" })
      .expect(202);
    expect(sent.body.status).toBe("unresolved");
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);

    const [pendingAttempt] = await db.select().from(estimateQuoteEventsTable)
      .where(and(
        eq(estimateQuoteEventsTable.estimateId, records.estimateId),
        eq(estimateQuoteEventsTable.eventType, "send_attempt"),
      ));
    expect(pendingAttempt.status).toBe("unresolved");
    await estimatePost(records, `/estimates/${records.estimateId}/quote-events/${pendingAttempt.id}/reconcile`)
      .send({ providerMessageId: "mock-provider-evidence", providerThreadId: "mock-thread-evidence" })
      .expect(200);
    const [revision] = await db.select().from(estimateQuoteEventsTable)
      .where(and(
        eq(estimateQuoteEventsTable.estimateId, records.estimateId),
        eq(estimateQuoteEventsTable.eventType, "revision"),
      ));
    expect(revision.tokenActivatedAt).toBeTruthy();
    expect(revision.tokenRevokedAt).toBeNull();

    await estimatePost(records, `/estimates/${records.estimateId}/send`)
      .send({ recipient: "quote-integration@example.test", idempotencyKey: "reconcile-key-first-0001" })
      .expect(409);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);

    const nextToken = "f".repeat(43);
    const [nextRevision] = await db.insert(estimateQuoteEventsTable).values({
      estimateId: records.estimateId,
      businessId: records.businessId,
      revision: 2,
      eventType: "revision",
      status: "accepted",
      tokenHash: hashEstimateQuoteToken(nextToken),
      tokenExpiresAt: new Date("2027-12-31T23:59:59.999Z"),
      tokenActivatedAt: new Date(),
      contentHash: "frozen-next-revision",
      customerSnapshot: { quoteNumber: "Q-TEST-POSTGRES", revision: 2, title: "Frozen revision two", total: 132 },
      metadata: {},
    }).returning();
    const responseResults = await Promise.all([
      request(app).post(`/api/public/quotes/${nextToken}/responses`).send({ type: "approved" }),
      request(app).post(`/api/public/quotes/${nextToken}/responses`).send({ type: "changes_requested", text: "Update the scope" }),
    ]);
    expect(responseResults.map(response => response.status).sort()).toEqual([201, 409]);
    const responses = await db.select().from(estimateQuoteEventsTable).where(and(
      eq(estimateQuoteEventsTable.revisionSnapshotId, nextRevision.id),
      eq(estimateQuoteEventsTable.eventType, "response"),
    ));
    expect(responses).toHaveLength(1);
    expect(responses[0].revision).toBe(2);
  });

  it("serves archived PDFs only through a currently active, unexpired customer token", async () => {
    const records = await createTestRecords("private-pdf");
    const validToken = "g".repeat(43);
    const [revision] = await db.insert(estimateQuoteEventsTable).values({
      estimateId: records.estimateId,
      businessId: records.businessId,
      revision: 1,
      eventType: "revision",
      status: "accepted",
      tokenHash: hashEstimateQuoteToken(validToken),
      tokenExpiresAt: new Date("2027-12-31T23:59:59.999Z"),
      tokenActivatedAt: new Date(),
      pdfObjectPath: "private-test/quote.pdf",
      logoObjectPath: "private-test/logo.png",
      logoContentType: "image/png",
      contentHash: "pdf-access-control",
      customerSnapshot: { quoteNumber: "Q-TEST-POSTGRES", revision: 1, total: 132 },
      metadata: {},
    }).returning();

    const validPdf = await request(app).get(`/api/public/quotes/${validToken}/pdf`).expect(200);
    expect(validPdf.headers["cache-control"]).toContain("no-store");
    expect(validPdf.headers["content-type"]).toContain("application/pdf");
    expect(validPdf.body).toEqual(mocks.storedPdf);
    const validLogo = await request(app).get(`/api/public/quotes/${validToken}/logo`).expect(200);
    expect(validLogo.headers["content-type"]).toContain("image/png");
    expect(validLogo.body).toEqual(mocks.storedPdf);
    const authorizedArchive = await request(app)
      .get(`/estimates/${records.estimateId}/quote-events/${revision.id}/pdf`)
      .set("Host", "localhost")
      .set("X-Test-Business", String(records.businessId))
      .expect(200);
    expect(authorizedArchive.body).toEqual(mocks.storedPdf);
    await request(app).get(`/estimates/${records.estimateId}/quote-events/${revision.id}/pdf`)
      .set("Host", "localhost")
      .set("X-Test-Business", "-1").expect(404);

    const uploadsBefore = mocks.uploadBuffer.mock.calls.length;
    const objectReadsBefore = mocks.getObjectEntityFile.mock.calls.length;
    await request(app).get(`/api/public/quotes/${"h".repeat(43)}/pdf`).expect(404);
    expect(mocks.uploadBuffer.mock.calls.length).toBe(uploadsBefore);
    expect(mocks.getObjectEntityFile.mock.calls.length).toBe(objectReadsBefore);

    await db.update(estimateQuoteEventsTable).set({ tokenRevokedAt: new Date() })
      .where(eq(estimateQuoteEventsTable.id, revision.id));
    await request(app).get(`/api/public/quotes/${validToken}/pdf`).expect(404);
    await request(app).get(`/api/public/quotes/${validToken}/logo`).expect(404);

    const expiredToken = "i".repeat(43);
    await db.insert(estimateQuoteEventsTable).values({
      estimateId: records.estimateId,
      businessId: records.businessId,
      revision: 2,
      eventType: "revision",
      status: "accepted",
      tokenHash: hashEstimateQuoteToken(expiredToken),
      tokenExpiresAt: new Date("2020-01-01T00:00:00.000Z"),
      tokenActivatedAt: new Date("2019-01-01T00:00:00.000Z"),
      pdfObjectPath: "private-test/expired.pdf",
      contentHash: "expired-quote-token",
      customerSnapshot: { quoteNumber: "Q-EXPIRED", revision: 2, total: 132 },
      metadata: {},
    });
    await request(app).get(`/api/public/quotes/${expiredToken}/pdf`).expect(404);
    expect(mocks.getObjectEntityFile.mock.calls.length).toBe(objectReadsBefore);
  });
});
