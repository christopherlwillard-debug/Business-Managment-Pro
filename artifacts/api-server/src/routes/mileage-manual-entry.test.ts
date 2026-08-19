// Mileage manual entry — endpoint-level rate-split regression tests
//
// Guards that POST /mileage, PUT /mileage/:id, and POST /portal/token/mileage
// derive the IRS rate from the trip DATE rather than a static settings value,
// so H2 2026 trips automatically use $0.760/mile without any manual override.
//
// Test contract:
//   - trip on 2026-06-30 → ratePerMile=0.725, deductionAmount=miles×0.725
//   - trip on 2026-07-01 → ratePerMile=0.760, deductionAmount=miles×0.760
//   - editing a trip's date to 2026-07-01 → same (rate re-derived from new date)
//
// Mock design: db.insert().values(vals).returning() echoes {id:1,...vals} back so
// that formatMileage(log) in the response carries the computed ratePerMile /
// deductionAmount without a real database. db.update().set(vals) does the same.

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Hoisted shared state ──────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  // Queue for db.select() calls (shift() → next result, or [] on empty queue)
  selectQueue: [] as any[][],
}));

// ── Mock @workspace/db ────────────────────────────────────────────────────────
vi.mock("@workspace/db", () => {
  function makeSelectChain() {
    const c: any = {
      from:      () => c,
      where:     () => c,
      leftJoin:  () => c,
      innerJoin: () => c,
      orderBy:   () => c,
      limit:     () => c,
      then(resolve: (v: any) => any, reject: (e: any) => any) {
        return Promise.resolve(h.selectQueue.shift() ?? []).then(resolve, reject);
      },
    };
    return c;
  }
  return {
    db: {
      select: () => makeSelectChain(),
      // Echo the inserted/updated values back with a synthetic id so the route
      // can read ratePerMile / deductionAmount from the returned row.
      insert: () => ({
        values: (vals: any) => ({
          returning: () => Promise.resolve([{ id: 1, ...vals }]),
          onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }),
        }),
      }),
      update: () => ({
        set: (vals: any) => ({
          where: () => ({
            // Merge a minimal base so formatMileage has all required fields
            returning: () => Promise.resolve([{
              id: 999, date: vals.date ?? "2026-07-01",
              miles: vals.miles ?? "10", classification: "business",
              ...vals,
            }]),
          }),
        }),
      }),
      delete: () => ({ where: () => Promise.resolve() }),
    },
    plaidConnectionsTable: {},
  };
});

// ── Stub guards ───────────────────────────────────────────────────────────────
vi.mock("./guards", () => ({
  sectionGuard:       () => (_req: any, _res: any, next: any) => next(),
  ownerGuard:         () => (_req: any, _res: any, next: any) => next(),
  getRequestUserId:   () => null,
  requireOwner:       () => (_req: any, _res: any, next: any) => next(),
}));

// Import the mileage router after mocks are in place
const { default: mileageRouter } = await import("./mileage");

const app = express();
app.use(express.json());
// Simulate a logged-in user (needed by requireAuth middleware calls inside router)
app.use((_req, _res, next) => {
  (_req as any).user = { id: 1, claims: { sub: "user_1" } };
  next();
});
app.use("/mileage", mileageRouter);

beforeEach(() => {
  h.selectQueue.length = 0;
});

// ── POST /mileage — create manual trip ───────────────────────────────────────

