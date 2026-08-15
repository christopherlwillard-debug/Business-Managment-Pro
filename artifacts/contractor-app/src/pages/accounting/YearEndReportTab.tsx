import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, AlertCircle, FileSpreadsheet, TrendingUp, TrendingDown,
  ChevronUp, ChevronDown, Download, Printer, AlertTriangle,
  CheckCircle2, DollarSign, Navigation, HardHat, CalendarClock,
  Shield, PieChart, Pencil, Check, X, Briefcase,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface YearEndReport {
  year: number;
  generatedAt: string;
  companyName: string;
  summary: {
    grossReceipts: number;
    otherIncomeTotal: number;
    totalRevenue: number;
    totalExpenses: number;
    mileageDeduction: number;
    mileageRate: number;
    totalMiles: number;
    totalDepreciation: number;
    netProfit: number;
  };
  taxEstimates: {
    selfEmploymentTax: number;
    federalIncomeTax: number;
    kyStateTax: number;
    owensboroOccTax?: number;
    totalLiability: number;
    totalPaid: number;
    balance: number;
  };
  expensesBySchedC: { schedCLine: string; amount: number; count: number; items: { date: string; description: string; vendor: string | null; amount: number }[] }[];
  totalExpenses: number;
  invoices: { invoiceNumber: string | null; issueDate: string; paymentDate: string; clientName: string; total: number; city: string; state: string }[];
  otherIncome: { id: number; date: string; description: string; source: string | null; amount: number; paymentMethod: string | null }[];
  mileage: { totalMiles: number; mileageRate: number; deduction: number; trips: number };
  depreciation: {
    rows: { id: number; name: string; assetType: string; purchaseDate: string; purchasePrice: number; depreciationMethod: string; usefulLifeYears: number; annualDeduction: number; section179Eligible: boolean; businessUsePct: number; schedule: { year: number; businessUsePct: number; annualDeduction: number; accumulated: number; bookValue: number }[] }[];
    total: number;
    totalAccumulated: number;
  };
  disposedAssets: { id: number; name: string; assetType: string; purchaseDate: string; purchasePrice: number; saleDate: string | null; salePrice: number; bookValue: number; gainLoss: number; status: string }[];
  sub1099s: { id: number; name: string; ytdPayments: number; requires1099: boolean; w9OnFile: boolean; w9LegalName: string | null }[];
  estimatedTaxPayments: { id: number; quarter: number; level: string; amountPaid: number; paidDate: string | null; paymentMethod: string | null; notes: string | null }[];
  ownerActivity?: {
    ownerAllocated: number;
    ownerTaxReserve: number;
    ownerCashTaken: number;
    ownerRetained: number;
    ownerOverWithdrawal: number;
    ownerDrawTotal: number;
    ownerContributionsTotal: number;
  };
}

