import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, DollarSign, MapPin, Receipt,
  Navigation, HardHat, FileSpreadsheet, Printer, AlertCircle, CheckCircle2
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchAccounting(year: number) {
  const res = await fetch(`${BASE}/api/reports/accounting?year=${year}`);
  if (!res.ok) throw new Error("Failed to load accounting data");
  return res.json();
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: any; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex gap-4 items-start">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-2xl font-display font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-4">
      <h2 className="text-lg font-display font-bold text-foreground">{title}</h2>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  "Materials": "bg-blue-100 text-blue-700",
  "Fuel": "bg-amber-100 text-amber-700",
  "Equipment": "bg-purple-100 text-purple-700",
  "Subcontractors": "bg-orange-100 text-orange-700",
  "Insurance": "bg-green-100 text-green-700",
  "Office": "bg-gray-100 text-gray-600",
  "Tools": "bg-red-100 text-red-700",
  "Other": "bg-slate-100 text-slate-600",
};

export default function Accounting() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const { data, isLoading, error } = useQuery({
    queryKey: ["accounting", year],
    queryFn: () => fetchAccounting(year),
    staleTime: 1000 * 60 * 2,
  });

  const s = data?.summary ?? {};
  const netColor = (s.netProfit ?? 0) >= 0 ? "text-emerald-600" : "text-red-500";

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Accounting & Reports</h1>
          <p className="text-muted-foreground mt-1">Auto-generated financials — income, expenses, mileage, and 1099s in one place.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="h-9 px-3 rounded-lg border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 h-9 px-4 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted/60 transition-colors"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-20 text-muted-foreground animate-pulse">Loading {year} report…</div>
      )}
      {error && (
        <div className="text-center py-20 text-destructive">Failed to load report. Check that the API is running.</div>
      )}

      {data && (
        <>
          {/* P&L Summary Cards */}
          <div>
            <SectionHeader title="Profit & Loss Summary" sub={`Jan 1 – Dec 31, ${year}`} />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Gross Revenue" value={formatCurrency(s.grossRevenue)} sub="All invoices" icon={TrendingUp} color="bg-emerald-100 text-emerald-600" />
              <StatCard label="Collected" value={formatCurrency(s.paidRevenue)} sub="Paid invoices" icon={DollarSign} color="bg-blue-100 text-blue-600" />
              <StatCard label="Total Expenses" value={formatCurrency(s.totalExpenses)} sub={`+${formatCurrency(s.mileageDeduction)} mileage`} icon={TrendingDown} color="bg-red-100 text-red-600" />
              <div className={`bg-card border border-border rounded-2xl p-5 shadow-sm flex gap-4 items-start border-l-4 ${(s.netProfit ?? 0) >= 0 ? "border-l-emerald-500" : "border-l-red-500"}`}>
                <div className="min-w-0 w-full">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Est. Net Profit</p>
                  <p className={`text-2xl font-display font-bold ${netColor}`}>{formatCurrency(s.netProfit)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Collected − Expenses − Mileage</p>
                </div>
              </div>
            </div>

            {s.pendingRevenue > 0 && (
              <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formatCurrency(s.pendingRevenue)} is pending (sent/overdue) — not yet counted in net profit.</span>
              </div>
            )}
          </div>

          {/* Income by City */}
          <div>
            <SectionHeader
              title="Income by City / Location"
              sub="For KY local occupational tax filing"
            />
            {data.incomeByCity.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground text-sm">
                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-20" />
                No invoices with location data yet. Add a city to your invoices to see this report.
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                    <tr>
                      <th className="px-5 py-3 text-left">City</th>
                      <th className="px-5 py-3 text-left">State</th>
                      <th className="px-5 py-3 text-right">Invoices</th>
                      <th className="px-5 py-3 text-right">Gross Income</th>
                      <th className="px-5 py-3 text-right">Collected</th>
                      <th className="px-5 py-3 text-right">Tax Collected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {data.incomeByCity.map((row: any) => (
                      <tr key={`${row.city}-${row.state}`} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3 font-semibold text-foreground flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                          {row.city}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{row.state || "—"}</td>
                        <td className="px-5 py-3 text-right text-muted-foreground">{row.invoiceCount}</td>
                        <td className="px-5 py-3 text-right font-medium">{formatCurrency(row.gross)}</td>
                        <td className="px-5 py-3 text-right text-emerald-600 font-medium">{formatCurrency(row.paid)}</td>
                        <td className="px-5 py-3 text-right text-blue-600">{formatCurrency(row.taxCollected)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t border-border font-semibold text-sm">
                    <tr>
                      <td colSpan={3} className="px-5 py-3 text-foreground">Totals</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(data.incomeByCity.reduce((s: number, r: any) => s + r.gross, 0))}</td>
                      <td className="px-5 py-3 text-right text-emerald-600">{formatCurrency(data.incomeByCity.reduce((s: number, r: any) => s + r.paid, 0))}</td>
                      <td className="px-5 py-3 text-right text-blue-600">{formatCurrency(data.incomeByCity.reduce((s: number, r: any) => s + r.taxCollected, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Monthly Trend */}
          <div>
            <SectionHeader title="Monthly Income vs. Expenses" sub={String(year)} />
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                  <tr>
                    <th className="px-5 py-3 text-left">Month</th>
                    <th className="px-5 py-3 text-right">Gross Invoiced</th>
                    <th className="px-5 py-3 text-right">Collected</th>
                    <th className="px-5 py-3 text-right">Expenses</th>
                    <th className="px-5 py-3 text-right">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(data.monthlyIncome as any[]).filter((m: any) => m.gross > 0 || m.expenses > 0).map((m: any) => {
                    const net = m.paid - m.expenses;
                    const monthName = new Date(m.month + "-15").toLocaleString("default", { month: "long" });
                    return (
                      <tr key={m.month} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3 font-medium text-foreground">{monthName}</td>
                        <td className="px-5 py-3 text-right">{formatCurrency(m.gross)}</td>
                        <td className="px-5 py-3 text-right text-emerald-600">{formatCurrency(m.paid)}</td>
                        <td className="px-5 py-3 text-right text-red-500">{formatCurrency(m.expenses)}</td>
                        <td className={`px-5 py-3 text-right font-semibold ${net >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatCurrency(net)}</td>
                      </tr>
                    );
                  })}
                  {(data.monthlyIncome as any[]).every((m: any) => m.gross === 0 && m.expenses === 0) && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No data for {year}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Expenses by Category */}
          <div>
            <SectionHeader title="Expense Breakdown" sub="Schedule C categories" />
            {data.expensesByCategory.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground text-sm">
                <Receipt className="w-8 h-8 mx-auto mb-2 opacity-20" />
                No expenses recorded for {year}.
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                    <tr>
                      <th className="px-5 py-3 text-left">Category</th>
                      <th className="px-5 py-3 text-right">Transactions</th>
                      <th className="px-5 py-3 text-right">Total Amount</th>
                      <th className="px-5 py-3 text-right">% of Expenses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {data.expensesByCategory.map((cat: any) => {
                      const pct = s.totalExpenses > 0 ? (cat.amount / s.totalExpenses * 100).toFixed(1) : "0";
                      const colorClass = CATEGORY_COLORS[cat.category] ?? "bg-gray-100 text-gray-600";
                      return (
                        <tr key={cat.category} className="hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-3">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${colorClass}`}>{cat.category}</span>
                          </td>
                          <td className="px-5 py-3 text-right text-muted-foreground">{cat.count}</td>
                          <td className="px-5 py-3 text-right font-semibold text-foreground">{formatCurrency(cat.amount)}</td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-muted-foreground text-xs w-8 text-right">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t border-border font-semibold">
                    <tr>
                      <td className="px-5 py-3 text-foreground">Total</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{data.expensesByCategory.reduce((s: number, c: any) => s + c.count, 0)}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(s.totalExpenses)}</td>
                      <td className="px-5 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Mileage Deduction */}
          <div>
            <SectionHeader title="Mileage Deduction" sub={`IRS rate: $${s.mileageRate?.toFixed(3)}/mile`} />
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Business Miles" value={s.totalMiles?.toFixed(1) ?? "0"} sub="Tracked this year" icon={Navigation} color="bg-violet-100 text-violet-600" />
              <StatCard label="IRS Deduction" value={formatCurrency(s.mileageDeduction)} sub={`@ $${s.mileageRate?.toFixed(3)}/mi`} icon={DollarSign} color="bg-emerald-100 text-emerald-600" />
              <StatCard label="Sub Payments" value={formatCurrency(s.totalSubPayments)} sub="Total YTD" icon={HardHat} color="bg-orange-100 text-orange-600" />
            </div>
          </div>

          {/* 1099 / Subcontractors */}
          <div>
            <SectionHeader title="Subcontractor / 1099 Report" sub={`$600 threshold for ${year}`} />
            {data.subcontractor1099.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground text-sm">
                <HardHat className="w-8 h-8 mx-auto mb-2 opacity-20" />
                No subcontractors on file.
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                    <tr>
                      <th className="px-5 py-3 text-left">Subcontractor</th>
                      <th className="px-5 py-3 text-right">YTD Payments</th>
                      <th className="px-5 py-3 text-center">1099 Required</th>
                      <th className="px-5 py-3 text-center">W-9 on File</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {(data.subcontractor1099 as any[]).map((sub: any) => (
                      <tr key={sub.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3 font-medium text-foreground">{sub.name}</td>
                        <td className={`px-5 py-3 text-right font-semibold ${sub.requires1099 ? "text-amber-600" : "text-foreground"}`}>{formatCurrency(sub.ytdPayments)}</td>
                        <td className="px-5 py-3 text-center">
                          {sub.requires1099
                            ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700"><AlertCircle className="w-3 h-3" /> Yes — File 1099</span>
                            : <span className="text-muted-foreground text-xs">Not yet (${(sub.threshold - sub.ytdPayments).toFixed(0)} to go)</span>
                          }
                        </td>
                        <td className="px-5 py-3 text-center">
                          {sub.w9OnFile
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                            : <AlertCircle className="w-4 h-4 text-red-400 mx-auto" />
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center pb-4">
            This report is auto-generated from your invoices, expenses, mileage logs, and subcontractor records. Always verify with your accountant before filing.
          </p>
        </>
      )}
    </div>
  );
}
