import PDFDocument from "pdfkit";

export type CustomerQuoteDocument = {
  quoteNumber: string;
  title: string;
  issuedAt: string;
  expiresAt: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  billingAddress: string | null;
  workAddress: string | null;
  jobType: string | null;
  terms: string | null;
  items: Array<{ description: string; quantity: number; unit: string | null; amount: number }>;
  subtotal: number;
  adjustment: number;
  tax: number;
  total: number;
  brand: {
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    logo: Buffer | null;
  };
};

const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value: string | null) => value
  ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  : "—";

export async function generateEstimateQuotePdf(quote: CustomerQuoteDocument): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 48, bottom: 48, left: 52, right: 52 }, info: { Title: quote.title, Author: quote.brand.name } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finish = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const pageWidth = 612;
  const left = 52;
  const right = pageWidth - 52;
  const width = right - left;
  const rule = () => {
    const y = doc.y;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.7).strokeColor("#d1d5db").stroke();
    doc.y = y + 12;
  };
  const row = (label: string, value: string, bold = false) => {
    const y = doc.y;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor("#111827").text(label, left, y, { width: width * 0.68 });
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).text(value, left, y, { width, align: "right" });
    doc.y = Math.max(doc.y, y + 17);
  };

  if (quote.brand.logo) {
    try { doc.image(quote.brand.logo, left, 40, { fit: [150, 64] }); } catch { /* Text branding remains available. */ }
  }
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#111827").text(quote.brand.name, left, 44, { width: width * 0.66, align: quote.brand.logo ? "right" : "left" });
  const contact = [quote.brand.address, [quote.brand.city, quote.brand.state, quote.brand.zip].filter(Boolean).join(" "), quote.brand.phone, quote.brand.email, quote.brand.website].filter(Boolean);
  doc.font("Helvetica").fontSize(8.5).fillColor("#4b5563").text(contact.join("  •  "), left, 76, { width, align: "right" });
  doc.y = 104;
  rule();

  doc.font("Helvetica-Bold").fontSize(24).fillColor("#b45309").text("QUOTE", left, doc.y);
  doc.font("Helvetica").fontSize(9).fillColor("#374151").text(`Quote ${quote.quoteNumber}   •   Issued ${dateLabel(quote.issuedAt)}   •   Expires ${dateLabel(quote.expiresAt)}`, left, doc.y + 5);
  doc.y += 38;
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#111827").text(quote.title, left, doc.y, { width });
  doc.y += 21;
  if (quote.customerName) doc.font("Helvetica-Bold").fontSize(10).text(`Prepared for ${quote.customerName}`, left, doc.y);
  doc.y += 14;
  const customerDetails = [quote.customerEmail, quote.customerPhone, quote.billingAddress].filter(Boolean);
  if (customerDetails.length) {
    doc.font("Helvetica").fontSize(9).fillColor("#4b5563").text(customerDetails.join("\n"), left, doc.y, { width: width * 0.55 });
  }
  if (quote.workAddress) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827").text("WORK LOCATION", left + width * 0.58, doc.y - (customerDetails.length ? 0 : 14));
    doc.font("Helvetica").fontSize(9).fillColor("#4b5563").text(quote.workAddress, left + width * 0.58, doc.y + 12, { width: width * 0.42 });
  }
  doc.y += Math.max(24, customerDetails.length * 11);
  if (quote.jobType) {
    doc.font("Helvetica").fontSize(9).fillColor("#4b5563").text(quote.jobType, left, doc.y);
    doc.y += 16;
  }
  rule();

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#6b7280").text("SCOPE", left, doc.y);
  doc.y += 18;
  for (const item of quote.items) {
    if (doc.y > 690) doc.addPage();
    const y = doc.y;
    const label = `${item.description}${item.quantity !== 1 || item.unit ? `  (${item.quantity}${item.unit ? ` ${item.unit}` : ""})` : ""}`;
    doc.font("Helvetica").fontSize(10).fillColor("#111827").text(label, left, y, { width: width * 0.72 });
    doc.font("Helvetica").fontSize(10).fillColor("#111827").text(money(item.amount), left, y, { width, align: "right" });
    doc.y = Math.max(doc.y, y + 18);
  }
  doc.y += 6;
  rule();
  row("Subtotal", money(quote.subtotal));
  if (quote.adjustment !== 0) row("Adjustment", money(quote.adjustment));
  if (quote.tax !== 0) row("Sales tax", money(quote.tax));
  doc.y += 4;
  rule();
  row("Total", money(quote.total), true);
  if (quote.terms) {
    doc.y += 22;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#6b7280").text("TERMS & NOTES", left, doc.y);
    doc.y += 14;
    doc.font("Helvetica").fontSize(9).fillColor("#374151").text(quote.terms, left, doc.y, { width, lineGap: 3 });
  }
  doc.end();
  return finish;
}
