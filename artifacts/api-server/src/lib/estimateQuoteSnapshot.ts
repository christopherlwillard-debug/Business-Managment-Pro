import { createHash } from "node:crypto";
import type { Business, Estimate, Settings } from "@workspace/db/schema";
import { expandEstimateLinesForInvoice } from "./estimate-totals.js";
import { loadInvoiceBrand } from "./invoiceBranding.js";
import type { CustomerQuoteDocument } from "./generateEstimateQuotePdf.js";

export type EstimateCustomerSnapshot = Omit<CustomerQuoteDocument, "brand"> & {
  revision: number;
  brand: Omit<CustomerQuoteDocument["brand"], "logo">;
};

export class EstimateQuoteTotalsMismatchError extends Error {
  constructor() {
    super("Customer pricing does not reconcile with the saved estimate.");
    this.name = "EstimateQuoteTotalsMismatchError";
  }
}

export async function buildEstimateQuoteSnapshot(input: {
  estimate: Estimate & {
    clientName?: string | null;
    clientEmail?: string | null;
    clientPhone?: string | null;
    clientAddress?: string | null;
    clientCity?: string | null;
    clientState?: string | null;
    clientZip?: string | null;
  };
  business: Business | null;
  settings: Settings | null;
  revision: number;
  expiresAt: string | null;
}) {
  const { estimate, business, settings, revision, expiresAt } = input;
  const lineItems = Array.isArray(estimate.lineItems) ? estimate.lineItems as Array<Record<string, unknown>> : [];
  const expanded = expandEstimateLinesForInvoice(
    lineItems as never[],
    estimate.markupPercent == null ? null : Number(estimate.markupPercent),
    estimate.contingencyPercent == null ? null : Number(estimate.contingencyPercent),
  );
  let expandedIndex = 0;
  const pricedLines = lineItems.map(source => {
    if (!String(source.description ?? "").trim()) return null;
    return expanded[expandedIndex++] ?? null;
  });
  const amountAt = (index: number) => {
    const line = pricedLines[index];
    if (!line) return 0;
    return Math.round(line.quantity * line.unitPrice * 100) / 100;
  };
  const tax = lineItems.reduce((sum, item, index) =>
    sum + (String(item.category ?? "").trim().toLowerCase() === "tax" ? amountAt(index) : 0), 0);
  const adjustment = lineItems.reduce((sum, item, index) =>
    sum + (String(item.category ?? "").trim().toLowerCase() === "adjustment" ? amountAt(index) : 0), 0);
  const nonTax = lineItems.reduce((sum, item, index) =>
    sum + (String(item.category ?? "").trim().toLowerCase() !== "tax" ? amountAt(index) : 0), 0);
  const subtotal = Math.round((nonTax - adjustment) * 100) / 100;
  const total = Number(estimate.total ?? 0);
  if (!Number.isFinite(total)
    || Math.round((subtotal + adjustment + tax) * 100) / 100 !== Math.round(total * 100) / 100) {
    throw new EstimateQuoteTotalsMismatchError();
  }

  const brand = await loadInvoiceBrand(estimate.businessLine, settings, business);
  const issuedAt = estimate.createdAt instanceof Date
    ? estimate.createdAt.toISOString()
    : String(estimate.createdAt);
  const quoteNumber = `Q-${issuedAt.slice(0, 4)}-${String(estimate.id).padStart(6, "0")}`;
  const items = lineItems.flatMap((source, index) => {
    const category = String(source.category ?? "").trim().toLowerCase();
    if (category === "tax" || category === "adjustment" || !pricedLines[index]) return [];
    return [{
      description: String(source.description ?? ""),
      quantity: Number(source.quantity ?? 1),
      unit: source.unit == null ? null : String(source.unit),
      amount: amountAt(index),
    }];
  });
  const billingAddress = [
    estimate.clientAddress,
    estimate.clientCity,
    estimate.clientState,
    estimate.clientZip,
  ].filter(Boolean).join(", ") || null;
  const terms = estimate.customerNotes ?? business?.defaultQuoteTerms ?? settings?.defaultPaymentTerms ?? null;
  const customerSnapshot: EstimateCustomerSnapshot = {
    quoteNumber,
    revision,
    title: estimate.title,
    issuedAt,
    expiresAt,
    customerName: estimate.clientName ?? null,
    customerEmail: estimate.clientEmail ?? null,
    customerPhone: estimate.clientPhone ?? null,
    billingAddress,
    workAddress: estimate.workAddress ?? null,
    jobType: estimate.jobType ?? null,
    terms,
    items,
    subtotal,
    adjustment,
    tax,
    total,
    brand: {
      name: brand.displayName,
      address: brand.address,
      city: brand.city,
      state: brand.state,
      zip: brand.zip,
      phone: brand.phone,
      email: brand.email,
      website: business?.website ?? null,
    },
  };
  const { revision: _revision, ...content } = customerSnapshot;
  const contentHash = createHash("sha256")
    .update(JSON.stringify(content))
    .digest("hex");
  const pdfDocument: CustomerQuoteDocument = {
    ...customerSnapshot,
    brand: { ...customerSnapshot.brand, logo: brand.logo?.buffer ?? null },
  };
  return {
    customerSnapshot,
    contentHash,
    pdfDocument,
    logo: brand.logo,
  };
}
