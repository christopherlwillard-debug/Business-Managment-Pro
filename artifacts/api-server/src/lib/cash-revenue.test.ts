import { describe, expect, it } from "vitest";
import {
  filterCashReceipts,
  getEffectivePaymentDate,
  sumCashReceipts,
} from "./cash-revenue.js";

const YEAR = 2026;

describe("cash revenue reconciliation", () => {
  it("attributes an invoice to its payment year, not its issue year", () => {
    const invoice = {
      status: "paid",
      issueDate: `${YEAR - 1}-12-31`,
      stripePaidAt: new Date(`${YEAR}-01-02T12:00:00.000Z`),
      total: "1250.00",
    };

    expect(getEffectivePaymentDate(invoice)).toBe(`${YEAR}-01-02`);
    expect(filterCashReceipts([invoice], `${YEAR}-01-01`, `${YEAR}-12-31`)).toHaveLength(1);
    expect(filterCashReceipts([invoice], `${YEAR - 1}-01-01`, `${YEAR - 1}-12-31`)).toHaveLength(0);
  });

  it("uses Square before the issue-date fallback and excludes unpaid invoices", () => {
    const invoices = [
      {
        status: "paid",
        issueDate: `${YEAR}-02-01`,
        squarePaidAt: new Date(`${YEAR}-03-04T12:00:00.000Z`),
        total: "80.50",
      },
      { status: "sent", issueDate: `${YEAR}-03-05`, total: "500.00" },
    ];

    expect(sumCashReceipts(invoices, `${YEAR}-03-01`, `${YEAR}-03-31`)).toBeCloseTo(80.5);
    expect(sumCashReceipts(invoices, `${YEAR}-02-01`, `${YEAR}-02-28`)).toBe(0);
  });

  it("falls back to issue date for manually marked paid invoices", () => {
    const invoice = { status: "paid", issueDate: `${YEAR}-07-15`, total: 42 };
    expect(sumCashReceipts([invoice], `${YEAR}-07-01`, `${YEAR}-07-31`)).toBe(42);
  });
});