import { useState, useEffect, useRef } from "react";
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
const cl = "block text-xs font-semibold text-gray-500 mb-1";
const ci = "w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-1 focus:ring-primary/50 transition-colors";

/** Migrate any localStorage data to the server (one-time, best-effort). */
async function migrateLocalHomeOffice(year: number): Promise<Record<string, string> | null> {
  try {
    const raw = localStorage.getItem(`home-office-${year}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, string>;
    await fetch(`${BASE}/api/tax-reports/home-office/${year}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    localStorage.removeItem(`home-office-${year}`);
    return data;
  } catch { return null; }
}

interface ProfitLossReport {
  year: number;
  revenue: { grossReceipts: number; otherIncome: number; grossRevenue: number };
  cogs: { materials: number; total: number };
  grossProfit: number;
  operatingExpenses: { label: string; key: string; amount: number }[];
  totalOperatingExpenses: number;
  netOperatingIncome: number;
  deductions: { mileageDeduction: number; totalMiles: number; mileageRate: number | null };
  netProfit: number;
  closedJobCount?: number;
}


function ScheduleCTab({ year }: { year: number }) {
  const { activeBusiness } = useBusiness();
  const {
    data: report,
    isLoading: reportLoading,
    error: reportError,
    refetch: refetchReport,
  } = useScheduleCReport(year, activeBusiness?.slug);
  const [showHomeOffice, setShowHomeOffice] = useState(false);
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch home office settings from the server
  const { data: serverHo, isSuccess: hoLoaded } = useQuery<Record<string, string> | null>({
    queryKey: ["home-office", year],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/tax-reports/home-office/${year}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load home office settings");
      return res.json();
    },
  });

  const [ho, setHo] = useState<Record<string, string>>({});

  // Once server data loads: use it, or migrate from localStorage if server has nothing
  useEffect(() => {
    if (!hoLoaded) return;
    if (serverHo && Object.keys(serverHo).length > 0) {
      setHo(serverHo);
    } else {
      // No server record yet — migrate localStorage if present
      migrateLocalHomeOffice(year).then(migrated => {
        if (migrated) {
          setHo(migrated);
          queryClient.invalidateQueries({ queryKey: ["home-office", year] });
        }
      });
    }
  }, [hoLoaded, serverHo, year]);

  // Reset when year changes
  useEffect(() => { setHo({}); }, [year]);

  const saveMutation = useMutation({
    mutationFn: async (fields: Record<string, string>) => {
      const res = await fetch(`${BASE}/api/tax-reports/home-office/${year}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["home-office", year], data);
    },
  });

  function setHoField(k: string, v: string) {
    setHo(prev => {
      const next = { ...prev, [k]: v };
      // Debounce server save 500ms so typing stays instant
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => saveMutation.mutate(next), 500);
      return next;
    });
  }

  const hoMethod: "regular" | "simplified" = (ho.method === "simplified") ? "simplified" : "regular";
  const totalSqft = parseFloat(ho.totalSqft || "0");
  const officeSqft = parseFloat(ho.officeSqft || "0");
  const businessUsePct = totalSqft > 0 && officeSqft > 0 ? Math.min(officeSqft / totalSqft, 1) : 0;
  const annualRentMortgage = parseFloat(ho.rentMortgage || "0");
  const annualUtilities = parseFloat(ho.utilities || "0");
  const annualPhone = parseFloat(ho.phone || "0");
  const phoneBusinessPct = parseFloat(ho.phonePct || "0") / 100;
  const homeOfficeDed = hoMethod === "simplified"
    ? Math.min(officeSqft, 300) * 5
    : businessUsePct * (annualRentMortgage + annualUtilities) + phoneBusinessPct * annualPhone;

  const [showMealsBreakdown, setShowMealsBreakdown] = useState(false);

  const scheduleCLines = report?.scheduleLines ?? [];
  const totalDeductions = (report?.totalExpenses ?? 0) + homeOfficeDed;
  const netProfit = (report?.grossReceipts ?? 0) - totalDeductions;

  const lineMap: Record<number, { description: string; amount: number }> = {};
  for (const l of scheduleCLines) { lineMap[l.line] = { description: l.description, amount: l.amount }; }

  // Extract line 24 sub-lines (24a travel, 24b meals) separately since both share line number 24
  const travelLine = scheduleCLines.find(l => l.line === 24 && l.description.includes("24a"));
  const mealsLine = scheduleCLines.find(l => l.line === 24 && l.description.includes("24b"));
  const mealsBreakdown = report?.mealsBreakdown;
  const assumptions = (report as any)?.assumptionsUsed;

  // Inject home office into line 30
  if (homeOfficeDed > 0) { lineMap[30] = { description: "Expenses for business use of your home (Form 8829)", amount: homeOfficeDed }; }


  return (
    <div className="space-y-6">
      {reportLoading && (
        <div className="text-center py-20 text-muted-foreground animate-pulse">Loading Schedule C…</div>
      )}

      {reportError && (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center gap-3">
          <div className="w-11 h-11 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Schedule C is temporarily unavailable</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              We couldn’t load the {year} report. Your financial records were not changed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetchReport()}
            className="px-4 py-2 rounded-xl border border-border bg-background text-sm font-medium hover:bg-muted/60 transition-colors"
          >
            Try again
          </button>
        </div>
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
          {assumptions && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
              <p className="font-semibold">Assumptions used for this estimate</p>
              <p className="mt-1">
                {assumptions.jurisdiction?.state ?? "State"} {((assumptions.kentuckyIncomeRate ?? 0) * 100).toFixed(2)}% ·
                occupational {((assumptions.occupationalRate ?? 0) * 100).toFixed(2)}% ·
                meals {((assumptions.mealDeductionRate ?? 0) * 100).toFixed(0)}% deductible ·
                {assumptions.source === "business_override" ? " business override" : " default"}
              </p>
              {(report as any).taxOwner && (
                <p className="mt-1">Tax owner: {(report as any).taxOwner.name} · includes {(report as any).taxOwner.includedBusinesses.join(", ")}</p>
              )}
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

              {/* Line 24 — Travel & Meals (full-width, rendered outside the 2-col grid) */}
              <div className="border-t border-border/30">
                {/* Line 24a — Travel / lodging (100% deductible) */}
                {(travelLine || true) && (
                  <div className="flex items-center gap-2 py-2 px-1">
                    <span className="text-[11px] text-muted-foreground font-mono w-7 flex-shrink-0 text-right">24</span>
                    <span className="flex-1 text-xs text-muted-foreground leading-tight">Travel — lodging & transportation (Line 24a)</span>
                    <span className={`font-medium tabular-nums text-sm min-w-[72px] text-right ${(travelLine?.amount ?? 0) > 0 ? "text-foreground" : "text-muted-foreground/40"}`}>
                      {(travelLine?.amount ?? 0) > 0 ? formatCurrency(travelLine!.amount) : "—"}
                    </span>
                  </div>
                )}

                {/* Line 24b — Meals (50% deductible) with expandable breakdown */}
                <div className="border-t border-border/20">
                  <button
                    onClick={() => setShowMealsBreakdown(v => !v)}
                    className="w-full flex items-center gap-2 py-2 px-1 hover:bg-muted/30 rounded transition-colors text-left group"
                  >
                    <span className="text-[11px] text-muted-foreground font-mono w-7 flex-shrink-0 text-right">24</span>
                    <span className="flex-1 text-xs text-muted-foreground leading-tight">
                      Meals — 50% deductible (Line 24b)
                    </span>
                    <span className={`font-medium tabular-nums text-sm min-w-[72px] text-right ${(mealsLine?.amount ?? 0) > 0 ? "text-foreground" : "text-muted-foreground/40"}`}>
                      {(mealsLine?.amount ?? 0) > 0 ? formatCurrency(mealsLine!.amount) : "—"}
                    </span>
                    <span className="ml-1 flex-shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground">
                      {showMealsBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  </button>

                  {showMealsBreakdown && mealsBreakdown && (
                    <div className="mx-2 mb-2 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">Meal Deduction Breakdown</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-white rounded-lg px-2 py-2 border border-amber-100">
                          <p className="text-lg font-bold text-foreground">{mealsBreakdown.receiptCount}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight">meal receipts</p>
                        </div>
                        <div className="bg-white rounded-lg px-2 py-2 border border-amber-100">
                          <p className="text-sm font-bold text-foreground">{formatCurrency(mealsBreakdown.totalSpend)}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight">total spend</p>
                        </div>
                        <div className="bg-white rounded-lg px-2 py-2 border border-amber-100">
                          <p className="text-sm font-bold text-primary">{formatCurrency(mealsBreakdown.deductibleAmount)}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight">deductible (Line 24b)</p>
                        </div>
                      </div>
                      {mealsBreakdown.explicitOverrideCount > 0 ? (
                        <p className="text-[11px] text-amber-700 leading-snug">
                          <strong>{mealsBreakdown.explicitOverrideCount}</strong> of {mealsBreakdown.receiptCount} receipts have an explicit deductible amount set (e.g. from trip receipts). The remaining {mealsBreakdown.receiptCount - mealsBreakdown.explicitOverrideCount} used the standard 50% fallback.
                        </p>
                      ) : (
                        <p className="text-[11px] text-amber-700 leading-snug">
                          All {mealsBreakdown.receiptCount} receipts used the standard {((assumptions?.mealDeductionRate ?? 0.5) * 100).toFixed(0)}% deduction rule ({formatCurrency(mealsBreakdown.totalSpend)} × {((assumptions?.mealDeductionRate ?? 0.5) * 100).toFixed(0)}% = {formatCurrency(mealsBreakdown.deductibleAmount)}).
                        </p>
                      )}
                    </div>
                  )}
                </div>
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
                {/* Method toggle */}
                <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl border border-border w-fit">
                  <button
                    onClick={() => setHoField("method", "regular")}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${hoMethod === "regular" ? "bg-white shadow-sm text-foreground border border-border" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Regular
                  </button>
                  <button
                    onClick={() => setHoField("method", "simplified")}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${hoMethod === "simplified" ? "bg-white shadow-sm text-foreground border border-border" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    IRS Simplified
                  </button>
                </div>

                {hoMethod === "simplified" ? (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
                      <strong>IRS Simplified Method</strong> — $5 per sq ft of office space, up to 300 sq ft (max deduction: $1,500). No need to track actual housing expenses.
                    </div>
                    <div className="max-w-xs">
                      <label className={cl}>Office Sq Ft (max 300)</label>
                      <input type="number" min="0" max="300" className={ci} placeholder="e.g. 150"
                        value={ho.officeSqft ?? ""} onChange={e => setHoField("officeSqft", e.target.value)} />
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-emerald-800">Calculated Home Office Deduction (Line 30)</p>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          {officeSqft > 0
                            ? `${Math.min(officeSqft, 300)} sq ft × $5/sq ft${officeSqft > 300 ? " (capped at 300 sq ft)" : ""}`
                            : "Enter office sq ft above to calculate"}
                        </p>
                      </div>
                      <p className="text-2xl font-display font-bold text-emerald-700">{formatCurrency(homeOfficeDed)}</p>
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
                )}

                <p className="text-xs text-muted-foreground">
                  Values are saved automatically and persist across sessions. This calculator is for estimation only — consult a CPA when filing.
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
