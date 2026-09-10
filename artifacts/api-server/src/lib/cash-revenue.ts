export interface CashRevenueInvoice {
  status: string;
  total?: string | number | null;
  amountPaid?: string | number | null;
  issueDate?: string | null;
  verifiedSentAt?: Date | string | null;
  stripePaidAt?: Date | null;
  squarePaidAt?: Date | null;
  lastManualPaidAt?: Date | null;
}

export interface CashReceiptEvent {
  amount: string | number;
  receivedAt: Date | string;
  isReversal?: boolean | null;
}

/**
 * Cash-basis payment date for an invoice.
 *
 * Electronic payment timestamps are authoritative when present. Manual payment
 * timestamps are next. Issue date remains the legacy fallback for older rows
 * that have no recorded payment timestamp.
 */
export function getEffectivePaymentDate(invoice: CashRevenueInvoice): string {
  if (invoice.stripePaidAt) return invoice.stripePaidAt.toISOString().slice(0, 10);
  if (invoice.squarePaidAt) return invoice.squarePaidAt.toISOString().slice(0, 10);
  if (invoice.lastManualPaidAt) return invoice.lastManualPaidAt.toISOString().slice(0, 10);
  return invoice.issueDate ?? "";
}

export function getCashReceiptAmount(invoice: CashRevenueInvoice): number {
  const rawAmount = invoice.amountPaid ?? invoice.total ?? 0;
  const amount = Number(rawAmount);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
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
    .reduce((sum, invoice) => sum + getCashReceiptAmount(invoice), 0);
}

/**
 * Dashboard-only revenue attribution date.
 *
 * A finalized delivery timestamp is authoritative. Issue date is the explicit
 * compatibility fallback for historical paid invoices that predate reliable
 * delivery tracking. Cash-basis reports must continue using
 * getEffectivePaymentDate instead.
 */
export function getDashboardRevenueDate(invoice: CashRevenueInvoice): string {
  if (hasVerifiedDashboardRevenueDate(invoice)) {
    const verifiedSentAt = invoice.verifiedSentAt;
    if (verifiedSentAt instanceof Date) return verifiedSentAt.toISOString().slice(0, 10);
    return new Date(verifiedSentAt as string).toISOString().slice(0, 10);
  }
  return invoice.issueDate ?? "";
}

/**
 * Whether an invoice has finalized delivery evidence suitable for Dashboard
 * revenue attribution. The legacy invoices.sentAt compatibility field is
 * intentionally not considered evidence here.
 */
export function hasVerifiedDashboardRevenueDate(invoice: CashRevenueInvoice): boolean {
  const verifiedSentAt = invoice.verifiedSentAt;
  if (verifiedSentAt instanceof Date) return Number.isFinite(verifiedSentAt.getTime());
  if (typeof verifiedSentAt === "string" && verifiedSentAt.length >= 10) {
    return Number.isFinite(new Date(verifiedSentAt).getTime());
  }
  return false;
}

export function isDashboardRevenueDateEstimated(invoice: CashRevenueInvoice): boolean {
  return invoice.status === "paid" && !hasVerifiedDashboardRevenueDate(invoice);
}

export function isDashboardRevenueInPeriod(
  invoice: CashRevenueInvoice,
  startDate: string,
  endDate: string,
): boolean {
  const revenueDate = getDashboardRevenueDate(invoice);
  return invoice.status === "paid"
    && revenueDate >= startDate
    && revenueDate <= endDate;
}

export function filterDashboardRevenueInvoices<T extends CashRevenueInvoice>(
  invoices: T[],
  startDate: string,
  endDate: string,
): T[] {
  return invoices.filter(invoice => isDashboardRevenueInPeriod(invoice, startDate, endDate));
}

export function sumDashboardRevenue(
  invoices: CashRevenueInvoice[],
  startDate: string,
  endDate: string,
): number {
  return filterDashboardRevenueInvoices(invoices, startDate, endDate)
    .reduce((sum, invoice) => sum + getCashReceiptAmount(invoice), 0);
}

/**
 * Reconciles a normalized payment-event stream. This is intentionally separate
 * from invoice snapshots because the current schema does not yet persist
 * multiple customer payments per invoice.
 */
export function sumCashReceiptEvents(
  events: CashReceiptEvent[],
  startDate: string,
  endDate: string,
): number {
  return events.reduce((sum, event) => {
    const receivedAt = event.receivedAt instanceof Date
      ? event.receivedAt.toISOString().slice(0, 10)
      : event.receivedAt.slice(0, 10);
    if (receivedAt < startDate || receivedAt > endDate) return sum;
    const amount = Number(event.amount);
    if (!Number.isFinite(amount)) return sum;
    return sum + (event.isReversal ? -Math.abs(amount) : amount);
  }, 0);
}