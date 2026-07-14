// Integration tests for DELETE /jobs/:id/sub-payments/:paymentId
//
// Pins the status-recalc behaviour introduced to fix a bug where deleting a
// payment for an hourly sub could leave paymentStatus as "partial" even when
// the balance was fully cleared — because amountOwed and fixedAmount are both
// null for hourly subs and the old code always fell through to "partial".
//
// The fix: when compensationType is "hourly" and no manual amountOwed override
// exists, compute the obligation from SUM(hours × rateSnapshot) in job_sub_hours.
//
// Three transitions tested:
//   1. paid  → partial : delete one of two payments; remaining paid < computed owed
//   2. partial → unpaid : delete all remaining payments; newPaid drops to 0
//   3. (regression) remaining paid ≥ computed owed → correctly "paid", not "partial"
//
// DB layer is fully mocked — no real database connection required.
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Hoisted mutable state ─────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  // Each awaited select chain pops one entry off this queue.
  selectQueue: [] as any[][],
  // Captures every .set(data) payload from UPDATE calls.
  updates: [] as any[],
}));

// ── Mock @workspace/db ────────────────────────────────────────────────────────
// The chain is a thenable so `await db.select().from().where(...)` resolves at
// any depth by popping the next queued result when the Promise is awaited.
vi.mock("@workspace/db", () => {
  function makeChain() {
    const c: any = {
      from:      () => c,
      where:     () => c,
      for:       () => c,
      leftJoin:  () => c,
      innerJoin: () => c,
      orderBy:   () => c,
      groupBy:   () => c,
      limit:     () => c,
      then(resolve: (v: any) => any, reject: (e: any) => any) {
        return Promise.resolve(h.selectQueue.shift() ?? []).then(resolve, reject);
      },
    };
    return c;
  }

  return {
    db: {
      select:  () => makeChain(),
      delete:  () => ({ where: () => Promise.resolve() }),
      update:  () => ({
        set: (data: any) => {
          h.updates.push(data);
          return { where: () => Promise.resolve() };
        },
      }),
      insert:  () => ({
        values: (_data: any) => ({
          returning: () => Promise.resolve([{ id: 99 }]),
        }),
      }),
    },
  };
});

// ── Stub sibling/lib modules so jobs.ts can be imported ───────────────────────
vi.mock("./material-lists",            () => ({ syncMaterialsToJobInvoice: vi.fn() }));
vi.mock("../lib/allocation.js",        () => ({ computeAllocationSplitPool: vi.fn(), computeSubOwed: vi.fn() }));
vi.mock("./invoices",                  () => ({ calcInvoice: vi.fn(), buildInvoiceQuery: vi.fn(), fmt: (v: any) => String(v) }));
vi.mock("../lib/productionBilling.js", () => ({ buildProductionLineItems: vi.fn(), ensureProductionBillingSeed: vi.fn() }));

// ── Import router AFTER mocks are hoisted ────────────────────────────────────
const { default: jobsRouter } = await import("./jobs");

// ── Minimal Express app ───────────────────────────────────────────────────────
const app = express();
app.use(express.json());
// Inject a stub user so any requireAuth middleware (if present) doesn't block.
app.use((_req, _res, next) => {
  (_req as any).user = { id: 1, claims: { sub: "user_1" } };
  next();
});
app.use("/jobs", jobsRouter);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Push DB result rows in the exact order the DELETE handler issues selects:
 *
 *   1. SELECT id FROM sub_advances WHERE appliedPaymentId = paymentId  (count released advances)
 *   2. SELECT subcontractorId  (verify ownership)
 *   3. SELECT total            (remaining paid after delete)
 *   4. SELECT compensationType / amountOwed / fixedAmount  (sub profile)
 *   5. SELECT computedOwed     (hourly only, pushed when computedOwed is given)
 *
 * delete() and update() don't return queued rows; those are fire-and-forget.
 */
function pushSelects(opts: {
  subcontractorId: number;
  remainingPaid: string;
  compensationType: string;
  amountOwed: string | null;
  fixedAmount: string | null;
  computedOwed?: string;
  releasedAdvances?: number;
}) {
  // 1. ownership check (first select in the handler)
  h.selectQueue.push([{ subcontractorId: opts.subcontractorId }]);
  // 2. linked advances count (runs after ownership check, before delete)
  const advCount = opts.releasedAdvances ?? 0;
  h.selectQueue.push(Array.from({ length: advCount }, (_, i) => ({ id: i + 1 })));
  // 3. remaining paid (after delete + unlink)
  h.selectQueue.push([{ total: opts.remainingPaid }]);
  // 4. sub profile
  h.selectQueue.push([{
    compensationType: opts.compensationType,
    amountOwed:       opts.amountOwed,
    fixedAmount:      opts.fixedAmount,
  }]);
  // 5. hourly computed owed (only when needed)
  if (opts.computedOwed !== undefined) {
    h.selectQueue.push([{ computedOwed: opts.computedOwed }]);
  }
}

