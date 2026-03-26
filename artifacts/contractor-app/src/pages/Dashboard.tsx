import { useGetDashboardStats } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Briefcase, DollarSign, Receipt, AlertTriangle, ArrowRight, ShieldAlert, CheckCircle2, Clock } from "lucide-react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function useComplianceSummary() {
  return useQuery({
    queryKey: ["compliance-items-summary"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/compliance-items`);
      if (!res.ok) return [];
      return res.json() as Promise<Array<{ computedStatus: string }>>;
    },
  });
}

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats({ period: "month" });
  const { data: complianceItems = [] } = useComplianceSummary();

  const overdueCount = complianceItems.filter(i => i.computedStatus === "overdue").length;
  const dueSoonCount = complianceItems.filter(i => i.computedStatus === "due-soon").length;
  const completeCount = complianceItems.filter(i => i.computedStatus === "complete").length;
  const hasComplianceIssues = overdueCount > 0 || dueSoonCount > 0;

  if (isLoading) {
    return <div className="flex items-center justify-center h-full animate-pulse text-muted-foreground">Loading dashboard...</div>;
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-3xl font-display font-bold text-foreground">Business Overview</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Revenue (MTD)" value={formatCurrency(stats.totalRevenue)} icon={DollarSign} trend="+12.5%" />
        <MetricCard title="Total Expenses (MTD)" value={formatCurrency(stats.totalExpenses)} icon={Receipt} trend="-2.4%" />
        <MetricCard title="Active Jobs" value={stats.activeJobs.toString()} icon={Briefcase} trend="+2" />
        <MetricCard title="Overdue Invoices" value={stats.overdueInvoices.toString()} icon={AlertTriangle} isAlert={stats.overdueInvoices > 0} />
      </div>

      {/* Compliance Summary Widget — always visible */}
      <Card className={`shadow-md border-border/50 ${hasComplianceIssues ? "border-l-4 border-l-amber-400" : "border-l-4 border-l-emerald-400"}`}>
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${hasComplianceIssues ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Compliance Status</p>
                {hasComplianceIssues ? (
                  <p className="text-xs text-muted-foreground mt-0.5">Action needed — check your compliance items</p>
                ) : (
                  <p className="text-xs text-emerald-600 font-medium mt-0.5">All clear — no issues requiring attention</p>
                )}
              </div>
            </div>
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
              <Link href="/compliance" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline ml-1">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
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

        <div className="space-y-6">
          <Card className="shadow-md border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-display text-lg">Recent Jobs</CardTitle>
              <Link href="/jobs" className="text-sm text-accent hover:underline flex items-center">View All <ArrowRight className="w-4 h-4 ml-1"/></Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats.recentJobs.slice(0, 4).map(job => (
                  <div key={job.id} className="flex justify-between items-center border-b border-border/40 pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium text-sm">{job.title}</p>
                      <p className="text-xs text-muted-foreground">{job.clientName || 'No Client'}</p>
                    </div>
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary">
                      {job.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <Card className="shadow-md border-border/50 bg-accent/5 border-accent/20">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg text-accent-foreground">Tax Deductions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-1">YTD Mileage Deduction</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.mileageDeduction)}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, trend, isAlert }: any) {
  return (
    <Card className="shadow-md border-border/50 hover:shadow-lg transition-shadow duration-300">
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
        {trend && (
          <div className="mt-4 flex items-center text-sm">
            <span className={cn("font-medium", trend.startsWith('+') ? "text-emerald-600" : "text-rose-600")}>
              {trend}
            </span>
            <span className="text-muted-foreground ml-2">vs last month</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
