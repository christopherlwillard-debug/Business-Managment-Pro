import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({
  selectResults: [] as any[][],
  updates: [] as any[],
  inserts: [] as any[],
}));

vi.mock("@workspace/db", () => {
  const selectChain: any = {};
  for (const method of ["from", "leftJoin", "where", "orderBy", "limit", "for"]) {
    selectChain[method] = () => selectChain;
  }
  selectChain.then = (resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(h.selectResults.shift() ?? []).then(resolve, reject);

  const db: any = {
    select: () => selectChain,
    update: () => ({
      set: (values: any) => {
        h.updates.push(values);
        const chain: any = {};
        chain.where = () => chain;
        chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve().then(resolve, reject);
        return chain;
      },
    }),
    insert: () => ({
      values: (values: any) => {
        h.inserts.push(values);
        return { returning: () => Promise.resolve([{ id: 91 }]) };
      },
    }),
    transaction: (callback: (tx: any) => Promise<unknown>) => callback(db),
  };
  return { db };
});

import materialListsRouter from "./material-lists";

function testApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "user-1" };
    next();
  });
  app.use("/api/material-lists", materialListsRouter);
  return app;
}

describe("material-list invoice assignment", () => {
  beforeEach(() => {
    h.selectResults = [];
    h.updates = [];
    h.inserts = [];
  });

  it("requires confirmation before moving materials off a sent invoice", async () => {
    h.selectResults = [
      [], // No legacy assignments to initialize.
      [{ id: 1, name: "Howard materials", jobId: 10, userId: "user-1", invoiceId: 20 }],
      [{ clientId: 5, businessId: 1 }],
      [{
        id: 20, invoiceNumber: "Wil-1055", status: "sent", clientId: 5,
        businessId: 1, jobTitle: "Howard",
      }],
      [{
        id: 30, invoiceNumber: "Wil-1100", status: "draft", clientId: 5,
        businessId: 1, jobTitle: "Howard - separate invoice",
      }],
    ];

    const response = await request(testApp())
      .post("/api/material-lists/1/attach-to-invoice")
      .send({ invoiceId: 30, confirmAfterFinalized: false });

    expect(response.status).toBe(409);
    expect(response.body.confirmationRequired).toBe(true);
    expect(response.body.sourceInvoiceLabel).toContain("Wil-1055");
    expect(response.body.destinationInvoiceLabel).toContain("Wil-1100");
    expect(h.updates).toHaveLength(0);
    expect(h.inserts).toHaveLength(0);
  });

  it("allows an explicit cross-job assignment for the same client", async () => {
    h.selectResults = [
      [], // No legacy assignments to initialize.
      [{ id: 1, name: "Howard materials", jobId: 10, userId: "user-1", invoiceId: null }],
      [{ clientId: 5, businessId: 1 }],
      [{
        id: 30, invoiceNumber: "Wil-1100", status: "draft", clientId: 5,
        businessId: 1, jobTitle: "Howard - separate invoice",
      }],
      [{
        id: 30, status: "draft", lineItems: [{ id: 1, description: "Labor", quantity: 1, unitPrice: 100 }],
        taxRate: "0",
      }],
      [{ id: 1, markup: "40" }],
      [{ id: 12, listId: 1, unitCostSnapshot: "10", qty: "2" }],
    ];

    const response = await request(testApp())
      .post("/api/material-lists/1/attach-to-invoice")
      .send({ invoiceId: 30, confirmAfterFinalized: false });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      materialListId: 1,
      invoiceId: 30,
      previousInvoiceId: null,
      changed: true,
    });
    expect(h.updates[0]).toMatchObject({ invoiceId: 30, invoiceAssignmentInitialized: true });
    expect(h.updates[1].lineItems).toContainEqual(expect.objectContaining({
      description: "Materials",
      unitPrice: 28,
      source: "material",
    }));
    expect(h.inserts[0]).toMatchObject({
      action: "attach",
      previousInvoiceId: null,
      destinationInvoiceId: 30,
      materialListNameSnapshot: "Howard materials",
    });
  });

  it("rejects an invoice belonging to a different client without writing", async () => {
    h.selectResults = [
      [],
      [{ id: 1, name: "Howard materials", jobId: 10, userId: "user-1", invoiceId: null }],
      [{ clientId: 5, businessId: 1 }],
      [{
        id: 30, invoiceNumber: "Wil-1100", status: "draft", clientId: 6,
        businessId: 1, jobTitle: "Different client",
      }],
    ];

    const response = await request(testApp())
      .post("/api/material-lists/1/attach-to-invoice")
      .send({ invoiceId: 30, confirmAfterFinalized: false });

    expect(response.status).toBe(409);
    expect(h.updates).toHaveLength(0);
    expect(h.inserts).toHaveLength(0);
  });
});
