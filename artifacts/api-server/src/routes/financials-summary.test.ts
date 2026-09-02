import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const fixture = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  consumed: 0,
  missing: [] as number[],
  poolMap: new Map<number, { splitPool: number }>(),
}));

vi.mock("@workspace/db", () => {
  function selectChain() {
    const chain: any = {
      from: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        const slot = fixture.consumed++;
        const result = fixture.selectQueue.shift();
        if (!result) {
          fixture.missing.push(slot);
          return Promise.reject(new Error(`missing queued query slot [${slot}]`)).then(resolve, reject);
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return chain;
  }
  return { db: { select: () => selectChain() } };
});

vi.mock("../lib/business-scope.js", () => ({
  requestedBusiness: async () => null,
  invalidBusinessScope: () => false,
  belongsToBusiness: () => true,
}));

vi.mock("../lib/allocation.js", () => ({
  computeAllocationSplitPool: vi.fn(),
  computeSubOwed: vi.fn(),
  computeAllocationSplitPools: async () => fixture.poolMap,
}));

vi.mock("./guards", () => ({ getRequestUser: () => null }));

const { default: jobsRouter } = await import("./jobs");
const app = express();
app.use(express.json());
app.use("/jobs", jobsRouter);

beforeEach(() => {
  fixture.selectQueue.length = 0;
  fixture.consumed = 0;
  fixture.missing.length = 0;
  fixture.poolMap = new Map();
});

afterEach(() => {
  expect(fixture.missing).toHaveLength(0);
  expect(fixture.selectQueue).toHaveLength(0);
});

describe("GET /jobs/financials-summary", () => {
  it("excludes closed jobs, applies linked Owner Withdrawals, and preserves unavailable balances", async () => {
    fixture.poolMap = new Map([
      [1, { splitPool: 1000 }],
      // Job 2 intentionally has no pool, so allocation and Owner Pay remain unknown.
    ]);
    fixture.selectQueue.push(
      [
        { id: 1, jobNumber: 101, title: "Active known", status: "in_progress", clientName: "A", clientId: 1, businessId: 1, businessLine: null },
        { id: 2, jobNumber: 102, title: "Active partial", status: "completed", clientName: "B", clientId: 2, businessId: 1, businessLine: null },
        { id: 3, jobNumber: 103, title: "Closed", status: "closed", clientName: "C", clientId: 3, businessId: 1, businessLine: null },
      ],
      [
        { id: 11, jobId: 1, status: "paid", total: "1000", amountPaid: "1000", createdAt: new Date() },
        { id: 12, jobId: 2, status: "sent", total: "500", amountPaid: "0", createdAt: new Date() },
        { id: 13, jobId: 3, status: "sent", total: "9999", amountPaid: "0", createdAt: new Date() },
      ],
      [
        {
          jobId: 2, subcontractorId: 20, subName: "Allocation Sub", compensationType: "allocation",
          amountOwed: null, fixedAmount: null, allocationPct: "50", amountPaidColumn: null,
          paymentStatus: "unpaid", computedOwed: "0", ledgerPaid: "0",
        },
      ],
      [
        { jobId: 1, amount: "-100" },
        { jobId: 3, amount: "-5000" },
      ],
      [],
      [{ ownerSplitPct: "50", taxReservePct: "25" }],
    );

    const response = await request(app).get("/jobs/financials-summary");

    expect(response.status).toBe(200);
    expect(response.body.jobs.map((row: any) => row.job.id)).toEqual([1, 2]);
    expect(response.body.totals.activeJobs).toBe(2);

    const known = response.body.jobs.find((row: any) => row.job.id === 1);
    expect(known.ownerPay.earned).toBe(375);
    expect(known.ownerPay.paid).toBe(100);
    expect(known.ownerPay.remaining).toBe(275);

    const partial = response.body.jobs.find((row: any) => row.job.id === 2);
    expect(partial.subcontractors.available).toBe(false);
    expect(partial.subcontractors.totalOwed).toBeNull();
    expect(partial.subcontractors.details[0].amountOwed).toBeNull();
    expect(partial.subcontractors.details[0].balance).toBeNull();
    expect(partial.ownerPay.supported).toBe(false);
    expect(partial.ownerPay.remaining).toBeNull();

    expect(response.body.totals.ownerPayOwed).toBe(275);
    expect(response.body.totals.ownerPayUnknownJobs).toBe(1);
    expect(response.body.totals.subcontractorsUnknownJobs).toBe(1);
    expect(response.body.dataStatus).toBe("partial");
    expect(response.body.warnings).toEqual(expect.arrayContaining([
      expect.stringMatching(/unavailable subcontractor balances/i),
      expect.stringMatching(/unavailable Owner Pay balances/i),
    ]));
  });
});