beforeEach(() => {
  h.selectQueue.length = 0;
  h.updates.length = 0;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DELETE /jobs/:id/sub-payments/:paymentId — status recalculation", () => {

  // ── Transition 1: partial → unpaid ──────────────────────────────────────────
  it("resets status to 'unpaid' and clears amountPaid when all payments are deleted (hourly)", async () => {
    // After deleting the last payment, SUM = 0 → newPaid ≤ 0.005 → "unpaid".
    // The hours-query branch should NOT be reached (short-circuits before it).
    pushSelects({
      subcontractorId: 7,
      remainingPaid:   "0",
      compensationType: "hourly",
      amountOwed:      null,
      fixedAmount:     null,
      // no computedOwed — the handler should not issue that query
    });

    const res = await request(app).delete("/jobs/1/sub-payments/6");

    expect(res.status).toBe(200);
    expect(res.body.newStatus).toBe("unpaid");
    expect(res.body.newPaid).toBeCloseTo(0);

    const finalUpdate = h.updates.find((u: any) => u.paymentStatus !== undefined);
    expect(finalUpdate?.paymentStatus).toBe("unpaid");
    expect(finalUpdate?.amountPaid).toBeNull();
    expect(finalUpdate?.paidAt).toBeNull();
    expect(finalUpdate?.lastPaidAt).toBeNull();
  });

  // ── Transition 2: paid → partial ────────────────────────────────────────────
  it("sets status to 'partial' when remaining paid is less than computed hourly owed", async () => {
    // Hourly sub computed owed = $100. After deleting one payment, $40 remains.
    // $40 < $100 × 0.99 → "partial".
    pushSelects({
      subcontractorId: 7,
      remainingPaid:   "40.00",
      compensationType: "hourly",
      amountOwed:      null,
      fixedAmount:     null,
      computedOwed:    "100.00",
    });

    const res = await request(app).delete("/jobs/1/sub-payments/5");

    expect(res.status).toBe(200);
    expect(res.body.newStatus).toBe("partial");
    expect(res.body.newPaid).toBeCloseTo(40);

    const finalUpdate = h.updates.find((u: any) => u.paymentStatus !== undefined);
    expect(finalUpdate?.paymentStatus).toBe("partial");
    expect(finalUpdate?.amountPaid).toBe("40.00");
  });

  // ── Regression: hourly sub remaining paid ≥ computed owed → "paid" ──────────
  it("correctly resolves to 'paid' (not 'partial') when remaining paid covers computed hourly owed", async () => {
    // Before the fix: amountOwed=null + fixedAmount=null caused owedAmount=null,
    // so the code always fell through to "partial" for any newPaid > 0.
    // After the fix: computed from job_sub_hours → $100 paid / $100 owed → "paid".
    pushSelects({
      subcontractorId: 7,
      remainingPaid:   "100.00",
      compensationType: "hourly",
      amountOwed:      null,
      fixedAmount:     null,
      computedOwed:    "100.00",
    });

    const res = await request(app).delete("/jobs/1/sub-payments/7");

    expect(res.status).toBe(200);
    expect(res.body.newStatus).toBe("paid");

    const finalUpdate = h.updates.find((u: any) => u.paymentStatus !== undefined);
    expect(finalUpdate?.paymentStatus).toBe("paid");
  });

  // ── Non-hourly: fixed sub still uses fixedAmount ────────────────────────────
  it("uses fixedAmount for status calc on fixed-type subs (no hours query needed)", async () => {
    // Fixed sub: fixedAmount = $200, remaining paid = $150 → partial.
    pushSelects({
      subcontractorId: 9,
      remainingPaid:   "150.00",
      compensationType: "fixed",
      amountOwed:      null,
      fixedAmount:     "200.00",
      // no computedOwed — should not reach the hourly branch
    });

    const res = await request(app).delete("/jobs/2/sub-payments/8");

    expect(res.status).toBe(200);
    expect(res.body.newStatus).toBe("partial");
  });

  // ── Manual amountOwed override takes precedence ────────────────────────────
  it("uses manual amountOwed override instead of computed hours when override is set", async () => {
    // amountOwed override = $80, remaining paid = $80 → paid (≥99%).
    // The hours query should NOT be reached because the first branch matches.
    pushSelects({
      subcontractorId: 11,
      remainingPaid:   "80.00",
      compensationType: "hourly",
      amountOwed:      "80.00",
      fixedAmount:     null,
      // no computedOwed
    });

    const res = await request(app).delete("/jobs/3/sub-payments/9");

    expect(res.status).toBe(200);
    expect(res.body.newStatus).toBe("paid");
  });
});
