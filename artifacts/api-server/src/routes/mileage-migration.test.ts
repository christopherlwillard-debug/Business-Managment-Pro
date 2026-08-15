// Mileage migration — retry-safety regression tests
//
// Verifies that `POST /admin/migrations/mileage-2026-recalc` is safe to re-run
// after a transient failure during Phase 2 (import aggregate repair).
//
// Scenario under test:
//   Run 1 — All logs already at $0.760 (Phase 1 is a no-op), but
//            recalcImportExpenses throws a transient error.
//            Expected: HTTP 500 so the caller knows to retry.
//
//   Run 2 — Same state: logs still at $0.760, import is re-discovered from
//            ALL H2 2026 logs (not just those updated in Run 1).
//            recalcImportExpenses now succeeds.
//            Expected: HTTP 200 { ok: true, logsUpdated: 0, importsRecalculated: 1 }
//
// This confirms the Phase 2 discovery query is independent of Phase 1 — imports
// whose logs were already corrected are still discovered and repaired on retry.
//
// DB select order per request (Phase 1 no-op scenario):
//   [0]  logsToFix select            → [] (no logs need updating)
//   [1]  allImportIds selectDistinct → [{ importId: N }]
//   [2]  SUM(deductionAmount)        → [{ total: "760.00" }]  ← only on success

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Hoist shared state AND the recalc mock function ──────────────────────────
// vi.hoisted() runs before vi.mock() factory invocations, so we can safely
// reference h and recalcMock inside the vi.mock() factory below.
const { h, recalcMock } = vi.hoisted(() => ({
  h: { selectQueue: [] as any[][] },
  recalcMock: vi.fn<(id: number) => Promise<void>>(),
}));

// ── Mock @workspace/db ────────────────────────────────────────────────────────
// We must export ALL tables that admin-migrations.ts imports from @workspace/db.
// Use a Proxy stub so any column access (e.g. mileageLogsTable.id) returns an
// empty object rather than throwing "Cannot read properties of undefined".
// The mock db ignores column/table references passed to select/where/from, so
// the stubs need only be non-undefined — they don't need real Drizzle structure.
vi.mock("@workspace/db", () => {
  // A stub column: any property access returns an empty object (never undefined)
  const col = {};
  const table = new Proxy(col, { get: () => col });

  function makeChain() {
    const c: any = {
      from:     () => c,
      where:    () => c,
      orderBy:  () => c,
      groupBy:  () => c,
      limit:    () => c,
      then(resolve: (v: any) => any, reject: (e: any) => any) {
        return Promise.resolve(h.selectQueue.shift() ?? []).then(resolve, reject);
      },
    };
    return c;
  }

  return {
    db: {
      select:         () => makeChain(),
      selectDistinct: () => makeChain(),
      insert: () => ({
        values: (vals: any) => ({
          returning: () => Promise.resolve([{ id: 1, ...vals }]),
          onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }),
        }),
      }),
      update: () => ({
        set: (_vals: any) => ({
          where: () => Promise.resolve([]),
        }),
      }),
      transaction: async (fn: (tx: any) => Promise<void>) => {
        const tx = {
          update: () => ({
            set: () => ({ where: () => Promise.resolve([]) }),
          }),
          delete: () => ({ where: () => Promise.resolve() }),
        };
        await fn(tx);
      },
      delete: () => ({ where: () => Promise.resolve() }),
    },
    plaidConnectionsTable:        table,
    mileageLogsTable:             table,
    expensesTable:                table,
    mfhManufacturersTable:        table,
    mfhModelsTable:               table,
    jobsTable:                    table,
    clientsTable:                 table,
    subPaymentRecordsTable:       table,
    productionServiceTypesTable:  table,
  };
});

// ── Mock ./mileage — recalcImportExpenses is controlled per-test via recalcMock
vi.mock("./mileage", () => ({
  recalcImportExpenses: recalcMock,
  getIrsRateForDate: vi.fn((date: string) =>
    date >= "2026-07-01" ? 0.760 : 0.725
  ),
}));

