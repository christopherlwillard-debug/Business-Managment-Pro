import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, DollarSign, MapPin, Receipt,
  Navigation, HardHat, FileSpreadsheet, Printer, AlertCircle, CheckCircle2,
  Download, FileText, BarChart3, AlertTriangle
} from "lucide-react";
import { useScheduleCReport, useAllSubcontractorsPayments, useCreatePayment, useUpdatePayment, useDeletePayment, type Payment } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function downloadCSV(records: any[], year: number) {
  const headers = ["Invoice #", "Date", "Client", "City", "State", "Subtotal", "Tax Collected", "Total", "Status"];
  const rows = records.map((r: any) => [
    r.invoiceNumber ?? "",
    r.issueDate ?? "",
    r.clientName ?? "",
    r.city ?? "",
    r.state ?? "",
    r.subtotal?.toFixed(2) ?? "0.00",
    r.taxAmount?.toFixed(2) ?? "0.00",
    r.total?.toFixed(2) ?? "0.00",
    r.status ?? "",
  ]);
  const csvContent = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tax-records-${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

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
  const [activeTab, setActiveTab] = useState<"accounting" | "schedule-c">("accounting");
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const { data, isLoading, error } = useQuery({
    queryKey: ["accounting", year],
    queryFn: () => fetchAccounting(year),
    staleTime: 1000 * 60 * 2,
  });

  const { data: report, isLoading: reportLoading } = useScheduleCReport(year);
  const { data: subPayments } = useAllSubcontractorsPayments(year);
  const createPayment = useCreatePayment();
  const updatePayment = useUpdatePayment();
  const deletePayment = useDeletePayment();

  const s = data?.summary ?? {};
  const netColor = (s.netProfit ?? 0) >= 0 ? "text-emerald-600" : "text-red-500";

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Accounting & Tax Reports</h1>
          <p className="text-muted-foreground mt-1">Auto-generated financials — income, expenses, mileage, Schedule C, and 1099s in one place.</p>
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

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab("accounting")}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            activeTab === "accounting"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 inline mr-2" /> Accounting Report
        </button>
        <button
          onClick={() => setActiveTab("schedule-c")}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            activeTab === "schedule-c"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 className="w-4 h-4 inline mr-2" /> Schedule C
        </button>
      </div>

      {activeTab === "accounting" && (
        <>
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

          {/* Tax Records Spreadsheet */}
          <div>
            <div className="flex items-start justify-between mb-4">
              <div>
                <SectionHeader title="Tax Records — All Invoices" sub={`Full ledger for ${year} — export for city occupational tax filings`} />
              </div>
              <button
                onClick={() => data.invoiceRecords?.length > 0 && downloadCSV(data.invoiceRecords, year)}
                disabled={!data.invoiceRecords?.length}
                className="flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow transition-colors disabled:opacity-40 flex-shrink-0"
              >
                <Download className="w-4 h-4" /> Download CSV
              </button>
            </div>
            {(!data.invoiceRecords || data.invoiceRecords.length === 0) ? (
              <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground text-sm">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                No invoices found for {year}. Create invoices with a city to populate this report.
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left">Invoice #</th>
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">Client</th>
                        <th className="px-4 py-3 text-left">City</th>
                        <th className="px-4 py-3 text-left">State</th>
                        <th className="px-4 py-3 text-right">Subtotal</th>
                        <th className="px-4 py-3 text-right">Tax</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {(data.invoiceRecords as any[]).map((r: any, i: number) => (
                        <tr key={i} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-xs text-foreground font-semibold">{r.invoiceNumber}</td>
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{r.issueDate}</td>
                          <td className="px-4 py-2.5 font-medium text-foreground">{r.clientName || "—"}</td>
                          <td className="px-4 py-2.5">
                            {r.city ? (
                              <span className="inline-flex items-center gap-1 text-primary font-medium">
                                <MapPin className="w-3 h-3 flex-shrink-0" />{r.city}
                              </span>
                            ) : <span className="text-muted-foreground italic text-xs">No city</span>}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{r.state || "—"}</td>
                          <td className="px-4 py-2.5 text-right">{formatCurrency(r.subtotal)}</td>
                          <td className="px-4 py-2.5 text-right text-blue-600">{r.taxAmount > 0 ? formatCurrency(r.taxAmount) : "—"}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-foreground">{formatCurrency(r.total)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                              r.status === "paid" ? "bg-emerald-100 text-emerald-700" :
                              r.status === "sent" ? "bg-blue-100 text-blue-700" :
                              r.status === "overdue" ? "bg-red-100 text-red-700" :
                              "bg-gray-100 text-gray-600"
                            }`}>{r.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30 border-t-2 border-border font-semibold text-sm">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-foreground">{data.invoiceRecords.length} invoice{data.invoiceRecords.length !== 1 ? "s" : ""}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency((data.invoiceRecords as any[]).reduce((s: number, r: any) => s + r.subtotal, 0))}</td>
                        <td className="px-4 py-3 text-right text-blue-600">{formatCurrency((data.invoiceRecords as any[]).reduce((s: number, r: any) => s + r.taxAmount, 0))}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency((data.invoiceRecords as any[]).reduce((s: number, r: any) => s + r.total, 0))}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    <strong>KY Occupational Tax tip:</strong> Use the City and Tax columns to determine which city jurisdictions you owe local occupational tax to. Download the CSV to attach to your city tax filings.
                  </p>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center pb-4">
            This report is auto-generated from your invoices, expenses, mileage logs, and subcontractor records. Always verify with your accountant before filing.
          </p>
            </>
          )}
        </>
      )}

      {/* Schedule C Tab */}
      {activeTab === "schedule-c" && (
        <>
          {reportLoading && (
            <div className="text-center py-20 text-muted-foreground animate-pulse">Loading Schedule C…</div>
          )}

          {report && (
            <>
              {/* Export Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!report) return;
                    const csvContent = `Schedule C - Tax Year ${report.year}\nGenerated: ${new Date().toLocaleDateString()}\n\nLine,Description,Amount\n1,Gross receipts or sales,"$${report.grossReceipts.toFixed(2)}"\n${report.scheduleLines
                      .filter(l => l.line > 1)
                      .map(line => `${line.line},"${line.description}","$${line.amount.toFixed(2)}"`)
                      .join("\n")}\n\nData Quality Check\nUncategorized Expenses,${report.dataQuality.uncategorizedExpenses}\nDraft Invoices,${report.dataQuality.invoicesDraft}`;
                    const blob = new Blob([csvContent], { type: "text/csv" });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `Schedule_C_${year}.csv`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                  }}
                  className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm transition-all border border-border"
                >
                  <Download className="w-4 h-4 mr-2" /> CSV Export
                </button>
                <button
                  onClick={() => {
                    if (!report) return;
                    let htmlContent = `
                      <html>
                        <head>
                          <title>Schedule C - Tax Year ${report.year}</title>
                          <style>
                            body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
                            h1 { text-align: center; font-size: 18px; margin-bottom: 30px; }
                            .form-line { display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
                            .line-number { font-weight: bold; width: 40px; }
                            .line-description { flex: 1; margin: 0 20px; }
                            .line-amount { width: 120px; text-align: right; }
                          </style>
                        </head>
                        <body>
                          <h1>SCHEDULE C (FORM 1040) - PROFIT OR LOSS FROM BUSINESS</h1>
                          <p style="text-align: center;">Tax Year ${report.year}</p>
                          ${report.scheduleLines
                            .map(
                              line => `
                            <div class="form-line">
                              <span class="line-number">Line ${line.line}</span>
                              <span class="line-description">${line.description}</span>
                              <span class="line-amount">$${line.amount.toFixed(2)}</span>
                            </div>
                          `
                            )
                            .join("")}
                        </body>
                      </html>
                    `;
                    const printWindow = window.open("", "", "width=800,height=600");
                    if (printWindow) {
                      printWindow.document.write(htmlContent);
                      printWindow.document.close();
                      setTimeout(() => printWindow.print(), 250);
                    }
                  }}
                  className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all"
                >
                  <FileText className="w-4 h-4 mr-2" /> PDF Print
                </button>
              </div>

              {/* Data Quality Warnings */}
              {report.dataQuality.warnings.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-medium text-amber-900">Data Quality Warnings</p>
                      {report.dataQuality.warnings.map((warning, i) => (
                        <p key={i} className="text-sm text-amber-800">• {warning}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Schedule C Summary */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-muted/50 px-6 py-4 border-b border-border">
                  <h2 className="text-lg font-display font-bold text-foreground">Schedule C Summary</h2>
                </div>
                <div className="p-6 space-y-3">
                  {report.scheduleLines.map((line, idx) => (
                    <div
                      key={idx}
                      className={`flex justify-between items-center py-2 ${
                        [1, 28, 29].includes(line.line) ? "border-t border-border pt-3 font-semibold" : ""
                      } ${[28, 29].includes(line.line) ? "bg-muted/30 px-3 rounded" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-sm text-muted-foreground w-8">Line {line.line}</span>
                        <span className="text-foreground">{line.description}</span>
                      </div>
                      <span className="text-lg font-semibold text-primary">{formatCurrency(line.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mileage Data */}
              {report.mileageData.logCount > 0 && (
                <div className="bg-card border border-border rounded-2xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Business Mileage Deduction</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Business Miles</p>
                      <p className="text-2xl font-bold text-foreground">{report.mileageData.totalBusinessMiles.toFixed(0)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Rate per Mile</p>
                      <p className="text-2xl font-bold text-foreground">${report.mileageData.ratePerMile.toFixed(3)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Deduction Amount</p>
                      <p className="text-2xl font-bold text-primary">{formatCurrency(report.mileageData.deduction)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Logs Recorded</p>
                      <p className="text-2xl font-bold text-foreground">{report.mileageData.logCount}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Subcontractor Payments */}
              {subPayments && subPayments.subcontractors.length > 0 && (
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-muted/50 px-6 py-4 border-b border-border flex justify-between items-center">
                    <h2 className="text-lg font-display font-bold text-foreground">Subcontractor Payments</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                        <tr>
                          <th className="px-6 py-3">Subcontractor</th>
                          <th className="px-6 py-3 text-right">Total Payments</th>
                          <th className="px-6 py-3 text-center">Payment Count</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {subPayments.subcontractors.map(sub => (
                          <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-4 font-medium text-foreground">{sub.name}</td>
                            <td className="px-6 py-4 text-right font-semibold text-primary">{formatCurrency(sub.totalPayments)}</td>
                            <td className="px-6 py-4 text-center text-muted-foreground">{sub.paymentCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-900 mb-1">⚠️ Tax Disclaimer</p>
                    <p className="text-sm text-blue-800">
                      This Schedule C summary is for informational purposes only and does not constitute tax advice. 
                      Please consult with a qualified tax professional or CPA before filing. BuildPro is not responsible 
                      for tax filing accuracy or penalties resulting from incomplete or incorrect information.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
