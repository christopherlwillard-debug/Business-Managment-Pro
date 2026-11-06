import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  signatureValid: true,
  verify: vi.fn(() => true),
}));

vi.mock("../lib/square", () => ({
  verifySquareWebhookSignature: h.verify,
}));

vi.mock("@workspace/db", () => ({ db: {} }));
vi.mock("@workspace/db/schema", () => ({
  invoicesTable: {},
  quickChargesTable: {},
  prospectsTable: {},
  estimatesTable: {},
  prospectEventsTable: {},
  otherIncomeTable: {},
  squarePaymentsTable: {},
  clientsTable: {},
  depositSubmissionsTable: {},
  businessesTable: {},
}));

const { default: squareWebhookRouter, calculateSquareInvoicePayment } = await import("./square-webhook");
const app = express();
app.use(express.json({
  verify: (req, _res, buffer) => {
    (req as typeof req & { rawBody?: string }).rawBody = buffer.toString("utf8");
  },
}));
app.use("/", squareWebhookRouter);

const originalNodeEnv = process.env["NODE_ENV"];
const originalSignatureKey = process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"];
const rawPendingEvent = `{
  "type": "payment.updated",
  "data": {
    "object": {
      "payment": {
        "id": "payment-1",
        "status": "PENDING"
      }
    }
  }
}`;

beforeEach(() => {
  process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"] = "test-signature-key";
  process.env["NODE_ENV"] = "test";
  h.signatureValid = true;
  h.verify.mockReset();
  h.verify.mockImplementation(() => h.signatureValid);
});

afterEach(() => {
  if (originalSignatureKey === undefined) delete process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"];
  else process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"] = originalSignatureKey;
  if (originalNodeEnv === undefined) delete process.env["NODE_ENV"];
  else process.env["NODE_ENV"] = originalNodeEnv;
});

describe("Square webhook signature boundary", () => {
  it("rejects a missing signature when a verification key is configured", async () => {
    const response = await request(app)
      .post("/")
      .set("Content-Type", "application/json")
      .send(rawPendingEvent);

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/missing.*signature/i);
    expect(h.verify).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature before processing the event", async () => {
    h.signatureValid = false;
    const response = await request(app)
      .post("/")
      .set("Content-Type", "application/json")
      .set("x-square-hmacsha256-signature", "invalid")
      .send(rawPendingEvent);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/invalid.*signature/i);
    expect(h.verify).toHaveBeenCalledOnce();
  });

  it("verifies the exact raw request body rather than re-serialized JSON", async () => {
    const response = await request(app)
      .post("/")
      .set("Content-Type", "application/json")
      .set("x-square-hmacsha256-signature", "valid")
      .send(rawPendingEvent);

    expect(response.status).toBe(200);
    expect(h.verify).toHaveBeenCalledWith(expect.objectContaining({
      signatureKey: "test-signature-key",
      rawBody: rawPendingEvent,
      headerSignature: "valid",
    }));
  });

  it("fails closed in production when the webhook signature key is missing", async () => {
    delete process.env["SQUARE_WEBHOOK_SIGNATURE_KEY"];
    process.env["NODE_ENV"] = "production";

    const response = await request(app)
      .post("/")
      .set("Content-Type", "application/json")
      .send(rawPendingEvent);

    expect(response.status).toBe(503);
    expect(response.body.error).toMatch(/not configured/i);
    expect(h.verify).not.toHaveBeenCalled();
  });
});


describe("Square invoice receipt allocation", () => {
  it("keeps an underpaid invoice partial instead of marking it paid", () => {
    expect(calculateSquareInvoicePayment("500.00", "0.00", 12500)).toEqual({
      amountPaid: "125.00",
      status: "partiallyPaid",
    });
  });

  it("marks an invoice paid when the new receipt covers the remaining balance", () => {
    expect(calculateSquareInvoicePayment("500.00", "125.00", 37500)).toEqual({
      amountPaid: "500.00",
      status: "paid",
    });
  });

  it("adds successive receipts using integer cents", () => {
    expect(calculateSquareInvoicePayment("19.99", "9.99", 1000)).toEqual({
      amountPaid: "19.99",
      status: "paid",
    });
  });

  it("caps invoice allocation at the invoice total when Square reports an overpayment", () => {
    expect(calculateSquareInvoicePayment("100.00", "75.00", 5000)).toEqual({
      amountPaid: "100.00",
      status: "paid",
    });
  });

  it("rejects invalid totals, prior balances, and payment amounts", () => {
    expect(calculateSquareInvoicePayment("0.00", "0.00", 100)).toBeNull();
    expect(calculateSquareInvoicePayment("100.00", "-1.00", 100)).toBeNull();
    expect(calculateSquareInvoicePayment("100.00", "0.00", 0)).toBeNull();
    expect(calculateSquareInvoicePayment("not-money", "0.00", 100)).toBeNull();
    expect(calculateSquareInvoicePayment("100.00", "0.00", 1.5)).toBeNull();
  });
});
