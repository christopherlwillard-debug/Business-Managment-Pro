import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  queue: [] as any[][],
  conditions: [] as any[],
  consumed: 0,
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => {
      const chain: any = {
        from: () => chain,
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
    jobsTable: table(["id"]),
    jobSubHoursTable: table(["id"]),
    jobSubcontractorsTable: table(["id"]),
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

const { computeYtd } = await import("./subcontractors");

beforeEach(() => {
  h.queue.length = 0;
  h.conditions.length = 0;
  h.consumed = 0;
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
