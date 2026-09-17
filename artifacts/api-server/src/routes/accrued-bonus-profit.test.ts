// Integration tests: accrued bonus flows correctly through the profit waterfall
//
// Task #1290: The accrued_bonus column on job_subcontractors was added in Task #1287
// to let Willard save a bonus before recording the actual cash payment. This bonus
// must appear in subLaborCost immediately — before and after a payment is recorded —
// and must never be double-counted.
//
// Coverage:
//   A. PATCH /jobs/:jobId/sub-payment-draft/:subId — saves fields, rejects bad input
//   B. GET  /jobs/:id/profit — subLaborCost = hoursLaborCost + accruedBonus
//   C. GET  /jobs/profit-summary — same invariant for the batch endpoint
//   D. No double-count — sub_payment_records rows for hourly subs are excluded from the
//      profit query (WHERE compType IN ('fixed','allocation')), so paying an hourly sub
//      after saving a draft does not add the bonus a second time
//
// DB layer fully mocked — no real connection required.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { calculateJobProfit } from "../lib/job-profit.js";
import { CANONICAL_JOB_PROFIT_RESPONSE_VERSION } from "../lib/job-profit.js";
import { RoutingEngine } from "../lib/routing-engine.js";

// ── Hoisted mutable state ─────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  updates:     [] as any[],
  inserts:     [] as any[],
  allocationPools: new Map<number, number>(),
  consumedSlots: 0,
  missingSlots: [] as number[],
  scenario: "no request",
}));

// ── Mock @workspace/db ────────────────────────────────────────────────────────
// The chain is thenable so `await db.select()...` resolves by popping the
// next queued result when Promise.all triggers .then() in creation order.
vi.mock("@workspace/db", () => {
  function makeChain() {
    const c: any = {
      from:      () => c,
      where:     () => c,
      leftJoin:  () => c,
      innerJoin: () => c,
      orderBy:   () => c,
      groupBy:   () => c,
      limit:     () => c,
      then(resolve: (v: any) => any, reject: (e: any) => any) {
        const slot = h.consumedSlots++;
        const queued = h.selectQueue.shift();
        if (queued === undefined) {
          h.missingSlots.push(slot);
          return Promise.reject(new Error(
            `[${h.scenario}] missing queued query slot [${slot}]`,
          )).then(resolve, reject);
        }
        return Promise.resolve(queued).then(resolve, reject);
      },
    };
    return c;
  }

  return {
    db: {
      select: () => makeChain(),
      delete: () => ({ where: () => Promise.resolve() }),
      transaction: async (callback: (tx: any) => Promise<void>) => callback({
        select: () => makeChain(),
        update: (table: any) => ({
          set: (data: any) => {
            h.updates.push(data);
            return { where: () => Promise.resolve() };
          },
        }),
        delete: () => ({ where: () => Promise.resolve() }),
      }),
      update: () => ({
        set: (data: any) => {
          h.updates.push(data);
          return {
            where: () => ({
              returning: () => Promise.resolve([{
                id: 99,
                ...data,
                amount: data.amount ?? "0.00",
                estimatedAmount: data.estimatedAmount ?? null,
              }]),
            }),
          };
        },
      }),
      insert: () => ({
        values: (data: any) => {
          h.inserts.push(data);
          return {
            returning: () => Promise.resolve([{
              id: 99,
              ...data,
            }]),
          };
        },
      }),
    },
  };
});

// ── Stub sibling modules so jobs.ts can be imported ──────────────────────────
vi.mock("./material-lists",            () => ({ syncMaterialsToJobInvoice: vi.fn() }));
vi.mock("../lib/allocation.js",        () => ({
  calculateAllocationSplitPool: (input: {
    revenue: number;
    directExpenses: number;
    allocatedExpenses: number;
    subLaborCost: number;
    growthReservePct: number;
  }) => {
    const expenses = input.directExpenses + input.allocatedExpenses;
    const income = Math.max(0, input.revenue - expenses);
    const growthReserve = income * (Math.max(0, input.growthReservePct) / 100);
    return {
      revenue: input.revenue,
      expenses,
      subLaborCost: input.subLaborCost,
      growthReservePct: Math.max(0, input.growthReservePct),
      growthReserve,
      splitPool: Math.max(0, income - growthReserve - input.subLaborCost),
    };
  },
  computeAllocationSplitPool: vi.fn(async (jobId: number) => ({
    revenue: 0,
    expenses: 0,
    subLaborCost: 0,
    growthReservePct: 5,
    growthReserve: 0,
    splitPool: h.allocationPools.get(jobId) ?? 0,
  })),
  computeAllocationSplitPools: vi.fn().mockResolvedValue(new Map()),
  computeSubOwed: vi.fn(),
}));
vi.mock("./invoices",                  () => ({ calcInvoice: vi.fn(), buildInvoiceQuery: vi.fn(), fmt: (v: any) => String(v) }));
vi.mock("../lib/productionBilling.js", () => ({ buildProductionLineItems: vi.fn(), ensureProductionBillingSeed: vi.fn() }));

const { default: jobsRouter } = await import("./jobs");
const { default: subcontractorsRouter } = await import("./subcontractors");

const app = express();
app.use(express.json());
app.use((_req, _res, next) => {
  h.scenario = `${_req.method} ${_req.path}`;
  (_req as any).user = { id: 1, claims: { sub: "user_1" } };
  next();
});
app.use("/jobs", jobsRouter);
app.use("/subcontractors", subcontractorsRouter);

beforeEach(() => {
  h.selectQueue.length = 0;
  h.updates.length = 0;
  h.inserts.length = 0;
  h.allocationPools.clear();
  h.consumedSlots = 0;
  h.missingSlots.length = 0;
  h.scenario = "no request";
});

