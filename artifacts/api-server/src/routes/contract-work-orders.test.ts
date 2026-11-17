import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const f = vi.hoisted(() => ({
  dbSelect: [] as unknown[][],
  txSelect: [] as unknown[][],
  insertedRows: [] as Record<string, unknown>[],
  updatedOrders: [] as Record<string, unknown>[],
  txCount: 0,
}));

vi.mock("@workspace/db", () => {
  function chain(queue: unknown[][]) {
    const result: any = {
      from: () => result, innerJoin: () => result, leftJoin: () => result,
      where: () => result, orderBy: () => result, limit: () => result,
      for: () => result,
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
        const next = queue.shift();
        if (!next) return Promise.reject(new Error("Unexpected database select")).then(resolve, reject);
        return Promise.resolve(next).then(resolve, reject);
      },
    };
    return result;
  }
  return {
    db: {
      select: () => chain(f.dbSelect),
      transaction: async (work: (tx: any) => Promise<unknown>) => {
        f.txCount += 1;
        return work({
          select: () => chain(f.txSelect),
          insert: () => ({
            values: (value: Record<string, unknown>) => {
              f.insertedRows.push(value);
              return { returning: async () => [{ id: 900 + f.insertedRows.length }] };
            },
          }),
          update: () => ({
            set: (value: Record<string, unknown>) => ({
              where: async () => { f.updatedOrders.push(value); },
            }),
          }),
        });
      },
    },
  };
});

vi.mock("../lib/business-scope.js", () => ({
  requestedBusiness: async () => ({ id: 7, slug: "general_contracting" }),
  resolveMutationBusiness: async () => ({ ok: true, explicit: true, business: { id: 7, slug: "general_contracting" } }),
  sameLegalBusiness: async () => true,
}));
vi.mock("../lib/property-access.js", () => ({ hasPropertyPermission: () => true }));
vi.mock("./guards", () => ({ getRequestUserId: () => "user_test" }));

const { default: router } = await import("./contract-work-orders");
const app = express();
app.use(express.json());
app.use("/jobs", router);

const orderBase = {
  id: 44, businessId: 7, programId: 6, externalOrderNumber: "SH-100",
  title: "Install entry door", scope: null, homeownerContactId: null,
  propertyId: null, agreedPrice: null, status: "pending_review", jobId: null,
};

beforeEach(() => {
  f.dbSelect.length = 0;
  f.txSelect.length = 0;
  f.insertedRows.length = 0;
  f.updatedOrders.length = 0;
  f.txCount = 0;
});
afterEach(() => {
  expect(f.dbSelect).toHaveLength(0);
  expect(f.txSelect).toHaveLength(0);
});

