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

const { parseRecurringExpenseBusinessId } = await import("./recurring-expenses");

describe("recurring expense business selector", () => {
  it("accepts only positive safe integer business IDs", () => {
    expect(parseRecurringExpenseBusinessId("12")).toBe(12);
    expect(parseRecurringExpenseBusinessId(12)).toBe(12);
    expect(parseRecurringExpenseBusinessId(null)).toBeNull();
    expect(parseRecurringExpenseBusinessId("")).toBeNull();
  });

  it.each(["12oops", "1.5", "-2", "0", "1e3", "Infinity", " "])(
    "rejects malformed business IDs: %s",
    value => {
      expect(parseRecurringExpenseBusinessId(value)).toBeUndefined();
    },
  );
});