function useYearEndReport(year: number, businessLine?: string) {
  return useQuery<YearEndReport>({
    queryKey: ["year-end-report", year, businessLine ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ year: String(year) });
      if (businessLine) params.set("businessLine", businessLine);
      const res = await fetch(`${BASE}/api/reports/year-end?${params}`);
      if (!res.ok) throw new Error("Failed to load year-end report");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function buildCSVBlob(rows: string[][], title: string): string {
  const header = title + "\n";
  const body = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  return header + body;
}

async function downloadYearEndZip(report: YearEndReport) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const year = report.year;

  zip.file(`${year}_PL_Summary.csv`, buildCSVBlob([
    ["Category", "Amount"],
    ["Gross Receipts (Paid Invoices)", report.summary.grossReceipts.toFixed(2)],
    ["Other Income", report.summary.otherIncomeTotal.toFixed(2)],
    ["Total Revenue", report.summary.totalRevenue.toFixed(2)],
    ["Total Expenses", (-report.summary.totalExpenses).toFixed(2)],
    ["Mileage Deduction", (-report.summary.mileageDeduction).toFixed(2)],
    ["Depreciation Deduction", (-report.summary.totalDepreciation).toFixed(2)],
    ["Net Profit", report.summary.netProfit.toFixed(2)],
  ], `${year} Profit & Loss Summary — ${report.companyName}`));

  const expenseDetailRows: string[][] = [["Schedule C Line", "Date", "Description", "Vendor", "Amount"]];
  for (const cat of report.expensesBySchedC) {
    expenseDetailRows.push([cat.schedCLine, "", "", "", ""]);
    for (const item of cat.items) {
      expenseDetailRows.push(["", item.date, item.description, item.vendor ?? "", item.amount.toFixed(2)]);
    }
    expenseDetailRows.push(["  Category Total", "", "", "", cat.amount.toFixed(2)]);
  }
  expenseDetailRows.push(["TOTAL", "", "", "", report.totalExpenses.toFixed(2)]);
  zip.file(`${year}_Expenses_ScheduleC.csv`, buildCSVBlob(expenseDetailRows, `${year} Expenses by Schedule C Category — ${report.companyName}`));

  zip.file(`${year}_Paid_Invoices.csv`, buildCSVBlob([
    ["Invoice #", "Issue Date", "Payment Date", "Client", "City", "State", "Total"],
    ...report.invoices.map(i => [i.invoiceNumber ?? "", i.issueDate, i.paymentDate, i.clientName, i.city, i.state, i.total.toFixed(2)]),
  ], `${year} Paid Invoices — ${report.companyName}`));

  zip.file(`${year}_Mileage.csv`, buildCSVBlob([
    ["Field", "Value"],
    ["Total Business Miles", report.mileage.totalMiles.toFixed(1)],
    ["IRS Rate ($/mile)", report.mileage.mileageRate.toFixed(3)],
    ["Total Deduction", report.mileage.deduction.toFixed(2)],
    ["# Trips Logged", String(report.mileage.trips)],
  ], `${year} Mileage Deduction — ${report.companyName}`));

  const deprRows: string[][] = [
    ["Asset", "Type", "Purchase Date", "Cost", "Method", "Life (yrs)", "Year", "Bus. Use %", "Annual Deduction", "Accum. Depreciation", "Book Value"],
  ];
  for (const r of report.depreciation.rows) {
    for (const s of r.schedule) {
      deprRows.push([
        r.name, r.assetType, r.purchaseDate, r.purchasePrice.toFixed(2),
        r.depreciationMethod, String(r.usefulLifeYears), String(s.year),
        `${s.businessUsePct}%`, s.annualDeduction.toFixed(2),
        s.accumulated.toFixed(2), s.bookValue.toFixed(2),
      ]);
    }
    deprRows.push([r.name + " — subtotal", "", "", "", "", "", String(year), `${r.businessUsePct}%`, r.annualDeduction.toFixed(2), "", ""]);
  }
  deprRows.push([`${report.year} TOTAL DEDUCTION`, "", "", "", "", "", "", "", report.depreciation.total.toFixed(2), "", ""]);
  deprRows.push(["TOTAL ACCUMULATED (all active assets)", "", "", "", "", "", "", "", "", report.depreciation.totalAccumulated.toFixed(2), ""]);
  zip.file(`${year}_Asset_Depreciation.csv`, buildCSVBlob(deprRows, `${year} Asset Depreciation — ${report.companyName}`));

  if (report.disposedAssets.length > 0) {
    zip.file(`${year}_Disposed_Assets.csv`, buildCSVBlob([
      ["Asset", "Type", "Purchase Date", "Cost", "Sale Date", "Sale Price", "Book Value", "Gain / Loss"],
      ...report.disposedAssets.map(a => [a.name, a.assetType, a.purchaseDate, a.purchasePrice.toFixed(2), a.saleDate ?? "", a.salePrice.toFixed(2), a.bookValue.toFixed(2), a.gainLoss.toFixed(2)]),
    ], `${year} Disposed Assets — ${report.companyName}`));
  }

  zip.file(`${year}_1099_Subcontractors.csv`, buildCSVBlob([
    ["Name", "Total Paid", "Requires 1099", "W-9 on File", "Legal Name"],
    ...report.sub1099s.map(s => [s.name, s.ytdPayments.toFixed(2), s.requires1099 ? "YES" : "NO", s.w9OnFile ? "Yes" : "No", s.w9LegalName ?? ""]),
  ], `${year} 1099 Subcontractor Payments — ${report.companyName}`));

  zip.file(`${year}_Estimated_Tax_Payments.csv`, buildCSVBlob([
    ["Quarter", "Level", "Amount Paid", "Date Paid", "Method", "Notes"],
    ...report.estimatedTaxPayments.map(p => [`Q${p.quarter}`, p.level, p.amountPaid.toFixed(2), p.paidDate ?? "", p.paymentMethod ?? "", p.notes ?? ""]),
    ["TOTAL", "", report.taxEstimates.totalPaid.toFixed(2), "", "", ""],
  ], `${year} Estimated Tax Payments — ${report.companyName}`));

  if (report.otherIncome.length > 0) {
    zip.file(`${year}_Other_Income.csv`, buildCSVBlob([
      ["Date", "Description", "Source", "Amount", "Payment Method"],
      ...report.otherIncome.map(o => [o.date, o.description, o.source ?? "", o.amount.toFixed(2), o.paymentMethod ?? ""]),
    ], `${year} Other Income — ${report.companyName}`));
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${year}_Year_End_Report_${report.companyName.replace(/[^a-z0-9]/gi, "_")}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

function printYearEndReport(report: YearEndReport) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const fmtN = (n: number) => n.toLocaleString("en-US");
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const row = (label: string, value: string, bold = false, indent = false) =>
    `<tr class="${bold ? "bold" : ""} ${indent ? "indent" : ""}"><td>${indent ? "&nbsp;&nbsp;&nbsp;" : ""}${esc(label)}</td><td class="num">${value}</td></tr>`;

  const schedCRows = report.expensesBySchedC.map(e => {
    const header = `<tr class="schedC-cat"><td colspan="2" style="font-weight:600;background:#f8fafc;padding:5px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#475569">${esc(e.schedCLine)}</td></tr>`;
    const itemRows = e.items.map(item =>
      `<tr><td style="padding-left:24px;color:#64748b">${esc(item.date)} &mdash; ${esc(item.description)}${item.vendor ? ` (${esc(item.vendor)})` : ""}</td><td class="num" style="color:#64748b">${fmt(item.amount)}</td></tr>`
    ).join("");
    const subtotal = `<tr><td style="padding-left:24px;font-weight:600;padding-bottom:6px">Category Total</td><td class="num" style="font-weight:600;padding-bottom:6px">${fmt(e.amount)}</td></tr>`;
    return header + itemRows + subtotal;
  }).join("");

  const deprRows = report.depreciation.rows.map(r => {
    const scheduleRows = r.schedule.map((s, si) =>
      `<tr style="${s.year === report.year ? "background:#fff7ed" : ""}">
        ${si === 0 ? `<td rowspan="${r.schedule.length}" style="vertical-align:top;font-weight:600">${esc(r.name)}</td><td rowspan="${r.schedule.length}" style="vertical-align:top;color:#64748b">${esc(r.assetType)}</td><td rowspan="${r.schedule.length}" style="vertical-align:top;color:#64748b">${esc(r.purchaseDate)}</td><td rowspan="${r.schedule.length}" class="num" style="vertical-align:top">${fmt(r.purchasePrice)}</td><td rowspan="${r.schedule.length}" style="vertical-align:top;color:#64748b">${esc(r.depreciationMethod)}</td>` : ""}
        <td class="num" style="${s.year === report.year ? "font-weight:700;color:#ea580c" : "color:#64748b"}">${s.year}</td>
        <td class="num" style="color:#64748b">${s.businessUsePct}%</td>
        <td class="num" style="${s.year === report.year ? "font-weight:700;color:#ea580c" : "color:#64748b"}">${fmt(s.annualDeduction)}</td>
        <td class="num" style="color:#64748b">${fmt(s.accumulated)}</td>
        <td class="num" style="color:#64748b">${fmt(s.bookValue)}</td>
      </tr>`
    ).join("");
    return scheduleRows;
  }).join("");

  const disposedRows = report.disposedAssets.map(a =>
    `<tr><td>${esc(a.name)}</td><td>${esc(a.purchaseDate)}</td><td>${esc(a.saleDate ?? "")}</td><td class="num">${fmt(a.purchasePrice)}</td><td class="num">${fmt(a.salePrice)}</td><td class="num">${fmt(a.bookValue)}</td><td class="num ${a.gainLoss >= 0 ? "pos" : "neg"}">${fmt(a.gainLoss)}</td></tr>`
  ).join("");

  const sub1099Rows = report.sub1099s.map(s =>
    `<tr><td>${esc(s.name)}</td><td>${esc(s.w9LegalName ?? "—")}</td><td class="num">${fmt(s.ytdPayments)}</td><td>${s.requires1099 ? '<span class="badge-red">1099 Required</span>' : "Below threshold"}</td><td>${s.w9OnFile ? '<span class="badge-green">Yes</span>' : '<span class="badge-red">No</span>'}</td></tr>`
  ).join("");

  const taxPayRows = report.estimatedTaxPayments.map(p =>
    `<tr><td>Q${p.quarter}</td><td>${esc(p.level)}</td><td class="num">${fmt(p.amountPaid)}</td><td>${esc(p.paidDate ?? "—")}</td><td>${esc(p.paymentMethod ?? "")}</td></tr>`
  ).join("");

  const otherIncomeRows = report.otherIncome.map(o =>
    `<tr><td>${esc(o.date)}</td><td>${esc(o.description)}</td><td>${esc(o.source ?? "")}</td><td class="num">${fmt(o.amount)}</td><td>${esc(o.paymentMethod ?? "")}</td></tr>`
  ).join("");

  const isLoss = report.summary.netProfit < 0;
  const netColor = isLoss ? "#dc2626" : "#16a34a";

  win.document.write(`<!DOCTYPE html><html><head><title>${esc(report.companyName)} — ${report.year} Year-End Report</title>
<style>
*{box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;padding:40px;max-width:820px;margin:0 auto;line-height:1.5}
h1{font-size:18px;margin:0 0 2px}
.subtitle{color:#64748b;font-size:11px;margin-bottom:24px}
h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#475569;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin:24px 0 8px}
table{width:100%;border-collapse:collapse;margin-bottom:4px}
th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;padding:4px 8px;border-bottom:2px solid #e2e8f0}
td{padding:4px 8px;border-bottom:1px solid #f1f5f9}
td.num{text-align:right;font-variant-numeric:tabular-nums}
tr.bold td{font-weight:700;background:#f8fafc}
tr.indent td:first-child{padding-left:20px;color:#475569}
.pos{color:#16a34a}
.neg{color:#dc2626}
.net-profit{text-align:center;margin:16px 0;padding:16px;border-radius:8px;background:${isLoss ? "#fef2f2" : "#f0fdf4"};border:2px solid ${isLoss ? "#fca5a5" : "#86efac"}}
.net-profit .label{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:${isLoss ? "#991b1b" : "#166534"}}
.net-profit .value{font-size:26px;font-weight:800;color:${netColor}}
.badge-red{background:#fee2e2;color:#dc2626;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600}
.badge-green{background:#dcfce7;color:#16a34a;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600}
.top-bar{position:fixed;top:12px;right:16px;display:flex;gap:8px;z-index:9999}
.top-bar button{background:rgba(0,0,0,.78);color:#fff;border:none;padding:6px 14px;border-radius:16px;font-size:12px;font-weight:600;cursor:pointer}
.footer{margin-top:32px;padding-top:8px;border-top:1px solid #e5e7eb;text-align:center;color:#94a3b8;font-size:10px}
.page-break{page-break-before:always}
@media print{.top-bar{display:none}}
</style></head>
<body>
<div class="top-bar">
  <button onclick="window.close()">&#8592; Close</button>
  <button onclick="window.print()">&#128438; Print / PDF</button>
</div>

<h1>${esc(report.companyName)}</h1>
<div class="subtitle">Year-End Accountant Report &bull; Tax Year ${report.year} &bull; Cash Basis &bull; Generated ${new Date(report.generatedAt).toLocaleDateString("en-US")}</div>

<h2>Profit &amp; Loss Summary</h2>
<table>
<tr><th>Category</th><th class="num">Amount</th></tr>
${row("Gross Receipts (Paid Invoices)", fmt(report.summary.grossReceipts), false, true)}
${report.summary.otherIncomeTotal > 0 ? row("Other Income", fmt(report.summary.otherIncomeTotal), false, true) : ""}
${row("Total Revenue", fmt(report.summary.totalRevenue), true)}
${row("Total Expenses", fmt(-report.summary.totalExpenses), false, true)}
${row(`Mileage Deduction (${report.summary.totalMiles.toFixed(0)} mi @ $${report.summary.mileageRate}/mi)`, fmt(-report.summary.mileageDeduction), false, true)}
${report.summary.totalDepreciation > 0 ? row("Asset Depreciation", fmt(-report.summary.totalDepreciation), false, true) : ""}
</table>
<div class="net-profit"><div class="label">${isLoss ? "Net Loss" : "Net Profit"}</div><div class="value">${fmt(Math.abs(report.summary.netProfit))}</div></div>

<h2>Expense Detail by Schedule C Line</h2>
<table>
<tr><th>Date / Description</th><th class="num">Amount</th></tr>
${schedCRows}
${row("Total Expenses", fmt(report.totalExpenses), true)}
</table>

${report.depreciation.rows.length > 0 ? `
<h2 class="page-break">Asset Depreciation — ${report.year} (Full Life-to-Date Schedule)</h2>
<p style="font-size:10px;color:#64748b;margin:-4px 0 8px">All years from purchase through end of useful life. Row highlighted in orange = ${report.year} (selected tax year).</p>
<table>
<tr><th>Asset</th><th>Type</th><th>Purchase Date</th><th class="num">Cost</th><th>Method</th><th class="num">Year</th><th class="num">Bus. Use %</th><th class="num">Annual Deduction</th><th class="num">Accum. Depr.</th><th class="num">Book Value</th></tr>
${deprRows}
<tr class="bold"><td colspan="7">${report.year} Total Deduction</td><td class="num">${fmt(report.depreciation.total)}</td><td></td><td></td></tr>
<tr class="bold"><td colspan="8">Total Accumulated Depreciation (all active assets)</td><td class="num">${fmt(report.depreciation.totalAccumulated)}</td><td></td></tr>
</table>` : ""}

${report.disposedAssets.length > 0 ? `
<h2>Disposed Assets — ${report.year}</h2>
<table>
<tr><th>Asset</th><th>Purchased</th><th>Sold/Retired</th><th class="num">Cost</th><th class="num">Sale Price</th><th class="num">Book Value</th><th class="num">Gain / Loss</th></tr>
${disposedRows}
</table>` : ""}

<h2>Mileage Deduction</h2>
<table>
<tr><th>Field</th><th class="num">Value</th></tr>
${row("Business Miles Logged", `${fmtN(Math.round(report.mileage.totalMiles))} miles`)}
${row(`IRS Rate (${report.year})`, `$${report.mileage.mileageRate.toFixed(3)}/mile`)}
${row("Total Mileage Deduction", fmt(report.mileage.deduction), true)}
${row("# Trips Recorded", fmtN(report.mileage.trips))}
</table>

${report.sub1099s.length > 0 ? `
<h2>1099 Subcontractor Payments</h2>
<table>
<tr><th>Name</th><th>Legal Name (W-9)</th><th class="num">Total Paid</th><th>1099 Status</th><th>W-9 on File</th></tr>
${sub1099Rows}
</table>` : ""}

${report.estimatedTaxPayments.length > 0 ? `
<h2>Estimated Tax Payments Made</h2>
<table>
<tr><th>Quarter</th><th>Level</th><th class="num">Amount Paid</th><th>Date</th><th>Method</th></tr>
${taxPayRows}
${row("Total Paid", fmt(report.taxEstimates.totalPaid), true)}
</table>` : ""}

<h2>Estimated Tax Liability (CPA Reference)</h2>
<table>
<tr><th>Component</th><th class="num">Amount</th></tr>
${row("Self-Employment Tax (15.3% × 92.35% of net profit)", fmt(report.taxEstimates.selfEmploymentTax), false, true)}
${row(`Federal Income Tax (${report.year} progressive brackets)`, fmt(report.taxEstimates.federalIncomeTax), false, true)}
${row("Kentucky State Income Tax (4%)", fmt(report.taxEstimates.kyStateTax), false, true)}
${report.taxEstimates.owensboroOccTax && report.taxEstimates.owensboroOccTax > 0 ? row("Owensboro Occupational Tax (1.39%)", fmt(report.taxEstimates.owensboroOccTax), false, true) : ""}
${row("Total Estimated Tax Liability", fmt(report.taxEstimates.totalLiability), true)}
${row("Estimated Tax Already Paid", fmt(-report.taxEstimates.totalPaid), false, true)}
${row("Remaining Balance", fmt(report.taxEstimates.balance), true)}
</table>

${report.otherIncome.length > 0 ? `
<h2>Other Income</h2>
<table>
<tr><th>Date</th><th>Description</th><th>Source</th><th class="num">Amount</th><th>Method</th></tr>
${otherIncomeRows}
</table>` : ""}

${report.ownerActivity && (report.ownerActivity.ownerAllocated > 0 || report.ownerActivity.ownerDrawTotal > 0 || report.ownerActivity.ownerContributionsTotal > 0) ? `
<h2>Owner Pay Waterfall (Informational)</h2>
<p style="font-size:10px;color:#64748b;margin:-4px 0 8px">Does not affect net profit. Based on cash-basis paid revenue for ${report.year}.</p>
<table>
<tr><th>Component</th><th class="num">Amount</th></tr>
${row("Owner Allocated (50% of net after 5% growth fund)", fmt(report.ownerActivity.ownerAllocated), false, true)}
${row("− Tax Reserve (25% of allocation)", fmt(-report.ownerActivity.ownerTaxReserve), false, true)}
${row("= Take-Home Budget", fmt(report.ownerActivity.ownerAllocated - report.ownerActivity.ownerTaxReserve), true)}
${row("− Cash Taken (Owner Draws)", fmt(-report.ownerActivity.ownerCashTaken), false, true)}
${report.ownerActivity.ownerOverWithdrawal > 0
  ? `<tr><td style="font-weight:700;color:#dc2626;padding:7px 8px;background:#fef2f2">⚠ Over-Withdrawal</td><td class="num" style="font-weight:700;color:#dc2626;background:#fef2f2">−${fmt(report.ownerActivity.ownerOverWithdrawal)}</td></tr>`
  : `<tr><td style="font-weight:700;color:#16a34a;padding:7px 8px;background:#f0fdf4">= Retained / Undrawn</td><td class="num" style="font-weight:700;color:#16a34a;background:#f0fdf4">${fmt(report.ownerActivity.ownerRetained)}</td></tr>`}
${report.ownerActivity.ownerContributionsTotal > 0 ? row("Owner Contributions (capital)", fmt(report.ownerActivity.ownerContributionsTotal), false, true) : ""}
</table>` : ""}

<div class="footer">${esc(report.companyName)} &bull; Tax Year ${report.year} &bull; Cash-Basis Accounting &bull; Prepared by BuildPro &bull; For CPA Use</div>
</body></html>`);
  win.document.close();
}

interface TripStat {
  id: number;
  destination: string;
  businessPurpose: string | null;
  startDate: string | null;
  endDate: string | null;
  jobTitle: string | null;
  status: string;
  totalAmount: number;
  receiptCount: number;
  missingReceipts: number;
  mealTotal: number;
  deductibleMeals: number;
}

function BusinessTripSummarySection({ year }: { year: number }) {
  const [expanded, setExpanded] = useState(false);
  const [dateFrom, setDateFrom] = useState(`${year}-01-01`);
  const [dateTo, setDateTo] = useState(`${year}-12-31`);

  const { data: trips = [], isLoading } = useQuery<TripStat[]>({
    queryKey: ["biz-trips-report", year, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ year: String(year) });
      const res = await fetch(`${BASE}/api/trips?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load trips");
      const all: TripStat[] = await res.json();
      // Client-side date-range filter
      return all.filter(t => {
        const d = t.startDate ?? t.endDate;
        if (!d) return true;
        return d >= dateFrom && d <= dateTo;
      });
    },
    staleTime: 60_000,
  });

  const activeTrips = trips.filter(t => t.status !== "archived");
  const totalTravelSpend = activeTrips.reduce((s, t) => s + t.totalAmount, 0);
  const totalTravelReceipts = activeTrips.reduce((s, t) => s + t.receiptCount, 0);
  const totalDeductibleMeals = activeTrips.reduce((s, t) => s + t.deductibleMeals, 0);
  const needsAttention = activeTrips.filter(t => t.missingReceipts > 0 || !t.businessPurpose || !t.startDate || !t.endDate);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left"
      >
        <Briefcase className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm text-foreground flex-1">Business Trip Summary</h3>
        <span className="text-xs text-muted-foreground mr-2">{activeTrips.length} trips · {fmtMoney(totalTravelSpend)}</span>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Date range filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs font-medium text-muted-foreground">Date range:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-xs border border-border rounded-lg px-2 py-1 bg-background"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-xs border border-border rounded-lg px-2 py-1 bg-background"
            />
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground animate-pulse">Loading trips…</p>
          ) : activeTrips.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No business trips in this date range.</p>
          ) : (
            <>
              {/* Summary metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total Trips", value: String(activeTrips.length) },
                  { label: "Total Travel Spend", value: fmtMoney(totalTravelSpend) },
                  { label: "Total Travel Receipts", value: String(totalTravelReceipts) },
                  { label: "Deductible Meals (50%)", value: fmtMoney(totalDeductibleMeals) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-muted/30 rounded-xl px-3 py-2 text-center">
                    <p className="text-base font-bold text-foreground tabular-nums">{value}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Needs attention */}
              {needsAttention.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-amber-700 mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> {needsAttention.length} trip{needsAttention.length > 1 ? "s" : ""} need{needsAttention.length === 1 ? "s" : ""} attention
                  </p>
                  <ul className="space-y-0.5">
                    {needsAttention.map(t => (
                      <li key={t.id} className="text-xs text-amber-700">
                        {t.destination}
                        {t.missingReceipts > 0 && ` — ${t.missingReceipts} unproven receipt${t.missingReceipts > 1 ? "s" : ""}`}
                        {!t.businessPurpose && " — no business purpose"}
                        {(!t.startDate || !t.endDate) && " — missing dates"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Trip list */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/20 text-[11px] text-muted-foreground uppercase tracking-wide">
                      <th className="text-left px-3 py-2">Destination</th>
                      <th className="text-left px-3 py-2">Dates</th>
                      <th className="text-left px-3 py-2">Purpose</th>
                      <th className="text-right px-3 py-2">Receipts</th>
                      <th className="text-right px-3 py-2">Total Spend</th>
                      <th className="text-right px-3 py-2">Deductible Meals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTrips.map(t => (
                      <tr key={t.id} className="border-t border-border/40 hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">{t.destination}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {[t.startDate, t.endDate].filter(Boolean).join(" → ") || "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[160px] truncate">{t.businessPurpose ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {t.receiptCount}
                          {t.missingReceipts > 0 && <span className="text-amber-600 ml-1">⚠</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(t.totalAmount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{t.deductibleMeals > 0 ? fmtMoney(t.deductibleMeals) : "—"}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border font-semibold bg-muted/20">
                      <td colSpan={3} className="px-3 py-2">Totals</td>
                      <td className="px-3 py-2 text-right tabular-nums">{totalTravelReceipts}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totalTravelSpend)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{fmtMoney(totalDeductibleMeals)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const ALL_YEAR_END_SECTIONS = ["pl", "expenses", "depreciation", "disposed", "mileage", "1099s", "tax-payments", "tax-liability", "other-income"] as const;
type YearEndSection = typeof ALL_YEAR_END_SECTIONS[number];

export default function YearEndReportTab({ year }: { year: number }) {
  const { activeBusiness } = useBusiness();
  const { data: report, isLoading, error, refetch } = useYearEndReport(year, activeBusiness?.slug);
  const [isDownloading, setIsDownloading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<YearEndSection>>(new Set(ALL_YEAR_END_SECTIONS));
  const [showFullDeprecSchedule, setShowFullDeprecSchedule] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<number | null>(null);
  const [editPct, setEditPct] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const { toast } = useToast();

  function startEditAsset(assetId: number, currentPct: number) {
    setEditingAssetId(assetId);
    setEditPct(String(currentPct));
    setEditError(null);
  }

  function cancelEditAsset() {
    setEditingAssetId(null);
    setEditPct("");
    setEditError(null);
  }

  async function saveAssetBusinessUse(assetId: number) {
    const pct = parseInt(editPct, 10);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setEditError("Enter a value between 0 and 100");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`${BASE}/api/assets/${assetId}/business-use`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, businessUsePct: pct }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      setEditingAssetId(null);
      setEditPct("");
      await refetch();
      toast({ title: "Business use % updated", description: `${year} deduction recalculated.` });
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setEditSaving(false);
    }
  }

  const toggleSection = (key: YearEndSection) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  async function handleDownload() {
    if (!report) return;
    setIsDownloading(true);
    try {
      await downloadYearEndZip(report);
    } finally {
      setIsDownloading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <RefreshCw className="w-8 h-8 animate-spin opacity-40" />
        <p className="text-sm">Compiling {year} year-end report…</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <AlertCircle className="w-8 h-8 text-destructive opacity-60" />
        <p className="text-sm text-destructive">Failed to load year-end report.</p>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">Retry</button>
      </div>
    );
  }

  const isLoss = report.summary.netProfit < 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Header + Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-muted/40 rounded-xl border border-border">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            {year} Year-End Accountant Report
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Complete financial summary for your CPA — cash basis, tax year {year}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => printYearEndReport(report)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted/60 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print / PDF
          </button>
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isDownloading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isDownloading ? "Preparing…" : "Download CSV Package"}
          </button>
        </div>
      </div>

      {/* P&L Summary */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button onClick={() => toggleSection("pl")} className="w-full px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground flex-1">Profit &amp; Loss Summary</h3>
          {expandedSections.has("pl") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {expandedSections.has("pl") && <div className="p-4 space-y-1">
          <div className="flex justify-between items-center py-1.5 border-b border-border/50">
            <span className="text-sm text-muted-foreground pl-4">Gross Receipts (Paid Invoices)</span>
            <span className="text-sm font-medium tabular-nums">{fmtMoney(report.summary.grossReceipts)}</span>
          </div>
          {report.summary.otherIncomeTotal > 0 && (
            <div className="flex justify-between items-center py-1.5 border-b border-border/50">
              <span className="text-sm text-muted-foreground pl-4">Other Income</span>
              <span className="text-sm font-medium tabular-nums">{fmtMoney(report.summary.otherIncomeTotal)}</span>
            </div>
          )}
          <div className="flex justify-between items-center py-1.5 border-b border-border font-semibold">
            <span className="text-sm">Total Revenue</span>
            <span className="text-sm tabular-nums">{fmtMoney(report.summary.totalRevenue)}</span>
          </div>
          <div className="flex justify-between items-center py-1.5 border-b border-border/50">
            <span className="text-sm text-muted-foreground pl-4">Total Expenses</span>
            <span className="text-sm tabular-nums text-red-600 font-medium">({fmtMoney(report.summary.totalExpenses)})</span>
          </div>
          <div className="flex justify-between items-center py-1.5 border-b border-border/50">
            <span className="text-sm text-muted-foreground pl-4">
              Mileage Deduction ({report.summary.totalMiles.toFixed(0)} mi @ ${report.summary.mileageRate}/mi)
            </span>
            <span className="text-sm tabular-nums text-red-600 font-medium">({fmtMoney(report.summary.mileageDeduction)})</span>
          </div>
          {report.summary.totalDepreciation > 0 && (
            <div className="flex justify-between items-center py-1.5 border-b border-border/50">
              <span className="text-sm text-muted-foreground pl-4">Asset Depreciation</span>
              <span className="text-sm tabular-nums text-red-600 font-medium">({fmtMoney(report.summary.totalDepreciation)})</span>
            </div>
          )}
          <div className={`flex justify-between items-center py-3 px-4 mt-2 rounded-lg font-bold text-sm ${isLoss ? "bg-red-50 border border-red-200 text-red-700" : "bg-emerald-50 border border-emerald-200 text-emerald-700"}`}>
            <span>{isLoss ? "Net Loss" : "Net Profit"}</span>
            <span className="tabular-nums text-base">{fmtMoney(Math.abs(report.summary.netProfit))}</span>
          </div>
        </div>}
      </div>

      {/* Expense Detail */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button onClick={() => toggleSection("expenses")} className="w-full px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left">
          <TrendingDown className="w-4 h-4 text-red-500" />
          <h3 className="font-semibold text-sm text-foreground flex-1">Expense Detail by Schedule C Line</h3>
          {expandedSections.has("expenses") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {expandedSections.has("expenses") && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/20 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-2">Description</th>
                  <th className="text-right px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.expensesBySchedC.map((e, i) => (
                  <React.Fragment key={i}>
                    <tr className="bg-muted/30 border-t-2 border-border">
                      <td className="px-4 py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground" colSpan={2}>{e.schedCLine}</td>
                    </tr>
                    {e.items.map((item, j) => (
                      <tr key={j} className="border-t border-border/30 hover:bg-muted/10">
                        <td className="px-4 py-1.5 pl-8 text-muted-foreground">
                          <span className="text-foreground/70 mr-2">{item.date}</span>
                          {item.description}
                          {item.vendor && <span className="text-muted-foreground/60 ml-1">({item.vendor})</span>}
                        </td>
                        <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{fmtMoney(item.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-border/60 bg-muted/5">
                      <td className="px-4 py-1.5 pl-8 font-medium text-xs">Category Total ({e.count} item{e.count !== 1 ? "s" : ""})</td>
                      <td className="px-4 py-1.5 text-right tabular-nums font-semibold">{fmtMoney(e.amount)}</td>
                    </tr>
                  </React.Fragment>
                ))}
                <tr className="border-t-2 border-border font-semibold bg-muted/20">
                  <td className="px-4 py-2">Total Expenses</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(report.totalExpenses)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Asset Depreciation */}
      {report.depreciation.rows.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button onClick={() => toggleSection("depreciation")} className="w-full px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left">
            <TrendingDown className="w-4 h-4 text-orange-500" />
            <h3 className="font-semibold text-sm text-foreground flex-1">Asset Depreciation — {year}</h3>
            {expandedSections.has("depreciation") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {expandedSections.has("depreciation") && (
            <>
              <div className="px-4 py-2 border-b border-border/40 bg-muted/10 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Showing {showFullDeprecSchedule ? "full life-to-date schedule" : `${year} deductions only`}</span>
                <button
                  onClick={() => setShowFullDeprecSchedule(v => !v)}
                  className="text-xs px-3 py-1 rounded-md border border-border bg-background hover:bg-muted/60 font-medium transition-colors"
                >
                  {showFullDeprecSchedule ? "Show selected year only" : "Show full schedule (all years)"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/20 text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="text-left px-4 py-2">Asset</th>
                      <th className="text-left px-4 py-2">Type</th>
                      <th className="text-left px-4 py-2">Purchase Date</th>
                      <th className="text-right px-4 py-2">Cost</th>
                      <th className="text-left px-4 py-2">Method</th>
                      {showFullDeprecSchedule ? (
                        <>
                          <th className="text-right px-4 py-2">Year</th>
                          <th className="text-right px-4 py-2">Bus. Use %</th>
                          <th className="text-right px-4 py-2">Annual Deduction</th>
                          <th className="text-right px-4 py-2">Accum. Depr.</th>
                          <th className="text-right px-4 py-2">Book Value</th>
                        </>
                      ) : (
                        <>
                          <th className="text-right px-4 py-2">Bus. Use %</th>
                          <th className="text-right px-4 py-2">{year} Deduction</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {showFullDeprecSchedule ? (
                      report.depreciation.rows.map(r => (
                        <React.Fragment key={r.id}>
                          {r.schedule.map((s, si) => (
                            <tr key={s.year} className={`border-t ${si === 0 ? "border-border/60 bg-muted/10" : "border-border/20"} hover:bg-muted/20 ${s.year === year ? "bg-orange-50/60 dark:bg-orange-950/10" : ""}`}>
                              {si === 0 && (
                                <>
                                  <td className="px-4 py-2 font-medium" rowSpan={r.schedule.length}>{r.name}</td>
                                  <td className="px-4 py-2 text-muted-foreground" rowSpan={r.schedule.length}>{r.assetType}</td>
                                  <td className="px-4 py-2 text-muted-foreground" rowSpan={r.schedule.length}>{r.purchaseDate}</td>
                                  <td className="px-4 py-2 text-right tabular-nums" rowSpan={r.schedule.length}>{fmtMoney(r.purchasePrice)}</td>
                                  <td className="px-4 py-2 text-muted-foreground capitalize" rowSpan={r.schedule.length}>{r.depreciationMethod}</td>
                                </>
                              )}
                              <td className={`px-4 py-1.5 text-right tabular-nums font-medium ${s.year === year ? "text-orange-600" : "text-foreground"}`}>{s.year}</td>
                              <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                                {s.businessUsePct < 100
                                  ? <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">{s.businessUsePct}%</span>
                                  : <span className="text-xs">100%</span>}
                              </td>
                              <td className={`px-4 py-1.5 text-right tabular-nums ${s.year === year ? "font-semibold text-orange-600" : "text-muted-foreground"}`}>{fmtMoney(s.annualDeduction)}</td>
                              <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{fmtMoney(s.accumulated)}</td>
                              <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{fmtMoney(s.bookValue)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))
                    ) : (
                      report.depreciation.rows.map(r => (
                        <tr key={r.id} className="border-t border-border/40 hover:bg-muted/20">
                          <td className="px-4 py-2 font-medium">{r.name}</td>
                          <td className="px-4 py-2 text-muted-foreground">{r.assetType}</td>
                          <td className="px-4 py-2 text-muted-foreground">{r.purchaseDate}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(r.purchasePrice)}</td>
                          <td className="px-4 py-2 text-muted-foreground capitalize">{r.depreciationMethod}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {editingAssetId === r.id ? (
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={editPct}
                                    onChange={e => setEditPct(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") saveAssetBusinessUse(r.id);
                                      if (e.key === "Escape") cancelEditAsset();
                                    }}
                                    disabled={editSaving}
                                    autoFocus
                                    className="w-16 text-right text-xs border border-border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                  />
                                  <span className="text-xs text-muted-foreground">%</span>
                                  <button
                                    onClick={() => saveAssetBusinessUse(r.id)}
                                    disabled={editSaving}
                                    className="p-0.5 rounded text-green-600 hover:bg-green-50 disabled:opacity-40"
                                    title="Save"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={cancelEditAsset}
                                    disabled={editSaving}
                                    className="p-0.5 rounded text-muted-foreground hover:bg-muted/60 disabled:opacity-40"
                                    title="Cancel"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                {editError && <span className="text-xs text-destructive">{editError}</span>}
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1 group">
                                {r.businessUsePct < 100
                                  ? <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">{r.businessUsePct}%</span>
                                  : <span className="text-muted-foreground text-xs">100%</span>}
                                <button
                                  onClick={() => startEditAsset(r.id, r.businessUsePct)}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-opacity"
                                  title={`Edit ${year} business use % for ${r.name}`}
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium text-orange-600">{fmtMoney(r.annualDeduction)}</td>
                        </tr>
                      ))
                    )}
                    <tr className="border-t-2 border-border font-semibold bg-muted/20">
                      {showFullDeprecSchedule ? (
                        <>
                          <td colSpan={7} className="px-4 py-2">{year} Total Deduction</td>
                          <td className="px-4 py-2 text-right tabular-nums text-orange-600">{fmtMoney(report.depreciation.total)}</td>
                          <td /><td />
                        </>
                      ) : (
                        <>
                          <td colSpan={6} className="px-4 py-2">{year} Total Deduction</td>
                          <td className="px-4 py-2 text-right tabular-nums text-orange-600">{fmtMoney(report.depreciation.total)}</td>
                        </>
                      )}
                    </tr>
                    <tr className="font-semibold bg-orange-50 dark:bg-orange-950/20 border-t border-orange-200">
                      {showFullDeprecSchedule ? (
                        <>
                          <td colSpan={8} className="px-4 py-2 text-orange-700">Total Accumulated Depreciation (all active assets)</td>
                          <td className="px-4 py-2 text-right tabular-nums text-orange-700">{fmtMoney(report.depreciation.totalAccumulated)}</td>
                          <td />
                        </>
                      ) : (
                        <>
                          <td colSpan={6} className="px-4 py-2 text-orange-700">Total Accumulated Depreciation (all active assets)</td>
                          <td className="px-4 py-2 text-right tabular-nums text-orange-700">{fmtMoney(report.depreciation.totalAccumulated)}</td>
                        </>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Disposed Assets */}
      {report.disposedAssets.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button onClick={() => toggleSection("disposed")} className="w-full px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left">
            <DollarSign className="w-4 h-4 text-blue-500" />
            <h3 className="font-semibold text-sm text-foreground flex-1">Disposed Assets — {year}</h3>
            <span className="text-xs text-muted-foreground">Gain/loss for CPA review</span>
            {expandedSections.has("disposed") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {expandedSections.has("disposed") && <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/20 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-2">Asset</th>
                  <th className="text-left px-4 py-2">Purchased</th>
                  <th className="text-left px-4 py-2">Sold / Retired</th>
                  <th className="text-right px-4 py-2">Cost</th>
                  <th className="text-right px-4 py-2">Sale Price</th>
                  <th className="text-right px-4 py-2">Book Value</th>
                  <th className="text-right px-4 py-2">Gain / Loss</th>
                </tr>
              </thead>
              <tbody>
                {report.disposedAssets.map(a => (
                  <tr key={a.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">{a.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.purchaseDate}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.saleDate ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(a.purchasePrice)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(a.salePrice)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(a.bookValue)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-semibold ${a.gainLoss >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {a.gainLoss >= 0 ? "+" : ""}{fmtMoney(a.gainLoss)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {/* Mileage */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button onClick={() => toggleSection("mileage")} className="w-full px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left">
          <Navigation className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground flex-1">Mileage Deduction</h3>
          {expandedSections.has("mileage") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {expandedSections.has("mileage") && <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-border">
          {[
            { label: "Business Miles", value: `${report.mileage.totalMiles.toFixed(1)} mi` },
            { label: "IRS Rate", value: `$${report.mileage.mileageRate.toFixed(3)}/mi` },
            { label: "Total Deduction", value: fmtMoney(report.mileage.deduction) },
            { label: "Trips Logged", value: report.mileage.trips.toLocaleString() },
          ].map(({ label, value }) => (
            <div key={label} className="px-4 py-3 space-y-0.5">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-base font-semibold tabular-nums">{value}</div>
            </div>
          ))}
        </div>}
      </div>

      {/* 1099 Subcontractors */}
      {report.sub1099s.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button onClick={() => toggleSection("1099s")} className="w-full px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left">
            <HardHat className="w-4 h-4 text-orange-500" />
            <h3 className="font-semibold text-sm text-foreground flex-1">1099 Subcontractor Payments</h3>
            {expandedSections.has("1099s") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {expandedSections.has("1099s") && <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/20 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">Legal Name (W-9)</th>
                  <th className="text-right px-4 py-2">Total Paid</th>
                  <th className="text-left px-4 py-2">1099 Status</th>
                  <th className="text-left px-4 py-2">W-9 on File</th>
                </tr>
              </thead>
              <tbody>
                {report.sub1099s.map(s => (
                  <tr key={s.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{s.w9LegalName ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtMoney(s.ytdPayments)}</td>
                    <td className="px-4 py-2">
                      {s.requires1099 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                          <AlertTriangle className="w-3 h-3" /> 1099 Required
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Below threshold</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {s.w9OnFile ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                          <CheckCircle2 className="w-3 h-3" /> On File
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600 text-xs font-medium">
                          <AlertCircle className="w-3 h-3" /> Missing
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {/* Estimated Tax Payments */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button onClick={() => toggleSection("tax-payments")} className="w-full px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left">
          <CalendarClock className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground flex-1">Estimated Tax Payments</h3>
          {expandedSections.has("tax-payments") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {expandedSections.has("tax-payments") && (report.estimatedTaxPayments.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">No estimated tax payments recorded for {year}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/20 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-2">Quarter</th>
                  <th className="text-left px-4 py-2">Level</th>
                  <th className="text-right px-4 py-2">Amount Paid</th>
                  <th className="text-left px-4 py-2">Date Paid</th>
                  <th className="text-left px-4 py-2">Method</th>
                </tr>
              </thead>
              <tbody>
                {report.estimatedTaxPayments.map(p => (
                  <tr key={p.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">Q{p.quarter}</td>
                    <td className="px-4 py-2 capitalize text-muted-foreground">{p.level}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtMoney(p.amountPaid)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{p.paidDate ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground capitalize">{p.paymentMethod ?? "—"}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-semibold bg-muted/20">
                  <td colSpan={2} className="px-4 py-2">Total Paid</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(report.taxEstimates.totalPaid)}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Estimated Tax Liability */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button onClick={() => toggleSection("tax-liability")} className="w-full px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground flex-1">Estimated Tax Liability</h3>
          <span className="text-xs text-muted-foreground">Reference only — consult your CPA</span>
          {expandedSections.has("tax-liability") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {expandedSections.has("tax-liability") && <div className="p-4 space-y-1">
          {[
            { label: "Self-Employment Tax (15.3% × 92.35%)", value: report.taxEstimates.selfEmploymentTax },
            { label: `Federal Income Tax (${report.year} progressive brackets)`, value: report.taxEstimates.federalIncomeTax },
            { label: "Kentucky State Income Tax (4%)", value: report.taxEstimates.kyStateTax },
            ...(report.taxEstimates.owensboroOccTax && report.taxEstimates.owensboroOccTax > 0
              ? [{ label: "Owensboro Occupational Tax (1.39%)", value: report.taxEstimates.owensboroOccTax }]
              : []),
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between py-1.5 border-b border-border/50">
              <span className="text-sm text-muted-foreground pl-4">{label}</span>
              <span className="text-sm tabular-nums font-medium">{fmtMoney(value)}</span>
            </div>
          ))}
          <div className="flex justify-between py-1.5 border-b border-border font-semibold">
            <span className="text-sm">Total Estimated Liability</span>
            <span className="text-sm tabular-nums">{fmtMoney(report.taxEstimates.totalLiability)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border/50">
            <span className="text-sm text-muted-foreground pl-4">Already Paid</span>
            <span className="text-sm tabular-nums text-emerald-600 font-medium">({fmtMoney(report.taxEstimates.totalPaid)})</span>
          </div>
          <div className={`flex justify-between py-3 px-4 mt-2 rounded-lg font-bold text-sm ${report.taxEstimates.balance > 0 ? "bg-amber-50 border border-amber-200 text-amber-700" : "bg-emerald-50 border border-emerald-200 text-emerald-700"}`}>
            <span>{report.taxEstimates.balance > 0 ? "Remaining Balance" : "Overpaid / Refund Est."}</span>
            <span className="tabular-nums">{fmtMoney(Math.abs(report.taxEstimates.balance))}</span>
          </div>
        </div>}
      </div>

      {/* Owner Pay Waterfall — informational, outside P&L */}
      {report.ownerActivity && (report.ownerActivity.ownerAllocated > 0 || report.ownerActivity.ownerDrawTotal > 0 || report.ownerActivity.ownerContributionsTotal > 0) && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-violet-600" />
            <h3 className="font-semibold text-sm text-foreground flex-1">Owner Pay Waterfall</h3>
            <span className="text-xs text-muted-foreground">Informational — does not affect net profit</span>
            {report.ownerActivity.ownerOverWithdrawal > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 uppercase tracking-wide">Over-Withdrawal</span>
            )}
          </div>
          <div className="p-4 space-y-1">
            {[
              { label: "Owner Allocated (50% of net after 5% growth fund)", value: report.ownerActivity.ownerAllocated, color: "text-emerald-700" },
              { label: "− Tax Reserve (25% of allocation)", value: -report.ownerActivity.ownerTaxReserve, color: "text-amber-700" },
              { label: "= Take-Home Budget", value: report.ownerActivity.ownerAllocated - report.ownerActivity.ownerTaxReserve, color: "text-foreground", bold: true },
              { label: "− Cash Taken (Owner Draws)", value: -report.ownerActivity.ownerCashTaken, color: "text-foreground" },
            ].map(({ label, value, color, bold }) => (
              <div key={label} className="flex justify-between py-1.5 border-b border-border/50">
                <span className={`text-sm pl-4 ${bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
                <span className={`text-sm tabular-nums font-medium ${color} ${bold ? "font-bold" : ""}`}>{fmtMoney(value)}</span>
              </div>
            ))}
            <div className={`flex justify-between py-3 px-4 mt-2 rounded-lg font-bold text-sm ${report.ownerActivity.ownerOverWithdrawal > 0 ? "bg-red-50 border border-red-200 text-red-700" : "bg-emerald-50 border border-emerald-200 text-emerald-700"}`}>
              <span>{report.ownerActivity.ownerOverWithdrawal > 0 ? "⚠ Over-Withdrawal" : "= Retained / Undrawn"}</span>
              <span className="tabular-nums">{fmtMoney(report.ownerActivity.ownerOverWithdrawal > 0 ? -report.ownerActivity.ownerOverWithdrawal : report.ownerActivity.ownerRetained)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-t border-border mt-3">
              <span className="text-sm text-muted-foreground pl-4">Owner Contributions (capital)</span>
              <span className="text-sm tabular-nums font-medium">{report.ownerActivity.ownerContributionsTotal > 0 ? fmtMoney(report.ownerActivity.ownerContributionsTotal) : "—"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Other Income */}
      {report.otherIncome.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button onClick={() => toggleSection("other-income")} className="w-full px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left">
            <PieChart className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground flex-1">Other Income</h3>
            {expandedSections.has("other-income") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {expandedSections.has("other-income") && <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/20 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Description</th>
                  <th className="text-left px-4 py-2">Source</th>
                  <th className="text-right px-4 py-2">Amount</th>
                  <th className="text-left px-4 py-2">Method</th>
                </tr>
              </thead>
              <tbody>
                {report.otherIncome.map(o => (
                  <tr key={o.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-4 py-2 text-muted-foreground">{o.date}</td>
                    <td className="px-4 py-2">{o.description}</td>
                    <td className="px-4 py-2 text-muted-foreground">{o.source ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtMoney(o.amount)}</td>
                    <td className="px-4 py-2 text-muted-foreground capitalize">{o.paymentMethod ?? "—"}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-semibold bg-muted/20">
                  <td colSpan={3} className="px-4 py-2">Total Other Income</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(report.summary.otherIncomeTotal)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {/* Business Trip Summary */}
      <BusinessTripSummarySection year={year} />

      {/* Disclaimer */}
      <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          This report is prepared from your BuildPro records on a cash basis.
          Tax bracket estimates are illustrative only. Your CPA should verify all figures, apply applicable deductions, and file your returns.
        </p>
      </div>
    </div>
  );
}
