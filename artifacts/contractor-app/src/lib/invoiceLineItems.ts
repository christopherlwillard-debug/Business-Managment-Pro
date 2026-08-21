export interface InvoiceLineLike {
  description?: unknown;
  source?: unknown;
}

/**
 * Material lines may be auto-generated (with source metadata) or manually
 * entered by a user (where the source metadata is not sent back on save).
 */
export function isMaterialInvoiceLine(line: InvoiceLineLike): boolean {
  if (line.source === "material") return true;
  const description = String(line.description ?? "").trim().toLowerCase();
  return description === "material" || description === "materials";
}