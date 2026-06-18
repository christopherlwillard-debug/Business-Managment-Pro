import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Receipt, AlertCircle, Download, FileText, AlertTriangle,
  ChevronDown, ChevronUp, X, Home,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useScheduleCReport } from "@workspace/api-client-react";
import { useBusiness } from "@/contexts/BusinessContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function loadHomeOffice(year: number) {
  try {
    const raw = localStorage.getItem(`home-office-${year}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveHomeOffice(year: number, data: Record<string, string>) {
  try { localStorage.setItem(`home-office-${year}`, JSON.stringify(data)); } catch {}
}

interface ProfitLossReport {
  year: number;
  revenue: { grossReceipts: number; otherIncome: number; grossRevenue: number };
  cogs: { materials: number; total: number };
  grossProfit: number;
  operatingExpenses: { label: string; key: string; amount: number }[];
  totalOperatingExpenses: number;
  netOperatingIncome: number;
  deductions: { mileageDeduction: number; totalMiles: number; mileageRate: number; writeoffsTotal: number };
  netProfit: number;
  closedJobCount?: number;
}


function ScheduleCTab({ year }: { year: number }) {
  const { activeBusiness } = useBusiness();
  const { data: report, isLoading: reportLoading } = useScheduleCReport(year, activeBusiness?.slug);
  const [showHomeOffice, setShowHomeOffice] = useState(false);

  const [ho, setHo] = useState<Record<string, string>>(() => loadHomeOffice(year));

  useEffect(() => { setHo(loadHomeOffice(year)); }, [year, activeBusiness?.slug]);

  function setHoField(k: string, v: string) {
    setHo(prev => {
      const next = { ...prev, [k]: v };
      saveHomeOffice(year, next);
      return next;
    });
  }

  const totalSqft = parseFloat(ho.totalSqft || "0");
  const officeSqft = parseFloat(ho.officeSqft || "0");
  const businessUsePct = totalSqft > 0 && officeSqft > 0 ? Math.min(officeSqft / totalSqft, 1) : 0;
  const annualRentMortgage = parseFloat(ho.rentMortgage || "0");
  const annualUtilities = parseFloat(ho.utilities || "0");
  const annualPhone = parseFloat(ho.phone || "0");
  const phoneBusinessPct = parseFloat(ho.phonePct || "0") / 100;
  const homeOfficeDed = businessUsePct * (annualRentMortgage + annualUtilities) + phoneBusinessPct * annualPhone;

  const scheduleCLines = report?.scheduleLines ?? [];
  const totalDeductions = (report?.totalExpenses ?? 0) + homeOfficeDed;
  const netProfit = (report?.grossReceipts ?? 0) - totalDeductions;

  const lineMap: Record<number, { description: string; amount: number }> = {};
  for (const l of scheduleCLines) { lineMap[l.line] = { description: l.description, amount: l.amount }; }

  // Inject home office into line 30
  if (homeOfficeDed > 0) { lineMap[30] = { description: "Expenses for business use of your home (Form 8829)", amount: homeOfficeDed }; }


  return (
    <div className="space-y-6">
      {reportLoading && (
        <div className="text-center py-20 text-muted-foreground animate-pulse">Loading Schedule C…</div>
      )}

      {report && (
        <>
          {/* Export actions */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                const csvContent = `Schedule C - Tax Year ${report.year}\n\nLine,Description,Amount\n1,Gross receipts or sales,"$${report.grossReceipts.toFixed(2)}"\n${report.scheduleLines.filter(l => l.line > 1).map(l => `${l.line},"${l.description}","$${l.amount.toFixed(2)}"`).join("\n")}${homeOfficeDed > 0 ? `\n30,"Home office deduction (Form 8829)","$${homeOfficeDed.toFixed(2)}"` : ""}\n28,Total expenses,"$${totalDeductions.toFixed(2)}"\n31,Net profit or loss,"$${netProfit.toFixed(2)}"`;
                const blob = new Blob([csvContent], { type: "text/csv" });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a"); a.href = url; a.download = `Schedule_C_${year}.csv`; a.click();
                window.URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm transition-all border border-border text-sm"
            >
              <Download className="w-4 h-4" /> CSV Export
            </button>
            <button
              onClick={() => {
                const printWindow = window.open("", "", "width=800,height=600");
                if (printWindow) {
                  printWindow.document.write(`<html><head><title>Schedule C - Tax Year ${report.year}</title><style>body{font-family:Arial,sans-serif;padding:40px;padding-top:80px;line-height:1.6}h1{text-align:center;font-size:18px;margin-bottom:5px}h2{font-size:13px;margin:20px 0 10px}.line{display:flex;justify-content:space-between;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:6px}.ln{font-weight:bold;width:50px;color:#666;font-size:12px}.desc{flex:1;margin:0 20px;font-size:13px}.amt{width:100px;text-align:right;font-weight:600}.total{border-top:2px solid #333;font-weight:bold;background:#f5f5f5;padding:8px 4px}.top-bar{position:fixed;top:max(16px,env(safe-area-inset-top,16px));left:0;right:0;display:flex;justify-content:space-between;padding:0 16px;z-index:9999;pointer-events:none}.top-bar button{pointer-events:all;background:rgba(0,0,0,0.75);color:#fff;border:none;padding:8px 16px;border-radius:20px;font-size:14px;font-weight:600;cursor:pointer}@media print{.top-bar{display:none}}</style></head><body><div class="top-bar"><button onclick="window.close()">&#8592; Back to App</button><button onclick="window.print()">&#128438; Print</button></div><h1>SCHEDULE C (FORM 1040)</h1><p style="text-align:center;color:#666">Profit or Loss from Business — Tax Year ${report.year}</p><h2>PART I — INCOME</h2>${report.scheduleLines.filter(l => l.line <= 7).map(l => `<div class="line"><span class="ln">Line ${l.line}</span><span class="desc">${l.description}</span><span class="amt">$${l.amount.toFixed(2)}</span></div>`).join("")}<h2>PART II — EXPENSES</h2>${report.scheduleLines.filter(l => l.line >= 8 && l.line < 28).map(l => `<div class="line"><span class="ln">Line ${l.line}</span><span class="desc">${l.description}</span><span class="amt">$${l.amount.toFixed(2)}</span></div>`).join("")}${homeOfficeDed > 0 ? `<div class="line"><span class="ln">Line 30</span><span class="desc">Home office deduction (Form 8829)</span><span class="amt">$${homeOfficeDed.toFixed(2)}</span></div>` : ""}<div class="line total"><span class="ln">Line 28</span><span class="desc">Total expenses</span><span class="amt">$${totalDeductions.toFixed(2)}</span></div><div class="line total"><span class="ln">Line 31</span><span class="desc">Net profit or (loss)</span><span class="amt">$${netProfit.toFixed(2)}</span></div></body></html>`);
                  printWindow.document.close();
                }
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all text-sm"
            >
              <FileText className="w-4 h-4" /> PDF Print
            </button>
          </div>

          {/* Data quality warnings */}
          {report.dataQuality.warnings.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-amber-900 text-sm">Data Quality Warnings</p>
                {report.dataQuality.warnings.map((w, i) => <p key={i} className="text-sm text-amber-800">• {w}</p>)}
              </div>
            </div>
          )}

          {/* IRS-style Schedule C form */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            {/* Form header */}
            <div className="bg-muted/50 px-6 py-4 border-b border-border">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Schedule C (Form 1040)</p>
                  <h2 className="text-base font-display font-bold text-foreground mt-0.5">Profit or Loss From Business</h2>
                  <p className="text-xs text-muted-foreground">Sole Proprietorship / Single-Member LLC — Tax Year {year}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">OMB No. 1545-0074</p>
                  <p className="text-xs font-bold text-foreground mt-0.5">Attachment Sequence No. 09</p>
                </div>
              </div>
            </div>

            {/* Part I — Income */}
            <div className="px-6 pt-4 pb-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="bg-foreground text-background text-[10px] font-bold px-2 py-0.5 rounded">PART I</div>
                <span className="text-sm font-bold text-foreground uppercase tracking-wide">Income</span>
              </div>
              <div className="space-y-0 divide-y divide-border/30">
                {[
                  { line: 1, desc: 'Gross receipts or sales. See instructions for line 1 and check the box if this income was reported to you on Form W-2 and the \u201cStatutory employee\u201d box on that form was checked' },
                  { line: 2, desc: "Returns and allowances" },
                  { line: 3, desc: "Subtract line 2 from line 1" },
                  { line: 4, desc: "Cost of goods sold (from Part III, line 42)" },
                  { line: 5, desc: "Gross profit. Subtract line 4 from line 3" },
                  { line: 6, desc: "Other income, including federal and state gasoline or fuel tax credit or refund" },
                  { line: 7, desc: "Gross income. Add lines 5 and 6" },
                ].map(({ line, desc }) => {
                  const entry = lineMap[line];
                  const amount = entry?.amount ?? 0;
                  const isKey = [1, 5, 7].includes(line);
                  return (
                    <div key={line} className={`flex items-start gap-3 py-2.5 ${isKey ? "bg-muted/10" : ""}`}>
                      <span className="text-[11px] text-muted-foreground font-mono w-8 flex-shrink-0 pt-0.5 text-right">{line}</span>
                      <span className={`flex-1 text-xs leading-relaxed ${isKey ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{desc}</span>
                      <span className={`font-semibold tabular-nums text-sm min-w-[80px] text-right ${isKey && amount > 0 ? "text-primary" : "text-muted-foreground"}`}>
                        {amount !== 0 ? formatCurrency(amount) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t-4 border-border" />

            {/* Part II — Expenses */}
            <div className="px-6 pt-4 pb-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="bg-foreground text-background text-[10px] font-bold px-2 py-0.5 rounded">PART II</div>
                <span className="text-sm font-bold text-foreground uppercase tracking-wide">Expenses</span>
                <span className="text-xs text-muted-foreground">Enter expenses for business use of your home only on line 30</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y divide-border/30">
                {[
                  { line: 8, desc: "Advertising" },
                  { line: 9, desc: "Car and truck expenses (see instructions)" },
                  { line: 10, desc: "Commissions and fees" },
                  { line: 11, desc: "Contract labor (see instructions)" },
                  { line: 12, desc: "Depletion" },
                  { line: 13, desc: "Depreciation and section 179 expense" },
                  { line: 14, desc: "Employee benefit programs" },
                  { line: 15, desc: "Insurance (other than health)" },
                  { line: 16, desc: "Interest — Mortgage (paid to banks, etc.)" },
                  { line: 17, desc: "Legal and professional services" },
                  { line: 18, desc: "Office expense" },
                  { line: 19, desc: "Pension and profit-sharing plans" },
                  { line: 20, desc: "Rent or lease (vehicles, machinery, equipment)" },
                  { line: 21, desc: "Repairs and maintenance" },
                  { line: 22, desc: "Supplies (not included in Part III)" },
                  { line: 23, desc: "Taxes and licenses" },
                  { line: 24, desc: "Travel and meals" },
                  { line: 25, desc: "Utilities" },
                  { line: 26, desc: "Wages (less employment credits)" },
                  { line: 27, desc: "Other expenses (from line 48)" },
                ].map(({ line, desc }) => {
                  const entry = lineMap[line];
                  const amount = entry?.amount ?? 0;
                  return (
                    <div key={line} className="flex items-center gap-2 py-2 px-1">
                      <span className="text-[11px] text-muted-foreground font-mono w-7 flex-shrink-0 text-right">{line}</span>
                      <span className="flex-1 text-xs text-muted-foreground leading-tight">{desc}</span>
                      <span className={`font-medium tabular-nums text-sm min-w-[72px] text-right ${amount > 0 ? "text-foreground" : "text-muted-foreground/40"}`}>
                        {amount > 0 ? formatCurrency(amount) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Line 28 Total, Line 30 Home Office, Line 31 Net */}
              <div className="mt-3 space-y-0 border-t-2 border-border divide-y divide-border/30">
                {[
                  { line: 28, desc: "Total expenses before expenses for business use of home. Add lines 8 through 27", amount: report.totalExpenses, key: true },
                  { line: 30, desc: "Expenses for business use of your home. Do not report these expenses elsewhere. Attach Form 8829 unless using the simplified method", amount: homeOfficeDed, key: false },
                  { line: 31, desc: "Net profit or (loss). Subtract line 30 from line 28. If a profit, enter on both Schedule 1 (Form 1040), line 3, and on Schedule SE, line 2.", amount: netProfit, key: true },
                ].map(({ line, desc, amount, key }) => (
                  <div key={line} className={`flex items-start gap-2 py-3 ${key ? "bg-muted/20 px-3 rounded" : "px-1"}`}>
                    <span className="text-[11px] text-muted-foreground font-mono w-7 flex-shrink-0 text-right pt-0.5">{line}</span>
                    <span className={`flex-1 text-xs leading-relaxed ${key ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{desc}</span>
                    <span className={`font-bold tabular-nums text-sm min-w-[80px] text-right ${amount < 0 ? "text-red-500" : key && amount > 0 ? "text-primary" : "text-foreground"}`}>
                      {formatCurrency(amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Form 8829 — Home Office Calculator */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setShowHomeOffice(v => !v)}
              className="w-full flex items-center justify-between px-6 py-4 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Home className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-foreground text-sm">Form 8829 — Home Office Deduction Calculator</p>
                  <p className="text-xs text-muted-foreground">
                    {homeOfficeDed > 0
                      ? `Calculated deduction: ${formatCurrency(homeOfficeDed)} → flows to Schedule C line 30`
                      : "Enter your home office details to calculate your deduction"}
                  </p>
                </div>
              </div>
              {showHomeOffice ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
            </button>

            {showHomeOffice && (
              <div className="px-6 py-5 space-y-5">
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
                  <strong>Part I — Business Use of Home</strong> — Enter square footage to calculate the business-use percentage. Only expenses attributable to the office portion are deductible.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={cl}>Total Home Sq Ft</label>
                    <input type="number" min="0" className={ci} placeholder="e.g. 1800"
                      value={ho.totalSqft ?? ""} onChange={e => setHoField("totalSqft", e.target.value)} />
                  </div>
                  <div>
                    <label className={cl}>Office Sq Ft</label>
                    <input type="number" min="0" className={ci} placeholder="e.g. 180"
                      value={ho.officeSqft ?? ""} onChange={e => setHoField("officeSqft", e.target.value)} />
                  </div>
                  <div>
                    <label className={cl}>Business Use %</label>
                    <div className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm font-semibold text-foreground">
                      {totalSqft > 0 ? `${(businessUsePct * 100).toFixed(1)}%` : "—"}
                    </div>
                  </div>
                </div>

                <div className="border-t border-border/50 pt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Part II — Deductible Expenses</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={cl}>Annual Rent or Mortgage Interest ($)</label>
                      <input type="number" min="0" step="0.01" className={ci} placeholder="e.g. 12000"
                        value={ho.rentMortgage ?? ""} onChange={e => setHoField("rentMortgage", e.target.value)} />
                    </div>
                    <div>
                      <label className={cl}>Annual Utilities — Electric, Gas, Water ($)</label>
                      <input type="number" min="0" step="0.01" className={ci} placeholder="e.g. 2400"
                        value={ho.utilities ?? ""} onChange={e => setHoField("utilities", e.target.value)} />
                    </div>
                    <div>
                      <label className={cl}>Annual Phone / Internet ($)</label>
                      <input type="number" min="0" step="0.01" className={ci} placeholder="e.g. 1200"
                        value={ho.phone ?? ""} onChange={e => setHoField("phone", e.target.value)} />
                    </div>
                    <div>
                      <label className={cl}>Business Use of Phone / Internet (%)</label>
                      <input type="number" min="0" max="100" className={ci} placeholder="e.g. 80"
                        value={ho.phonePct ?? ""} onChange={e => setHoField("phonePct", e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Calculated Home Office Deduction (Line 30)</p>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      {businessUsePct > 0
                        ? `${(businessUsePct * 100).toFixed(1)}% × (rent + utilities) + ${ho.phonePct || 0}% of phone`
                        : "Enter square footage above to calculate"}
                    </p>
                  </div>
                  <p className="text-2xl font-display font-bold text-emerald-700">{formatCurrency(homeOfficeDed)}</p>
                </div>

                <p className="text-xs text-muted-foreground">
                  Values are saved automatically and persist across sessions. This calculator is for estimation only — consult a CPA and attach the actual Form 8829 when filing.
                </p>
              </div>
            )}
          </div>

          {/* Disclaimer */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800">
              <strong>Tax Disclaimer:</strong> This Schedule C summary is for informational purposes only and does not constitute tax advice.
              Consult with a qualified CPA before filing. BuildPro is not responsible for filing accuracy or penalties.
            </p>
          </div>
        </>
      )}
    </div>
  );
}


export default ScheduleCTab;
