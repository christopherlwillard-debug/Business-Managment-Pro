import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { inspect } from "node:util";
import { getEstimateQuoteToken, hashEstimateQuoteToken } from "../lib/estimateQuoteDelivery.js";

const h = vi.hoisted(() => {
  class ProviderRejected extends Error {}
  return {
    selectQueue: [] as any[][],
    whereClauses: [] as unknown[],
    insertQueue: [] as any[][],
    inserts: [] as any[],
    updates: [] as any[],
    deletes: [] as any[],
    sent: [] as any[],
    pdfGenerations: 0,
    uploadCalls: [] as any[],
    deleteCalls: [] as any[],
    sendResults: [] as any[],
    failAcceptedWrite: false,
    failPdfUpload: false,
    transactionCount: 0,
    ProviderRejected,
    storedPdf: Buffer.from("archived-original-pdf"),
  };
});

function makeSelect() {
  const chain: any = {
    from: () => chain,
    leftJoin: () => chain,
    where: (condition: unknown) => {
      h.whereClauses.push(condition);
      return chain;
    },
    orderBy: () => chain,
    limit: () => chain,
    then: (resolve: any, reject: any) =>
      Promise.resolve(h.selectQueue.shift() ?? []).then(resolve, reject),
  };
  return chain;
}

const fakeDb = {
  select: () => makeSelect(),
  insert: () => ({
    values: (values: any) => {
      h.inserts.push(values);
      const chain: any = {
        onConflictDoNothing: () => chain,
        returning: async () => h.insertQueue.shift() ?? [{ id: 800 + h.inserts.length, ...values }],
      };
      return chain;
    },
  }),
  update: () => ({
    set: (values: any) => {
      h.updates.push(values);
      if (h.failAcceptedWrite && values.providerMessageId) {
        h.failAcceptedWrite = false;
        throw new Error("simulated crash window: provider accepted before DB update");
      }
      return { where: async () => undefined };
    },
  }),
  delete: () => ({
    where: async () => {
      h.deletes.push("delete");
      return undefined;
    },
  }),
  transaction: async (callback: (tx: any) => Promise<any>) => {
    h.transactionCount += 1;
    return callback(fakeDb);
  },
  execute: async () => undefined,
};

vi.mock("@workspace/db", () => ({ db: fakeDb }));
vi.mock("../lib/business-scope.js", () => ({
  requestedBusinessReadScope: async () => ({ businessIds: [1], businessLines: ["general_contracting"] }),
  invalidBusinessScope: () => false,
  hasRequestedBusiness: () => false,
  belongsToBusinessReadScope: () => true,
}));
vi.mock("./guards.js", () => ({
  getRequestUser: () => ({ firstName: "Test", lastName: "Owner" }),
  getRequestUserId: () => 77,
  getOwnerId: async () => 77,
}));
vi.mock("../lib/estimateQuoteSnapshot.js", () => ({
  buildEstimateQuoteSnapshot: async ({ revision }: { revision: number }) => ({
    contentHash: "quote-content-v1",
    customerSnapshot: {
      revision,
      quoteNumber: "Q-2026-000012",
      title: "Driveway service",
      customerName: "Customer",
      items: [{ description: "Wash and seal", amount: 132 }],
      total: 132,
      terms: "Due on completion",
    },
    pdfDocument: { title: "mock pdf" },
    logo: null,
  }),
}));
vi.mock("../lib/generateEstimateQuotePdf.js", () => ({
  generateEstimateQuotePdf: async () => {
    h.pdfGenerations += 1;
    return Buffer.from("exact-original-quote-pdf");
  },
}));
vi.mock("../lib/sendEmail.js", () => ({
  EmailProviderRejectedError: h.ProviderRejected,
  escapeHtml: (value: string) => value,
  sendEmail: async (message: any) => {
    h.sent.push(message);
    const result = h.sendResults.shift();
    if (result instanceof Error) throw result;
    return result ?? { provider: "gmail", messageId: "mock-message-1", threadId: "mock-thread-1" };
  },
}));
vi.mock("../lib/objectStorage.js", () => ({
  ObjectStorageService: class {
    async uploadBuffer(buffer: Buffer, mimeType: string, path: string) {
      h.uploadCalls.push({ buffer, mimeType, path });
      if (h.failPdfUpload && path.endsWith("/quote")) throw new Error("mock storage failure");
      return `private/${path}`;
    }
    async deleteObject(path: string) {
      h.deleteCalls.push(path);
    }
    async getObjectEntityFile(path: string) {
      return {
        download: async () => [h.storedPdf],
        createReadStream: () => Readable.from(h.storedPdf),
      };
    }
  },
}));