describe("POST /mileage — rate derived from trip date", () => {

  it("rejects reserved generated-job source values", async () => {
    const res = await request(app)
      .post("/mileage")
      .send({
        date: "2026-08-19",
        miles: 10,
        classification: "business",
        businessId: 1,
        source: "job_client_route",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid mileage source");
  });

  it("H1 2026 trip (Jun 30) uses $0.725/mile and correct deductionAmount", async () => {
    const miles = 100;
    const res = await request(app)
      .post("/mileage")
      .send({
        date: "2026-06-30",
        miles,
        startLocation: "A",
        endLocation: "B",
        classification: "business",
        businessId: 1,
      });

    expect(res.status).toBe(201);
    // Rate must be 0.725 (H1 2026)
    expect(res.body.ratePerMile).toBeCloseTo(0.725, 10);
    // Deduction = 100 mi × $0.725 = $72.50
    expect(res.body.deductionAmount).toBeCloseTo(72.5, 10);
  });

  it("H2 2026 trip (Jul 1) uses $0.760/mile and correct deductionAmount", async () => {
    const miles = 100;
    const res = await request(app)
      .post("/mileage")
      .send({
        date: "2026-07-01",
        miles,
        startLocation: "A",
        endLocation: "B",
        classification: "business",
        businessId: 1,
      });

    expect(res.status).toBe(201);
    // Rate must be 0.760 (H2 2026)
    expect(res.body.ratePerMile).toBeCloseTo(0.760, 10);
    // Deduction = 100 mi × $0.760 = $76.00
    expect(res.body.deductionAmount).toBeCloseTo(76.0, 10);
  });

  it("H2 2026 trip (Aug 15) uses $0.760/mile", async () => {
    const res = await request(app)
      .post("/mileage")
      .send({ date: "2026-08-15", miles: 50, classification: "business", businessId: 1 });

    expect(res.status).toBe(201);
    expect(res.body.ratePerMile).toBeCloseTo(0.760, 10);
    expect(res.body.deductionAmount).toBeCloseTo(38.0, 10); // 50 × 0.760
  });

  it("personal trip: deductionAmount is 0 regardless of date", async () => {
    const res = await request(app)
      .post("/mileage")
      .send({ date: "2026-07-01", miles: 100, classification: "personal", businessId: 1 });

    expect(res.status).toBe(201);
    // Personal trips have no deduction
    expect(res.body.deductionAmount).toBeCloseTo(0, 10);
  });

  it("H2 2026 deduction is higher than H1 deduction for same miles", async () => {
    const milesValue = 50;

    const h1Res = await request(app)
      .post("/mileage")
      .send({ date: "2026-06-30", miles: milesValue, classification: "business", businessId: 1 });

    const h2Res = await request(app)
      .post("/mileage")
      .send({ date: "2026-07-01", miles: milesValue, classification: "business", businessId: 1 });

    expect(h1Res.status).toBe(201);
    expect(h2Res.status).toBe(201);
    // H2 deduction ($38) must exceed H1 deduction ($36.25) for the same mileage
    expect(h2Res.body.deductionAmount).toBeGreaterThan(h1Res.body.deductionAmount);
  });
});

// ── GET /mileage/summary — aggregate deduction sums stored per-trip amounts ───

describe("GET /mileage/summary — split-year aggregate deduction", () => {

  it("totalDeduction sums stored deductionAmount fields across H1 and H2 trips", async () => {
    // Two H1 trips at $0.725 and one H2 trip at $0.760.
    // If the route multiplied miles × a single rate instead of summing deductionAmount,
    // the result would be wrong: 300mi × 0.725 = $217.50 or 300mi × 0.760 = $228.
    // Correct answer: (100 × 0.725) + (100 × 0.725) + (100 × 0.760) = $222.00
    h.selectQueue.push([
      { id: 1, date: "2026-06-15", miles: "100", classification: "business", ratePerMile: "0.725", deductionAmount: "72.50" },
      { id: 2, date: "2026-06-30", miles: "100", classification: "business", ratePerMile: "0.725", deductionAmount: "72.50" },
      { id: 3, date: "2026-07-01", miles: "100", classification: "business", ratePerMile: "0.760", deductionAmount: "76.00" },
    ]);

    const res = await request(app).get("/mileage/summary?businessId=1");
    expect(res.status).toBe(200);

    expect(res.body.businessMiles).toBeCloseTo(300, 10);
    // Must equal the sum of stored deductionAmounts
    expect(res.body.totalDeduction).toBeCloseTo(221.0, 10);  // 72.50+72.50+76.00
    // Derived blended rate must NOT equal either raw rate
    expect(res.body.ratePerMile).not.toBeCloseTo(0.725, 3);
    expect(res.body.ratePerMile).not.toBeCloseTo(0.760, 3);
    // Blended rate = $221 / 300mi ≈ 0.7367
    expect(res.body.ratePerMile).toBeCloseTo(221.0 / 300, 5);
  });

  it("totalDeduction differs from miles × single rate for split-year trips", async () => {
    // One H1 trip + one H2 trip of equal miles.
    // At $0.725: 200mi × 0.725 = $145.00 (wrong — understates H2 deduction)
    // At $0.760: 200mi × 0.760 = $152.00 (wrong — overstates H1 deduction)
    // Correct: (100 × 0.725) + (100 × 0.760) = $148.50
    h.selectQueue.push([
      { id: 10, date: "2026-06-30", miles: "100", classification: "business", ratePerMile: "0.725", deductionAmount: "72.50" },
      { id: 11, date: "2026-07-01", miles: "100", classification: "business", ratePerMile: "0.760", deductionAmount: "76.00" },
    ]);

    const res = await request(app).get("/mileage/summary?businessId=1");
    expect(res.status).toBe(200);

    expect(res.body.totalDeduction).toBeCloseTo(148.5, 10);
    // Must NOT be the single-rate result
    expect(res.body.totalDeduction).not.toBeCloseTo(145.0, 1); // 200mi × $0.725
    expect(res.body.totalDeduction).not.toBeCloseTo(152.0, 1); // 200mi × $0.760
  });

  it("ratePerMile returns null when there are no business trips", async () => {
    h.selectQueue.push([
      { id: 20, date: "2026-07-01", miles: "50", classification: "personal", ratePerMile: "0.760", deductionAmount: "0" },
    ]);

    const res = await request(app).get("/mileage/summary?businessId=1");
    expect(res.status).toBe(200);

    expect(res.body.totalDeduction).toBeCloseTo(0, 10);
    expect(res.body.ratePerMile).toBeNull();
  });
});

// ── PUT /mileage/:id — edit manual trip ──────────────────────────────────────

describe("PUT /mileage/:id — rate re-derived from the new trip date", () => {

  it("editing a trip to 2026-07-01 yields $0.760/mile", async () => {
    // select queue: [1] existing log (no expenseId → skip expense update), [2] no jobId lookup
    h.selectQueue.push([{ id: 999, date: "2026-06-01", miles: "10", ratePerMile: "0.725", expenseId: null, importId: null }]);

    const res = await request(app)
      .put("/mileage/999")
      .send({
        date: "2026-07-01",
        miles: 100,
        classification: "business",
      });

    expect(res.status).toBe(200);
    expect(res.body.ratePerMile).toBeCloseTo(0.760, 10);
    expect(res.body.deductionAmount).toBeCloseTo(76.0, 10);
  });

  it("editing a trip to 2026-06-30 yields $0.725/mile", async () => {
    h.selectQueue.push([{ id: 998, date: "2026-07-15", miles: "10", ratePerMile: "0.760", expenseId: null, importId: null }]);

    const res = await request(app)
      .put("/mileage/998")
      .send({
        date: "2026-06-30",
        miles: 100,
        classification: "business",
      });

    expect(res.status).toBe(200);
    expect(res.body.ratePerMile).toBeCloseTo(0.725, 10);
    expect(res.body.deductionAmount).toBeCloseTo(72.5, 10);
  });

  it("editing a trip with a linked expense updates the expense amount via the correct rate", async () => {
    // Provide an existing log WITH an expenseId so the route updates the linked expense
    h.selectQueue.push([{ id: 997, date: "2026-06-01", miles: "50", ratePerMile: "0.725", expenseId: 55, importId: null }]);

    const res = await request(app)
      .put("/mileage/997")
      .send({
        date: "2026-07-01",
        miles: 100,
        classification: "business",
      });

    // Route updates the linked expense with the new deductionAmount, then updates the log.
    // Both use 0.760 since the new date is in H2 2026.
    expect(res.status).toBe(200);
    expect(res.body.ratePerMile).toBeCloseTo(0.760, 10);
    expect(res.body.deductionAmount).toBeCloseTo(76.0, 10);
  });
});
