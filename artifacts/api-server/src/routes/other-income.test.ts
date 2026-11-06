import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {} }));
vi.mock("@workspace/db/schema", () => ({
  otherIncomeTable: {},
  jobsTable: {},
}));
vi.mock("../lib/business-scope.js", () => ({
  requestedBusiness: async () => null,
  resolveMutationBusiness: async () => ({ ok: true, explicit: false, business: { id: 1, slug: "general_contracting" } }),
  belongsToBusiness: () => true,
  mutationBusinessPredicate: () => ({}),
}));

const { parseOtherIncomeBody } = await import("./other-income");

describe("other-income payload validation", () => {
  const valid = {
    amount: "125.50",
    date: "2026-11-06",
    description: "Additional job income",
    paymentMethod: "check",
  };

  it("accepts valid money and calendar dates and normalizes cents", () => {
    expect(parseOtherIncomeBody({ ...valid, amount: "125.5" })?.amount).toBe("125.50");
    expect(parseOtherIncomeBody({ ...valid, amount: 12 })?.amount).toBe("12.00");
  });

  it.each(["12.50junk", "1e3", "-25.00", "0", "1.999", "10000000000.00", "Infinity", ""])(
    "rejects malformed or out-of-range amounts: %s",
    amount => {
      expect(parseOtherIncomeBody({ ...valid, amount })).toBeNull();
    },
  );

  it.each(["2026-02-30", "2026-13-01", "2026-2-01", "not-a-date"])(
    "rejects invalid calendar dates: %s",
    date => {
      expect(parseOtherIncomeBody({ ...valid, date })).toBeNull();
    },
  );

  it("rejects partially numeric IDs instead of silently dropping their relationship", () => {
    expect(parseOtherIncomeBody({ ...valid, jobId: "17oops" })).toBeNull();
    expect(parseOtherIncomeBody({ ...valid, clientId: "2.5" })).toBeNull();
    expect(parseOtherIncomeBody({ ...valid, jobId: "17" })?.jobId).toBe(17);
  });

  it("rejects malformed objects and oversized text fields", () => {
    expect(parseOtherIncomeBody(null)).toBeNull();
    expect(parseOtherIncomeBody([])).toBeNull();
    expect(parseOtherIncomeBody({ ...valid, description: " " })).toBeNull();
    expect(parseOtherIncomeBody({ ...valid, notes: "x".repeat(2001) })).toBeNull();
  });
});
