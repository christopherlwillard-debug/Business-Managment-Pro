import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { ownerOnlyInvoiceHistory } from "../lib/invoiceHistoryAccess.js";

function makeApp() {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).user = { id: req.header("x-test-user") ?? "staff" };
    next();
  });
  app.get("/invoice/:id/communications", ownerOnlyInvoiceHistory(async () => "owner"), (_req, res) => res.json({ events: [] }));
  return app;
}

describe("owner-only invoice communication history", () => {
  afterEach(() => vi.restoreAllMocks());

  it("allows the owner to read communication history", async () => {
    const response = await request(makeApp()).get("/invoice/41/communications").set("x-test-user", "owner");
    expect(response.status).toBe(200);
  });

  it("denies approved staff from reading communication history", async () => {
    const response = await request(makeApp()).get("/invoice/41/communications").set("x-test-user", "staff");
    expect(response.status).toBe(403);
  });
});