afterEach(() => {
  expect(h.missingSlots, `[${h.scenario}] missing queued query slot(s)`).toHaveLength(0);
  expect(
    h.selectQueue,
    `[${h.scenario}] unconsumed queued query slot(s) after ${h.consumedSlots} consumed`,
  ).toHaveLength(0);
  vi.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Push the select results that GET /jobs/:id/profit issues:
 *   [0] invoices      [1] other income [2] expenses [3] job allocations
 *   [4] mileage reimbursement [5] active spr rows [6] reversed spr rows
 *   [7] hours cost [8] hours cnt [9] hourly payment fallback [10] accrued bonus
 *   [11-13] fuel inputs [14] settings
 */
function pushProfitSelects(opts: {
  invoices?:       { total: string; status: string }[];
  otherIncome?:    { amount: string }[];
  expenses?:       any[];
  mileageReimbursement?: { id: number; amount: string; recipientType: string; recipientName: string };
  sprRows?:        { compType: string; total: string }[];
  reversedSprRows?: { compType: string; total: string }[];
  hoursLaborCost?: string;
  totalHours?:     string;
  hourlyPaymentFallback?: string;
  accruedBonus?:   string;
  fuelSettings?:   { companyAddress?: string | null; companyCity?: string | null; companyState?: string | null };
  fuelVehicle?:    { avgMpg: number; fuelPricePerGallon: string };
  fuelJob?:        { address: string; city: string; state: string; includeMileageInJobCosts?: boolean };
  fuelWorkDates?:  string[];
  fuelDailyLogDates?: string[];
}) {
  h.selectQueue.push(opts.invoices ?? []);
  h.selectQueue.push(opts.otherIncome ?? []);
  h.selectQueue.push(opts.expenses ?? []);
  h.selectQueue.push([]); // job-only allocations
  h.selectQueue.push(opts.mileageReimbursement ? [opts.mileageReimbursement] : []); // job-card mileage reimbursements
  h.selectQueue.push(opts.sprRows  ?? []);
  h.selectQueue.push(opts.reversedSprRows ?? []);
  h.selectQueue.push([{ total: opts.hoursLaborCost ?? "0" }]);
  h.selectQueue.push([{ total: opts.totalHours     ?? "0" }]);
  h.selectQueue.push(opts.hourlyPaymentFallback
    ? [{ total: opts.hourlyPaymentFallback }]
    : []);
  h.selectQueue.push([{ total: opts.accruedBonus   ?? "0" }]);
  // Fuel estimation performs settings, vehicle, and job selects after the
  // profit waterfall. When the job has addresses and a vehicle, it also reads
  // actual work dates before the financial-settings select.
  h.selectQueue.push(opts.fuelSettings ? [opts.fuelSettings] : []); // [9] settings
  h.selectQueue.push(opts.fuelVehicle ? [opts.fuelVehicle] : []); // [10] default vehicle
  h.selectQueue.push(opts.fuelJob ? [opts.fuelJob] : []); // [11] job address
  if (opts.fuelJob) {
    h.selectQueue.push((opts.fuelWorkDates ?? []).map(date => ({ date }))); // sub-hour dates
    h.selectQueue.push((opts.fuelDailyLogDates ?? []).map(date => ({ date }))); // daily-log dates
    h.selectQueue.push([]); // component work-session dates
  }
  h.selectQueue.push([]); // financial settings
}

/**
 * Push the select results that GET /jobs/profit-summary issues via Promise.all:
 *   [0] invoices  [1] other income [2] expenses [3] job allocations
 *   [4] hours cost rows [5] hours count rows [6] manHours [7] active spr rows
 *   [8] reversed spr rows [9] hourly payment fallback rows [10] accrued bonus rows
 *
 * All arrays are grouped by jobId on the real DB; the mock just returns the
 * raw rows — the route code maps them by jobId.
 */
function pushSummarySelects(opts: {
  jobId:          number;
  invoices?:      { jobId: number; total: string; status: string }[];
  otherIncome?:   { jobId: number; amount: string }[];
  expenses?:      any[];
  mileageReimbursement?: { jobId: number; amount: string };
  hoursLaborCost?: string;
  totalHours?:    string;
  sprRows?:       { jobId: number; compType: string; total: string }[];
  reversedSprRows?: { jobId: number; compType: string; total: string }[];
  hourlyPaymentFallbackRows?: { jobId: number; total: string }[];
  accruedBonus?:  string;
  fuelSettings?:  { companyAddress?: string | null; companyCity?: string | null; companyState?: string | null };
  fuelVehicle?:   { avgMpg: number; fuelPricePerGallon: string };
  fuelJob?:       { address: string; city: string; state: string; includeMileageInJobCosts?: boolean; workdayCount: number };
  includeMileageInJobCosts?: boolean;
}) {
  const { jobId } = opts;
  h.selectQueue.push(opts.invoices ?? []);
  h.selectQueue.push(opts.otherIncome ?? []);
  h.selectQueue.push(opts.expenses ?? []);
  h.selectQueue.push([]); // job-only allocations
  h.selectQueue.push(opts.mileageReimbursement ? [opts.mileageReimbursement] : []); // job-card mileage reimbursements
  // hours cost grouped by jobId
  h.selectQueue.push(opts.hoursLaborCost && opts.hoursLaborCost !== "0"
    ? [{ jobId, total: opts.hoursLaborCost }] : []);
  // hours count grouped by jobId
  h.selectQueue.push(opts.totalHours && opts.totalHours !== "0"
    ? [{ jobId, totalHours: opts.totalHours }] : []);
  // manHours from jobs table
  h.selectQueue.push([{ id: jobId, manHours: null, includeMileageInJobCosts: opts.includeMileageInJobCosts }]);
  h.selectQueue.push(opts.sprRows ?? []);
  h.selectQueue.push(opts.reversedSprRows ?? []);
  h.selectQueue.push(opts.hourlyPaymentFallbackRows ?? []);
  // accrued bonus grouped by jobId
  h.selectQueue.push(opts.accruedBonus && opts.accruedBonus !== "0"
    ? [{ jobId, total: opts.accruedBonus }] : []);
  // Fuel estimation performs three additional selects after the summary query.
  h.selectQueue.push(opts.fuelSettings ? [opts.fuelSettings] : []); // settings
  h.selectQueue.push(opts.fuelVehicle ? [opts.fuelVehicle] : []); // default vehicle
  h.selectQueue.push(opts.fuelJob ? [{
    id: opts.jobId,
    ...opts.fuelJob,
  }] : []); // job address/workday rows
}

function pushBatchSummarySelects(opts: {
  invoices?: { jobId: number; total: string; status: string }[];
  otherIncome?: { jobId: number; amount: string }[];
  expenses?: any[];
  mileageReimbursements?: { jobId: number; amount: string }[];
  hoursRows?: { jobId: number; total: string }[];
  hoursCountRows?: { jobId: number; totalHours: string }[];
  manHoursRows: { id: number; manHours: string | null; includeMileageInJobCosts?: boolean }[];
  sprRows?: { jobId: number; compType: string; total: string }[];
  sprPaymentRows?: { jobId: number; compType: "fixed" | "allocation"; amount: string; isReversal?: boolean | null }[];
  hourlyPaymentFallbackRows?: { jobId: number; total: string }[];
  accruedBonusRows?: { jobId: number; total: string }[];
  fuelSettings?: { companyAddress?: string | null; companyCity?: string | null; companyState?: string | null };
  fuelVehicle?: { avgMpg: number; fuelPricePerGallon: string };
  fuelJobs?: {
    id: number;
    address: string;
    city: string;
    state: string;
    includeMileageInJobCosts?: boolean;
    workdayCount: number;
  }[];
}) {
  h.selectQueue.push(opts.invoices ?? []);
  h.selectQueue.push(opts.otherIncome ?? []);
  h.selectQueue.push(opts.expenses ?? []);
  h.selectQueue.push([]); // job-only allocations
  h.selectQueue.push(opts.mileageReimbursements ?? []);
  h.selectQueue.push(opts.hoursRows ?? []);
  h.selectQueue.push(opts.hoursCountRows ?? []);
  h.selectQueue.push(opts.manHoursRows);
  if (opts.sprPaymentRows) {
    const activeTotals = new Map<string, { jobId: number; compType: "fixed" | "allocation"; total: number }>();
    for (const row of opts.sprPaymentRows) {
      // Mirrors the production query's `is_reversal IS NOT TRUE` predicate
      // before fixed/allocation rows are grouped by job and comp type.
      if (row.isReversal === true) continue;
      const key = `${row.jobId}:${row.compType}`;
      const current = activeTotals.get(key);
      if (current) {
        current.total += parseFloat(row.amount);
      } else {
        activeTotals.set(key, {
          jobId: row.jobId,
          compType: row.compType,
          total: parseFloat(row.amount),
        });
      }
    }
    h.selectQueue.push([...activeTotals.values()].map(row => ({
      jobId: row.jobId,
      compType: row.compType,
      total: row.total.toFixed(2),
    })));
    const reversedTotals = new Map<string, { jobId: number; compType: "fixed" | "allocation"; total: number }>();
    for (const row of opts.sprPaymentRows) {
      if (row.isReversal !== true) continue;
      const key = `${row.jobId}:${row.compType}`;
      const current = reversedTotals.get(key);
      if (current) {
        current.total += parseFloat(row.amount);
      } else {
        reversedTotals.set(key, {
          jobId: row.jobId,
          compType: row.compType,
          total: parseFloat(row.amount),
        });
      }
    }
    h.selectQueue.push([...reversedTotals.values()].map(row => ({
      jobId: row.jobId,
      compType: row.compType,
      total: row.total.toFixed(2),
    })));
  } else {
    h.selectQueue.push(opts.sprRows ?? []);
    h.selectQueue.push([]);
  }
  h.selectQueue.push(opts.hourlyPaymentFallbackRows ?? []);
  h.selectQueue.push(opts.accruedBonusRows ?? []);
  // Fuel enrichment reads one shared settings row, vehicle row, and all job addresses.
  h.selectQueue.push(opts.fuelSettings ? [opts.fuelSettings] : []);
  h.selectQueue.push(opts.fuelVehicle ? [opts.fuelVehicle] : []);
  h.selectQueue.push(opts.fuelJobs ?? []);
}

const SHARED_PROFIT_RESPONSE_FIELDS = [
  "grossInvoiced",
  "collected",
  "otherIncomeRevenue",
  "jobExpenses",
  "directExpenseTotal",
  "allocatedExpenseTotal",
  "mileageReimbursement",
  "estimatedFuelCost",
  "actualFuelCost",
  "auditTrailTotal",
  "tripTravelTotal",
  "tripMealsDeductible",
  "ownerDrawTaken",
  "payrollLinkedExcluded",
  "legacySubcontractorExpense",
  "subLaborCost",
  "allocPaid",
  "totalSubHours",
  "netProfit",
  "includedCostTotal",
  "profitBreakdown",
  "splitPool",
] as const;

function expectSharedProfitCalculationFields(body: unknown) {
  expect(body).toBeTruthy();
  for (const field of SHARED_PROFIT_RESPONSE_FIELDS) {
    expect(body).toHaveProperty(field);
  }
}

describe("job mileage reimbursement ownership and validation", () => {
  it("rejects a job owner change when an invoice is already linked", async () => {
    h.selectQueue.push(
      [{ id: 1, slug: "general_contracting" }], // param scope resolution
      [{ id: 7, businessId: 1, businessLine: "general_contracting" }], // param ownership gate
      [{ businessId: 2, businessLine: "asphalt_sealing" }], // handler's current owner
      [{ id: 1, slug: "general_contracting" }], // requested owner
      [{ id: 2, slug: "asphalt_sealing" }], // canonical current owner
      [{ id: 44 }], // linked invoice
    );

    const res = await request(app)
      .put("/jobs/7")
      .send({ businessLine: "general_contracting" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cannot be changed while invoices are linked/i);
    expect(h.updates).toHaveLength(0);
  });

  it("resets a removed subcontractor reimbursement recipient to the owner", async () => {
    h.selectQueue.push(
      [{ businessId: 1, businessLine: "general_contracting" }], // current job ownership
      [{ id: 1, slug: "general_contracting" }], // default mutation owner
      [{ id: 1, slug: "general_contracting" }], // canonical current owner
      [{ subcontractorId: 12 }, { subcontractorId: 13 }], // current assignments
      [], // recomputeSubPaid
      [{ id: 7, createdAt: new Date(), subcontractorId: null, subcontractorName: null }], // refreshed job
      [], // no source job row for the production-component projection
    );

    const res = await request(app)
      .put("/jobs/7")
      .send({ subcontractorIds: [13] });

    expect(res.status).toBe(200);
    expect(h.updates).toHaveLength(3);
    expect(h.updates[1]).toEqual({
      recipientType: "owner",
      recipientName: "Business owner",
      recipientSubcontractorId: null,
    });
  });

  it("returns 404 for a cross-business GET before reading the reimbursement", async () => {
    h.selectQueue.push(
      [{ id: 1, slug: "business-one" }],
      [{ id: 7, businessId: 2 }],
    );

    const res = await request(app)
      .get("/jobs/7/mileage-reimbursement?businessId=1");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/job not found/i);
  });

  it("returns 404 for a cross-business PUT without attempting a write", async () => {
    h.selectQueue.push(
      [{ id: 1, slug: "business-one" }],
      [{ id: 7, businessId: 2 }],
    );

    const res = await request(app)
      .put("/jobs/7/mileage-reimbursement")
      .query({ businessId: 1 })
      .send({ amount: 125, recipientType: "owner" });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/job not found/i);
    expect(h.updates).toHaveLength(0);
    expect(h.inserts).toHaveLength(0);
  });

  it("resolves a legacy businessLine before saving the reimbursement", async () => {
    h.selectQueue.push(
      [{ id: 7, businessId: null, businessLine: "business-one" }],
      [{ id: 1 }],
      [],
    );

    const res = await request(app)
      .put("/jobs/7/mileage-reimbursement")
      .send({ amount: 125, recipientType: "owner" });

    expect(res.status).toBe(200);
    expect(h.inserts[0]).toMatchObject({
      jobId: 7,
      businessId: 1,
      amount: "125.00",
    });
  });

  it("rejects an unowned job with an actionable business message", async () => {
    h.selectQueue.push([{ id: 7, businessId: null, businessLine: null }]);

    const res = await request(app)
      .put("/jobs/7/mileage-reimbursement")
      .send({ amount: 125, recipientType: "owner" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/assign this job to a business/i);
    expect(h.inserts).toHaveLength(0);
  });

  it.each([
    ["negative", -1],
    ["NaN", "not-a-number"],
    ["infinite", "Infinity"],
  ])("rejects a %s reimbursement amount", async (_label, amount) => {
    h.selectQueue.push([{ id: 7, businessId: 1 }]);

    const res = await request(app)
      .put("/jobs/7/mileage-reimbursement")
      .send({ amount, recipientType: "owner" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/zero or greater/i);
    expect(h.updates).toHaveLength(0);
    expect(h.inserts).toHaveLength(0);
  });

  it("rejects a blank manual recipient", async () => {
    h.selectQueue.push([{ id: 7, businessId: 1 }]);

    const res = await request(app)
      .put("/jobs/7/mileage-reimbursement")
      .send({ amount: 125, recipientType: "other", recipientName: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/recipient is required/i);
  });

  it.each([
    ["non-numeric", "abc"],
    ["zero", 0],
    ["fractional", 1.5],
    ["missing", null],
  ])("rejects an invalid subcontractor ID (%s)", async (_label, recipientSubcontractorId) => {
    h.selectQueue.push([{ id: 7, businessId: 1 }]);

    const res = await request(app)
      .put("/jobs/7/mileage-reimbursement")
      .send({
        amount: 125,
        recipientType: "subcontractor",
        recipientName: "Crew lead",
        recipientSubcontractorId,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid subcontractor/i);
  });

  it("rejects a subcontractor who is not assigned to the job", async () => {
    h.selectQueue.push(
      [{ id: 7, businessId: 1 }],
      [],
    );

    const res = await request(app)
      .put("/jobs/7/mileage-reimbursement")
      .send({
        amount: 125,
        recipientType: "subcontractor",
        recipientName: "Crew lead",
        recipientSubcontractorId: 12,
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not assigned to this job/i);
    expect(h.updates).toHaveLength(0);
    expect(h.inserts).toHaveLength(0);
  });

  it.each([
    ["owner", { recipientType: "owner" }, "Business owner", null],
    ["subcontractor", { recipientType: "subcontractor", recipientName: "Crew lead", recipientSubcontractorId: 12 }, "Crew lead", 12],
    ["manual", { recipientType: "other", recipientName: "  Fuel helper  " }, "Fuel helper", null],
  ])("keeps valid %s recipients editable", async (_label, body, expectedName, expectedSubcontractorId) => {
    h.selectQueue.push([{ id: 7, businessId: 1 }]);
    if (body.recipientType === "subcontractor") {
      h.selectQueue.push([{ subcontractorId: 12 }]);
    }
    h.selectQueue.push([{ id: 41 }]);

    const res = await request(app)
      .put("/jobs/7/mileage-reimbursement")
      .send({ amount: 125, ...body });

    expect(res.status).toBe(200);
    expect(h.updates[0]).toMatchObject({
      jobId: 7,
      businessId: 1,
      amount: "125.00",
      recipientName: expectedName,
      recipientSubcontractorId: expectedSubcontractorId,
    });
    expect(res.body.amount).toBe(125);
  });
});

describe("DELETE /subcontractors/:id — reimbursement ownership", () => {
  it("resets that subcontractor's reimbursement recipient while preserving its financial fields", async () => {
    h.selectQueue.push([]);
    const res = await request(app).delete("/subcontractors/12");

    expect(res.status).toBe(200);
    expect(res.body.reassignedJobs).toEqual([]);
    expect(h.updates).toHaveLength(6);
    expect(h.updates[5]).toEqual({
      recipientType: "owner",
      recipientName: "Business owner",
      recipientSubcontractorId: null,
    });
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PATCH /jobs/:jobId/sub-payment-draft/:subId — draft save", () => {

  it("returns 200 and writes all five draft columns when sub is assigned to the job", async () => {
    // Ownership check: sub IS on the job
    h.selectQueue.push([{ jobId: 1 }]);

    const res = await request(app)
      .patch("/jobs/1/sub-payment-draft/7")
      .send({
        bonusAmount:      75,
        bonusNote:        "performance bonus",
        advancementAmt:   20,
        paymentMethod:    "Zelle",
        paymentReference: "TX-12345",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const upd = h.updates[0];
    expect(upd.accruedBonus).toBe("75.00");
    expect(upd.accruedBonusNote).toBe("performance bonus");
    expect(upd.accruedAdvancement).toBe("20.00");
    expect(upd.paymentMethodDraft).toBe("Zelle");
    expect(upd.paymentReferenceDraft).toBe("TX-12345");
  });

  it("returns 404 when the sub is not assigned to the job", async () => {
    h.selectQueue.push([]); // ownership check returns nothing

    const res = await request(app)
      .patch("/jobs/1/sub-payment-draft/999")
      .send({ bonusAmount: 50 });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
    // No update should have been attempted
    expect(h.updates).toHaveLength(0);
  });

  it("returns 400 for a negative bonusAmount", async () => {
    // No ownership check queued — route should reject before hitting DB
    const res = await request(app)
      .patch("/jobs/1/sub-payment-draft/7")
      .send({ bonusAmount: -50 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-negative/i);
  });

  it("returns 400 for a negative advancementAmt", async () => {
    const res = await request(app)
      .patch("/jobs/1/sub-payment-draft/7")
      .send({ advancementAmt: -10 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-negative/i);
  });

  it("persists null values when clearing a previously saved draft", async () => {
    h.selectQueue.push([{ jobId: 1 }]);

    const res = await request(app)
      .patch("/jobs/1/sub-payment-draft/7")
      .send({
        bonusAmount:      null,
        bonusNote:        null,
        advancementAmt:   null,
        paymentMethod:    null,
        paymentReference: null,
      });

    expect(res.status).toBe(200);
    const upd = h.updates[0];
    expect(upd.accruedBonus).toBeNull();
    expect(upd.accruedBonusNote).toBeNull();
    expect(upd.accruedAdvancement).toBeNull();
    expect(upd.paymentMethodDraft).toBeNull();
    expect(upd.paymentReferenceDraft).toBeNull();
  });
});

describe("GET /jobs/:id/profit — accrued bonus included in subLaborCost", () => {
  it("uses the canonical post-hourly-worker split pool for Pope", async () => {
    h.allocationPools.set(58, 1575);
    pushProfitSelects({
      invoices: [{ total: "2500.00", status: "paid" }],
      hoursLaborCost: "0",
    });

    const res = await request(app).get("/jobs/58/profit");

    expect(res.status).toBe(200);
    expect(res.body.grossInvoiced).toBeCloseTo(2500, 2);
    expect(res.body.subLaborCost).toBe(0);
    expect(res.body.splitPool).toBeCloseTo(1575, 2);
  });

  it("adds accrued_bonus to hours-based labor cost", async () => {
    // 4h @ $50 = $200 hours + $75 bonus = $275 subLaborCost
    pushProfitSelects({
      hoursLaborCost: "200.00",
      totalHours:     "4.0",
      accruedBonus:   "75.00",
    });

    const res = await request(app).get("/jobs/1/profit");

    expect(res.status).toBe(200);
    expect(res.body.subLaborCost).toBeCloseTo(275);
    // netProfit = collected(0) - expenses(0) - subLaborCost(275) - allocPaid(0)
    expect(res.body.netProfit).toBeCloseTo(-275);
  });

  it("counts accrued_bonus even when no hours have been logged yet", async () => {
    // Sub assigned with a $100 bonus draft, but zero hours so far
    pushProfitSelects({ accruedBonus: "100.00" });

    const res = await request(app).get("/jobs/1/profit");

    expect(res.status).toBe(200);
    expect(res.body.subLaborCost).toBeCloseTo(100);
  });

  it("returns zero subLaborCost when neither hours nor accrued bonus exist", async () => {
    pushProfitSelects({});

    const res = await request(app).get("/jobs/1/profit");

    expect(res.status).toBe(200);
    expect(res.body.subLaborCost).toBe(0);
  });

  it("correctly reflects collected revenue minus labor cost in netProfit", async () => {
    // Revenue $1 000 collected, $200 hours labor, $75 bonus → netProfit = $725
    pushProfitSelects({
      invoices:       [{ total: "1000.00", status: "paid" }],
      hoursLaborCost: "200.00",
      totalHours:     "4.0",
      accruedBonus:   "75.00",
    });

    const res = await request(app).get("/jobs/1/profit");

    expect(res.status).toBe(200);
    expect(res.body.grossInvoiced).toBeCloseTo(1000);
    expect(res.body.subLaborCost).toBeCloseTo(275);
    expect(res.body.netProfit).toBeCloseTo(725);
  });

  it("includes explicitly job-linked other income once in revenue and profit", async () => {
    pushProfitSelects({
      invoices: [{ total: "1000.00", status: "paid" }],
      otherIncome: [{ amount: "250.00" }],
      expenses: [{ amount: "100.00", category: "Materials", countsTowardJobProfit: true }],
    });

    const res = await request(app).get("/jobs/1/profit");

    expect(res.status).toBe(200);
    expect(res.body.otherIncomeRevenue).toBeCloseTo(250);
    expect(res.body.grossInvoiced).toBeCloseTo(1250);
    expect(res.body.collected).toBeCloseTo(1250);
    expect(res.body.netProfit).toBeCloseTo(1150);
  });

  it("includes a saved owner reimbursement in job costs exactly once", async () => {
    pushProfitSelects({
      invoices: [{ total: "1000.00", status: "paid" }],
      mileageReimbursement: { id: 7, amount: "125.00", recipientType: "owner", recipientName: "Business owner" },
    });

    const res = await request(app).get("/jobs/1/profit");

    expect(res.status).toBe(200);
    expect(res.body.jobExpenses).toBeCloseTo(125);
    expect(res.body.netProfit).toBeCloseTo(875);
    expect(res.body.mileageReimbursement).toMatchObject({
      id: 7,
      amount: 125,
      recipientType: "owner",
      recipientName: "Business owner",
    });
    expectSharedProfitCalculationFields(res.body);
    expect(res.body.growthReservePct).toBeTypeOf("number");
    expect(res.body.ownerSplitPct).toBeTypeOf("number");
    expect(res.body.taxReservePct).toBeTypeOf("number");
  });

  it("does not add mileage reimbursement on top of an actual Fuel/Travel expense", async () => {
    pushProfitSelects({
      invoices: [{ total: "1000.00", status: "paid" }],
      expenses: [{ amount: "80.00", category: "Fuel/Travel", countsTowardJobProfit: true }],
      mileageReimbursement: { id: 8, amount: "125.00", recipientType: "other", recipientName: "A team member" },
    });

    const res = await request(app).get("/jobs/1/profit");

    expect(res.status).toBe(200);
    expect(res.body.jobExpenses).toBeCloseTo(80);
    expect(res.body.netProfit).toBeCloseTo(920);
    expect(res.body.mileageReimbursementApplied).toBe(false);
  });
});

describe("GET /jobs/:id/profit — no double-count after a payment is recorded", () => {

  it("does NOT add an hourly payment a second time when job-hour accrual already exists", async () => {
    // After pay-worker records $275 for an hourly sub, sub_payment_records has a row.
    // The hourly fallback query excludes it because matching job-hour rows exist.
    // subLaborCost should remain hours($200) + bonus($75) = $275, not $550.
    pushProfitSelects({
      sprRows:        [], // hourly payment excluded at DB level by compType filter
      hoursLaborCost: "200.00",
      totalHours:     "4.0",
      accruedBonus:   "75.00",
    });

    const res = await request(app).get("/jobs/1/profit");

    expect(res.status).toBe(200);
    expect(res.body.subLaborCost).toBeCloseTo(275); // NOT 550
  });

  it("uses a non-reversed hourly payment when no assignment amount or job hours exist", async () => {
    pushProfitSelects({
      invoices: [{ total: "1406.27", status: "paid" }],
      expenses: [{ amount: "387.57", category: "Tools/Equipment", countsTowardJobProfit: true }],
      hourlyPaymentFallback: "320.00",
    });

    const res = await request(app).get("/jobs/38/profit");

    expect(res.status).toBe(200);
    expect(res.body.subLaborCost).toBeCloseTo(320);
    expect(res.body.totalSubHours).toBe(0);
    expect(res.body.netProfit).toBeCloseTo(698.70);
  });

  it("adds a fixed-sub payment to subLaborCost without affecting the hourly accrued bonus", async () => {
    // Fixed sub paid $500 (in sprRows) + hourly sub has $75 accrued bonus.
    // No hours logged (hoursLaborCost = 0 → nonHoursCost uses sprFixedCost).
    // subLaborCost = $500 (fixed, from spr) + $75 (accrued bonus) = $575.
    pushProfitSelects({
      sprRows:        [{ compType: "fixed", total: "500.00" }],
      hoursLaborCost: "0",
      totalHours:     "0",
      accruedBonus:   "75.00",
    });

    const res = await request(app).get("/jobs/1/profit");

    expect(res.status).toBe(200);
    expect(res.body.subLaborCost).toBeCloseTo(575);
  });

  it("correctly counts hours cost + bonus after full payment without double-counting", async () => {
    // Full payment scenario:
    // - 10h @ $30/hr = $300 captured in job_sub_hours
    // - $50 bonus saved via draft (accrued_bonus = $50)
    // - Pay-worker records $350 net in sub_payment_records (NOT in profit calc for hourly)
    // Expected: subLaborCost = $300 + $50 = $350 (counted once, not $700)
    pushProfitSelects({
      sprRows:        [], // hourly payment filtered out
      hoursLaborCost: "300.00",
      totalHours:     "10.0",
      accruedBonus:   "50.00",
    });

    const res = await request(app).get("/jobs/1/profit");

    expect(res.status).toBe(200);
    expect(res.body.subLaborCost).toBeCloseTo(350);
  });
});

describe("GET /jobs/profit-summary — accrued bonus in batch subLaborCost", () => {

  it("keeps the confirmed historical Jobs 38 and 45 costs isolated", async () => {
    pushBatchSummarySelects({
      invoices: [
        { jobId: 38, total: "1406.27", status: "paid" },
        { jobId: 45, total: "182.27", status: "paid" },
      ],
      expenses: [
        { jobId: 38, id: 178, amount: "387.57", category: "Tools/Equipment", countsTowardJobProfit: true },
      ],
      hourlyPaymentFallbackRows: [{ jobId: 38, total: "320.00" }],
      manHoursRows: [
        { id: 38, manHours: null },
        { id: 45, manHours: null },
      ],
    });

    const res = await request(app).get("/jobs/profit-summary?jobIds=38,45");

    expect(res.status).toBe(200);
    expect(res.body[38].responseVersion).toBe(6);
    expect(res.body[38].grossInvoiced).toBeCloseTo(1406.27);
    expect(res.body[38].jobExpenses).toBeCloseTo(387.57);
    expect(res.body[38].subLaborCost).toBeCloseTo(320);
    expect(res.body[38].totalSubHours).toBe(0);
    expect(res.body[38].netProfit).toBeCloseTo(698.70);
    expect(res.body[45].responseVersion).toBe(6);
    expect(res.body[45].grossInvoiced).toBeCloseTo(182.27);
    expect(res.body[45].jobExpenses).toBe(0);
    expect(res.body[45].subLaborCost).toBe(0);
    expect(res.body[45].totalSubHours).toBe(0);
    expect(res.body[45].netProfit).toBeCloseTo(182.27);
    expect(res.body[38].subLaborCost).not.toBeCloseTo(res.body[45].subLaborCost);
    expect(res.body[38].subLaborCost).not.toBeCloseTo(4340);
    expect(res.body[45].subLaborCost).not.toBeCloseTo(4340);
  });

  it("keeps payroll advances in the shared calculation fields on both response paths", async () => {
    pushProfitSelects({
      invoices: [{ total: "1000.00", status: "paid" }],
      sprRows: [{ compType: "fixed", total: "600.00" }], // $500 pay + $100 advance
    });

    const perJobRes = await request(app).get("/jobs/1/profit");

    expect(perJobRes.status).toBe(200);
    expect(perJobRes.body.subLaborCost).toBeCloseTo(600);
    expect(perJobRes.body.includedCostTotal).toBeCloseTo(600);
    expect(perJobRes.body.profitBreakdown.includedCosts.subLabor).toBeCloseTo(600);
    expectSharedProfitCalculationFields(perJobRes.body);

    pushSummarySelects({
      jobId: 5,
      invoices: [{ jobId: 5, total: "1000.00", status: "paid" }],
      sprRows: [{ jobId: 5, compType: "fixed", total: "600.00" }], // $500 pay + $100 advance
    });

    const batchRes = await request(app).get("/jobs/profit-summary?jobIds=5");

    expect(batchRes.status).toBe(200);
    expect(batchRes.body[5].subLaborCost).toBeCloseTo(600);
    expect(batchRes.body[5].includedCostTotal).toBeCloseTo(600);
    expect(batchRes.body[5].profitBreakdown.includedCosts.subLabor).toBeCloseTo(600);
    expectSharedProfitCalculationFields(batchRes.body[5]);
  });

  it("excludes reversed fixed and allocation payouts consistently from both profit views", async () => {
    pushProfitSelects({
      invoices: [{ total: "1000.00", status: "paid" }],
      sprRows: [
        { compType: "fixed", total: "300.00" },
        { compType: "allocation", total: "200.00" },
      ],
      reversedSprRows: [
        { compType: "fixed", total: "900.00" },
        { compType: "allocation", total: "800.00" },
      ],
    });

    const detailRes = await request(app).get("/jobs/5/profit");

    pushBatchSummarySelects({
      invoices: [{ jobId: 5, total: "1000.00", status: "paid" }],
      manHoursRows: [{ id: 5, manHours: null }],
      sprPaymentRows: [
        { jobId: 5, compType: "fixed", amount: "300.00", isReversal: false },
        { jobId: 5, compType: "allocation", amount: "200.00", isReversal: null },
        { jobId: 5, compType: "fixed", amount: "900.00", isReversal: true },
        { jobId: 5, compType: "allocation", amount: "800.00", isReversal: true },
      ],
    });

    const batchRes = await request(app).get("/jobs/profit-summary?jobIds=5");

    expect(detailRes.status).toBe(200);
    expect(batchRes.status).toBe(200);

    const detail = detailRes.body;
    const batch = batchRes.body[5];
    expect(detail.responseVersion).toBe(CANONICAL_JOB_PROFIT_RESPONSE_VERSION);
    expect(batch.responseVersion).toBe(CANONICAL_JOB_PROFIT_RESPONSE_VERSION);
    for (const [label, detailValue, batchValue] of [
      ["subLaborCost", detail.subLaborCost, batch.subLaborCost],
      ["allocPaid", detail.allocPaid, batch.allocPaid],
      ["includedCostTotal", detail.includedCostTotal, batch.includedCostTotal],
      ["splitPayouts", detail.profitBreakdown.includedCosts.splitPayouts, batch.profitBreakdown.includedCosts.splitPayouts],
      ["reversedFixedPayouts", detail.profitBreakdown.excludedFromProfit.reversedFixedPayouts, batch.profitBreakdown.excludedFromProfit.reversedFixedPayouts],
      ["reversedAllocationPayouts", detail.profitBreakdown.excludedFromProfit.reversedAllocationPayouts, batch.profitBreakdown.excludedFromProfit.reversedAllocationPayouts],
      ["netProfit", detail.netProfit, batch.netProfit],
    ] as const) {
      expect(batchValue, `${label} should match both profit views`).toBeCloseTo(detailValue);
    }

    expect(detail.subLaborCost).toBeCloseTo(300);
    expect(detail.allocPaid).toBeCloseTo(200);
    expect(detail.includedCostTotal).toBeCloseTo(500);
    expect(detail.profitBreakdown.includedCosts.splitPayouts).toBeCloseTo(200);
    expect(detail.profitBreakdown.excludedFromProfit.reversedFixedPayouts).toBeCloseTo(900);
    expect(detail.profitBreakdown.excludedFromProfit.reversedAllocationPayouts).toBeCloseTo(800);
    expect(detail.netProfit).toBeCloseTo(500);
    expectSharedProfitCalculationFields(detail);
    expectSharedProfitCalculationFields(batch);
  });

  it("keeps mixed fixed/allocation payout buckets equal across detail and cached-fuel batch views", async () => {
    const route = {
      miles: 10,
      durationMinutes: 20,
      routeStatus: "ok" as const,
      provider: "haversine" as const,
      cached: true,
    };
    const liveRoute = vi.spyOn(RoutingEngine, "calculate").mockResolvedValue(route);
    const cachedRoute = vi.spyOn(RoutingEngine, "getCachedRoute").mockReturnValue(route);

    // The same accounting fixture is supplied to both endpoints:
    // $400 fixed labor + $250 allocation payout, plus an $8 cached fuel estimate.
    pushProfitSelects({
      invoices: [{ total: "1000.00", status: "paid" }],
      sprRows: [
        { compType: "fixed", total: "400.00" },
        { compType: "allocation", total: "250.00" },
      ],
      reversedSprRows: [
        { compType: "fixed", total: "900.00" },
        { compType: "allocation", total: "750.00" },
      ],
      fuelSettings: {
        companyAddress: "100 Main St",
        companyCity: "Evansville",
        companyState: "IN",
      },
      fuelVehicle: { avgMpg: 20, fuelPricePerGallon: "4.00" },
      fuelJob: {
        address: "200 Oak St",
        city: "Evansville",
        state: "IN",
      },
      fuelWorkDates: ["2026-01-05", "2026-01-06"],
    });

    const detailRes = await request(app).get("/jobs/5/profit");

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.estimatedFuelCost).toBeCloseTo(8);
    expect(liveRoute).toHaveBeenCalledTimes(1);

    // Batch enrichment must use only the in-memory route cache, not external routing.
    liveRoute.mockClear();
    pushBatchSummarySelects({
      invoices: [{ jobId: 5, total: "1000.00", status: "paid" }],
      manHoursRows: [{ id: 5, manHours: null }],
      sprPaymentRows: [
        { jobId: 5, compType: "fixed", amount: "400.00", isReversal: false },
        { jobId: 5, compType: "allocation", amount: "250.00", isReversal: null },
        { jobId: 5, compType: "fixed", amount: "900.00", isReversal: true },
        { jobId: 5, compType: "allocation", amount: "750.00", isReversal: true },
      ],
      fuelSettings: {
        companyAddress: "100 Main St",
        companyCity: "Evansville",
        companyState: "IN",
      },
      fuelVehicle: { avgMpg: 20, fuelPricePerGallon: "4.00" },
      fuelJobs: [{
        id: 5,
        address: "200 Oak St",
        city: "Evansville",
        state: "IN",
        workdayCount: 2,
      }],
    });

    const batchRes = await request(app).get("/jobs/profit-summary?jobIds=5");

    expect(batchRes.status).toBe(200);
    expect(liveRoute).not.toHaveBeenCalled();
    expect(cachedRoute).toHaveBeenCalledTimes(1);
    expect(batchRes.body[5].estimatedFuelCost).toBeCloseTo(8);

    const detail = detailRes.body;
    const batch = batchRes.body[5];
    for (const [label, detailValue, batchValue] of [
      ["subLaborCost", detail.subLaborCost, batch.subLaborCost],
      ["allocPaid", detail.allocPaid, batch.allocPaid],
      ["includedCostTotal", detail.includedCostTotal, batch.includedCostTotal],
      ["splitPayouts", detail.profitBreakdown.includedCosts.splitPayouts, batch.profitBreakdown.includedCosts.splitPayouts],
      ["reversedFixedPayouts", detail.profitBreakdown.excludedFromProfit.reversedFixedPayouts, batch.profitBreakdown.excludedFromProfit.reversedFixedPayouts],
      ["reversedAllocationPayouts", detail.profitBreakdown.excludedFromProfit.reversedAllocationPayouts, batch.profitBreakdown.excludedFromProfit.reversedAllocationPayouts],
      ["netProfit", detail.netProfit, batch.netProfit],
    ] as const) {
      expect(batchValue, `${label} should match both profit views`).toBeCloseTo(detailValue);
    }

    expect(detail.subLaborCost).toBeCloseTo(400);
    expect(detail.allocPaid).toBeCloseTo(250);
    expect(detail.includedCostTotal).toBeCloseTo(658);
    expect(detail.profitBreakdown.includedCosts.splitPayouts).toBeCloseTo(250);
    expect(detail.profitBreakdown.excludedFromProfit.reversedFixedPayouts).toBeCloseTo(900);
    expect(detail.profitBreakdown.excludedFromProfit.reversedAllocationPayouts).toBeCloseTo(750);
    expect(detail.netProfit).toBeCloseTo(342);
  });

  it("keeps fixed-sub advances when cached fuel re-projects the batch response", async () => {
    const cachedRoute = vi.spyOn(RoutingEngine, "getCachedRoute").mockReturnValue({
      miles: 10,
      durationMinutes: 20,
      routeStatus: "ok",
      provider: "haversine",
      cached: true,
    });

    pushSummarySelects({
      jobId: 5,
      invoices: [{ jobId: 5, total: "1000.00", status: "paid" }],
      // $500 fixed payment + $100 advance, as grouped by the route query.
      sprRows: [{ jobId: 5, compType: "fixed", total: "600.00" }],
      fuelSettings: {
        companyAddress: "100 Main St",
        companyCity: "Evansville",
        companyState: "IN",
      },
      fuelVehicle: { avgMpg: 20, fuelPricePerGallon: "4.00" },
      fuelJob: {
        address: "200 Oak St",
        city: "Evansville",
        state: "IN",
        workdayCount: 2,
      },
    });

    const res = await request(app).get("/jobs/profit-summary?jobIds=5");
    cachedRoute.mockRestore();

    expect(res.status).toBe(200);
    const profit = res.body[5];
    expect(profit.subLaborCost).toBeCloseTo(600);
    expect(profit.jobExpenses).toBeCloseTo(8);
    expect(profit.estimatedFuelCost).toBeCloseTo(8);
    expect(profit.includedCostTotal).toBeCloseTo(608);
    expect(profit.netProfit).toBeCloseTo(392);
    expect(profit.profitBreakdown.includedCosts.subLabor).toBeCloseTo(600);
    expectSharedProfitCalculationFields(profit);
    expect(profit.mileageReimbursement).toBe(0);
  });

  it("keeps allocation payouts when cached fuel re-projects the batch response", async () => {
    const cachedRoute = vi.spyOn(RoutingEngine, "getCachedRoute").mockReturnValue({
      miles: 10,
      durationMinutes: 20,
      routeStatus: "ok",
      provider: "haversine",
      cached: true,
    });

    pushSummarySelects({
      jobId: 5,
      invoices: [{ jobId: 5, total: "1000.00", status: "paid" }],
      sprRows: [{ jobId: 5, compType: "allocation", total: "600.00" }],
      fuelSettings: {
        companyAddress: "100 Main St",
        companyCity: "Evansville",
        companyState: "IN",
      },
      fuelVehicle: { avgMpg: 20, fuelPricePerGallon: "4.00" },
      fuelJob: {
        address: "200 Oak St",
        city: "Evansville",
        state: "IN",
        workdayCount: 2,
      },
    });

    const res = await request(app).get("/jobs/profit-summary?jobIds=5");
    cachedRoute.mockRestore();

    expect(res.status).toBe(200);
    const profit = res.body[5];
    expect(profit.allocPaid).toBeCloseTo(600);
    expect(profit.jobExpenses).toBeCloseTo(8);
    expect(profit.estimatedFuelCost).toBeCloseTo(8);
    expect(profit.includedCostTotal).toBeCloseTo(608);
    expect(profit.profitBreakdown.includedCosts.splitPayouts).toBeCloseTo(600);
    expect(profit.splitPool).toBeCloseTo(942.4);
    expectSharedProfitCalculationFields(profit);
  });

  it("keeps fixed labor and allocation payouts separate after cached fuel re-projects the batch response", async () => {
    const cachedRoute = vi.spyOn(RoutingEngine, "getCachedRoute").mockReturnValue({
      miles: 10,
      durationMinutes: 20,
      routeStatus: "ok",
      provider: "haversine",
      cached: true,
    });

    pushSummarySelects({
      jobId: 5,
      invoices: [{ jobId: 5, total: "1000.00", status: "paid" }],
      // Both compensation types belong to this job and must remain distinct:
      // fixed payroll is labor cost; allocation payroll is a split payout.
      sprRows: [
        { jobId: 5, compType: "fixed", total: "400.00" },
        { jobId: 5, compType: "allocation", total: "250.00" },
      ],
      fuelSettings: {
        companyAddress: "100 Main St",
        companyCity: "Evansville",
        companyState: "IN",
      },
      fuelVehicle: { avgMpg: 20, fuelPricePerGallon: "4.00" },
      fuelJob: {
        address: "200 Oak St",
        city: "Evansville",
        state: "IN",
        workdayCount: 2,
      },
    });

    const res = await request(app).get("/jobs/profit-summary?jobIds=5");
    cachedRoute.mockRestore();

    expect(res.status).toBe(200);
    const profit = res.body[5];
    expect(profit.subLaborCost).toBeCloseTo(400);
    expect(profit.allocPaid).toBeCloseTo(250);
    expect(profit.jobExpenses).toBeCloseTo(8);
    expect(profit.estimatedFuelCost).toBeCloseTo(8);
    expect(profit.includedCostTotal).toBeCloseTo(658);
    expect(profit.netProfit).toBeCloseTo(342);
    expect(profit.profitBreakdown.includedCosts.subLabor).toBeCloseTo(400);
    expect(profit.profitBreakdown.includedCosts.splitPayouts).toBeCloseTo(250);
    expect(profit.splitPool).toBeCloseTo(542.4);
    expectSharedProfitCalculationFields(profit);
  });

  it("excludes reversed fixed/allocation payouts after cached fuel re-projects the batch response", async () => {
    const route = {
      miles: 10,
      durationMinutes: 20,
      routeStatus: "ok" as const,
      provider: "haversine" as const,
      cached: true,
    };
    const liveRoute = vi.spyOn(RoutingEngine, "calculate");
    const cachedRoute = vi.spyOn(RoutingEngine, "getCachedRoute").mockReturnValue(route);

    // The ledger contains active and reversed rows for both non-hourly
    // compensation types. The production aggregate excludes is_reversal=true
    // before the cached-fuel re-projection receives its grouped totals.
    pushBatchSummarySelects({
      invoices: [{ jobId: 5, total: "1000.00", status: "paid" }],
      manHoursRows: [{ id: 5, manHours: null }],
      sprPaymentRows: [
        { jobId: 5, compType: "fixed", amount: "400.00", isReversal: false },
        { jobId: 5, compType: "fixed", amount: "900.00", isReversal: true },
        { jobId: 5, compType: "allocation", amount: "250.00", isReversal: null },
        { jobId: 5, compType: "allocation", amount: "750.00", isReversal: true },
      ],
      fuelSettings: {
        companyAddress: "100 Main St",
        companyCity: "Evansville",
        companyState: "IN",
      },
      fuelVehicle: { avgMpg: 20, fuelPricePerGallon: "4.00" },
      fuelJobs: [{
        id: 5,
        address: "200 Oak St",
        city: "Evansville",
        state: "IN",
        workdayCount: 2,
      }],
    });

    const res = await request(app).get("/jobs/profit-summary?jobIds=5");

    expect(res.status).toBe(200);
    expect(liveRoute).not.toHaveBeenCalled();
    expect(cachedRoute).toHaveBeenCalledTimes(1);

    const profit = res.body[5];
    expect(profit.subLaborCost).toBeCloseTo(400);
    expect(profit.allocPaid).toBeCloseTo(250);
    expect(profit.estimatedFuelCost).toBeCloseTo(8);
    expect(profit.includedCostTotal).toBeCloseTo(658);
    expect(profit.profitBreakdown.includedCosts.subLabor).toBeCloseTo(400);
    expect(profit.profitBreakdown.includedCosts.splitPayouts).toBeCloseTo(250);
    expect(profit.profitBreakdown.includedCosts.total).toBeCloseTo(658);
    expect(profit.profitBreakdown.excludedFromProfit.reversedFixedPayouts).toBeCloseTo(900);
    expect(profit.profitBreakdown.excludedFromProfit.reversedAllocationPayouts).toBeCloseTo(750);
    expect(profit.splitPool).toBeCloseTo(542.4);
    expect(profit.netProfit).toBeCloseTo(342);
    expectSharedProfitCalculationFields(profit);

    liveRoute.mockRestore();
    cachedRoute.mockRestore();
  });

  it("keeps active and reversed payouts isolated by job in a multi-job batch", async () => {
    pushProfitSelects({
      invoices: [{ total: "1000.00", status: "paid" }],
      sprRows: [
        { compType: "fixed", total: "120.00" },
        { compType: "allocation", total: "80.00" },
      ],
      reversedSprRows: [
        { compType: "fixed", total: "900.00" },
        { compType: "allocation", total: "700.00" },
      ],
    });
    const firstDetailRes = await request(app).get("/jobs/501/profit");

    pushProfitSelects({
      invoices: [{ total: "1800.00", status: "paid" }],
      sprRows: [
        { compType: "fixed", total: "350.00" },
        { compType: "allocation", total: "75.00" },
      ],
      reversedSprRows: [
        { compType: "fixed", total: "600.00" },
        { compType: "allocation", total: "450.00" },
      ],
    });
    const secondDetailRes = await request(app).get("/jobs/502/profit");

    pushBatchSummarySelects({
      invoices: [
        { jobId: 501, total: "1000.00", status: "paid" },
        { jobId: 502, total: "1800.00", status: "paid" },
      ],
      manHoursRows: [
        { id: 501, manHours: null },
        { id: 502, manHours: null },
      ],
      sprPaymentRows: [
        { jobId: 501, compType: "fixed", amount: "120.00", isReversal: false },
        { jobId: 501, compType: "allocation", amount: "80.00", isReversal: null },
        { jobId: 501, compType: "fixed", amount: "900.00", isReversal: true },
        { jobId: 501, compType: "allocation", amount: "700.00", isReversal: true },
        { jobId: 502, compType: "fixed", amount: "350.00", isReversal: false },
        { jobId: 502, compType: "allocation", amount: "75.00", isReversal: null },
        { jobId: 502, compType: "fixed", amount: "600.00", isReversal: true },
        { jobId: 502, compType: "allocation", amount: "450.00", isReversal: true },
      ],
    });
    const batchRes = await request(app).get("/jobs/profit-summary?jobIds=501,502");

    expect(firstDetailRes.status).toBe(200);
    expect(secondDetailRes.status).toBe(200);
    expect(batchRes.status).toBe(200);
    expect(Object.keys(batchRes.body).sort()).toEqual(["501", "502"]);

    const detailByJob = {
      501: firstDetailRes.body,
      502: secondDetailRes.body,
    } as const;
    for (const jobId of [501, 502] as const) {
      const detail = detailByJob[jobId];
      const batch = batchRes.body[jobId];

      expect(batch).toBeDefined();
      for (const [label, detailValue, batchValue] of [
        ["subLaborCost", detail.subLaborCost, batch.subLaborCost],
        ["allocPaid", detail.allocPaid, batch.allocPaid],
        ["includedCostTotal", detail.includedCostTotal, batch.includedCostTotal],
        ["splitPayouts", detail.profitBreakdown.includedCosts.splitPayouts, batch.profitBreakdown.includedCosts.splitPayouts],
        ["reversedFixedPayouts", detail.profitBreakdown.excludedFromProfit.reversedFixedPayouts, batch.profitBreakdown.excludedFromProfit.reversedFixedPayouts],
        ["reversedAllocationPayouts", detail.profitBreakdown.excludedFromProfit.reversedAllocationPayouts, batch.profitBreakdown.excludedFromProfit.reversedAllocationPayouts],
        ["netProfit", detail.netProfit, batch.netProfit],
      ] as const) {
        expect(batchValue, `${label} should stay isolated for job ${jobId}`).toBeCloseTo(detailValue);
      }
    }

    expect(batchRes.body[501].subLaborCost).toBeCloseTo(120);
    expect(batchRes.body[501].allocPaid).toBeCloseTo(80);
    expect(batchRes.body[501].includedCostTotal).toBeCloseTo(200);
    expect(batchRes.body[501].profitBreakdown.includedCosts.splitPayouts).toBeCloseTo(80);
    expect(batchRes.body[501].profitBreakdown.excludedFromProfit.reversedFixedPayouts).toBeCloseTo(900);
    expect(batchRes.body[501].profitBreakdown.excludedFromProfit.reversedAllocationPayouts).toBeCloseTo(700);
    expect(batchRes.body[501].netProfit).toBeCloseTo(800);

    expect(batchRes.body[502].subLaborCost).toBeCloseTo(350);
    expect(batchRes.body[502].allocPaid).toBeCloseTo(75);
    expect(batchRes.body[502].includedCostTotal).toBeCloseTo(425);
    expect(batchRes.body[502].profitBreakdown.includedCosts.splitPayouts).toBeCloseTo(75);
    expect(batchRes.body[502].profitBreakdown.excludedFromProfit.reversedFixedPayouts).toBeCloseTo(600);
    expect(batchRes.body[502].profitBreakdown.excludedFromProfit.reversedAllocationPayouts).toBeCloseTo(450);
    expect(batchRes.body[502].netProfit).toBeCloseTo(1375);
  });

  it("keeps payroll and cached fuel values isolated across multiple batch jobs", async () => {
    const liveRoute = vi.spyOn(RoutingEngine, "calculate");
    const cachedRoute = vi.spyOn(RoutingEngine, "getCachedRoute").mockImplementation(({ destination }) => ({
      miles: destination.includes("Oak") ? 10 : 25,
      durationMinutes: destination.includes("Oak") ? 20 : 50,
      routeStatus: "ok",
      provider: "haversine",
      cached: true,
    }));

    pushBatchSummarySelects({
      invoices: [
        { jobId: 501, total: "1000.00", status: "paid" },
        { jobId: 502, total: "1800.00", status: "paid" },
      ],
      hoursRows: [
        { jobId: 501, total: "120.00" },
      ],
      hoursCountRows: [
        { jobId: 501, totalHours: "4.0" },
      ],
      manHoursRows: [
        { id: 501, manHours: null },
        { id: 502, manHours: null },
      ],
      sprRows: [
        { jobId: 501, compType: "allocation", total: "150.00" },
        { jobId: 502, compType: "fixed", total: "350.00" },
        { jobId: 502, compType: "allocation", total: "75.00" },
      ],
      fuelSettings: {
        companyAddress: "100 Main St",
        companyCity: "Evansville",
        companyState: "IN",
      },
      fuelVehicle: { avgMpg: 20, fuelPricePerGallon: "4.00" },
      fuelJobs: [
        {
          id: 501,
          address: "200 Oak St",
          city: "Evansville",
          state: "IN",
          workdayCount: 2,
        },
        {
          id: 502,
          address: "300 Pine St",
          city: "Evansville",
          state: "IN",
          workdayCount: 3,
        },
      ],
    });

    const res = await request(app).get("/jobs/profit-summary?jobIds=501,502");
    cachedRoute.mockRestore();

    expect(res.status).toBe(200);
    expect(liveRoute).not.toHaveBeenCalled();
    const firstJob = res.body[501];
    const secondJob = res.body[502];

    expect(firstJob.allocPaid).toBeCloseTo(150);
    expect(firstJob.subLaborCost).toBeCloseTo(120);
    expect(firstJob.estimatedFuelCost).toBeCloseTo(8);
    expect(firstJob.splitPool).toBeCloseTo(822.4);
    expect(firstJob.netProfit).toBeCloseTo(722);

    expect(secondJob.allocPaid).toBeCloseTo(75);
    expect(secondJob.subLaborCost).toBeCloseTo(350);
    expect(secondJob.estimatedFuelCost).toBeCloseTo(30);
    expect(secondJob.splitPool).toBeCloseTo(1331.5);
    expect(secondJob.netProfit).toBeCloseTo(1345);

    expect(firstJob.allocPaid).not.toBeCloseTo(secondJob.allocPaid);
    expect(firstJob.subLaborCost).not.toBeCloseTo(secondJob.subLaborCost);
    expect(firstJob.estimatedFuelCost).not.toBeCloseTo(secondJob.estimatedFuelCost);
    expect(firstJob.splitPool).not.toBeCloseTo(secondJob.splitPool);
    expect(firstJob.netProfit).not.toBeCloseTo(secondJob.netProfit);
    expectSharedProfitCalculationFields(firstJob);
    expectSharedProfitCalculationFields(secondJob);
    liveRoute.mockRestore();
  });

  it("does not leak a cached fuel estimate into a batch job with no cached route", async () => {
    const liveRoute = vi.spyOn(RoutingEngine, "calculate");
    const cachedRoute = vi.spyOn(RoutingEngine, "getCachedRoute").mockImplementation(({ destination }) => (
      destination.includes("Oak")
        ? {
            miles: 10,
            durationMinutes: 20,
            routeStatus: "ok",
            provider: "haversine",
            cached: true,
          }
        : null
    ));

    pushBatchSummarySelects({
      invoices: [
        { jobId: 601, total: "1000.00", status: "paid" },
        { jobId: 602, total: "1800.00", status: "paid" },
      ],
      hoursRows: [
        { jobId: 601, total: "120.00" },
      ],
      hoursCountRows: [
        { jobId: 601, totalHours: "4.0" },
      ],
      manHoursRows: [
        { id: 601, manHours: null },
        { id: 602, manHours: null },
      ],
      sprRows: [
        { jobId: 601, compType: "allocation", total: "150.00" },
        { jobId: 602, compType: "fixed", total: "350.00" },
        { jobId: 602, compType: "allocation", total: "75.00" },
      ],
      fuelSettings: {
        companyAddress: "100 Main St",
        companyCity: "Evansville",
        companyState: "IN",
      },
      fuelVehicle: { avgMpg: 20, fuelPricePerGallon: "4.00" },
      fuelJobs: [
        {
          id: 601,
          address: "200 Oak St",
          city: "Evansville",
          state: "IN",
          workdayCount: 2,
        },
        {
          id: 602,
          address: "300 Pine St",
          city: "Evansville",
          state: "IN",
          workdayCount: 3,
        },
      ],
    });

    const res = await request(app).get("/jobs/profit-summary?jobIds=601,602");

    expect(res.status).toBe(200);
    expect(liveRoute).not.toHaveBeenCalled();
    expect(cachedRoute).toHaveBeenCalledTimes(2);

    const cachedJob = res.body[601];
    const cacheMissJob = res.body[602];

    expect(cachedJob.estimatedFuelCost).toBeCloseTo(8);
    expect(cachedJob.subLaborCost).toBeCloseTo(120);
    expect(cachedJob.allocPaid).toBeCloseTo(150);
    expect(cachedJob.splitPool).toBeCloseTo(822.4);
    expect(cachedJob.netProfit).toBeCloseTo(722);

    expect(cacheMissJob.estimatedFuelCost).toBe(0);
    expect(cacheMissJob.profitBreakdown.includedCosts.estimatedFuel).toBe(0);
    expect(cacheMissJob.subLaborCost).toBeCloseTo(350);
    expect(cacheMissJob.allocPaid).toBeCloseTo(75);
    expect(cacheMissJob.splitPool).toBeCloseTo(1360);
    expect(cacheMissJob.netProfit).toBeCloseTo(1375);

    expect(cachedJob.estimatedFuelCost).not.toBeCloseTo(cacheMissJob.estimatedFuelCost);
    expect(cachedJob.subLaborCost).not.toBeCloseTo(cacheMissJob.subLaborCost);
    expect(cachedJob.allocPaid).not.toBeCloseTo(cacheMissJob.allocPaid);
    expect(cachedJob.splitPool).not.toBeCloseTo(cacheMissJob.splitPool);
    expect(cachedJob.netProfit).not.toBeCloseTo(cacheMissJob.netProfit);
    expectSharedProfitCalculationFields(cachedJob);
    expectSharedProfitCalculationFields(cacheMissJob);

    liveRoute.mockRestore();
    cachedRoute.mockRestore();
  });

  it("keeps the batch mileage reimbursement in its numeric compatibility form", async () => {
    pushSummarySelects({
      jobId: 5,
      invoices: [{ jobId: 5, total: "1000.00", status: "paid" }],
      mileageReimbursement: { jobId: 5, amount: "125.00" },
      sprRows: [{ jobId: 5, compType: "fixed", total: "200.00" }],
      hoursLaborCost: "300.00",
      totalHours: "10.0",
      accruedBonus: "50.00",
    });

    const res = await request(app).get("/jobs/profit-summary?jobIds=5");

    expect(res.status).toBe(200);
    const profit = res.body[5];
    expect(profit.mileageReimbursement).toBe(125);
    expect(profit.subLaborCost).toBeCloseTo(550);
    expect(profit.netProfit).toBeCloseTo(325);
    expectSharedProfitCalculationFields(profit);
  });

  it("keeps opted-out mileage reimbursement fields aligned between detail and batch routes", async () => {
    const liveRoute = vi.spyOn(RoutingEngine, "calculate").mockResolvedValue({
      miles: 10,
      durationMinutes: 20,
      routeStatus: "ok",
      provider: "haversine",
      cached: false,
    });
    const cachedRoute = vi.spyOn(RoutingEngine, "getCachedRoute");
    const reimbursement = {
      id: 705,
      amount: "125.00",
      recipientType: "owner",
      recipientName: "Willard",
    };

    h.allocationPools.set(5, 400);
    pushProfitSelects({
      invoices: [{ total: "1000.00", status: "paid" }],
      mileageReimbursement: reimbursement,
      sprRows: [
        { compType: "fixed", total: "200.00" },
        { compType: "allocation", total: "125.00" },
      ],
      hoursLaborCost: "300.00",
      totalHours: "10.0",
      accruedBonus: "50.00",
      fuelJob: {
        address: "200 Oak St",
        city: "Evansville",
        state: "IN",
        includeMileageInJobCosts: false,
      },
    });

    const detailRes = await request(app).get("/jobs/5/profit");

    pushSummarySelects({
      jobId: 5,
      invoices: [{ jobId: 5, total: "1000.00", status: "paid" }],
      mileageReimbursement: { jobId: 5, amount: reimbursement.amount },
      sprRows: [
        { jobId: 5, compType: "fixed", total: "200.00" },
        { jobId: 5, compType: "allocation", total: "125.00" },
      ],
      hoursLaborCost: "300.00",
      totalHours: "10.0",
      accruedBonus: "50.00",
      includeMileageInJobCosts: false,
    });

    const batchRes = await request(app).get("/jobs/profit-summary?jobIds=5");

    expect(detailRes.status).toBe(200);
    expect(batchRes.status).toBe(200);
    expect(liveRoute).toHaveBeenCalledTimes(1);
    expect(cachedRoute).not.toHaveBeenCalled();

    const detailProfit = detailRes.body;
    const batchProfit = batchRes.body[5];
    for (const profit of [detailProfit, batchProfit]) {
      expect(profit.includeMileageInJobCosts).toBe(false);
      expect(profit.mileageReimbursementApplied).toBe(false);
      expect(profit.jobExpenses).toBeCloseTo(0);
      expect(profit.includedCostTotal).toBeCloseTo(550 + 125);
      expect(profit.netProfit).toBeCloseTo(1000 - (550 + 125));
      expect(profit.profitBreakdown.includedCosts).toMatchObject({
        directExpenses: 0,
        mileageReimbursement: 0,
        estimatedFuel: 0,
        subLabor: 550,
        splitPayouts: 125,
      });
    }
    expect(detailProfit.mileageReimbursement.amount).toBeCloseTo(125);
    expect(batchProfit.mileageReimbursement).toBe(0);

    for (const field of ["subLaborCost", "allocPaid", "includedCostTotal", "netProfit"] as const) {
      expect(batchProfit[field]).toBeCloseTo(detailProfit[field]);
    }
    expect(batchProfit.profitBreakdown.includedCosts.splitPayouts)
      .toBeCloseTo(detailProfit.profitBreakdown.includedCosts.splitPayouts);
    expect(batchProfit.splitPool).toBeCloseTo(detailProfit.splitPool);
    expectSharedProfitCalculationFields(detailProfit);
    expectSharedProfitCalculationFields(batchProfit);
    liveRoute.mockRestore();
    cachedRoute.mockRestore();
  });

  it("includes accrued_bonus per job in the batch result", async () => {
    pushSummarySelects({
      jobId:          5,
      invoices:       [{ jobId: 5, total: "1000.00", status: "paid" }],
      hoursLaborCost: "200.00",
      totalHours:     "4.0",
      accruedBonus:   "75.00",
    });

    const res = await request(app).get("/jobs/profit-summary?jobIds=5");

    expect(res.status).toBe(200);
    expect(res.body[5]).toBeDefined();
    expect(res.body[5].subLaborCost).toBeCloseTo(275);
    // netProfit = $1000 - $275 = $725
    expect(res.body[5].netProfit).toBeCloseTo(725);
  });

  it("includes job-linked other income in the batch result", async () => {
    pushSummarySelects({
      jobId: 5,
      otherIncome: [{ jobId: 5, amount: "300.00" }],
    });

    const res = await request(app).get("/jobs/profit-summary?jobIds=5");

    expect(res.status).toBe(200);
    expect(res.body[5].otherIncomeRevenue).toBeCloseTo(300);
    expect(res.body[5].grossInvoiced).toBeCloseTo(300);
    expect(res.body[5].collected).toBeCloseTo(300);
    expect(res.body[5].netProfit).toBeCloseTo(300);
  });

  it("returns zero subLaborCost when job has no hours and no accrued bonus", async () => {
    pushSummarySelects({ jobId: 3 });

    const res = await request(app).get("/jobs/profit-summary?jobIds=3");

    expect(res.status).toBe(200);
    expect(res.body[3].subLaborCost).toBe(0);
    expect(res.body[3].netProfit).toBe(0);
  });

  it("counts accrued_bonus alone when no hours have been logged for the job", async () => {
    pushSummarySelects({
      jobId:        8,
      accruedBonus: "120.00",
    });

    const res = await request(app).get("/jobs/profit-summary?jobIds=8");

    expect(res.status).toBe(200);
    expect(res.body[8].subLaborCost).toBeCloseTo(120);
  });

  it("returns empty object for an empty jobIds param", async () => {
    const res = await request(app).get("/jobs/profit-summary?jobIds=");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });
});
