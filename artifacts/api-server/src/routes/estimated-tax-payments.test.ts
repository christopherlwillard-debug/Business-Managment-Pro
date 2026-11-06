import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {},
  estimatedTaxPaymentsTable: {},
  invoicesTable: {},
  expensesTable: {},
  mileageLogsTable: {},
  otherIncomeTable: {},
  settingsTable: {},
}));
vi.mock("../lib/business-scope.js", () => ({
  requestedBusiness: async () => null,
  hasRequestedBusiness: () => false,
  invalidBusinessScope: () => false,
  resolveMutationBusiness: async () => ({ ok: true, explicit: false, business: { id: 1, slug: "general_contracting" } }),
  mutationBusinessPredicate: () => ({}),
}));

const { parseEstimatedTaxMoney, isValidOptionalIsoDate } = await import("./estimated-tax-payments");

describe("estimated tax payment input validation", () => {
  it("normalizes valid non-negative money to cents", () => {
    expect(parseEstimatedTaxMoney("125.5")).toBe("125.50");
    expect(parseEstimatedTaxMoney(0)).toBe("0.00");
    expect(parseEstimatedTaxMoney("9999999999.99")).toBe("9999999999.99");
  });

  it.each(["12.50junk", "1e3", "-1", "1.999", "10000000000.00", "Infinity", ""])(
    "rejects invalid payment amounts: %s",
    value => {
      expect(parseEstimatedTaxMoney(value)).toBeUndefined();
    },
  );

  it("allows an omitted due amount only when explicitly requested", () => {
    expect(parseEstimatedTaxMoney(null, true)).toBeNull();
    expect(parseEstimatedTaxMoney(null)).toBeUndefined();
  });

  it("validates actual calendar dates rather than only the date shape", () => {
    expect(isValidOptionalIsoDate("2026-11-06")).toBe(true);
    expect(isValidOptionalIsoDate(null)).toBe(true);
    expect(isValidOptionalIsoDate("2026-02-30")).toBe(false);
    expect(isValidOptionalIsoDate("2026-13-01")).toBe(false);
    expect(isValidOptionalIsoDate("2026-2-01")).toBe(false);
  });
});
