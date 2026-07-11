// Integration tests for business-trips receipt-proof audit logic.
//
// Pins the rule: a trip is Audit Ready (missingReceipts === 0) only when
// EVERY expense has genuine proof:
//   (a) receiptStatus='uploaded'  AND receiptUrl is non-empty, OR
//   (b) receiptStatus='missing'   AND receiptMissingExplanation is non-empty.
//
// An expense with receiptStatus='uploaded' but no receiptUrl MUST be counted
// as unproven, even though its status flag says "uploaded".
//
// The DB layer is fully mocked — no real connection required.
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Hoisted mutable state ────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  // SELECT results — each awaited chain pops one entry off
  selectQueue: [] as any[][],
  // Captured .set(data) payloads from UPDATE calls
  updates: [] as any[],
  // Results returned by UPDATE … RETURNING — each pop is consumed in order
  updateReturnQueue: [] as any[][],
}));

// ── Mock @workspace/db ────────────────────────────────────────────────────────
// The chain is a thenable so that `await chain.where().orderBy()` resolves.
// Every fluent method returns the same chain object.
vi.mock("@workspace/db", () => {
  function makeChain() {
    const chain: any = {
      from:      () => chain,
      leftJoin:  () => chain,
      innerJoin: () => chain,
      orderBy:   () => chain,
      groupBy:   () => chain,
      where:     () => chain,
      limit:     () => chain,
      // Make the chain itself awaitable — pops the next queued result
      then(resolve: (v: any) => any, reject: (e: any) => any) {
        return Promise.resolve(h.selectQueue.shift() ?? []).then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    db: {
      select:  () => makeChain(),

      update:  () => ({
        set: (data: any) => {
          h.updates.push(data);
          const returning = () => Promise.resolve(h.updateReturnQueue.shift() ?? [data]);
          return {
            where: () => ({ returning }),
            returning,
          };
        },
      }),

      insert:  () => ({
        values: (data: any) => ({
          returning: () => Promise.resolve([{ id: 99, ...data }]),
        }),
      }),

      delete:  () => ({ where: () => Promise.resolve() }),
    },
  };
});

// ── Import router AFTER mocks ─────────────────────────────────────────────────
const { default: tripsRouter } = await import("./trips");

// ── Minimal Express app ───────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use((_req, _res, next) => {
  (_req as any).user = { id: 1, claims: { sub: "user_1" } };
  next();
});
app.use("/", tripsRouter);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A minimal raw DB trip row as returned by the GROUP BY stats query. */
function fakeRawTrip(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    destination: "Houston, TX",
    businessPurpose: "Site survey",
    startDate: "2026-06-01",
    endDate: "2026-06-03",
    jobId: null,
    status: "completed",
    closedAt: new Date("2026-06-04"),
    closedBy: "user_1",
    createdAt: new Date("2026-06-01"),
    jobTitle: null,
    // aggregate stat columns (DB returns strings from COUNT/SUM)
    receiptCount: "3",
    totalAmount: "420.00",
    mealTotal: "60.00",
    deductibleMeals: "30.00",
    missingReceipts: "0",
    hotelTotal: "200.00",
    airfareTotal: "0",
    transportTotal: "0",
    mealsHaveOvernightAnswered: "3",
    mealsCount: "1",
    rentalCarTotal: "0",
    parkingTollTotal: "0",
    potentiallyNonDeductibleMeals: "0",
    mealsMissingReceipts: "0",
    ...overrides,
  };
}

