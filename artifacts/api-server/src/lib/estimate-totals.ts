import { roundCurrency } from "@workspace/api-zod";

export type EstimateLineItemInput = {
  category?: string | null;
  description?: string | null;
  quantity?: number | string | null;
  unitCost?: number | string | null;
  unitPrice?: number | string | null;
};

export type InvoiceDraftLine = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export function isTaxEstimateLine(line: EstimateLineItemInput): boolean {
  return String(line.category ?? "").trim().toLowerCase() === "tax";
}

export function estimateLineAmount(line: EstimateLineItemInput): number {
  const quantity = Number(line.quantity ?? 0);
  const unitCost = Number(line.unitCost ?? line.unitPrice ?? 0);
  if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) return 0;
  return roundCurrency(quantity * unitCost);
}

export function calculateEstimateTotals(
  lineItems: EstimateLineItemInput[],
  markupPercent: number | null,
  contingencyPercent: number | null,
) {
  const subtotal = roundCurrency(lineItems
    .filter(line => !isTaxEstimateLine(line))
    .reduce((sum, line) => sum + estimateLineAmount(line), 0));
  const taxAmount = roundCurrency(lineItems
    .filter(isTaxEstimateLine)
    .reduce((sum, line) => sum + estimateLineAmount(line), 0));
  const afterMarkup = markupPercent == null
    ? subtotal
    : roundCurrency(subtotal * (1 + markupPercent / 100));
  const afterContingency = contingencyPercent == null
    ? afterMarkup
    : roundCurrency(afterMarkup * (1 + contingencyPercent / 100));

  return {
    subtotal,
    total: roundCurrency(afterContingency + taxAmount),
  };
}

export function expandEstimateLinesForInvoice(
  lineItems: EstimateLineItemInput[],
  markupPercent: number | null,
  contingencyPercent: number | null,
): InvoiceDraftLine[] {
  const scaleFactor = (1 + (markupPercent ?? 0) / 100)
    * (1 + (contingencyPercent ?? 0) / 100);

  return lineItems.flatMap((line) => {
    const description = String(line.description ?? "").trim();
    if (!description) return [];

    const quantity = Number(line.quantity ?? 1);
    const unitCost = Number(line.unitCost ?? line.unitPrice ?? 0);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) return [];
    const multiplier = isTaxEstimateLine(line) ? 1 : scaleFactor;

    return [{
      description,
      quantity,
      unitPrice: roundCurrency(unitCost * multiplier),
    }];
  });
}