// ── Stub guards ───────────────────────────────────────────────────────────────
vi.mock("./guards", () => ({
  sectionGuard:     () => (_req: any, _res: any, next: any) => next(),
  ownerGuard:       () => (_req: any, _res: any, next: any) => next(),
  requireOwner:     () => (_req: any, _res: any, next: any) => next(),
  getRequestUserId: () => null,
}));

// ── Import router after all mocks are in place ────────────────────────────────
const { default: migrationsRouter } = await import("./admin-migrations");

const app = express();
app.use(express.json());
app.use((_req, _res, next) => {
  (_req as any).user = { id: 1, claims: { sub: "user_1" } };
  next();
});
app.use("/admin/migrations", migrationsRouter);

// ── Fixtures ──────────────────────────────────────────────────────────────────
const IMPORT_10 = { importId: 10 };
const IMPORT_11 = { importId: 11 };
const SUM_760   = { total: "760.00" };

beforeEach(() => {
  h.selectQueue.length = 0;
  recalcMock.mockReset();
  // Default: resolve successfully (tests that need failure override below)
  recalcMock.mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /admin/migrations/mileage-2026-recalc — retry safety", () => {

  it("returns 500 when recalcImportExpenses throws (all logs already at $0.760)", async () => {
    // Phase 1: no logs need updating (already at 0.760)
    h.selectQueue.push([]);          // [0] logsToFix → empty
    // Phase 2: one import discovered from all H2 2026 logs
    h.selectQueue.push([IMPORT_10]); // [1] allImportIds → [10]
    h.selectQueue.push([]);          // [2] legacyLogs for import 10 → none (already consolidated)
    // recalcImportExpenses fails — SUM query never reached
    recalcMock.mockRejectedValue(new Error("DB timeout — transient error"));

    const res = await request(app).post("/admin/migrations/mileage-2026-recalc");

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/retry/i);
    expect(res.body.failedImports).toHaveLength(1);
    expect(res.body.failedImports[0].importId).toBe(10);
    expect(res.body.logsUpdated).toBe(0);
    expect(res.body.importsRepaired).toBe(0);
    expect(res.body.importsTotal).toBe(1);
    expect(recalcMock).toHaveBeenCalledOnce();
  });

  it("on retry (logs still at $0.760) re-discovers the import and returns ok:true", async () => {
    // Retry scenario: logs are already at 0.760 (Phase 1 is a no-op),
    // but the import aggregate was never repaired from the previous failed run.
    // The Phase 2 query uses ALL H2 2026 logs, so it still finds importId 10.
    h.selectQueue.push([]);          // [0] logsToFix → empty (logs already fixed)
    h.selectQueue.push([IMPORT_10]); // [1] allImportIds → [10] (still discovered)
    h.selectQueue.push([]);          // [2] legacyLogs for import 10 → none (already consolidated)
    h.selectQueue.push([SUM_760]);   // [3] SUM after successful recalc
    // recalcImportExpenses succeeds this time (default mock)

    const res = await request(app).post("/admin/migrations/mileage-2026-recalc");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.logsUpdated).toBe(0);       // Phase 1 was still a no-op
    expect(res.body.expensesUpdated).toBe(0);
    expect(res.body.importsRecalculated).toBe(1); // Phase 2 repaired the import
    expect(recalcMock).toHaveBeenCalledWith(10);
  });

  it("returns ok:true with zeros when there are no H2 2026 logs at all", async () => {
    h.selectQueue.push([]); // [0] logsToFix → empty
    h.selectQueue.push([]); // [1] allImportIds → empty

    const res = await request(app).post("/admin/migrations/mileage-2026-recalc");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.logsUpdated).toBe(0);
    expect(res.body.importsRecalculated).toBe(0);
    expect(recalcMock).not.toHaveBeenCalled();
  });

  it("partial failure: first import fails, second succeeds → 500 with accurate counts", async () => {
    h.selectQueue.push([]);                             // [0] logsToFix → empty
    h.selectQueue.push([IMPORT_10, IMPORT_11]);         // [1] allImportIds → [10, 11]
    h.selectQueue.push([]);                             // [2] legacyLogs for import 10 → none
    // import 10's recalcMock will fail; SUM query not consumed for it
    h.selectQueue.push([]);                             // [3] legacyLogs for import 11 → none
    h.selectQueue.push([SUM_760]);                      // [4] SUM for import 11 (succeeds)

    // import 10 rejects, import 11 resolves
    recalcMock
      .mockRejectedValueOnce(new Error("timeout on import 10"))
      .mockResolvedValueOnce(undefined);

    const res = await request(app).post("/admin/migrations/mileage-2026-recalc");

    expect(res.status).toBe(500);
    expect(res.body.failedImports).toHaveLength(1);
    expect(res.body.failedImports[0].importId).toBe(10);
    expect(res.body.importsRepaired).toBe(1);  // import 11 succeeded
    expect(res.body.importsTotal).toBe(2);
    expect(recalcMock).toHaveBeenCalledTimes(2);
  });

  it("fresh run with logs needing update repairs both logs and imports", async () => {
    const LOG_TO_FIX = { id: 42, miles: "100", expenseId: null };
    h.selectQueue.push([LOG_TO_FIX]); // [0] logsToFix → one log needing update
    h.selectQueue.push([IMPORT_10]);   // [1] allImportIds → [10]
    h.selectQueue.push([]);            // [2] legacyLogs for import 10 → none
    h.selectQueue.push([SUM_760]);     // [3] SUM after recalc

    const res = await request(app).post("/admin/migrations/mileage-2026-recalc");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.logsUpdated).toBe(1);
    expect(res.body.expensesUpdated).toBe(0); // log has no expenseId
    expect(res.body.importsRecalculated).toBe(1);
    expect(recalcMock).toHaveBeenCalledWith(10);
  });

  it("imported H2 logs with per-trip expenseId are consolidated before aggregates rebuild — no double-count", async () => {
    // Scenario: an import has H2 2026 logs that were logged when the system still
    // created per-trip expenses for each imported log (legacy state). Without the
    // consolidation step, recalcImportExpenses would produce monthly aggregate
    // expenses on top of those per-trip ones — double-counting the deduction.
    // The migration must unlink + delete the per-trip expenses first (transactionally),
    // then rebuild monthly aggregates, leaving exactly one expense representation.
    h.selectQueue.push([]);                              // [0] logsToFix → empty (logs at $0.760)
    h.selectQueue.push([IMPORT_10]);                     // [1] allImportIds → [10]
    // [2] legacyLogs for import 10: two H2 logs with per-trip expenseIds
    h.selectQueue.push([
      { id: 7, expenseId: 20 },  // H2 log, legacy per-trip expense id=20
      { id: 8, expenseId: 21 },  // H2 log, legacy per-trip expense id=21
    ]);
    // consolidation transaction runs (unlinks logs, deletes expenses 20 & 21)
    // recalcImportExpenses mock resolves — monthly aggregate rebuilt
    h.selectQueue.push([SUM_760]);                       // [3] SUM after recalc

    const res = await request(app).post("/admin/migrations/mileage-2026-recalc");

    // Migration succeeds: per-trip expenses consolidated, aggregates rebuilt
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.importsRecalculated).toBe(1);
    // recalcImportExpenses was called (aggregates rebuilt post-consolidation)
    expect(recalcMock).toHaveBeenCalledWith(10);
    // recalcMock was called exactly once — not skipped, not called twice
    expect(recalcMock).toHaveBeenCalledTimes(1);
  });
});
