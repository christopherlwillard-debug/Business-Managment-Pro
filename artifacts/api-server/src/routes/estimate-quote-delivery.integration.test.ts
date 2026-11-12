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
    scopeRequests: [] as any[],
    requireBusinessScope: false,
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
    failPdfDownload: false,
    failSnapshot: false,
    contentHashOverride: null as string | null,
    transactionCount: 0,
    ProviderRejected,
    storedPdf: Buffer.from("exact-original-quote-pdf"),
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
  requestedBusinessReadScope: async (req: any) => {
    h.scopeRequests.push(req.query);
    if (h.requireBusinessScope && req.query.businessId == null && req.query.businessLine == null) return null;
    return { businessIds: [1], businessLines: ["general_contracting"] };
  },
  invalidBusinessScope: () => false,
  hasRequestedBusiness: () => false,
  belongsToBusinessReadScope: () => true,
  businessReadPredicate: () => undefined,
}));
vi.mock("./guards.js", () => ({
  getRequestUser: () => ({ firstName: "Test", lastName: "Owner" }),
  getRequestUserId: () => 77,
  getOwnerId: async () => 77,
}));
vi.mock("../lib/estimateQuoteSnapshot.js", () => ({
  buildEstimateQuoteSnapshot: async ({ revision }: { revision: number }) => {
    if (h.failSnapshot) {
      const error = new Error("mismatch");
      error.name = "EstimateQuoteTotalsMismatchError";
      throw error;
    }
    return {
      contentHash: h.contentHashOverride ?? "quote-content-v1",
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
    };
  },
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
        download: async () => {
          if (h.failPdfDownload) throw new Error("mock storage download failure");
          return [h.storedPdf];
        },
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
  pdfObjectPath: "private/quote-archives/estimates/12/revision-1/quote",
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
  const reviewed = revision();
  h.selectQueue.push([], [estimate], [], [business], [], [reviewed], [reviewed]);
  h.insertQueue.push([attempt()]);
}

function sendRequest(key = "unique-idempotency-key-0001") {
  return request(app).post("/estimates/12/send")
    .set("Host", "localhost")
    .set("X-Test-Business", "1")
    .send({ recipient: "customer@example.test", idempotencyKey: key, revisionEventId: 701 });
}

function previewRequest() {
  return request(app).post("/estimates/12/quote-preview")
    .set("X-Test-Business", "1");
}

beforeEach(() => {
  process.env.REPLIT_DEV_DOMAIN = "localhost";
  process.env.SESSION_SECRET = "test-secret";
  h.selectQueue.length = 0;
  h.whereClauses.length = 0;
  h.scopeRequests.length = 0;
  h.requireBusinessScope = false;
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
  h.failPdfDownload = false;
  h.failSnapshot = false;
  h.contentHashOverride = null;
  h.transactionCount = 0;
});

describe("scoped Quote Center actions", () => {
  it("requires an explicit business scope before recording a manual decision", async () => {
    h.requireBusinessScope = true;
    const response = await request(app).post("/estimates/12/quote-events/manual-response").send({
      revisionSnapshotId: 701,
      responseType: "approved",
      method: "phone",
      idempotencyKey: "manual-response-key-0001",
    }).expect(400);
    expect(response.body.error).toContain("business");
    expect(h.selectQueue).toHaveLength(0);
  });

  it("records a manual decision against the requested business and exact revision", async () => {
    h.requireBusinessScope = true;
    h.selectQueue.push([{ ...estimate }], [revision()]);
    h.insertQueue.push([{
      id: 801,
      estimateId: 12,
      revisionSnapshotId: 701,
      revision: 1,
      eventType: "manual_response",
      status: "recorded",
      responseType: "approved",
      requestedAt: new Date("2026-11-11T12:00:00.000Z"),
      metadata: { method: "phone", source: "manual" },
    }]);
    const response = await request(app).post("/estimates/12/quote-events/manual-response").send({
      businessId: 1,
      revisionSnapshotId: 701,
      responseType: "approved",
      method: "phone",
      contactName: "Jordan Lee",
      idempotencyKey: "manual-response-key-0002",
    }).expect(201);

    expect(h.scopeRequests.at(-1)).toMatchObject({ businessId: 1 });
    expect(h.inserts.at(-1)).toMatchObject({
      eventType: "manual_response",
      status: "recorded",
      responseType: "approved",
      estimateId: 12,
      revisionSnapshotId: 701,
      metadata: { source: "manual", method: "phone", contactName: "Jordan Lee" },
    });
    expect(response.body).toMatchObject({
      eventType: "manual_response",
      responseType: "approved",
      responseAt: "2026-11-11T12:00:00.000Z",
    });
  });
});

describe("explicit work authorization", () => {
  const acceptedDecision = {
    id: 702,
    estimateId: 12,
    businessId: 1,
    revisionSnapshotId: 701,
    revision: 1,
    eventType: "response",
    status: "recorded",
    responseType: "approved",
    requestedAt: new Date("2026-11-10T13:00:00.000Z"),
  };
  const authorizationInput = {
    businessId: 1,
    revisionSnapshotId: 701,
    confirmed: true,
    note: "Customer confirmed the start date by phone",
    idempotencyKey: "authorize-quote-revision-0001",
  };

  it("refuses authorization without an accepted decision", async () => {
    h.selectQueue.push([{ ...estimate }], [revision()], [{ id: 701 }], []);
    const response = await request(app).post("/estimates/12/quote-events/work-authorization")
      .send(authorizationInput).expect(409);
    expect(response.body.error).toContain("accepted revision");
    expect(h.inserts).toHaveLength(0);
  });

  it("records one explicit authorization against the accepted frozen revision", async () => {
    h.selectQueue.push(
      [{ ...estimate }],
      [revision()],
      [{ id: 701 }],
      [acceptedDecision],
      [],
    );
    h.insertQueue.push([{
      id: 703,
      estimateId: 12,
      businessId: 1,
      revisionSnapshotId: 701,
      revision: 1,
      eventType: "work_authorization",
      status: "authorized",
      actorName: "Test Owner",
      requestedAt: new Date("2026-11-11T12:00:00.000Z"),
      metadata: { confirmed: true, note: authorizationInput.note },
    }]);

    const response = await request(app).post("/estimates/12/quote-events/work-authorization")
      .send(authorizationInput).expect(201);
    expect(h.inserts.at(-1)).toMatchObject({
      eventType: "work_authorization",
      status: "authorized",
      revisionSnapshotId: 701,
      actorUserId: 77,
      metadata: { confirmed: true, note: authorizationInput.note },
    });
    expect(response.body).toMatchObject({
      eventType: "work_authorization",
      revision: 1,
      actorName: "Test Owner",
    });
  });

  it("rejects a duplicate authorization event for the same revision", async () => {
    h.selectQueue.push(
      [{ ...estimate }],
      [revision()],
      [{ id: 701 }],
      [acceptedDecision],
      [{ id: 703 }],
    );
    await request(app).post("/estimates/12/quote-events/work-authorization")
      .send({ ...authorizationInput, idempotencyKey: "authorize-quote-revision-0002" })
      .expect(409);
    expect(h.inserts).toHaveLength(0);
  });
});

afterEach(() => {
  expect(h.selectQueue).toHaveLength(0);
});

describe("mocked quote send and recovery lifecycle", () => {
  it("prepares and archives a frozen PDF without sending email", async () => {
    h.selectQueue.push([estimate], [estimate], [business], [], []);
    h.insertQueue.push([revision()]);

    const response = await previewRequest().expect(200);

    expect(response.body).toMatchObject({
      revisionEventId: 701,
      revision: 1,
      quoteNumber: "Q-2026-000012",
      total: 132,
    });
    expect(h.inserts[0]).toMatchObject({ eventType: "revision", status: "snapshot" });
    expect(h.inserts[0].tokenActivatedAt).toBeUndefined();
    expect(h.pdfGenerations).toBe(1);
    expect(h.uploadCalls.map(call => call.path)).toEqual([
      "quote-archives/estimates/12/revision-1/quote",
    ]);
    expect(h.sent).toHaveLength(0);
  });

  it("blocks a mismatched estimate before creating a revision or sending", async () => {
    h.selectQueue.push([estimate], [estimate], [business], [], []);
    h.failSnapshot = true;

    const response = await previewRequest().expect(409);

    expect(response.body.error).toContain("pricing does not reconcile");
    expect(h.inserts).toHaveLength(0);
    expect(h.sent).toHaveLength(0);
  });

  it("reuses an unchanged prepared revision and its PDF", async () => {
    h.selectQueue.push([estimate], [estimate], [business], [], [revision()]);

    const response = await previewRequest().expect(200);

    expect(response.body.revisionEventId).toBe(701);
    expect(h.inserts).toHaveLength(0);
    expect(h.pdfGenerations).toBe(0);
    expect(h.uploadCalls).toHaveLength(0);
    expect(h.sent).toHaveLength(0);
  });

  it("rejects sending when the estimate changed after its PDF was reviewed", async () => {
    const reviewed = revision();
    h.selectQueue.push([], [estimate], [], [business], [], [reviewed], [reviewed]);
    h.contentHashOverride = "changed-after-preview";

    const response = await sendRequest().expect(409);

    expect(response.body.error).toContain("changed");
    expect(h.sent).toHaveLength(0);
    expect(h.inserts).toHaveLength(0);
  });

  it("refuses to send without a prepared revision", async () => {
    await request(app).post("/estimates/12/send")
      .set("Host", "localhost")
      .send({ recipient: "customer@example.test", idempotencyKey: "unique-idempotency-key-0001" })
      .expect(400);
    expect(h.sent).toHaveLength(0);
    expect(h.selectQueue).toHaveLength(0);
  });

  it("cleans staged objects when preview PDF storage fails", async () => {
    h.selectQueue.push([estimate], [estimate], [business], [], []);
    h.failPdfUpload = true;

    await previewRequest().expect(409);

    expect(h.inserts).toHaveLength(0);
    expect(h.sent).toHaveLength(0);
    expect(h.deleteCalls).toHaveLength(0);
  });

  it("sends the exact reviewed archived PDF and records provider acceptance", async () => {
    queueInitialSend();
    const response = await sendRequest().expect(200);
    expect(response.body.status).toBe("accepted");
    expect(h.sent).toHaveLength(1);
    expect(Buffer.from(h.sent[0].attachment.base64Data, "base64")).toEqual(Buffer.from("exact-original-quote-pdf"));
    expect(h.pdfGenerations).toBe(0);
    expect(h.uploadCalls).toHaveLength(0);
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
    const reviewed = revision();
    h.selectQueue.push([], [estimate], [], [business], [], [reviewed], [reviewed]);
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
    expect(h.deleteCalls).toHaveLength(0);
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

  it("does not create a send attempt when the reviewed PDF cannot be loaded", async () => {
    queueInitialSend();
    h.failPdfDownload = true;
    const response = await sendRequest().expect(409);
    expect(h.sent).toHaveLength(0);
    expect(h.inserts).toHaveLength(0);
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
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts.some(event => event.eventType === "work_authorization")).toBe(false);
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