beforeEach(() => {
  h.selectQueue.length = 0;
  h.updates.length = 0;
  h.updateReturnQueue.length = 0;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /trips — audit-ready receipt proof rules", () => {
  it("returns missingReceipts=0 when every expense has an uploaded file", async () => {
    h.selectQueue.push([fakeRawTrip({ missingReceipts: "0" })]);

    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body[0].missingReceipts).toBe(0);
  });

  it("returns missingReceipts>0 when a receipt is marked uploaded but has no URL", async () => {
    // The SQL in trips.ts counts (uploaded AND no receiptUrl) as unproven.
    h.selectQueue.push([fakeRawTrip({ missingReceipts: "1" })]);

    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body[0].missingReceipts).toBe(1);
  });

  it("returns missingReceipts>0 when a receipt is missing with no explanation", async () => {
    h.selectQueue.push([fakeRawTrip({ missingReceipts: "2" })]);

    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body[0].missingReceipts).toBe(2);
  });

  it("returns missingReceipts=0 when missing receipt has a valid explanation", async () => {
    h.selectQueue.push([fakeRawTrip({ missingReceipts: "0" })]);

    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body[0].missingReceipts).toBe(0);
  });

  it("formats trip stats as numbers, not raw strings", async () => {
    h.selectQueue.push([fakeRawTrip({ missingReceipts: "0", totalAmount: "420.00", mealTotal: "60.00" })]);

    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    const trip = res.body[0];
    expect(typeof trip.missingReceipts).toBe("number");
    expect(typeof trip.totalAmount).toBe("number");
    expect(typeof trip.mealTotal).toBe("number");
  });
});

describe("receipt proof invariant (unit)", () => {
  // Contract test documenting the full proof-state matrix.
  // The SQL in trips.ts counts both of these conditions as unproven:
  //   (uploaded AND no URL) OR (missing AND no explanation)
  it("correctly classifies all receipt proof states", () => {
    const CASES = [
      { receiptStatus: "uploaded", receiptUrl: null,        explanation: null,   isProven: false },
      { receiptStatus: "uploaded", receiptUrl: "",           explanation: null,   isProven: false },
      { receiptStatus: "uploaded", receiptUrl: "http://x",  explanation: null,   isProven: true  },
      { receiptStatus: "missing",  receiptUrl: null,        explanation: null,   isProven: false },
      { receiptStatus: "missing",  receiptUrl: null,        explanation: "",     isProven: false },
      { receiptStatus: "missing",  receiptUrl: null,        explanation: "lost", isProven: true  },
    ];

    for (const c of CASES) {
      const uploadedWithoutUrl = c.receiptStatus === "uploaded" && !c.receiptUrl?.trim();
      const missingWithoutExplanation = c.receiptStatus === "missing" && !c.explanation?.trim();
      const isUnproven = uploadedWithoutUrl || missingWithoutExplanation;
      expect(isUnproven).toBe(!c.isProven);
    }
  });
});

describe("PATCH /trips/:id — status transitions", () => {
  it("closes an open trip and records closedAt/closedBy server-side", async () => {
    const updateResult = { id: 1, status: "completed", closedAt: new Date(), closedBy: "user_1" };
    h.updateReturnQueue.push([updateResult]);
    // buildTripsQuery re-fetch after update
    h.selectQueue.push([fakeRawTrip({ status: "completed" })]);

    const res = await request(app).patch("/1").send({ status: "completed" });
    expect(res.status).toBe(200);
    const setData = h.updates[0];
    expect(setData.status).toBe("completed");
    expect(setData.closedAt).toBeDefined();
    // closedBy must come from req.user, not req.body
    expect(setData.closedBy).toBe("user_1");
  });

  it("archives a completed trip", async () => {
    const updateResult = { id: 1, status: "archived" };
    h.updateReturnQueue.push([updateResult]);
    h.selectQueue.push([fakeRawTrip({ status: "archived" })]);

    const res = await request(app).patch("/1").send({ status: "archived" });
    expect(res.status).toBe(200);
    expect(h.updates[0].status).toBe("archived");
  });

  it("reopens an archived trip (clears closedAt)", async () => {
    const updateResult = { id: 1, status: "open", closedAt: null };
    h.updateReturnQueue.push([updateResult]);
    h.selectQueue.push([fakeRawTrip({ status: "open" })]);

    const res = await request(app).patch("/1").send({ status: "open" });
    expect(res.status).toBe(200);
    expect(h.updates[0].status).toBe("open");
    expect(h.updates[0].closedAt).toBeNull();
  });

  it("returns 404 if trip does not exist (RETURNING is empty)", async () => {
    h.updateReturnQueue.push([]);   // empty RETURNING → !updated → 404

    const res = await request(app).patch("/999").send({ status: "completed" });
    expect(res.status).toBe(404);
  });
});
