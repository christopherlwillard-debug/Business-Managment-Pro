import jsPDF from "jspdf";

export interface Payer1099 {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  ein?: string | null;
}

export interface Payee1099 {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  tinType?: string | null; // SSN | EIN
  tinLastFour?: string | null;
}

export interface Form1099NecData {
  taxYear: number;
  payer: Payer1099;
  payee: Payee1099;
  nonemployeeCompensation: number; // Box 1
}

function box(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string, small = false) {
  doc.setDrawColor(100);
  doc.rect(x, y, w, h);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(80);
  doc.text(label, x + 1.5, y + 3.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(small ? 8 : 10);
  doc.setTextColor(20);
  if (value) doc.text(value, x + 1.5, y + h - 2.5);
}

export function generate1099NecPdf(data: Form1099NecData): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;
  const formW = pageW - margin * 2;

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFillColor(230, 240, 255);
  doc.rect(margin, 10, formW, 12, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20);
  doc.text(`Form 1099-NEC`, margin + 3, 18);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60);
  doc.text(`Nonemployee Compensation — Tax Year ${data.taxYear}`, margin + 3, 23);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text(`${data.taxYear}`, pageW - margin - 3, 21, { align: "right" });

  const col1 = margin;
  const col2 = margin + formW * 0.5;
  const col2w = formW * 0.5;
  const col1w = formW * 0.5;

  let y = 26;

  // ── Payer section ─────────────────────────────────────────────────────────
  const payerAddr = [
    data.payer.address,
    [data.payer.city, data.payer.state, data.payer.zip].filter(Boolean).join(", "),
    data.payer.phone,
  ].filter(Boolean).join("\n");

  doc.setDrawColor(100);
  doc.rect(col1, y, col1w, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(80);
  doc.text("PAYER'S name, street address, city or town, state or province, country, ZIP or foreign postal code, and telephone no.", col1 + 1.5, y + 3.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20);
  doc.text(data.payer.name || "", col1 + 1.5, y + 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const payerLines = payerAddr.split("\n");
  payerLines.forEach((line, i) => doc.text(line, col1 + 1.5, y + 14 + i * 4.5));

  // Payer TIN box
  box(doc, col2, y, col2w / 2, 14,
    "PAYER'S TIN",
    data.payer.ein ? `EIN: ${data.payer.ein}` : ""
  );

  // Recipient TIN box
  box(doc, col2 + col2w / 2, y, col2w / 2, 14,
    "RECIPIENT'S TIN",
    data.payee.tinLastFour
      ? `${data.payee.tinType === "EIN" ? "EIN" : "SSN"}: ***-**-${data.payee.tinLastFour}`
      : "Not on file"
  );

  y += 14;

  // ── Recipient section ─────────────────────────────────────────────────────
  const recipAddr = [
    data.payee.address,
    [data.payee.city, data.payee.state, data.payee.zip].filter(Boolean).join(", "),
  ].filter(Boolean).join("\n");

  doc.setDrawColor(100);
  doc.rect(col2, y, col2w, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(80);
  doc.text("RECIPIENT'S name", col2 + 1.5, y + 3.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20);
  doc.text(data.payee.name || "", col2 + 1.5, y + 9);

  y += 14;

  // Recipient address
  doc.setDrawColor(100);
  doc.rect(col2, y, col2w, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(80);
  doc.text("Street address (including apt. no.)", col2 + 1.5, y + 3.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(20);
  const recipLines = recipAddr.split("\n");
  recipLines.forEach((line, i) => doc.text(line, col2 + 1.5, y + 8 + i * 4.5));

  // ── Boxes row ─────────────────────────────────────────────────────────────
  y = 26 + 28;

  const boxH = 16;
  const boxW = formW / 4;

  // Box 1 — Nonemployee compensation (main value)
  doc.setFillColor(245, 250, 245);
  doc.rect(col1, y, boxW, boxH, "F");
  box(doc, col1, y, boxW, boxH, "1  Nonemployee compensation", `$${data.nonemployeeCompensation.toFixed(2)}`);

  // Box 2 — Payer made direct sales totaling $5,000 or more
  box(doc, col1 + boxW, y, boxW, boxH, "2  Direct sales (see instructions)", "");

  // Box 3
  box(doc, col1 + boxW * 2, y, boxW, boxH, "3  Other income", "");

  // Box 4 — Federal income tax withheld
  box(doc, col1 + boxW * 3, y, boxW, boxH, "4  Federal income tax withheld", "$0.00");

  y += boxH;

  // Boxes 5–7
  box(doc, col1, y, boxW, boxH, "5  State tax withheld", "", true);
  box(doc, col1 + boxW, y, boxW, boxH, "6  State/Payer's state no.", "", true);
  box(doc, col1 + boxW * 2, y, boxW * 2, boxH, "7  State income", "", true);

  y += boxH + 6;

  // ── Instructions note ─────────────────────────────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80);
  doc.text(
    "COPY B — For Recipient. This is important tax information and is being furnished to the IRS. If you are required to file a return,\na negligence penalty or other sanction may be imposed on you if this income is taxable and you fail to report it.",
    margin, y, { maxWidth: formW }
  );

  y += 14;

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setDrawColor(180);
  doc.line(margin, y, pageW - margin, y);
  y += 4;
  doc.setFontSize(7.5);
  doc.setTextColor(100);
  doc.text(`Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} · ${data.taxYear} Tax Year · For informational purposes only.`, margin, y);

  return doc.output("blob");
}
