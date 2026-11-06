import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  queue: [] as any[][],
  conditions: [] as any[],
  consumed: 0,
  selection: null as any,
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: (selection?: unknown) => {
      h.selection = selection ?? null;
      const chain: any = {
        from: () => chain,
        innerJoin: () => chain,
        orderBy: () => chain,
        where: (condition: unknown) => {
          h.conditions.push(condition);
          return chain;
        },
        limit: () => chain,
        then: (resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) => {
          h.consumed++;
          return Promise.resolve(h.queue.shift() ?? []).then(resolve, reject);
        },
      };
      return chain;
    },
  },
}));

vi.mock("@workspace/db/schema", () => {
  const table = (fields: string[]) => Object.fromEntries(fields.map(field => [field, field]));
  return {
    businessesTable: table(["id", "slug"]),
    subPaymentRecordsTable: table(["subcontractorId", "paymentDate", "isReversal", "businessId", "businessLine", "amount", "advanceAmount"]),
    expensesTable: table(["subcontractorId", "category", "date", "jobSubHoursId", "businessId", "businessLine", "amount"]),
    paymentsTable: table(["subcontractorId", "year", "businessId", "amount"]),
    subcontractorsTable: table(["id", "name"]),
    settingsTable: table(["id"]),
    generated1099sTable: table(["id"]),
    mileageLogsTable: table(["id"]),
    jobsTable: table(["id", "title", "status", "startDate", "businessLine"]),
    jobSubHoursTable: table(["id"]),
    jobSubcontractorsTable: table(["id", "jobId", "subcontractorId", "compensationType", "amountOwed", "fixedAmount", "allocationPct", "amountPaid", "paidDate", "paidNotes", "paymentStatus", "paidAt"]),
    invoicesTable: table(["id"]),
    jobMileageReimbursementsTable: table(["id"]),
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => ({ op: "eq", args }),
  and: (...args: unknown[]) => ({ op: "and", args }),
  or: (...args: unknown[]) => ({ op: "or", args }),
  isNull: (...args: unknown[]) => ({ op: "isNull", args }),
  inArray: (...args: unknown[]) => ({ op: "inArray", args }),
  ne: (...args: unknown[]) => ({ op: "ne", args }),
  gte: (...args: unknown[]) => ({ op: "gte", args }),
  lte: (...args: unknown[]) => ({ op: "lte", args }),
  sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => ({ op: "sql", strings, values }), { raw: (value: string) => ({ op: "sql-raw", value }) }),
}));

const { computeYtd, loadPaymentHistoryJobs, filterPaymentHistoryJobs } = await import("./subcontractors");

beforeEach(() => {
  h.queue.length = 0;
  h.conditions.length = 0;
  h.consumed = 0;
  h.selection = null;
});

afterEach(() => {
  expect(h.queue).toHaveLength(0);
});

describe("subcontractor YTD business isolation", () => {
  it("scopes new, manual-expense, and legacy payment totals to the resolved business ID", async () => {
    h.queue.push([{ id: 7 }]); // business slug lookup
    h.queue.push([{ total: "100.00" }]); // pay-worker payments
    h.queue.push([{ total: "50.00" }]); // manual subcontractor expenses
    h.queue.push([{ total: "25.00" }]); // legacy direct payments

    await expect(computeYtd(4, 2026, "asphalt_sealing")).resolves.toBe(175);
    expect(h.consumed).toBe(4);
    expect(h.conditions[1]).toMatchObject({ op: "and" });
    expect(JSON.stringify(h.conditions[1])).toContain('"op":"or"');
    expect(JSON.stringify(h.conditions[2])).toContain('"op":"or"');
    expect(JSON.stringify(h.conditions[3])).toContain('"op":"eq"');
    expect(JSON.stringify(h.conditions[3])).toContain('"businessId"');
  });

  it("returns zero for an unknown business instead of falling back to global totals", async () => {
    h.queue.push([]);
    await expect(computeYtd(4, 2026, "unknown-business")).resolves.toBe(0);
    expect(h.consumed).toBe(1);
  });

  it("preserves the all-business YTD total when no business filter is supplied", async () => {
    h.queue.push([{ total: "100.00" }]);
    h.queue.push([{ total: "50.00" }]);
    h.queue.push([{ total: "25.00" }]);
    await expect(computeYtd(4, 2026)).resolves.toBe(175);
    expect(h.consumed).toBe(3);
  });
});


describe("subcontractor payment history event dates", () => {
  const jobRow = (overrides: Record<string, unknown> = {}) => ({
    subcontractorId: 4,
    subcontractorName: "Test Sub",
    jobId: 12,
    jobTitle: "Test Job",
    jobStatus: "closed",
    jobStartDate: "2025-11-20",
    businessLine: "general_contracting",
    compensationType: "hourly",
    amountOwedOverride: null,
    fixedAmount: null,
    allocationPct: null,
    hasLedgerRecords: true,
    amountPaid: "125.00",
    paidDate: "2026-02-10",
    paidNotes: null,
    paymentStatus: "paid",
    paidAt: "2026-02-10",
    computedOwed: "300.00",
    totalHours: "10.00",
    ...overrides,
  });

  it("uses payment event dates and limits the ledger sum to the selected year", async () => {
    h.queue.push([jobRow()]);
    const rows = await loadPaymentHistoryJobs(4, { year: 2026, startDate: null, endDate: null });
    expect(rows[0]).toMatchObject({
      amountPaid: 125,
      effectiveDate: "2026-02-10",
      effectiveYear: 2026,
      paymentStatus: "partial",
    });
    expect(JSON.stringify(h.selection?.amountPaid)).toContain("2026-01-01");
    expect(JSON.stringify(h.selection?.amountPaid)).toContain("2026-12-31");
    expect(filterPaymentHistoryJobs(rows, 2026, null)).toHaveLength(1);
    expect(filterPaymentHistoryJobs(rows, 2025, null)).toHaveLength(0);
  });

  it("does not use the job start date or cached paid amount when all ledger entries are reversed", async () => {
    h.queue.push([jobRow({
      amountPaid: "0.00",
      paidDate: null,
      paidAt: "2025-11-20",
      paymentStatus: "paid",
    })]);
    const rows = await loadPaymentHistoryJobs(4);
    expect(rows[0]).toMatchObject({
      amountPaid: 0,
      effectiveDate: null,
      effectiveYear: null,
      paymentStatus: "unpaid",
      paidAt: null,
    });
    expect(filterPaymentHistoryJobs(rows, 2025, null)).toHaveLength(0);
  });

  it("uses the requested date window for both the event amount and event date", async () => {
    h.queue.push([jobRow({ paidDate: "2026-04-14", amountPaid: "75.00" })]);
    const rows = await loadPaymentHistoryJobs(4, {
      year: null,
      startDate: "2026-04-01",
      endDate: "2026-04-30",
    });
    expect(rows[0].effectiveDate).toBe("2026-04-14");
    const selection = JSON.stringify(h.selection?.amountPaid);
    expect(selection).toContain("2026-04-01");
    expect(selection).toContain("2026-04-30");
  });
});