const { default: deliveryRouter } = await import("./estimate-quote-delivery.js");
const { default: publicQuotesRouter } = await import("./public-quotes.js");
const { default: estimatesRouter } = await import("./estimates.js");
const app = express();
app.use(express.json());
app.use("/estimates", deliveryRouter);
app.use("/estimates", estimatesRouter);
app.use("/api/public/quotes", publicQuotesRouter);

const estimate = {
  id: 12,
  title: "Driveway service",
  clientId: 3,
  businessId: 1,
  businessLine: "general_contracting",
  status: "draft",
  subtotal: "120",
  markupPercent: "10",
  contingencyPercent: null,
  total: "132",
  jobType: "Maintenance",
  notes: "INTERNAL COSTS: never expose",
  customerNotes: "Due on completion",
  quoteExpiresAt: "2026-12-31",
  lineItems: [{ category: "Labor", description: "Wash and seal", quantity: 1, unitCost: 120 }],
  createdAt: new Date("2026-01-02T12:00:00.000Z"),
  clientName: "Customer",
  clientEmail: "customer@example.test",
  clientPhone: null,
  clientAddress: "12 Main St",
  clientCity: "Town",
  clientState: "IL",
  clientZip: "60000",
};
const business = { id: 1, slug: "general_contracting", defaultQuoteValidityDays: 30 };
const revision = (overrides: Record<string, unknown> = {}) => ({
  id: 701,
  estimateId: 12,
  businessId: 1,
  revision: 1,
  eventType: "revision",
  status: "snapshot",
  contentHash: "quote-content-v1",
  tokenHash: hashEstimateQuoteToken(getEstimateQuoteToken(12, 1, "quote-content-v1")),
  tokenExpiresAt: new Date("2026-12-31T23:59:59.999Z"),
  tokenActivatedAt: null,
  tokenRevokedAt: null,
  customerSnapshot: { quoteNumber: "Q-2026-000012", title: "Driveway service", total: 132 },
  pdfObjectPath: null,
  logoObjectPath: null,
  ...overrides,
});
const attempt = (overrides: Record<string, unknown> = {}) => ({
  id: 702,
  estimateId: 12,
  businessId: 1,
  revisionSnapshotId: 701,
  revision: 1,
  eventType: "send_attempt",
  status: "pending",
  recipient: "customer@example.test",
  idempotencyKey: createHash("sha256").update("12:unique-idempotency-key-0001").digest("hex"),
  ...overrides,
});

function queueInitialSend() {
  h.selectQueue.push([], [estimate], [], [business], [], []);
  h.insertQueue.push([revision()], [attempt()]);
}

function sendRequest(key = "unique-idempotency-key-0001") {
  return request(app).post("/estimates/12/send")
    .set("Host", "localhost")
    .set("X-Test-Business", "1")
    .send({ recipient: "customer@example.test", idempotencyKey: key });
}

beforeEach(() => {
  process.env.REPLIT_DEV_DOMAIN = "localhost";
  process.env.SESSION_SECRET = "test-secret";
  h.selectQueue.length = 0;
  h.whereClauses.length = 0;
  h.insertQueue.length = 0;
  h.inserts.length = 0;
  h.updates.length = 0;
  h.deletes.length = 0;
  h.sent.length = 0;
  h.pdfGenerations = 0;
  h.uploadCalls.length = 0;
  h.deleteCalls.length = 0;
  h.sendResults.length = 0;
  h.failAcceptedWrite = false;
  h.failPdfUpload = false;
  h.transactionCount = 0;
});

