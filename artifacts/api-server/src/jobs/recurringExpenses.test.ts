import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const recurringExpensesTable = {
    id: "recurring_expenses.id",
    active: "recurring_expenses.active",
    nextDueDate: "recurring_expenses.next_due_date",
    startDate: "recurring_expenses.start_date",
    endDate: "recurring_expenses.end_date",
    frequency: "recurring_expenses.frequency",
  };
  const expensesTable = {
    id: "expenses.id",
    recurringExpenseId: "expenses.recurring_expense_id",
    date: "expenses.date",
  };
  return {
    recurringExpensesTable,
    expensesTable,
    dueRows: [] as Array<{ id: number }>,
    templates: new Map<number, any>(),
    existing: new Set<string>(),
    inserted: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
    lockedRows: 0,
    db: {
      select: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

vi.mock("@workspace/db", () => ({ db: h.db }));
vi.mock("@workspace/db/schema", () => ({
  recurringExpensesTable: h.recurringExpensesTable,
  expensesTable: h.expensesTable,
}));
vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
  and: (...conditions: unknown[]) => ({ conditions }),
  lte: (column: unknown, value: unknown) => ({ column, value, operator: "lte" }),
}));
vi.mock("../routes/recurring-expenses.js", () => ({
  advanceDate: (dateStr: string, frequency: string) => {
    if (frequency !== "weekly") throw new Error("Test worker only supports weekly schedules");
    const date = new Date(dateStr + "T00:00:00.000Z");
    date.setUTCDate(date.getUTCDate() + 7);
    return date.toISOString().slice(0, 10);
  },
  localDateStr: () => "2026-04-20",
}));

const { processRecurringExpenses } = await import("./recurringExpenses.js");

function txSelectChain() {
  let table: unknown;
  let condition: any;
  const chain: any = {
    from: (value: unknown) => {
      table = value;
      return chain;
    },
    where: (value: unknown) => {
      condition = value;
      return chain;
    },
    for: () => {
      h.lockedRows++;
      return chain;
    },
    limit: () => chain,
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) => {
      let rows: unknown[] = [];
      if (table === h.recurringExpensesTable) {
        const template = h.templates.get(condition?.value);
        rows = template ? [template] : [];
      } else if (table === h.expensesTable) {
        const conditions = condition?.conditions ?? [];
        const recurringId = conditions.find((item: any) => item.column === h.expensesTable.recurringExpenseId)?.value;
        const date = conditions.find((item: any) => item.column === h.expensesTable.date)?.value;
        rows = h.existing.has(String(recurringId) + ":" + String(date)) ? [{ id: 999 }] : [];
      }
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
  return chain;
}

const tx = {
  select: vi.fn(() => txSelectChain()),
  insert: vi.fn((table: unknown) => ({
    values: async (values: Record<string, unknown>) => {
      h.inserted.push(values);
      if (table === h.expensesTable) {
        h.existing.add(String(values.recurringExpenseId) + ":" + String(values.date));
      }
    },
  })),
  update: vi.fn(() => {
    let values: Record<string, unknown> = {};
    const chain: any = {
      set: (next: Record<string, unknown>) => {
        values = next;
        h.updates.push(next);
        return chain;
      },
      where: (condition: any) => {
        const template = h.templates.get(condition?.value);
        if (template) Object.assign(template, values);
        return Promise.resolve();
      },
    };
    return chain;
  }),
};

function dueSelectChain() {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(h.dueRows).then(resolve, reject),
  };
  return chain;
}

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    active: true,
    description: "Monthly rent",
    amount: "500.00",
    category: "Rent",
    vendor: null,
    jobId: null,
    notes: null,
    businessId: 1,
    frequency: "weekly",
    startDate: "2026-04-01",
    nextDueDate: "2026-04-01",
    endDate: null,
    ...overrides,
  };
}

beforeEach(() => {
  h.dueRows.length = 0;
  h.templates.clear();
  h.existing.clear();
  h.inserted.length = 0;
  h.updates.length = 0;
  h.lockedRows = 0;
  h.db.select.mockReset().mockImplementation(() => dueSelectChain());
  h.db.transaction.mockReset().mockImplementation(async (callback: (transaction: typeof tx) => unknown) =>
    callback(tx),
  );
  tx.select.mockClear();
  tx.insert.mockClear();
  tx.update.mockClear();
});

describe("recurring expense worker reliability", () => {
  it("locks each template and catches up all missed occurrences in one transaction", async () => {
    h.dueRows.push({ id: 7 });
    h.templates.set(7, template());

    await processRecurringExpenses("2026-04-20");

    expect(h.db.transaction).toHaveBeenCalledOnce();
    expect(h.lockedRows).toBe(1);
    expect(h.inserted.map(row => row.date)).toEqual([
      "2026-04-01",
      "2026-04-08",
      "2026-04-15",
    ]);
    expect(h.templates.get(7).nextDueDate).toBe("2026-04-22");
  });

  it("does not duplicate an occurrence that already exists for the template date", async () => {
    h.dueRows.push({ id: 7 });
    h.templates.set(7, template());
    h.existing.add("7:2026-04-01");

    await processRecurringExpenses("2026-04-20");

    expect(h.inserted.map(row => row.date)).toEqual([
      "2026-04-08",
      "2026-04-15",
    ]);
    expect(h.templates.get(7).nextDueDate).toBe("2026-04-22");
  });

  it("deactivates a template without generating an occurrence after its end date", async () => {
    h.dueRows.push({ id: 7 });
    h.templates.set(7, template({
      nextDueDate: "2026-04-15",
      endDate: "2026-04-14",
    }));

    await processRecurringExpenses("2026-04-20");

    expect(h.inserted).toHaveLength(0);
    expect(h.templates.get(7).active).toBe(false);
    expect(h.updates[0]).toMatchObject({ active: false });
  });
});
