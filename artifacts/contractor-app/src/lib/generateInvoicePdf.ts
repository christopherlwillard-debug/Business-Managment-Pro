import jsPDF from "jspdf";

export interface InvoicePdfLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  issueDate?: string | null;
  dueDate?: string | null;
  terms?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  clientCity?: string | null;
  clientState?: string | null;
  clientZip?: string | null;
  locationName?: string | null;
  city?: string | null;
  state?: string | null;
  lineItems: InvoicePdfLineItem[];
  subtotal: number;
  taxRate?: number | null;
  taxAmount?: number | null;
  total: number;
  notes?: string | null;
  businessLine?: string | null;
}

export interface InvoicePdfSettings {
  companyName?: string | null;
  companyAddress?: string | null;
  companyCity?: string | null;
  companyState?: string | null;
  companyZip?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  logoUrl?: string | null;
  dbaLogoUrl?: string | null;
}

export function resolveLogoUrl(settings: InvoicePdfSettings, businessLine?: string | null): string | null {
  if (businessLine === "asphalt_sealing") return settings.dbaLogoUrl ?? settings.logoUrl ?? null;
  return settings.logoUrl ?? null;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }
  return iso;
}

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function generateInvoicePdf(invoice: InvoicePdfData, settings: InvoicePdfSettings = {}): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = margin;

  const amber: [number, number, number] = [245, 158, 11];
  const dark:  [number, number, number] = [17, 17, 17];
  const grey:  [number, number, number] = [100, 100, 100];
  const light: [number, number, number] = [220, 220, 220];
  const bgLight: [number, number, number] = [250, 250, 250];

  // ── Amber accent bar ─────────────────────────────────────────────────────────
  doc.setFillColor(...amber);
  doc.rect(0, 0, pageW, 4, "F");

  y = 14;

  // Resolve logo: DBA logo for asphalt sealing, fallback to main logo.
  // Note: logo image rendering requires async image loading (HTMLImageElement/base64).
  // resolveLogoUrl makes the selection; callers can extend when async rendering is added.
  const _effectivePdfLogoUrl = resolveLogoUrl(settings, invoice.businessLine);

  // ── Company block (left) + INVOICE label (right) ─────────────────────────────
  const companyName = invoice.businessLine === "asphalt_sealing"
    ? `${settings.companyName || "Willard's General Contracting LLC"}, DBA Willard's Asphalt Sealing`
    : (settings.companyName || "");
  const cityLine = [settings.companyCity, settings.companyState, settings.companyZip].filter(Boolean).join(", ");

  if (companyName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...dark);
    doc.text(companyName, margin, y);
    y += 5;
  }
  if (settings.companyAddress) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...grey);
    doc.text(settings.companyAddress, margin, y);
    y += 4;
  }
  if (cityLine) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...grey);
    doc.text(cityLine, margin, y);
    y += 4;
  }
  if (settings.companyPhone) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...grey);
    doc.text(settings.companyPhone, margin, y);
    y += 4;
  }
  if (settings.companyEmail) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...grey);
    doc.text(settings.companyEmail, margin, y);
  }

  // INVOICE watermark label (right side, aligned top)
  const invoiceTopY = 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...light);
  doc.text("INVOICE", pageW - margin, invoiceTopY, { align: "right" });

  // Invoice number + dates (right side below watermark)
  let detailY = invoiceTopY + 9;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...amber);
  doc.text(invoice.invoiceNumber, pageW - margin, detailY, { align: "right" });
  detailY += 5;

  const dateLines: { label: string; value: string }[] = [];
  if (invoice.issueDate) dateLines.push({ label: "Date:", value: fmtDate(invoice.issueDate) });
  if (invoice.dueDate)   dateLines.push({ label: "Due:", value: fmtDate(invoice.dueDate) });
  if (invoice.terms)     dateLines.push({ label: "Terms:", value: invoice.terms });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  for (const { label, value } of dateLines) {
    doc.setTextColor(...grey);
    doc.text(label, pageW - margin - 35, detailY);
    doc.setTextColor(...dark);
    doc.text(value, pageW - margin, detailY, { align: "right" });
    detailY += 4;
  }

  // ── Divider ──────────────────────────────────────────────────────────────────
  y = Math.max(y + 6, detailY + 4);
  doc.setDrawColor(...light);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // ── Bill To block ────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...grey);
  doc.text("BILL TO", margin, y);
  y += 4;

  if (invoice.clientName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...dark);
    doc.text(invoice.clientName, margin, y);
    y += 5;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...grey);

  if (invoice.clientEmail)  { doc.text(invoice.clientEmail,  margin, y); y += 4; }
  if (invoice.clientPhone)  { doc.text(invoice.clientPhone,  margin, y); y += 4; }
  const clientCityLine = [invoice.clientAddress, invoice.clientCity, invoice.clientState, invoice.clientZip].filter(Boolean).join(", ");
  if (clientCityLine)       { doc.text(clientCityLine, margin, y, { maxWidth: 90 }); y += 4; }

  // Location (if different from client address)
  const locLine = [invoice.locationName, invoice.city, invoice.state].filter(Boolean).join(", ");
  if (locLine) {
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...grey);
    doc.text("WORK LOCATION", margin + 100, y - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...dark);
    doc.text(locLine, margin + 100, y - 6);
  }

  y += 6;
  doc.setDrawColor(...light);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // ── Line items table ──────────────────────────────────────────────────────────
  const col = {
    desc:  margin,
    qty:   pageW - margin - 65,
    rate:  pageW - margin - 40,
    total: pageW - margin,
  };

  // Table header
  doc.setFillColor(...bgLight);
  doc.rect(margin, y - 1, contentW, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...grey);
  doc.text("DESCRIPTION",  col.desc, y + 4);
  doc.text("QTY",   col.qty,   y + 4, { align: "right" });
  doc.text("RATE",  col.rate,  y + 4, { align: "right" });
  doc.text("AMOUNT", col.total, y + 4, { align: "right" });
  y += 10;

  // Table rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  let rowAlt = false;

  for (const li of invoice.lineItems) {
    if (y > 240) {
      doc.addPage();
      y = margin + 4;
      // Redraw column headers on new page
      doc.setFillColor(...bgLight);
      doc.rect(margin, y - 1, contentW, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...grey);
      doc.text("DESCRIPTION",  col.desc, y + 4);
      doc.text("QTY",   col.qty,   y + 4, { align: "right" });
      doc.text("RATE",  col.rate,  y + 4, { align: "right" });
      doc.text("AMOUNT", col.total, y + 4, { align: "right" });
      y += 10;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
    }

    if (rowAlt) {
      doc.setFillColor(248, 248, 248);
      doc.rect(margin, y - 2, contentW, 7, "F");
    }
    rowAlt = !rowAlt;

    const desc = li.description.length > 55 ? li.description.substring(0, 53) + "…" : li.description;
    const lineTotal = li.quantity * li.unitPrice;

    doc.setTextColor(...dark);
    doc.text(desc, col.desc, y + 3);
    doc.setTextColor(...grey);
    doc.text(String(li.quantity),        col.qty,   y + 3, { align: "right" });
    doc.text(fmt(li.unitPrice),          col.rate,  y + 3, { align: "right" });
    doc.setTextColor(...dark);
    doc.setFont("helvetica", "bold");
    doc.text(fmt(lineTotal),             col.total, y + 3, { align: "right" });
    doc.setFont("helvetica", "normal");

    doc.setDrawColor(235, 235, 235);
    doc.line(margin, y + 5, pageW - margin, y + 5);
    y += 7;
  }

  y += 4;

  // ── Totals ────────────────────────────────────────────────────────────────────
  const totalsX = pageW - margin - 55;

  doc.setDrawColor(...light);
  doc.line(totalsX, y, pageW - margin, y);
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...grey);
  doc.text("Subtotal", totalsX, y);
  doc.setTextColor(...dark);
  doc.text(fmt(invoice.subtotal), pageW - margin, y, { align: "right" });
  y += 5;

  if ((invoice.taxRate ?? 0) > 0) {
    doc.setTextColor(...grey);
    doc.text(`Tax (${invoice.taxRate}%)`, totalsX, y);
    doc.setTextColor(...dark);
    doc.text(fmt(invoice.taxAmount ?? 0), pageW - margin, y, { align: "right" });
    y += 5;
  }

  doc.setDrawColor(...dark);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y, pageW - margin, y);
  doc.setLineWidth(0.2);
  y += 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...dark);
  doc.text("Total Due", totalsX, y);
  doc.setTextColor(...amber);
  doc.text(fmt(invoice.total), pageW - margin, y, { align: "right" });
  y += 10;

  // ── Notes ─────────────────────────────────────────────────────────────────────
  if (invoice.notes) {
    doc.setDrawColor(...light);
    doc.line(margin, y, pageW - margin, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...grey);
    doc.text("NOTES", margin, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    const noteLines = doc.splitTextToSize(invoice.notes, contentW);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 4 + 4;
  }

  // ── Footer ────────────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...light);
  doc.text(
    `Thank you for your business${companyName ? " · " + companyName : ""}`,
    pageW / 2,
    pageH - 10,
    { align: "center" }
  );
  doc.setFillColor(...amber);
  doc.rect(0, pageH - 3, pageW, 3, "F");

  return doc;
}

/**
 * Download the invoice PDF directly in the browser.
 */
export function downloadInvoicePdf(invoice: InvoicePdfData, settings: InvoicePdfSettings = {}): void {
  const doc = generateInvoicePdf(invoice, settings);
  doc.save(`Invoice-${invoice.invoiceNumber}.pdf`);
}

/**
 * Return the invoice PDF as a standard base64 string (no URL-safe encoding).
 * Suitable for embedding directly in a MIME attachment Content-Transfer-Encoding: base64 part.
 */
export function invoicePdfToBase64(invoice: InvoicePdfData, settings: InvoicePdfSettings = {}): string {
  const doc = generateInvoicePdf(invoice, settings);
  const dataUri = doc.output("datauristring");
  return dataUri.split(",")[1] ?? "";
}