afterEach(() => {
  expect(h.selectQueue).toHaveLength(0);
});

describe("mocked quote send and recovery lifecycle", () => {
  it("stages and archives the exact PDF, then records successful provider acceptance", async () => {
    queueInitialSend();
    const response = await sendRequest().expect(200);
    expect(response.body.status).toBe("accepted");
    expect(h.sent).toHaveLength(1);
    expect(Buffer.from(h.sent[0].attachment.base64Data, "base64")).toEqual(Buffer.from("exact-original-quote-pdf"));
    expect(h.uploadCalls.map(call => call.path)).toEqual([
      "quote-archives/estimates/12/revision-1/quote",
    ]);
    expect(h.updates.some(values => values.status === "accepted")).toBe(true);
    expect(h.sent[0].to).toBe("customer@example.test");
    expect(h.sent[0].html).toContain("http://localhost/quote/");
  });

  it("rejects untrusted delivery hosts before querying or sending", async () => {
    await request(app).post("/estimates/12/send")
      .set("Host", "attacker.example")
      .send({ recipient: "customer@example.test", idempotencyKey: "unique-idempotency-key-0001" })
      .expect(400);
    expect(h.selectQueue).toHaveLength(0);
    expect(h.sent).toHaveLength(0);
  });

  it("reuses the archived PDF bytes for a later send instead of regenerating the revision", async () => {
    const originalPdf = Buffer.from("immutable-archived-pdf-bytes");
    h.storedPdf = originalPdf;
    h.selectQueue.push([], [estimate], [], [business], [], [
      revision({ pdfObjectPath: "private/quote-archives/estimates/12/revision-1/quote" }),
    ]);
    h.insertQueue.push([attempt({ id: 703 })]);

    await sendRequest("second-explicit-send-key-00003").expect(200);

    expect(Buffer.from(h.sent[0].attachment.base64Data, "base64")).toEqual(originalPdf);
    expect(h.pdfGenerations).toBe(0);
    expect(h.uploadCalls).toHaveLength(0);
  });

  it("marks definite provider rejection failed and cleans staged PDF objects", async () => {
    queueInitialSend();
    h.sendResults.push(new h.ProviderRejected("rejected"));
    const response = await sendRequest().expect(502);
    expect(response.body.status).toBe("failed");
    expect(h.deleteCalls).toContain("private/quote-archives/estimates/12/revision-1/quote");
    expect(h.sent).toHaveLength(1);
    expect(h.updates.some(values => values.status === "failed")).toBe(true);
  });

  it("recovers the accept-before-database-write failure without sending twice", async () => {
    queueInitialSend();
    h.failAcceptedWrite = true;
    const send = await sendRequest().expect(202);
    expect(send.body.status).toBe("unresolved");
    expect(h.sent).toHaveLength(1);

    h.selectQueue.push([attempt({ status: "unresolved" })], [attempt({ status: "accepted", providerMessageId: "gmail-evidence-1" })]);
    const recovered = await request(app).post("/estimates/12/quote-events/702/reconcile")
      .send({ providerMessageId: "gmail-evidence-1", providerThreadId: "thread-evidence-1" })
      .expect(200);
    expect(recovered.body.status).toBe("accepted");
    expect(h.sent).toHaveLength(1);
    expect(h.updates.some(values => values.tokenActivatedAt instanceof Date)).toBe(true);

    h.selectQueue.push([attempt({ status: "accepted" })]);
    await sendRequest().expect(409);
    expect(h.sent).toHaveLength(1);
  });

  it("keeps an uncertain provider result unresolved and blocks a second send", async () => {
    queueInitialSend();
    h.sendResults.push(new Error("connection dropped after request"));
    const response = await sendRequest().expect(202);
    expect(response.body.status).toBe("unresolved");
    h.selectQueue.push([], [estimate], [attempt({ status: "unresolved" })]);
    await sendRequest("different-idempotency-key-0002").expect(409);
    expect(h.sent).toHaveLength(1);
  });

  it("does not send when PDF storage fails and cleans staged files", async () => {
    queueInitialSend();
    h.failPdfUpload = true;
    const response = await sendRequest().expect(202);
    expect(response.body.status).toBe("unresolved");
    expect(h.sent).toHaveLength(0);
    expect(h.updates.some(values => values.status === "unresolved")).toBe(true);
  });
});

