/**
 * PDF generators for the Subcontractor Portal.
 * Uses pdfkit (pure Node.js) — NOT Puppeteer/Chrome.
 */

import PDFDocument from "pdfkit";

// ── Colour palette ────────────────────────────────────────────────────────────
const AMBER  = "#d97706";
const DARK   = "#1f2937";
const GRAY   = "#6b7280";
const LGRAY  = "#9ca3af";
const BORDER = "#e5e7eb";
const GREEN  = "#059669";
const RED    = "#dc2626";
const VIOLET = "#7c3aed";
const BLUE   = "#1d4ed8";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMoney(n: number): string {
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function makeDoc(title: string) {
  const doc = new PDFDocument({
    size: "Letter",
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    autoFirstPage: true,
    info: { Title: title, Author: "Subcontractor Portal" },
  }) as any;

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const PW = 612;
  const ML = 40;
  const MR = 40;
  const L  = ML;
  const R  = PW - MR;
  const W  = R - L;

  function ensureSpace(needed: number) {
    const pageBottom = (doc.page.height as number) - (doc.page.margins.bottom as number);
    if (doc.y + needed > pageBottom) doc.addPage();
  }

  function hRule(color = BORDER, weight = 0.5) {
    const y = doc.y;
    doc.save().moveTo(L, y).lineTo(R, y).strokeColor(color).lineWidth(weight).stroke().restore();
    doc.y = y + 6;
  }

  function sectionHeading(label: string, color = AMBER) {
    ensureSpace(30);
    doc.y += 8;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(color)
       .text(label.toUpperCase(), L, doc.y, { width: W, characterSpacing: 0.8 });
    doc.y += 3;
    hRule(BORDER, 0.7);
  }

  function row2(left: string, right: string, opts?: { bold?: boolean; rightColor?: string; leftColor?: string }) {
    ensureSpace(16);
    const y = doc.y;
    const leftFont = opts?.bold ? "Helvetica-Bold" : "Helvetica";
    doc.font(leftFont).fontSize(9).fillColor(opts?.leftColor ?? DARK)
       .text(left, L, y, { width: W * 0.65, lineBreak: false });
    doc.font(opts?.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9)
       .fillColor(opts?.rightColor ?? DARK)
       .text(right, L, y, { width: W, align: "right" });
    doc.y = y + 14;
  }

  function pageHeader(name: string, subtitle: string, year: number) {
    // Amber banner
    doc.rect(L, doc.y, W, 48).fill(AMBER);
    const bannerY = doc.y + 10;
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#ffffff")
       .text(subtitle, L + 10, bannerY, { width: W * 0.6, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#ffffff")
       .text(String(year), L, bannerY, { width: W - 10, align: "right" });
    doc.y = bannerY + 18;
    doc.font("Helvetica").fontSize(9).fillColor("rgba(255,255,255,0.85)")
       .text(name, L + 10, doc.y, { width: W - 20 });
    doc.y += 16;
    doc.font("Helvetica").fontSize(8).fillColor(LGRAY)
       .text(`Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, L, doc.y, { width: W, align: "right" });
    doc.y += 4;
    hRule(BORDER, 0.5);
    doc.y += 4;
  }

  function disclaimer(text: string) {
    doc.y += 6;
    doc.rect(L, doc.y, W, 1).fill(BORDER);
    doc.y += 6;
    doc.font("Helvetica").fontSize(7.5).fillColor(LGRAY)
       .text(text, L, doc.y, { width: W });
  }

  return { doc, chunks, L, R, W, ensureSpace, hRule, sectionHeading, row2, pageHeader, disclaimer };
}

function finalize(doc: any, chunks: Buffer[]): Promise<Buffer> {
  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Tax Summary PDF
// ─────────────────────────────────────────────────────────────────────────────

export interface TaxReportData {
  year: number;
  subName: string;
  w9LegalName?: string | null;
  grossIncome: number;
  qualifyingIncome?: number;
  expenses: {
    total: number;
    byCategory: Record<string, number>;
    count: number;
  };
  mileage: {
    totalMiles: number;
    ratePerMile: number;
    deduction: number;
    count: number;
  };
  totalDeductions: number;
  netIncome: number;
  seTaxEstimate: number;
  seDeduction: number;
  federalTaxableIncome: number;
  estimatedFederalIncomeTax: number;
  estimatedTotalTax: number;
  estimatedQuarterlyPayment: number;
  standardDeduction?: number;
}

export async function generateTaxSummaryPdf(data: TaxReportData): Promise<Buffer> {
  const { doc, chunks, L, W, sectionHeading, row2, pageHeader, disclaimer } = makeDoc(`Tax Summary ${data.year}`);

  const displayName = data.w9LegalName || data.subName;
  pageHeader(displayName, "Tax Summary", data.year);

  // ── Gross Income ──────────────────────────────────────────────────────────
  sectionHeading("Gross Income", GREEN);
  row2("Payments from contractor", fmtMoney(data.grossIncome), { rightColor: GREEN });
  if (data.qualifyingIncome != null && data.qualifyingIncome !== data.grossIncome) {
    doc.font("Helvetica").fontSize(8).fillColor(LGRAY)
       .text(`Qualifying cash/check/ACH payments: ${fmtMoney(data.qualifyingIncome)} (1099-NEC threshold is $2,000)`, L, doc.y, { width: W });
    doc.y += 10;
  }

  // ── Deductions ────────────────────────────────────────────────────────────
  sectionHeading("Deductions");

  // Business expenses by category
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(DARK).text("Business Expenses", L, doc.y);
  doc.y += 2;
  if (data.expenses.count === 0) {
    doc.font("Helvetica").fontSize(8.5).fillColor(LGRAY).text("No expenses logged", L + 10, doc.y);
    doc.y += 12;
  } else {
    for (const [cat, amt] of Object.entries(data.expenses.byCategory)) {
      row2(`  ${cat}`, fmtMoney(amt), { leftColor: GRAY });
    }
    row2(`  Total Business Expenses (${data.expenses.count} items)`, `−${fmtMoney(data.expenses.total)}`, { bold: true, rightColor: RED });
  }

  doc.y += 4;

  // Mileage deduction
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(DARK).text("Mileage Deduction", L, doc.y);
  doc.y += 2;
  if (data.mileage.count === 0) {
    doc.font("Helvetica").fontSize(8.5).fillColor(LGRAY).text("No business miles logged", L + 10, doc.y);
    doc.y += 12;
  } else {
    row2(`  ${data.mileage.totalMiles.toFixed(1)} business miles × $${data.mileage.ratePerMile}/mi (IRS rate)`, `−${fmtMoney(data.mileage.deduction)}`, { rightColor: RED });
  }

  doc.y += 6;
  row2("Total Deductions", `−${fmtMoney(data.totalDeductions)}`, { bold: true, rightColor: RED });

  // ── Net Income ────────────────────────────────────────────────────────────
  sectionHeading("Net Self-Employment Income", VIOLET);
  row2("Gross Income − Total Deductions", fmtMoney(data.netIncome), { bold: true, rightColor: VIOLET });

  // ── Tax Calculation ───────────────────────────────────────────────────────
  sectionHeading("Tax Calculation");

  const stdDed = data.standardDeduction ?? 15_000;
  const fedTaxable = Math.max(0, data.federalTaxableIncome - stdDed);

  const calcRows: [string, number, string?][] = [
    ["Gross Income",                data.grossIncome,          GREEN],
    ["− Business Deductions",       data.totalDeductions,      RED],
    ["= Net Self-Employment Income",data.netIncome,            DARK],
    ["SE Tax (15.3% on 92.35%)",    data.seTaxEstimate,        DARK],
    ["− Deductible half of SE Tax", data.seDeduction,          RED],
    ["= Adjusted Gross Income",     data.federalTaxableIncome, DARK],
    ["− Standard Deduction",        stdDed,                    RED],
    ["= Estimated Federal Taxable Income", fedTaxable,         BLUE],
  ];
  for (const [label, amt, color] of calcRows) {
    const isBold = label.startsWith("=");
    row2(label, fmtMoney(amt), { bold: isBold, rightColor: color, leftColor: isBold ? DARK : GRAY });
  }

  // ── Estimated Tax Owed ────────────────────────────────────────────────────
  sectionHeading("Estimated Tax Owed");
  row2("Federal income tax (2026 brackets)", fmtMoney(data.estimatedFederalIncomeTax ?? 0));
  row2("Self-employment tax", fmtMoney(data.seTaxEstimate));
  row2("Total Estimated Tax Owed", fmtMoney(data.estimatedTotalTax ?? 0), { bold: true, rightColor: RED });
  if ((data.estimatedTotalTax ?? 0) > 0) {
    row2("Recommended Quarterly Payment", fmtMoney(data.estimatedQuarterlyPayment), { rightColor: AMBER });
  }
  if (data.grossIncome > 0) {
    const eff = ((data.estimatedTotalTax ?? 0) / data.grossIncome * 100).toFixed(1);
    doc.font("Helvetica").fontSize(8).fillColor(LGRAY)
       .text(`Effective tax rate: ${eff}% of gross income`, L, doc.y, { width: W });
    doc.y += 12;
  }

  disclaimer(
    "ESTIMATE ONLY — NOT TAX ADVICE. Assumes single filing status and the $15,000 standard deduction. " +
    "Actual taxes depend on your full return, other income, credits, and deductions. " +
    "Consult a CPA or tax professional before making any tax payments."
  );

  return finalize(doc, chunks);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Mileage Report PDF
// ─────────────────────────────────────────────────────────────────────────────

export interface MileageLogEntry {
  id: number;
  date: string;
  miles: number;
  startLocation?: string | null;
  endLocation?: string | null;
  purpose?: string | null;
  classification: string;
  ratePerMile: number;
  deductionAmount: number;
  notes?: string | null;
}

export async function generateMileageReportPdf(
  subName: string,
  year: number,
  logs: MileageLogEntry[],
  irsRate: number,
): Promise<Buffer> {
  const { doc, chunks, L, W, ensureSpace, hRule, sectionHeading, row2, pageHeader, disclaimer } = makeDoc(`Mileage Report ${year}`);

  pageHeader(subName, "Mileage Report", year);

  const bizLogs = logs.filter(m => m.classification === "business");
  const totalMiles = bizLogs.reduce((s, m) => s + m.miles, 0);
  const totalDeduction = bizLogs.reduce((s, m) => s + m.deductionAmount, 0);
  const personalLogs = logs.filter(m => m.classification !== "business");

  // ── Summary ───────────────────────────────────────────────────────────────
  sectionHeading("Summary", GREEN);
  row2("Total business miles", totalMiles.toFixed(1) + " mi");
  row2(`IRS mileage rate (${year})`, `$${irsRate}/mile`);
  row2("Total mileage deduction", fmtMoney(totalDeduction), { bold: true, rightColor: GREEN });
  row2("Business trips logged", String(bizLogs.length));
  if (personalLogs.length > 0) {
    row2("Personal trips logged (not deductible)", String(personalLogs.length), { rightColor: LGRAY });
  }

  // ── Trip Detail ───────────────────────────────────────────────────────────
  if (bizLogs.length > 0) {
    sectionHeading("Business Trips", AMBER);

    // Column header
    ensureSpace(16);
    const y0 = doc.y;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY);
    doc.text("Date",        L,           y0, { width: 65,  lineBreak: false });
    doc.text("From → To / Purpose", L + 65, y0, { width: W - 65 - 110, lineBreak: false });
    doc.text("Miles",       L + W - 110, y0, { width: 50, align: "right", lineBreak: false });
    doc.text("Deduction",   L + W - 60,  y0, { width: 60, align: "right" });
    doc.y = y0 + 13;
    hRule(BORDER, 0.4);

    let runningMiles = 0;
    for (const m of bizLogs) {
      ensureSpace(20);
      const y = doc.y;

      const description = [
        m.startLocation && m.endLocation
          ? `${m.startLocation} → ${m.endLocation}`
          : m.startLocation || m.endLocation || "",
        m.purpose,
      ].filter(Boolean).join(" · ") || "Business trip";

      doc.font("Helvetica").fontSize(8.5).fillColor(DARK)
         .text(fmtDate(m.date), L, y, { width: 65, lineBreak: false });
      doc.font("Helvetica").fontSize(8.5).fillColor(DARK)
         .text(description, L + 65, y, { width: W - 65 - 110, lineBreak: false });
      doc.font("Helvetica").fontSize(8.5).fillColor(DARK)
         .text(m.miles.toFixed(1), L + W - 110, y, { width: 50, align: "right", lineBreak: false });
      doc.font("Helvetica").fontSize(8.5).fillColor(GREEN)
         .text(fmtMoney(m.deductionAmount), L + W - 60, y, { width: 60, align: "right" });

      runningMiles += m.miles;
      doc.y = y + 14;

      if (m.notes) {
        ensureSpace(12);
        doc.font("Helvetica").fontSize(7.5).fillColor(LGRAY)
           .text(`  Note: ${m.notes}`, L + 65, doc.y, { width: W - 65 });
        doc.y += 10;
      }
    }

    // Totals row
    hRule(BORDER, 0.4);
    ensureSpace(16);
    const yt = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK)
       .text("Total", L, yt, { width: W - 110, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK)
       .text(totalMiles.toFixed(1), L + W - 110, yt, { width: 50, align: "right", lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GREEN)
       .text(fmtMoney(totalDeduction), L + W - 60, yt, { width: 60, align: "right" });
    doc.y = yt + 14;
  } else {
    doc.font("Helvetica").fontSize(9).fillColor(LGRAY)
       .text("No business trips logged for this year.", L, doc.y, { width: W });
    doc.y += 14;
  }

  disclaimer(
    "ESTIMATE ONLY — NOT TAX ADVICE. Business mileage deduction based on the IRS standard mileage rate. " +
    "Keep odometer records or GPS logs to support this deduction. Consult a tax professional."
  );

  return finalize(doc, chunks);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Expense Report PDF
// ─────────────────────────────────────────────────────────────────────────────

export interface ExpenseEntry {
  id: number;
  date: string | null;
  category: string;
  description: string | null;
  amount: number;
  vendor?: string | null;
  notes?: string | null;
}

export async function generateExpenseReportPdf(
  subName: string,
  year: number,
  expenses: ExpenseEntry[],
): Promise<Buffer> {
  const { doc, chunks, L, W, ensureSpace, hRule, sectionHeading, row2, pageHeader, disclaimer } = makeDoc(`Expense Report ${year}`);

  pageHeader(subName, "Expense Report", year);

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  // ── Summary ───────────────────────────────────────────────────────────────
  sectionHeading("Summary", GREEN);
  row2("Total expenses", fmtMoney(total), { bold: true, rightColor: RED });
  row2("Number of expenses", String(expenses.length));

  // By category breakdown
  const byCat: Record<string, number> = {};
  for (const e of expenses) {
    byCat[e.category] = (byCat[e.category] ?? 0) + e.amount;
  }
  if (Object.keys(byCat).length > 0) {
    sectionHeading("By Category", AMBER);
    for (const [cat, amt] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
      row2(cat, fmtMoney(amt));
    }
  }

  // ── Line Items ────────────────────────────────────────────────────────────
  if (expenses.length > 0) {
    sectionHeading("All Expenses", AMBER);

    ensureSpace(16);
    const y0 = doc.y;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY);
    doc.text("Date",     L,           y0, { width: 65, lineBreak: false });
    doc.text("Category", L + 65,      y0, { width: 90, lineBreak: false });
    doc.text("Description", L + 155,  y0, { width: W - 155 - 70, lineBreak: false });
    doc.text("Amount",   L + W - 70,  y0, { width: 70, align: "right" });
    doc.y = y0 + 13;
    hRule(BORDER, 0.4);

    for (const e of expenses) {
      ensureSpace(18);
      const y = doc.y;

      doc.font("Helvetica").fontSize(8.5).fillColor(DARK)
         .text(fmtDate(e.date), L, y, { width: 65, lineBreak: false });
      doc.font("Helvetica").fontSize(8.5).fillColor(GRAY)
         .text(e.category, L + 65, y, { width: 90, lineBreak: false });
      doc.font("Helvetica").fontSize(8.5).fillColor(DARK)
         .text(e.description || "—", L + 155, y, { width: W - 155 - 70, lineBreak: false });
      doc.font("Helvetica").fontSize(8.5).fillColor(RED)
         .text(fmtMoney(e.amount), L + W - 70, y, { width: 70, align: "right" });
      doc.y = y + 14;

      if (e.vendor || e.notes) {
        ensureSpace(12);
        const detail = [e.vendor ? `Vendor: ${e.vendor}` : null, e.notes ? `Note: ${e.notes}` : null].filter(Boolean).join(" · ");
        doc.font("Helvetica").fontSize(7.5).fillColor(LGRAY)
           .text(`  ${detail}`, L + 65, doc.y, { width: W - 65 });
        doc.y += 10;
      }
    }

    hRule(BORDER, 0.4);
    ensureSpace(16);
    const yt = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK)
       .text("Total", L, yt, { width: W - 70, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(RED)
       .text(fmtMoney(total), L + W - 70, yt, { width: 70, align: "right" });
    doc.y = yt + 14;
  } else {
    doc.font("Helvetica").fontSize(9).fillColor(LGRAY)
       .text("No expenses logged for this year.", L, doc.y, { width: W });
    doc.y += 14;
  }

  disclaimer(
    "ESTIMATE ONLY — NOT TAX ADVICE. Keep all receipts and documentation for claimed deductions. " +
    "Consult a CPA or tax professional to confirm which expenses are deductible on your Schedule C."
  );

  return finalize(doc, chunks);
}
