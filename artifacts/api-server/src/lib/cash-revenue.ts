export interface CashRevenueInvoice {
  status: string;
  total?: string | number | null;
  issueDate?: string | null;
  stripePaidAt?: Date | null;
  squarePaidAt?: Date | null;
}

/**
 * Cash-basis payment date for an invoice.
 *
 * Electronic payment timestamps are authoritative when present. Manual paid
 * invoices have no separate payment date, so issueDate is the documented
 * fallback used by the existing ledger.
 */
export function getEffectivePaymentDate(invoice: CashRevenueInvoice): string {
  if (invoice.stripePaidAt) return invoice.stripePaidAt.toISOString().slice(0, 10);
  if (invoice.squarePaidAt) return invoice.squarePaidAt.toISOString().slice(0, 10);
  return invoice.issueDate ?? "";
}

export function isCashReceiptInPeriod(
  invoice: CashRevenueInvoice,
  startDate: string,
  endDate: string,
): boolean {
  return invoice.status === "paid"
    && getEffectivePaymentDate(invoice) >= startDate
    && getEffectivePaymentDate(invoice) <= endDate;
}

export function filterCashReceipts<T extends CashRevenueInvoice>(
  invoices: T[],
  startDate: string,
  endDate: string,
): T[] {
  return invoices.filter(invoice => isCashReceiptInPeriod(invoice, startDate, endDate));
}

export function sumCashReceipts(
  invoices: CashRevenueInvoice[],
  startDate: string,
  endDate: string,
): number {
  return filterCashReceipts(invoices, startDate, endDate)
    .reduce((sum, invoice) => sum + parseFloat(String(invoice.total ?? "0")), 0);
}