describe("public quote token responses", () => {
  it("rejects malformed, expired, and revoked tokens without exposing a quote", async () => {
    await request(app).get("/api/public/quotes/not-a-token").expect(404);
    h.selectQueue.push([], []);
    await request(app).get(`/api/public/quotes/${"a".repeat(43)}`).expect(404);
    await request(app).get(`/api/public/quotes/${"b".repeat(43)}`).expect(404);
    const activeRevisionQuery = inspect(h.whereClauses[0], { depth: 8 });
    expect(activeRevisionQuery).toContain("tokenActivatedAt");
    expect(activeRevisionQuery).toContain("tokenRevokedAt");
    expect(activeRevisionQuery).toContain("tokenExpiresAt");
  });

  it("returns only the frozen customer snapshot and excludes internal event fields", async () => {
    const token = "d".repeat(43);
    h.selectQueue.push([
      revision({
        tokenHash: hashEstimateQuoteToken(token),
        tokenActivatedAt: new Date(),
        recipient: "private-recipient@example.test",
        providerMessageId: "internal-provider-id",
        customerSnapshot: {
          quoteNumber: "Q-2026-000012",
          title: "Driveway service",
          total: 132,
          items: [{ description: "Wash and seal", amount: 132 }],
          terms: "Due on completion",
        },
      }),
    ], []);
    const response = await request(app).get(`/api/public/quotes/${token}`).expect(200);
    expect(response.body).toMatchObject({ quoteNumber: "Q-2026-000012", total: 132 });
    expect(response.body).not.toHaveProperty("recipient");
    expect(response.body).not.toHaveProperty("providerMessageId");
    expect(response.body).not.toHaveProperty("businessId");
    expect(JSON.stringify(response.body)).not.toContain("internal-provider-id");
  });

  it.each(["approved", "declined", "changes_requested"])("records %s against the immutable revision", async type => {
    const token = "c".repeat(43);
    h.selectQueue.push([revision({ tokenHash: hashEstimateQuoteToken(token), tokenActivatedAt: new Date() })], []);
    h.insertQueue.push([{ id: 901 }]);
    const response = await request(app).post(`/api/public/quotes/${token}/responses`)
      .send({ type, text: "Customer decision" }).expect(201);
    expect(response.body).toEqual({ success: true, response: type });
    expect(h.inserts.at(-1)).toMatchObject({
      eventType: "response",
      revisionSnapshotId: 701,
      revision: 1,
      responseType: type,
      responseText: "Customer decision",
    });
  });
});

describe("server-side quote deletion protection", () => {
  it("blocks deleting an estimate with accepted quote history", async () => {
    h.selectQueue.push(
      [{ id: 12, businessId: 1, businessLine: "general_contracting" }],
      [{ eventType: "send_attempt", status: "accepted" }],
    );
    const response = await request(app).delete("/estimates/12").expect(409);
    expect(response.body.error).toContain("cannot be deleted");
    expect(h.deletes).toHaveLength(0);
  });

  it("allows removal of a draft with only failed attempts and inactive revisions", async () => {
    h.selectQueue.push(
      [{ id: 12, businessId: 1, businessLine: "general_contracting" }],
      [
        { eventType: "send_attempt", status: "failed" },
        { eventType: "revision", tokenActivatedAt: null },
      ],
    );
    const response = await request(app).delete("/estimates/12");
    expect(response.status, JSON.stringify(response.body)).toBe(204);
    expect(h.deletes).toHaveLength(3);
  });
});
