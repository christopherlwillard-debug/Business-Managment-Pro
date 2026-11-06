import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {} }));
vi.mock("@workspace/db/schema", () => ({
  recurringExpensesTable: {},
  expensesTable: {},
  jobsTable: {},
}));
vi.mock("../lib/business-scope.js", () => ({
  resolveMutationBusiness: async () => ({ ok: true, business: { id: 1, slug: "general_contracting" } }),
  mutationBusinessPredicate: () => ({}),
  belongsToBusiness: () => true,
}));

const { parseRecurringExpenseBusinessId, parseRecurringExpenseAmount, isValidRecurringExpenseDate, parseRecurringExpenseJobId } = await import("./recurring-expenses");

describe("recurring expense business selector", () => {
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
