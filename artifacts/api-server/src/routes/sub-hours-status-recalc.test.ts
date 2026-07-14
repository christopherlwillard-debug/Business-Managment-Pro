// Integration tests for recomputeSubPaymentStatus wired into the sub-hours routes.
//
// Before this fix, paymentStatus in job_subcontractors was only recalculated when
// payments were added or deleted — not when logged hours changed. A sub marked
// "paid" at $100 owed / $100 paid would stay "paid" even if new/edited hours
// pushed the computed obligation to $150, leaving the balance visually settled
// when it wasn't.
//
// Fix: after any insert/update/delete on job_sub_hours, recomputeSubPaymentStatus
// re-derives the obligation (via hours × rateSnapshot for hourly subs) and
// persists the correct paymentStatus to job_subcontractors.
//
// Scenarios:
//   1. Rate updated upward → paid < new owed → "partial"  (core regression)
//   2. No payments recorded → early return, paymentStatus NOT written
//   3. Hours reduced → paid still covers new owed → stays "paid"
//
// DB is fully mocked — no real database connection required.

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Hoisted mutable state ─────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  selectQueue:      [] as any[][],
  updates:          [] as any[],
  updateReturnQueue: [] as any[][], // rows returned by update().set().where().returning()
}));

// ── Mock @workspace/db ────────────────────────────────────────────────────────
vi.mock("@workspace/db", () => {
  function makeSelectChain() {
    const c: any = {
      from:     () => c,
      where:    () => c,
      leftJoin: () => c,
      orderBy:  () => c,
      limit:    () => c,
      then(resolve: any, reject: any) {
        return Promise.resolve(h.selectQueue.shift() ?? []).then(resolve, reject);
      },
    };
    return c;
  }

  return {
    db: {
      select: () => makeSelectChain(),
      delete: () => ({ where: () => Promise.resolve() }),
      update: () => ({
        set: (data: any) => {
          h.updates.push(data);
          return {
            where: () => ({
              returning: () => Promise.resolve(h.updateReturnQueue.shift() ?? []),
            }),
          };
        },
      }),
      insert: () => ({
        values: () => ({ returning: () => Promise.resolve([{ id: 99 }]) }),
      }),
    },
  };
});

// ── Mock ./jobs so recomputeSubPaid is a no-op ────────────────────────────────
vi.mock("./jobs", () => ({ recomputeSubPaid: vi.fn().mockResolvedValue(true) }));

// ── Import router AFTER mocks are hoisted ─────────────────────────────────────
const { default: subHoursRouter } = await import("./job-sub-hours");

// ── Minimal Express app ───────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use((_req, _res, next) => {
  (_req as any).user = { id: 1, claims: { sub: "user_1" } };
  next();
});
app.use("/", subHoursRouter);

beforeEach(() => {
  h.selectQueue.length      = 0;
  h.updates.length          = 0;
  h.updateReturnQueue.length = 0;
});

// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Push DB select results for PUT /sub-hours/:id in call order:
 *   1. sub name
 *   2. job businessLine    (upsertLinkedExpense)
 *   3. existing expense    (upsertLinkedExpense)
 *   4. payments SUM        (recomputeSubPaymentStatus — skipped when amountPaid=0)
 *   5. sub row             (recomputeSubPaymentStatus — skipped when amountPaid=0)
 *   6. computed hours×rate (recomputeSubPaymentStatus — hourly only, optional)
 */
function setupPutSelects(opts: {
  subName: string;
  amountPaid: string;
  compensationType: string;
  amountOwed: string | null;
  fixedAmount: string | null;
  computedOwed?: string;
  hasExistingExpense?: boolean;
}) {
  h.selectQueue.push([{ name: opts.subName }]);
  h.selectQueue.push([{ businessLine: null }]);
  h.selectQueue.push(opts.hasExistingExpense !== false ? [{ id: 200 }] : []);

  if (parseFloat(opts.amountPaid) > 0.005) {
    h.selectQueue.push([{ total: opts.amountPaid }]);
    h.selectQueue.push([{
      compensationType: opts.compensationType,
      amountOwed:       opts.amountOwed,
      fixedAmount:      opts.fixedAmount,
    }]);
    if (opts.computedOwed !== undefined) {
      h.selectQueue.push([{ computedOwed: opts.computedOwed }]);
    }
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PUT /sub-hours/:id — recomputeSubPaymentStatus after hours/rate change", () => {

  it("sets paymentStatus to 'partial' when paid no longer covers updated computed owed", async () => {
    // Sub paid $100 for 2 hrs × $50. Rate bumped to $75 → owed = 2×$75 = $150.
    // $100 < $150×0.99 → "partial".
    h.updateReturnQueue.push([{
      id: 10, jobId: 1, subcontractorId: 7,
      date: "2026-07-14", hours: "2", rateSnapshot: "75",
      hourType: null, description: null, createdAt: new Date().toISOString(),
    }]);

    setupPutSelects({
      subName:          "Bob",
      amountPaid:       "100.00",
      compensationType: "hourly",
      amountOwed:       null,
      fixedAmount:      null,
      computedOwed:     "150.00",
      hasExistingExpense: true,
    });

    const res = await request(app).put("/sub-hours/10").send({ rateSnapshot: 75 });

    expect(res.status).toBe(200);

    const statusUpdate = h.updates.find((u: any) => "paymentStatus" in u);
    expect(statusUpdate?.paymentStatus).toBe("partial");
  });

  it("does not write paymentStatus when the sub has no recorded payments", async () => {
    // SUM of payments = 0 → recomputeSubPaymentStatus exits early.
    h.updateReturnQueue.push([{
      id: 11, jobId: 1, subcontractorId: 8,
      date: "2026-07-14", hours: "3", rateSnapshot: "60",
      hourType: null, description: null, createdAt: new Date().toISOString(),
    }]);

    setupPutSelects({
      subName:          "Alice",
      amountPaid:       "0",
      compensationType: "hourly",
      amountOwed:       null,
      fixedAmount:      null,
    });

    const res = await request(app).put("/sub-hours/11").send({ hours: 3 });

    expect(res.status).toBe(200);

    const statusUpdate = h.updates.find((u: any) => "paymentStatus" in u);
    expect(statusUpdate).toBeUndefined();
  });

  it("keeps paymentStatus 'paid' when reduced hours still leave paid ≥ owed", async () => {
    // Sub paid $200. Hours reduced 4→3 hrs × $60 = $180 owed. $200 ≥ $180×0.99 → "paid".
    h.updateReturnQueue.push([{
      id: 12, jobId: 2, subcontractorId: 9,
      date: "2026-07-14", hours: "3", rateSnapshot: "60",
      hourType: null, description: null, createdAt: new Date().toISOString(),
    }]);

    setupPutSelects({
      subName:          "Charlie",
      amountPaid:       "200.00",
      compensationType: "hourly",
      amountOwed:       null,
      fixedAmount:      null,
      computedOwed:     "180.00",
      hasExistingExpense: true,
    });

    const res = await request(app).put("/sub-hours/12").send({ hours: 3 });

    expect(res.status).toBe(200);

    const statusUpdate = h.updates.find((u: any) => "paymentStatus" in u);
    expect(statusUpdate?.paymentStatus).toBe("paid");
  });
});
