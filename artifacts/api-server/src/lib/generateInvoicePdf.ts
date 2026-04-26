import jsPDF from "jspdf";
import fs from "node:fs";
import path from "node:path";

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
  jobTitle?: string | null;
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
}

async function loadLogoDataUri(logoUrl: string): Promise<string | null> {
  try {
    if (logoUrl.startsWith("/api/uploads/")) {
      const relative = logoUrl.slice("/api/uploads/".length);
      const filePath = path.resolve("uploads", relative);
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase().replace(".", "");
      const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
      return `data:${mime};base64,${buf.toString("base64")}`;
    }
    if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
      const resp = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) return null;
      const buf = Buffer.from(await resp.arrayBuffer());
      const ct = resp.headers.get("content-type") ?? "image/png";
      const mime = ct.split(";")[0].trim();
      return `data:${mime};base64,${buf.toString("base64")}`;
    }
    return null;
  } catch {
    return null;
  }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }
  return iso;
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function buildPdf(invoice: InvoicePdfData, settings: InvoicePdfSettings, logoDataUri: string | null): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentW = pageW - margin * 2;

  const amber: [number, number, number] = [245, 158, 11];
  const dark: [number, number, number] = [17, 17, 17];
  const grey: [number, number, number] = [100, 100, 100];
  const light: [number, number, number] = [220, 220, 220];

  doc.setFillColor(...amber);
  doc.rect(0, 0, pageW, 4, "F");

  const logoMaxW = 36;
  const logoMaxH = 22;
  let logoEndY = 6;

  if (logoDataUri) {
    const imgFmt = (logoDataUri.match(/data:image\/(\w+)/)?.[1] ?? "png").toUpperCase();
    try {
      doc.addImage(logoDataUri, imgFmt, margin, 6, logoMaxW, logoMaxH);
      logoEndY = 6 + logoMaxH;
    } catch { /* skip on error */ }
  }

  const companyName = invoice.businessLine === "asphalt_sealing"
    ? `${settings.companyName || "Willard's General Contracting LLC"}, DBA Willard's Asphalt Sealing`
    : (settings.companyName || "");
  const cityLine = [settings.companyCity, settings.companyState, settings.companyZip].filter(Boolean).join(", ");

  let leftY = logoEndY + 3;

  if (!logoDataUri && companyName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...dark);
    doc.text(companyName, margin, leftY);
    leftY += 5;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...grey);
  if (settings.companyAddress) { doc.text(settings.companyAddress, margin, leftY); leftY += 4; }
  if (cityLine)                 { doc.text(cityLine,                margin, leftY); leftY += 4; }
  if (settings.companyPhone)    { doc.text(settings.companyPhone,   margin, leftY); leftY += 4; }
  if (settings.companyEmail)    { doc.text(settings.companyEmail,   margin, leftY); leftY += 4; }

  const invoiceTopY = 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...dark);
  doc.text("INVOICE", pageW - margin, invoiceTopY, { align: "right" });

  let detailY = invoiceTopY + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...amber);
  doc.text(invoice.invoiceNumber, pageW - margin, detailY, { align: "right" });
  detailY += 5;

  const dateLines: { label: string; value: string }[] = [];
  if (invoice.issueDate) dateLines.push({ label: "Date:", value: fmtDate(invoice.issueDate) });
  if (invoice.dueDate)   dateLines.push({ label: "Due:", value: fmtDate(invoice.dueDate) });
  if (invoice.terms)     dateLines.push({ label: "Terms:", value: invoice.terms });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  for (const { label, value } of dateLines) {
    doc.setTextColor(...grey);
    doc.text(label, pageW - margin - 38, detailY);
    doc.setTextColor(...dark);
    doc.text(value, pageW - margin, detailY, { align: "right" });
    detailY += 4.5;
  }

  let y = Math.max(leftY + 4, detailY + 4);
  doc.setDrawColor(...light);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  const locLine = [invoice.locationName, invoice.city, invoice.state].filter(Boolean).join(", ");
  const hasLocation = !!locLine;

  const billToLines: Array<{ text: string; bold: boolean; large: boolean }> = [];
  if (invoice.clientName)  billToLines.push({ text: invoice.clientName, bold: true, large: true });
  if (invoice.clientEmail) billToLines.push({ text: invoice.clientEmail, bold: false, large: false });
  if (invoice.clientPhone) billToLines.push({ text: invoice.clientPhone, bold: false, large: false });
  const clientAddrLine = [invoice.clientAddress, invoice.clientCity, invoice.clientState, invoice.clientZip].filter(Boolean).join(", ");
  if (clientAddrLine)      billToLines.push({ text: clientAddrLine, bold: false, large: false });
  if (invoice.jobTitle)    billToLines.push({ text: `Re: ${invoice.jobTitle}`, bold: false, large: false });

  const boxPadX = 4;
  const boxPadTop = 4;
  const boxPadBot = 4;
  const labelH = 5;
  const lineH = 4.5;
  const largeLineH = 5;

  function calcBoxH(lines: Array<{ large: boolean }>): number {
    const linesH = lines.reduce((acc, l) => acc + (l.large ? largeLineH : lineH), 0);
    return boxPadTop + labelH + linesH + boxPadBot;
  }

  const billBoxH = calcBoxH(billToLines.length > 0 ? billToLines : [{ large: false }]);
  const billBoxW = hasLocation ? (contentW - 5) * 0.55 : contentW;

  doc.setFillColor(247, 248, 249);
  doc.setDrawColor(...light);
  doc.roundedRect(margin, y, billBoxW, billBoxH, 2, 2, "FD");

  let billY = y + boxPadTop + 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...grey);
  doc.text("BILL TO", margin + boxPadX, billY);
  billY += labelH;

  for (const line of billToLines) {
    if (line.bold && line.large) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...dark);
      doc.text(line.text, margin + boxPadX, billY);
      billY += largeLineH;
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(80, 80, 80);
      doc.text(line.text, margin + boxPadX, billY, { maxWidth: billBoxW - boxPadX * 2 - 2 });
      billY += lineH;
    }
  }

  if (hasLocation) {
    const locX = margin + billBoxW + 5;
    const locBoxW = contentW - billBoxW - 5;
    const locContentLines: Array<{ text: string; bold: boolean; large: boolean }> = [];
    if (invoice.locationName) locContentLines.push({ text: invoice.locationName, bold: true, large: true });
    const cityStateLine = [invoice.city, invoice.state].filter(Boolean).join(", ");
    if (cityStateLine) locContentLines.push({ text: cityStateLine, bold: false, large: false });
    const locBoxH = Math.max(billBoxH, calcBoxH(locContentLines.length > 0 ? locContentLines : [{ large: false }]));

    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(253, 230, 138);
    doc.roundedRect(locX, y, locBoxW, locBoxH, 2, 2, "FD");

    let locY = y + boxPadTop + 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(180, 120, 0);
    doc.text("WORK LOCATION", locX + boxPadX, locY);
    locY += labelH;

    for (const line of locContentLines) {
      if (line.bold && line.large) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...dark);
        doc.text(line.text, locX + boxPadX, locY, { maxWidth: locBoxW - boxPadX * 2 - 2 });
        locY += largeLineH;
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(80, 80, 80);
        doc.text(line.text, locX + boxPadX, locY, { maxWidth: locBoxW - boxPadX * 2 - 2 });
        locY += lineH;
      }
    }
    y += Math.max(billBoxH, locBoxH) + 8;
  } else {
    y += billBoxH + 8;
  }

  const col = {
    desc: margin,
    qty: pageW - margin - 65,
    rate: pageW - margin - 38,
    total: pageW - margin,
  };

  doc.setFillColor(250, 250, 250);
  doc.rect(margin, y - 1, contentW, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...grey);
  doc.text("DESCRIPTION", col.desc, y + 4);
  doc.text("QTY",    col.qty,   y + 4, { align: "right" });
  doc.text("RATE",   col.rate,  y + 4, { align: "right" });
  doc.text("AMOUNT", col.total, y + 4, { align: "right" });

  doc.setDrawColor(...dark);
  doc.setLineWidth(0.4);
  doc.line(margin, y + 7, pageW - margin, y + 7);
  doc.setLineWidth(0.2);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  let rowAlt = false;

  for (const li of invoice.lineItems) {
    if (y > 240) {
      doc.addPage();
      y = margin + 4;
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, y - 1, contentW, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...grey);
      doc.text("DESCRIPTION", col.desc, y + 4);
      doc.text("QTY",    col.qty,   y + 4, { align: "right" });
      doc.text("RATE",   col.rate,  y + 4, { align: "right" });
      doc.text("AMOUNT", col.total, y + 4, { align: "right" });
      doc.setDrawColor(...dark);
      doc.setLineWidth(0.4);
      doc.line(margin, y + 7, pageW - margin, y + 7);
      doc.setLineWidth(0.2);
      y += 10;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
    }

    if (rowAlt) {
      doc.setFillColor(248, 248, 248);
      doc.rect(margin, y - 2, contentW, 7, "F");
    }
    rowAlt = !rowAlt;

    const desc = String(li.description ?? "").length > 60
      ? String(li.description).substring(0, 58) + "…"
      : String(li.description ?? "");
    const lineTotal = li.quantity * li.unitPrice;

    doc.setTextColor(...dark);
    doc.text(desc, col.desc, y + 3);
    doc.setTextColor(...grey);
    doc.text(String(li.quantity), col.qty,  y + 3, { align: "right" });
    doc.text(fmtMoney(li.unitPrice), col.rate, y + 3, { align: "right" });
    doc.setTextColor(...dark);
    doc.setFont("helvetica", "bold");
    doc.text(fmtMoney(lineTotal), col.total, y + 3, { align: "right" });
    doc.setFont("helvetica", "normal");

    doc.setDrawColor(235, 235, 235);
    doc.line(margin, y + 5, pageW - margin, y + 5);
    y += 7;
  }

  y += 4;
  const totalsX = pageW - margin - 58;
  doc.setDrawColor(...light);
  doc.line(totalsX, y, pageW - margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...grey);
  doc.text("Subtotal", totalsX, y);
  doc.setTextColor(...dark);
  doc.text(fmtMoney(invoice.subtotal), pageW - margin, y, { align: "right" });
  y += 5;

  if ((invoice.taxRate ?? 0) > 0) {
    doc.setTextColor(...grey);
    doc.text(`Tax (${invoice.taxRate}%)`, totalsX, y);
    doc.setTextColor(...dark);
    doc.text(fmtMoney(invoice.taxAmount ?? 0), pageW - margin, y, { align: "right" });
    y += 5;
  }

  doc.setDrawColor(...dark);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y, pageW - margin, y);
  doc.setLineWidth(0.2);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...dark);
  doc.text("Total Due", totalsX, y);
  doc.setTextColor(...amber);
  doc.text(fmtMoney(invoice.total), pageW - margin, y, { align: "right" });
  y += 10;

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

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...light);
  doc.text(
    `Thank you for your business${companyName ? " · " + companyName : ""}`,
    pageW / 2,
    pageH - 10,
    { align: "center" },
  );
  doc.setFillColor(...amber);
  doc.rect(0, pageH - 4, pageW, 4, "F");

  return doc;
}

export async function generateInvoicePdfBase64(
  invoice: InvoicePdfData,
  settings: InvoicePdfSettings,
): Promise<string> {
  const logoUrl = settings.logoUrl ?? null;
  const logoDataUri = logoUrl ? await loadLogoDataUri(logoUrl) : null;
  const doc = buildPdf(invoice, settings, logoDataUri);
  const dataUri: string = doc.output("datauristring");
  return dataUri.split(",")[1] ?? "";
}
