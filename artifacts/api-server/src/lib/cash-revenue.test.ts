import { describe, expect, it } from "vitest";
import {
  filterCashReceipts,
  getDashboardRevenueDate,
  getEffectivePaymentDate,
  getCashReceiptAmount,
  hasVerifiedDashboardRevenueDate,
  isDashboardRevenueDateEstimated,
  sumDashboardRevenue,
  sumCashReceipts,
  sumCashReceiptEvents,
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

  it("attributes dashboard revenue to verified send date with an issue-date legacy fallback", () => {
    const deliveredInvoice = {
      status: "paid",
      issueDate: `${YEAR - 1}-12-30`,
      verifiedSentAt: new Date(`${YEAR - 1}-12-31T18:00:00.000Z`),
      stripePaidAt: new Date(`${YEAR}-01-02T12:00:00.000Z`),
      total: "1250.00",
    };
    const legacyInvoice = {
      status: "paid",
      issueDate: `${YEAR - 1}-12-15`,
      verifiedSentAt: null,
      stripePaidAt: new Date(`${YEAR}-01-03T12:00:00.000Z`),
      total: "250.00",
    };

    expect(getDashboardRevenueDate(deliveredInvoice)).toBe(`${YEAR - 1}-12-31`);
    expect(getDashboardRevenueDate(legacyInvoice)).toBe(`${YEAR - 1}-12-15`);
    expect(hasVerifiedDashboardRevenueDate(deliveredInvoice)).toBe(true);
    expect(hasVerifiedDashboardRevenueDate(legacyInvoice)).toBe(false);
    expect(isDashboardRevenueDateEstimated(deliveredInvoice)).toBe(false);
    expect(isDashboardRevenueDateEstimated(legacyInvoice)).toBe(true);
    expect(sumDashboardRevenue(
      [deliveredInvoice, legacyInvoice],
      `${YEAR - 1}-01-01`,
      `${YEAR - 1}-12-31`,
    )).toBe(1500);
    expect(sumDashboardRevenue(
      [deliveredInvoice, legacyInvoice],
      `${YEAR}-01-01`,
      `${YEAR}-12-31`,
    )).toBe(0);
  });

  it("does not treat invalid delivery timestamps as verified evidence", () => {
    const invoice = {
      status: "paid",
      issueDate: `${YEAR}-08-01`,
      verifiedSentAt: "not-a-date",
    };

    expect(hasVerifiedDashboardRevenueDate(invoice)).toBe(false);
    expect(isDashboardRevenueDateEstimated(invoice)).toBe(true);
    expect(getDashboardRevenueDate(invoice)).toBe(`${YEAR}-08-01`);
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

  it("uses the recorded manual payment date instead of the issue date", () => {
    const invoice = {
      status: "paid",
      issueDate: `${YEAR - 1}-12-31`,
      lastManualPaidAt: new Date(`${YEAR}-01-04T12:00:00.000Z`),
      total: "75.00",
    };

    expect(getEffectivePaymentDate(invoice)).toBe(`${YEAR}-01-04`);
    expect(sumCashReceipts([invoice], `${YEAR}-01-01`, `${YEAR}-12-31`)).toBe(75);
    expect(sumCashReceipts([invoice], `${YEAR - 1}-01-01`, `${YEAR - 1}-12-31`)).toBe(0);
  });

  it("uses aggregate amountPaid for a partial cash receipt instead of the invoice total", () => {
    const invoice = {
      status: "paid",
      issueDate: `${YEAR}-04-01`,
      amountPaid: "250.00",
      total: "1000.00",
    };

    expect(getCashReceiptAmount(invoice)).toBe(250);
    expect(sumCashReceipts([invoice], `${YEAR}-04-01`, `${YEAR}-04-30`)).toBe(250);
  });

  it("reconciles multiple payment events and reversals by event date", () => {
    const events = [
      { amount: "250.00", receivedAt: `${YEAR}-05-01` },
      { amount: "250.00", receivedAt: `${YEAR}-05-15` },
      { amount: "100.00", receivedAt: `${YEAR}-05-20`, isReversal: true },
      { amount: "500.00", receivedAt: `${YEAR}-06-01` },
    ];

    expect(sumCashReceiptEvents(events, `${YEAR}-05-01`, `${YEAR}-05-31`)).toBe(400);
    expect(sumCashReceiptEvents(events, `${YEAR}-06-01`, `${YEAR}-06-30`)).toBe(500);
  });
});