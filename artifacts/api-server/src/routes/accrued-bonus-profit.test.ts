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

// ── Hoisted mutable state ─────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  updates:     [] as any[],
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
      update: () => ({
        set: (data: any) => {
          h.updates.push(data);
          return { where: () => Promise.resolve() };
        },
      }),
      insert: () => ({
        values: (_data: any) => ({
          returning: () => Promise.resolve([{ id: 99 }]),
        }),
      }),
    },
  };
});

// ── Stub sibling modules so jobs.ts can be imported ──────────────────────────
vi.mock("./material-lists",            () => ({ syncMaterialsToJobInvoice: vi.fn() }));
vi.mock("../lib/allocation.js",        () => ({ computeAllocationSplitPool: vi.fn(), computeSubOwed: vi.fn() }));
vi.mock("./invoices",                  () => ({ calcInvoice: vi.fn(), buildInvoiceQuery: vi.fn(), fmt: (v: any) => String(v) }));
vi.mock("../lib/productionBilling.js", () => ({ buildProductionLineItems: vi.fn(), ensureProductionBillingSeed: vi.fn() }));

const { default: jobsRouter } = await import("./jobs");

const app = express();
app.use(express.json());
app.use((_req, _res, next) => {
  h.scenario = `${_req.method} ${_req.path}`;
  (_req as any).user = { id: 1, claims: { sub: "user_1" } };
  next();
});
app.use("/jobs", jobsRouter);

beforeEach(() => {
  h.selectQueue.length = 0;
  h.updates.length = 0;
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
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Push the 7 select results that GET /jobs/:id/profit issues via Promise.all:
 *   [0] invoices      [1] other income [2] expenses [3] spr fixed/alloc rows
 *   [4] hours cost    [5] hours cnt    [6] accrued bonus
 */
function pushProfitSelects(opts: {
  invoices?:       { total: string; status: string }[];
  otherIncome?:    { amount: string }[];
  expenses?:       any[];
  sprRows?:        { compType: string; total: string }[];
  hoursLaborCost?: string;
  totalHours?:     string;
  accruedBonus?:   string;
}) {
  h.selectQueue.push(opts.invoices ?? []);
  h.selectQueue.push(opts.otherIncome ?? []);
  h.selectQueue.push(opts.expenses ?? []);
  h.selectQueue.push(opts.sprRows  ?? []);
  h.selectQueue.push([{ total: opts.hoursLaborCost ?? "0" }]);
  h.selectQueue.push([{ total: opts.totalHours     ?? "0" }]);
  h.selectQueue.push([{ total: opts.accruedBonus   ?? "0" }]);
  // Fuel estimation performs three additional selects after the profit waterfall.
  h.selectQueue.push([]); // [7] fuel logs
  h.selectQueue.push([]); // [8] fuel expenses
  h.selectQueue.push([]); // [9] job mileage
}

/**
 * Push the 8 select results that GET /jobs/profit-summary issues via Promise.all:
 *   [0] invoices  [1] other income [2] expenses [3] hours cost rows
 *   [4] hours count rows [5] manHours [6] spr rows [7] accrued bonus rows
 *
 * All arrays are grouped by jobId on the real DB; the mock just returns the
 * raw rows — the route code maps them by jobId.
 */
function pushSummarySelects(opts: {
  jobId:          number;
  invoices?:      { jobId: number; total: string; status: string }[];
  otherIncome?:   { jobId: number; amount: string }[];
  expenses?:      any[];
  hoursLaborCost?: string;
  totalHours?:    string;
  sprRows?:       { jobId: number; compType: string; total: string }[];
  accruedBonus?:  string;
}) {
  const { jobId } = opts;
  h.selectQueue.push(opts.invoices ?? []);
  h.selectQueue.push(opts.otherIncome ?? []);
  h.selectQueue.push(opts.expenses ?? []);
  // hours cost grouped by jobId
  h.selectQueue.push(opts.hoursLaborCost && opts.hoursLaborCost !== "0"
    ? [{ jobId, total: opts.hoursLaborCost }] : []);
  // hours count grouped by jobId
  h.selectQueue.push(opts.totalHours && opts.totalHours !== "0"
    ? [{ jobId, totalHours: opts.totalHours }] : []);
  // manHours from jobs table
  h.selectQueue.push([{ id: jobId, manHours: null }]);
  h.selectQueue.push(opts.sprRows ?? []);
  // accrued bonus grouped by jobId
  h.selectQueue.push(opts.accruedBonus && opts.accruedBonus !== "0"
    ? [{ jobId, total: opts.accruedBonus }] : []);
  // Fuel estimation performs three additional selects after the summary query.
  h.selectQueue.push([]); // [8] fuel logs
  h.selectQueue.push([]); // [9] fuel expenses
  h.selectQueue.push([]); // [10] job mileage
}

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
});

describe("GET /jobs/:id/profit — no double-count after a payment is recorded", () => {

  it("does NOT add hourly sub_payment_records to subLaborCost (filtered by compType)", async () => {
    // After pay-worker records $275 for an hourly sub, sub_payment_records has a row.
    // The profit query uses WHERE compType IN ('fixed','allocation'), so the hourly
    // row never reaches sprRows — the mock correctly returns an empty sprRows array.
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
