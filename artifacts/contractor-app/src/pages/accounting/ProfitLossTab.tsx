import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Receipt, Printer, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useBusiness } from "@/contexts/BusinessContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ProfitLossReport {
  year: number;
  revenue: { grossReceipts: number; otherIncome: number; grossRevenue: number };
  cogs: { materials: number; total: number };
  grossProfit: number;
  operatingExpenses: { label: string; key: string; amount: number }[];
  totalOperatingExpenses: number;
  netOperatingIncome: number;
  deductions: { mileageDeduction: number; totalMiles: number; mileageRate: number };
  netProfit: number;
  closedJobCount?: number;
}

function useProfitLoss(year: number, businessLine?: string) {
  return useQuery<ProfitLossReport>({
    queryKey: ["profit-loss", year, businessLine ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ year: String(year) });
      if (businessLine) params.set("businessLine", businessLine);
      const res = await fetch(`${BASE}/api/reports/profit-loss?${params}`);
      if (!res.ok) throw new Error("Failed to load P&L report");
      return res.json();
    },
    staleTime: 1000 * 60 * 2,
  });
}

function fmtAmt(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function PLRow({ label, amount, bold, indent, negative, highlight, separator }: {
  label: string; amount?: number; bold?: boolean; indent?: boolean;
  negative?: boolean; highlight?: boolean; separator?: boolean;
}) {
  const amtClass = amount === undefined ? "" :
    amount < 0 || negative ? "text-red-600" :
    highlight ? "text-emerald-600" : "text-foreground";
  return (
    <div className={`flex items-center justify-between py-2 ${separator ? "border-t-2 border-border mt-1" : "border-b border-border/30"} ${highlight ? "bg-muted/30 rounded px-2 -mx-2" : ""}`}>
      <span className={`text-sm ${indent ? "pl-6 text-muted-foreground" : bold ? "font-semibold text-foreground" : "text-foreground"}`}>{label}</span>
      {amount !== undefined && (
        <span className={`tabular-nums text-sm font-medium ${amtClass} ${bold || highlight ? "font-bold" : ""}`}>
          {fmtAmt(amount)}
        </span>
      )}
    </div>
  );
}

function PLSection({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-1">
      <div className="bg-foreground text-background text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">{title}</div>
    </div>
  );
}

function ProfitLossTab({ year }: { year: number }) {
  const { activeBusiness } = useBusiness();
  const { data: report, isLoading, error } = useProfitLoss(year, activeBusiness?.slug);

  function handlePrint() {
    if (!report) return;
    const printWindow = window.open("", "", "width=860,height=700");
    if (!printWindow) return;

    const row = (label: string, amt: number | null, opts: { indent?: boolean; bold?: boolean; subtotal?: boolean; total?: boolean; negative?: boolean } = {}) => {
      const isNeg = amt !== null && (amt < 0 || opts.negative);
      const color = amt === null ? "" : isNeg ? "color:#dc2626" : opts.total ? "color:#059669" : "";
      const bg = opts.total ? "background:#f0fdf4;" : opts.subtotal ? "background:#f9fafb;" : "";
      const border = opts.subtotal || opts.total ? "border-top:2px solid #d1d5db;" : "border-bottom:1px solid #e5e7eb;";
      const weight = opts.bold || opts.subtotal || opts.total ? "font-weight:700;" : "";
      const indent = opts.indent ? "padding-left:2rem;" : "";
      const amtStr = amt === null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amt);
      return `<div style="display:flex;justify-content:space-between;padding:6px 4px;${border}${bg}${weight}"><span style="${indent}font-size:13px">${label}</span>${amt !== null ? `<span style="font-size:13px;${color}">${amtStr}</span>` : ""}</div>`;
    };
    const section = (title: string) =>
      `<div style="margin-top:20px;margin-bottom:4px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;background:#1e293b;color:#fff;padding:3px 6px;border-radius:3px;display:inline-block">${title}</div>`;

    const opexRows = report.operatingExpenses
      .map(e => row(e.label, e.amount, { indent: true })).join("");
    const mileLabel = `Mileage Deduction (${report.deductions.totalMiles.toFixed(0)} mi \u00d7 $${report.deductions.mileageRate.toFixed(3)}/mi)`;
    const isLoss = report.netProfit < 0;

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Profit & Loss — ${report.year}</title><style>body{font-family:Arial,sans-serif;padding:48px;padding-top:88px;line-height:1.5;max-width:700px;margin:0 auto}.header{text-align:center;margin-bottom:24px}.header h1{font-size:20px;margin:0 0 4px}.header p{margin:0;color:#64748b;font-size:13px}.top-bar{position:fixed;top:max(14px,env(safe-area-inset-top,14px));left:0;right:0;display:flex;justify-content:space-between;padding:0 20px;z-index:9999;pointer-events:none}.top-bar button{pointer-events:all;background:rgba(0,0,0,.78);color:#fff;border:none;padding:8px 18px;border-radius:20px;font-size:14px;font-weight:600;cursor:pointer;letter-spacing:.01em}.net-profit{text-align:center;margin-top:20px;padding:16px;border-radius:8px;background:${isLoss ? "#fef2f2" : "#f0fdf4"};border:2px solid ${isLoss ? "#fca5a5" : "#86efac"}}.net-profit .label{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:${isLoss ? "#991b1b" : "#166534"}}.net-profit .value{font-size:28px;font-weight:800;color:${isLoss ? "#dc2626" : "#16a34a"}}.footer{margin-top:36px;padding-top:12px;border-top:1px solid #e5e7eb;text-align:center;color:#94a3b8;font-size:11px}@media print{.top-bar{display:none}}</style></head><body><div class="top-bar"><button onclick="window.close()">&#8592; Back</button><button onclick="window.print()">&#128438; Print / PDF</button></div><div class="header"><h1>Willard's General Contracting LLC</h1><p>Profit &amp; Loss Statement — January 1, ${report.year} – December 31, ${report.year}</p><p style="font-size:11px;color:#94a3b8">Cash Basis &bull; Prepared by BuildPro</p></div>${section("Revenue")}${row("Gross Receipts (Paid Invoices)", report.revenue.grossReceipts, { indent: true })}${report.revenue.otherIncome > 0 ? row("Other Income", report.revenue.otherIncome, { indent: true }) : ""}${row("Total Revenue", report.revenue.grossRevenue, { subtotal: true })}${section("Cost of Goods Sold")}${row("Materials", report.cogs.materials, { indent: true })}${row("Total COGS", report.cogs.total, { subtotal: true })}${row("Gross Profit", report.grossProfit, { subtotal: true })}${section("Operating Expenses")}${opexRows}${row("Total Operating Expenses", report.totalOperatingExpenses, { subtotal: true })}${row("Net Operating Income", report.netOperatingIncome, { subtotal: true })}${section("Other Deductions")}${row(mileLabel, report.deductions.mileageDeduction, { indent: true })}<div class="net-profit"><div class="label">${isLoss ? "Net Loss" : "Net Profit"}</div><div class="value">${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(report.netProfit))}</div></div><div class="footer">Willard's General Contracting LLC &bull; ${report.year} &bull; Cash-Basis Accounting &bull; Prepared by BuildPro</div></body></html>`);
    printWindow.document.close();
  }

  return (
    <div className="space-y-4">
      {isLoading && <div className="text-center py-20 text-muted-foreground animate-pulse">Loading Profit & Loss…</div>}
      {error && <div className="text-center py-20 text-destructive">Failed to load report. Check that the API is running.</div>}

      {report && (
        <>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all text-sm"
            >
              <Printer className="w-4 h-4" /> Print / Save PDF
            </button>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-muted/50 px-6 py-4 border-b border-border">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Profit & Loss Statement</p>
                  <h2 className="text-base font-display font-bold text-foreground mt-0.5">Willard's General Contracting LLC</h2>
                  <p className="text-xs text-muted-foreground">January 1, {year} – December 31, {year} &bull; Cash Basis</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Prepared by BuildPro</p>
                  <p className="mt-0.5">Tax Year {year}</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 space-y-1">
              <PLSection title="Revenue" />
              {(report.closedJobCount ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 mb-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                  <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  Includes {report.closedJobCount} closed job{report.closedJobCount === 1 ? "" : "s"} — revenue and expenses fully counted
                </div>
              )}
              <PLRow label="Gross Receipts (Paid Invoices)" amount={report.revenue.grossReceipts} indent />
              {report.revenue.otherIncome > 0 && <PLRow label="Other Income" amount={report.revenue.otherIncome} indent />}
              <PLRow label="Total Revenue" amount={report.revenue.grossRevenue} bold separator />

              <PLSection title="Cost of Goods Sold" />
              <PLRow label="Materials" amount={report.cogs.materials} indent />
              <PLRow label="Total COGS" amount={report.cogs.total} bold separator />

              <PLRow label="Gross Profit" amount={report.grossProfit} bold highlight separator />

              <PLSection title="Operating Expenses" />
              {report.operatingExpenses.map(e => (
                <div key={e.key}>
                  <PLRow label={e.label} amount={e.amount} indent />
                  {e.key === "contractLabor" && (report as any).outstandingSubLiability?.total > 0 && (
                    <div className="ml-6 mb-1 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-amber-800">
                          {formatCurrency((report as any).outstandingSubLiability.total)} outstanding (unpaid)
                        </span>
                        <span className="text-amber-700 ml-1">— fixed/allocation subs not yet marked paid. These are not yet in expenses.</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <PLRow label="Total Operating Expenses" amount={report.totalOperatingExpenses} bold separator />

              <PLRow label="Net Operating Income" amount={report.netOperatingIncome} bold highlight separator />

              <PLSection title="Other Deductions" />
              <PLRow
                label={`Mileage Deduction (${report.deductions.totalMiles.toFixed(0)} mi × $${report.deductions.mileageRate.toFixed(3)}/mi)`}
                amount={report.deductions.mileageDeduction}
                indent
              />

              <div className={`mt-4 rounded-xl p-4 border-2 ${report.netProfit < 0 ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${report.netProfit < 0 ? "text-red-700" : "text-emerald-700"}`}>
                      {report.netProfit < 0 ? "Net Loss" : "Net Profit"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">After all deductions — Tax Year {year}</p>
                  </div>
                  <span className={`text-2xl font-display font-bold tabular-nums ${report.netProfit < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(report.netProfit))}
                    {report.netProfit < 0 && <span className="text-base ml-1">(loss)</span>}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


export default ProfitLossTab;