describe("contract work-order acceptance", () => {
  it("creates one payer-linked job and returns the same job on retry", async () => {
    const acceptedOrder = { ...orderBase, status: "accepted", jobId: 901 };
    f.txSelect.push(
      [orderBase],
      [{
        id: 6, businessId: 7, payerClientId: 12, active: true,
        requiresInstallationPhotos: true, requiresCompletionDocumentation: true,
      }],
      [{ maxNum: 510 }],
      [],
      [],
    );
    f.dbSelect.push([{
      id: 44, businessId: 7, programId: 6, programName: "SageHome install",
      payerClientId: 12, payerName: "SageHome Brands", externalOrderNumber: "SH-100",
      title: "Install entry door", scope: null, homeownerContactId: null,
      homeownerName: null, propertyId: null, propertyLabel: null, propertyAddress: null,
      agreedPrice: null, status: "accepted", jobId: 901, acceptedAt: new Date().toISOString(),
      declineReason: null, cancellationReason: null,
    }]);
    const first = await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "accept" }).expect(200);
    expect(first.body.jobId).toBe(901);
    expect(first.body.payerName).toBe("SageHome Brands");
    expect(f.insertedRows).toHaveLength(5);
    expect(f.insertedRows[0]).toMatchObject({ clientId: 12, businessId: 7, title: "Install entry door" });
    expect(f.insertedRows[1]).toMatchObject({
      templateName: "Contract Work Order Completion",
      shareEnabled: false,
    });
    expect(f.insertedRows[2]).toMatchObject({ name: "Contract completion — SH-100" });
    expect(f.insertedRows.slice(3).map(row => row.title)).toEqual([
      "Capture installation photos",
      "Upload required completion documentation",
    ]);

    f.txSelect.push([acceptedOrder]);
    f.dbSelect.push([{ ...first.body, status: "accepted", jobId: 901 }]);
    const retry = await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "accept" }).expect(200);
    expect(retry.body.jobId).toBe(901);
    expect(f.insertedRows).toHaveLength(5);
    expect(f.txCount).toBe(2);
  });

  it("adds the contract completion section without replacing an existing job checklist", async () => {
    f.txSelect.push(
      [orderBase],
      [{
        id: 6, businessId: 7, payerClientId: 12, active: true,
        requiresInstallationPhotos: true, requiresCompletionDocumentation: true,
      }],
      [{ maxNum: 510 }],
      [{ id: 733 }],
      [],
    );
    f.dbSelect.push([{
      id: 44, businessId: 7, programId: 6, programName: "SageHome install",
      payerClientId: 12, payerName: "SageHome Brands", externalOrderNumber: "SH-100",
      title: "Install entry door", scope: null, homeownerContactId: null,
      homeownerName: null, propertyId: null, propertyLabel: null, propertyAddress: null,
      agreedPrice: null, status: "accepted", jobId: 901, acceptedAt: new Date().toISOString(),
      declineReason: null, cancellationReason: null,
    }]);

    await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "accept" }).expect(200);

    expect(f.insertedRows).toHaveLength(4);
    expect(f.insertedRows[1]).toMatchObject({
      jobChecklistId: 733,
      name: "Contract completion — SH-100",
    });
    expect(f.insertedRows.slice(2).map(row => row.title)).toEqual([
      "Capture installation photos",
      "Upload required completion documentation",
    ]);
  });

  it("does not infer completion requirements for an unconfigured client program", async () => {
    f.txSelect.push(
      [orderBase],
      [{
        id: 6, businessId: 7, payerClientId: 12, active: true,
        requiresInstallationPhotos: false, requiresCompletionDocumentation: false,
      }],
      [{ maxNum: 510 }],
    );
    f.dbSelect.push([{
      id: 44, businessId: 7, programId: 6, programName: "Other client",
      payerClientId: 12, payerName: "Other client", externalOrderNumber: "OC-200",
      title: "Install entry door", scope: null, homeownerContactId: null,
      homeownerName: null, propertyId: null, propertyLabel: null, propertyAddress: null,
      agreedPrice: null, status: "accepted", jobId: 901, acceptedAt: new Date().toISOString(),
      declineReason: null, cancellationReason: null,
    }]);

    await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "accept" }).expect(200);

    expect(f.insertedRows).toHaveLength(1);
    expect(f.insertedRows[0]).toMatchObject({ title: "Install entry door", clientId: 12 });
  });

  it("declines without creating a job", async () => {
    f.txSelect.push([orderBase]);
    f.dbSelect.push([{
      id: 44, businessId: 7, programId: 6, programName: "SageHome install",
      payerClientId: 12, payerName: "SageHome Brands", externalOrderNumber: "SH-100",
      title: "Install entry door", scope: null, homeownerContactId: null, homeownerName: null,
      propertyId: null, propertyLabel: null, propertyAddress: null, agreedPrice: null,
      status: "declined", jobId: null, acceptedAt: null, declineReason: "Outside area",
      cancellationReason: null,
    }]);
    const response = await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "decline", reason: "Outside area" }).expect(200);
    expect(response.body.status).toBe("declined");
    expect(f.insertedRows).toHaveLength(0);
    expect(f.updatedOrders[0]).toMatchObject({ status: "declined", declineReason: "Outside area" });
  });

  it("requires a reason and records cancellation without deleting the job", async () => {
    const acceptedOrder = { ...orderBase, status: "accepted", jobId: 901 };
    await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "cancel" }).expect(400);
    f.txSelect.push([acceptedOrder]);
    f.dbSelect.push([{
      id: 44, businessId: 7, programId: 6, programName: "SageHome install",
      payerClientId: 12, payerName: "SageHome Brands", externalOrderNumber: "SH-100",
      title: "Install entry door", scope: null, homeownerContactId: null, homeownerName: null,
      propertyId: null, propertyLabel: null, propertyAddress: null, agreedPrice: null,
      status: "cancelled", jobId: 901, acceptedAt: new Date().toISOString(),
      declineReason: null, cancellationReason: "Customer rescheduled",
    }]);
    const response = await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "cancel", reason: "Customer rescheduled" }).expect(200);
    expect(response.body.status).toBe("cancelled");
    expect(response.body.jobId).toBe(901);
    expect(f.insertedRows).toHaveLength(0);
    expect(f.updatedOrders[0]).toMatchObject({ status: "cancelled", cancellationReason: "Customer rescheduled" });
  });

  it("does not expose a work order outside the selected business", async () => {
    f.txSelect.push([]);
    await request(app).post("/jobs/contract-work-orders/44/decision?businessId=7")
      .send({ decision: "accept" }).expect(404);
    expect(f.insertedRows).toHaveLength(0);
    expect(f.dbSelect).toHaveLength(0);
  });
});
