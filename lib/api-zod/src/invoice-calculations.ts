export type InvoiceCalculationLine = {
  quantity: number;
  unitPrice: number;
};

export type InvoiceTotals = {
  lineTotals: number[];
  subtotal: number;
  taxAmount: number;
  total: number;
};

/** Round a monetary value to the nearest cent at the calculation boundary. */
export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Invoice money is calculated in cents: each line is rounded first, then the
 * rounded lines are summed, tax is rounded, and the final total is rounded.
 */
export function calculateInvoiceTotals(
  lineItems: InvoiceCalculationLine[],
  taxRate: number | null | undefined,
): InvoiceTotals {
  const lineTotals = lineItems.map((line) => roundCurrency(line.quantity * line.unitPrice));
  const subtotal = roundCurrency(lineTotals.reduce((sum, lineTotal) => sum + lineTotal, 0));
  const taxAmount = roundCurrency(subtotal * ((taxRate ?? 0) / 100));
  const total = roundCurrency(subtotal + taxAmount);
  return { lineTotals, subtotal, taxAmount, total };
}