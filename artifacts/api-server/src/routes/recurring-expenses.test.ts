import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const recurringExpensesTable = {
    id: "recurring_expenses.id",
    businessId: "recurring_expenses.business_id",
    nextDueDate: "recurring_expenses.next_due_date",
  };
  const expensesTable = { id: "expenses.id" };
  const jobsTable = {
    id: "jobs.id",
    businessId: "jobs.business_id",
    businessLine: "jobs.business_line",
    title: "jobs.title",
  };
  return {
    recurringExpensesTable,
    expensesTable,
    jobsTable,
    selectResults: [] as unknown[][],
    updates: [] as Array<Record<string, unknown>>,
    updateResult: null as Record<string, unknown> | null,
    db: {
      select: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
    },
    resolveMutationBusiness: vi.fn(async () => ({
      ok: true as const,
      business: { id: 1, slug: "general_contracting" },
    })),
    belongsToBusiness: vi.fn(() => true),
  };
});

vi.mock("@workspace/db", () => ({ db: h.db }));
vi.mock("@workspace/db/schema", () => ({
  recurringExpensesTable: h.recurringExpensesTable,
  expensesTable: h.expensesTable,
  jobsTable: h.jobsTable,
}));
vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
  and: (...conditions: unknown[]) => ({ conditions }),
  getTableColumns: () => ({}),
}));
vi.mock("../lib/business-scope.js", () => ({
  resolveMutationBusiness: h.resolveMutationBusiness,
  belongsToBusiness: h.belongsToBusiness,
}));

const {
  default: recurringExpensesRouter,
  parseRecurringExpenseBusinessId,
  parseRecurringExpenseAmount,
  isValidRecurringExpenseDate,
  parseRecurringExpenseJobId,
  advanceDate,
} = await import("./recurring-expenses.js");

const app = express();
app.use(express.json());
app.use("/", recurringExpensesRouter);

function selectChain(rows: unknown[]) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    leftJoin: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

const currentTemplate = {
  id: 1,
  businessId: 1,
  description: "Old rent",
  amount: "500.00",
  category: "Rent",
  frequency: "monthly",
  startDate: "2026-01-01",
  endDate: null,
  nextDueDate: "2026-12-01",
  active: true,
  jobId: null,
  vendor: null,
  notes: null,
  createdAt: new Date("2026-01-01T12:00:00.000Z"),
};

beforeEach(() => {
  h.selectResults.length = 0;
  h.updates.length = 0;
  h.updateResult = null;
  h.db.select.mockReset();
  h.db.update.mockReset();
  h.db.select.mockImplementation(() => selectChain(h.selectResults.shift() ?? []));
  h.db.update.mockImplementation(() => {
    const chain: any = {
      set: (values: Record<string, unknown>) => {
        h.updates.push(values);
        return chain;
      },
      where: () => chain,
      returning: async () => h.updateResult ? [h.updateResult] : [],
    };
    return chain;
  });
  h.resolveMutationBusiness.mockReset().mockResolvedValue({
    ok: true,
    business: { id: 1, slug: "general_contracting" },
  });
  h.belongsToBusiness.mockReset().mockReturnValue(true);
});

describe("recurring expense validation", () => {
  it("accepts only positive safe integer business IDs", () => {
    expect(parseRecurringExpenseBusinessId("12")).toBe(12);
    expect(parseRecurringExpenseBusinessId(12)).toBe(12);
    expect(parseRecurringExpenseBusinessId(null)).toBeNull();
    expect(parseRecurringExpenseBusinessId("")).toBeNull();
  });

  it("normalizes recurring expense amounts and rejects malformed values", () => {
    expect(parseRecurringExpenseAmount("125.5")).toBe("125.50");
    expect(parseRecurringExpenseAmount(20)).toBe("20.00");
    for (const value of ["0", "-5", "10junk", "1e3", "1.999", "10000000000.00"]) {
      expect(parseRecurringExpenseAmount(value)).toBeNull();
    }
  });

  it("accepts only real calendar dates and optional blank end dates", () => {
    expect(isValidRecurringExpenseDate("2026-11-06")).toBe(true);
    expect(isValidRecurringExpenseDate(null, true)).toBe(true);
    expect(isValidRecurringExpenseDate("2026-02-30")).toBe(false);
    expect(isValidRecurringExpenseDate("2026-13-01")).toBe(false);
    expect(isValidRecurringExpenseDate("2026-2-01")).toBe(false);
  });

  it("validates optional linked job IDs without partial parsing", () => {
    expect(parseRecurringExpenseJobId("12")).toBe(12);
    expect(parseRecurringExpenseJobId(null)).toBeNull();
    expect(parseRecurringExpenseJobId("12oops")).toBeUndefined();
    expect(parseRecurringExpenseJobId("1.5")).toBeUndefined();
  });

  it.each(["12oops", "1.5", "-2", "0", "1e3", "Infinity", " "])(
    "rejects malformed business IDs: %s",
    value => {
      expect(parseRecurringExpenseBusinessId(value)).toBeUndefined();
    },
  );
});

describe("recurring expense calendar scheduling", () => {
  it("clamps month-end dates and retains the original day across later months", () => {
    expect(advanceDate("2026-01-31", "monthly", "2026-01-31")).toBe("2026-02-28");
    expect(advanceDate("2026-02-28", "monthly", "2026-01-31")).toBe("2026-03-31");
    expect(advanceDate("2026-01-30", "monthly", "2026-01-30")).toBe("2026-02-28");
    expect(advanceDate("2026-02-28", "monthly", "2026-01-30")).toBe("2026-03-30");
  });

  it("preserves leap-day yearly schedules and handles quarter-end dates", () => {
    expect(advanceDate("2024-02-29", "yearly", "2024-02-29")).toBe("2025-02-28");
    expect(advanceDate("2025-02-28", "yearly", "2024-02-29")).toBe("2026-02-28");
    expect(advanceDate("2026-01-31", "quarterly", "2026-01-31")).toBe("2026-04-30");
  });

  it("rejects invalid dates and unsupported frequencies instead of stalling a schedule", () => {
    expect(() => advanceDate("2026-02-30", "monthly")).toThrow(RangeError);
    expect(() => advanceDate("2026-01-01", "sometimes")).toThrow(RangeError);
  });
});

describe("recurring expense updates", () => {
  it("updates a template when jobId is omitted instead of throwing before parsing it", async () => {
    const updated = { ...currentTemplate, description: "Updated rent" };
    h.selectResults.push([currentTemplate], [updated]);
    h.updateResult = updated;

    const response = await request(app).put("/1").send({ description: "Updated rent" });

    expect(response.status).toBe(200);
    expect(response.body.description).toBe("Updated rent");
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]).toMatchObject({ description: "Updated rent" });
  });

  it("validates and scopes a supplied job before updating the template", async () => {
    const updated = { ...currentTemplate, jobId: 42 };
    h.selectResults.push(
      [currentTemplate],
      [{ businessId: 1, businessLine: "general_contracting" }],
      [updated],
    );
    h.updateResult = updated;

    const response = await request(app).put("/1").send({ jobId: "42" });

    expect(response.status).toBe(200);
    expect(h.updates[0]).toMatchObject({ jobId: 42 });
  });

  it("rejects a malformed job ID without writing", async () => {
    h.selectResults.push([currentTemplate]);

    const response = await request(app).put("/1").send({ jobId: "42oops" });

    expect(response.status).toBe(400);
    expect(h.db.update).not.toHaveBeenCalled();
  });
});
