import { useState } from "react";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Briefcase, DollarSign, Receipt, AlertTriangle, ArrowRight, ShieldAlert, CheckCircle2, Clock, TrendingUp, TrendingDown } from "lucide-react";
import { Link, useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function useComplianceSummary() {
  return useQuery({
    queryKey: ["compliance-items-summary"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/compliance-items`);
      if (!res.ok) throw new Error("Failed to load compliance data");
      return res.json() as Promise<Array<{ computedStatus: string }>>;
    },
    retry: 1,
  });
}

export default function Dashboard() {
  const [period, setPeriod] = useState<"week" | "month" | "quarter" | "year">("month");
  const [, navigate] = useLocation();
  const { data: stats, isLoading } = useGetDashboardStats({ period });
  const { data: complianceItems = [], isError: complianceError, isLoading: complianceLoading } = useComplianceSummary();

  const overdueCount = complianceItems.filter(i => i.computedStatus === "overdue").length;
  const dueSoonCount = complianceItems.filter(i => i.computedStatus === "due-soon").length;
  const completeCount = complianceItems.filter(i => i.computedStatus === "complete").length;
  const hasComplianceIssues = overdueCount > 0 || dueSoonCount > 0;

  const periodLabels = { week: "WTD", month: "MTD", quarter: "QTD", year: "YTD" };
  const periodLabel = periodLabels[period];

  if (isLoading) {
    return <div className="flex items-center justify-center h-full animate-pulse text-muted-foreground">Loading dashboard...</div>;
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-3xl font-display font-bold text-foreground">Business Overview</h1>
        <div className="flex gap-2 bg-muted/40 rounded-lg p-1">
          {(["week", "month", "quarter", "year"] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title={`Total Revenue (${periodLabel})`} value={formatCurrency(stats.totalRevenue)} icon={DollarSign} href="/accounting" />
        <MetricCard title={`Total Expenses (${periodLabel})`} value={formatCurrency(stats.totalExpenses)} icon={Receipt} href="/expenses" />
        <MetricCard title="Active Jobs" value={stats.activeJobs.toString()} icon={Briefcase} href="/jobs" />
        <MetricCard title="Overdue Invoices" value={stats.overdueInvoices.toString()} icon={AlertTriangle} isAlert={stats.overdueInvoices > 0} href="/accounting" />
      </div>

      {/* Operational Net Profit card */}
      {stats.operationalNetProfit !== undefined && (
        <NetProfitCard
          operationalNetProfit={stats.operationalNetProfit}
          excludedFromProfit={stats.excludedFromProfit ?? 0}
          excludedCount={stats.excludedExpenseCount ?? 0}
          periodLabel={periodLabel}
        />
      )}

      {/* Compliance Summary Widget — always visible */}
      <Card
        role="button"
        tabIndex={0}
        onClick={() => navigate("/accounting?tab=tax-calendar")}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/accounting?tab=tax-calendar"); }}
        className={`shadow-md border-border/50 cursor-pointer transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          complianceError ? "border-l-4 border-l-muted-foreground/40" :
          hasComplianceIssues ? "border-l-4 border-l-amber-400" :
          "border-l-4 border-l-emerald-400"
        }`}
      >
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${
                complianceError ? "bg-muted text-muted-foreground" :
                hasComplianceIssues ? "bg-amber-100 text-amber-700" :
                "bg-emerald-100 text-emerald-700"
              }`}>
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Compliance Status</p>
                {complianceLoading ? (
                  <p className="text-xs text-muted-foreground mt-0.5 animate-pulse">Loading…</p>
                ) : complianceError ? (
                  <p className="text-xs text-muted-foreground mt-0.5">Unable to load compliance data</p>
                ) : hasComplianceIssues ? (
                  <p className="text-xs text-muted-foreground mt-0.5">Action needed — check your compliance items</p>
                ) : (
                  <p className="text-xs text-emerald-600 font-medium mt-0.5">All clear — no issues requiring attention</p>
                )}
              </div>
            </div>
            {!complianceLoading && !complianceError && (
              <div className="flex items-center gap-3 flex-wrap">
                {overdueCount > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 border border-red-200">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    <span className="text-xs font-bold text-red-700">{overdueCount} Overdue</span>
                  </div>
                )}
                {dueSoonCount > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 border border-amber-200">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-xs font-bold text-amber-700">{dueSoonCount} Due Soon</span>
                  </div>
                )}
                {!hasComplianceIssues && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-700">
                      {completeCount > 0 ? `${completeCount} Complete` : "No issues"}
                    </span>
                  </div>
                )}
                <span className="flex items-center gap-1 text-xs font-semibold text-primary ml-1">
                  View All <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            )}
            {(complianceLoading || complianceError) && (
              <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-md border-border/50">
          <CardHeader>
            <CardTitle className="font-display">Revenue vs Expenses (6 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthlyRevenue} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(val) => `$${val/1000}k`} />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted)/0.4)' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Link href="/mileage" className="block group">
          <Card className="shadow-md border-border/50 bg-accent/5 border-accent/20 hover:shadow-lg transition-all duration-300 cursor-pointer hover:border-accent/40">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg text-accent-foreground">Tax Deductions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-0.5">YTD Mileage Deduction</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.mileageDeduction)}</p>
              <div className="mt-3 pt-3 border-t border-accent/20 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Business Miles</p>
                  <p className="text-base font-semibold text-foreground">{(stats.ytdMiles ?? 0).toFixed(0)} mi</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">IRS Rate</p>
                  <p className="text-base font-semibold text-foreground">${(stats.ytdMileageRate ?? 0.70).toFixed(2)}/mi</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Mileage deduction only — Schedule C Line 9 may include additional car/truck expenses.</p>
              <div className="mt-3 flex items-center text-xs font-semibold text-accent-foreground/60 group-hover:text-accent-foreground transition-colors">
                View details <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function NetProfitCard({ operationalNetProfit, excludedFromProfit, excludedCount, periodLabel }: {
  operationalNetProfit: number;
  excludedFromProfit: number;
  excludedCount: number;
  periodLabel: string;
}) {
  const isPositive = operationalNetProfit >= 0;
  return (
    <Card className={`shadow-md border-border/50 border-l-4 ${isPositive ? "border-l-emerald-500" : "border-l-red-500"}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Net Profit — Operational ({periodLabel})</p>
            <p className={cn("text-3xl font-display font-bold tracking-tight mt-1", isPositive ? "text-emerald-600" : "text-red-600")}>
              {formatCurrency(operationalNetProfit)}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5">
              Revenue minus operational expenses
              {excludedCount > 0 ? (
                <span className="ml-1 text-amber-600 font-medium">
                  · {excludedCount} write-off{excludedCount !== 1 ? "s" : ""} excluded ({formatCurrency(excludedFromProfit)})
                </span>
              ) : (
                <span className="ml-1 text-muted-foreground/70">· No write-offs excluded</span>
              )}
            </p>
          </div>
          <div className={cn("p-3 rounded-xl flex-shrink-0", isPositive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
            {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          </div>
        </div>
        {excludedCount > 0 && (
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
            Total expenses including write-offs would be <span className="font-semibold">{formatCurrency(operationalNetProfit - excludedFromProfit)}</span> net profit
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({ title, value, icon: Icon, isAlert, href }: {
  title: string;
  value: string;
  icon: React.ElementType;
  isAlert?: boolean;
  href?: string;
}) {
  const inner = (
    <CardContent className="p-6">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className={cn("text-3xl font-display font-bold tracking-tight", isAlert ? "text-destructive" : "text-foreground")}>
            {value}
          </p>
        </div>
        <div className={cn("p-3 rounded-xl", isAlert ? "bg-destructive/10 text-destructive" : "bg-primary/5 text-primary")}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {href && (
        <div className="mt-4 flex items-center text-xs font-semibold text-primary/60 group-hover:text-primary transition-colors">
          View details <ArrowRight className="w-3 h-3 ml-1" />
        </div>
      )}
    </CardContent>
  );

  if (href) {
    return (
      <Link href={href}>
        <Card className="shadow-md border-border/50 hover:shadow-lg transition-all duration-300 cursor-pointer group hover:border-primary/20">
          {inner}
        </Card>
      </Link>
    );
  }

  return (
    <Card className="shadow-md border-border/50 hover:shadow-lg transition-shadow duration-300">
      {inner}
    </Card>
  );
}
