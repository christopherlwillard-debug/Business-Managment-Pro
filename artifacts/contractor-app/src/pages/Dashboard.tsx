import { useState } from "react";
import { useGetDashboardStats, useListClients } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  Briefcase, DollarSign, Receipt, AlertTriangle, ArrowRight, ShieldAlert,
  CheckCircle2, Clock, TrendingUp, TrendingDown, CalendarClock, MapPin,
  Navigation, Phone, FileText, Sparkles,
} from "lucide-react";
import { Link, useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function useComplianceSummary() {
  return useQuery({
    queryKey: ["compliance-items-summary"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/compliance-items`);
      if (!res.ok) throw new Error("Failed to load compliance data");
      return res.json() as Promise<Array<{ id: number; title: string; dueDate: string; computedStatus: string; daysUntilDue: number }>>;
    },
    retry: 1,
  });
}

function useTodayRouteStops() {
  const today = getTodayStr();
  return useQuery({
    queryKey: ["route-stops-today", today],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/route-stops?date=${today}`);
      if (!res.ok) throw new Error("Failed to load route stops");
      return res.json() as Promise<Array<{
        id: number; title: string | null; address: string; status: string;
        clientName: string | null; prospectContactName: string | null;
      }>>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useFollowUpProspects() {
  const today = getTodayStr();
  return useQuery({
    queryKey: ["follow-up-prospects", today],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/prospects`);
      if (!res.ok) throw new Error("Failed to load prospects");
      const all = await res.json() as Array<{
        id: number; address: string; contactName: string | null;
        contactPhone: string | null; followUpDate: string | null; status: string;
      }>;
      return all.filter(p =>
        p.followUpDate &&
        p.followUpDate <= today &&
        p.status !== "lost"
      );
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useOverdueInvoicesList() {
  return useQuery({
    queryKey: ["overdue-invoices-list"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/invoices?status=overdue`);
      if (!res.ok) throw new Error("Failed to load overdue invoices");
      return res.json() as Promise<Array<{
        id: number; invoiceNumber: string; clientName: string | null;
        dueDate: string | null; total: number;
      }>>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function Dashboard() {
  const [period, setPeriod] = useState<"week" | "month" | "quarter" | "year">("month");
  const [, navigate] = useLocation();
  const { data: stats, isLoading } = useGetDashboardStats({ period });
  const { data: complianceItems = [], isError: complianceError, isLoading: complianceLoading } = useComplianceSummary();
  const { data: allClients = [] } = useListClients();
  const { data: todayStops = [], isLoading: stopsLoading } = useTodayRouteStops();
  const { data: followUpProspects = [], isLoading: followUpsLoading } = useFollowUpProspects();
  const { data: overdueInvoices = [], isLoading: overdueLoading } = useOverdueInvoicesList();

  const now = new Date();
  const in90 = new Date(now);
  in90.setDate(in90.getDate() + 90);
  const dueSoonClients = (allClients as any[])
    .filter(c => c.nextServiceDate)
    .map(c => ({ ...c, _dueDate: new Date(c.nextServiceDate) }))
    .filter(c => c._dueDate <= in90)
    .sort((a, b) => a._dueDate.getTime() - b._dueDate.getTime())
    .slice(0, 5);

  function formatDueDate(d: Date): string {
    const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
    if (diff < 0) return "Overdue";
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff <= 7) return `In ${diff} days`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const overdueCount = complianceItems.filter(i => i.computedStatus === "overdue").length;
  const dueSoonCount = complianceItems.filter(i => i.computedStatus === "due-soon").length;
  const completeCount = complianceItems.filter(i => i.computedStatus === "complete").length;
  const hasComplianceIssues = overdueCount > 0 || dueSoonCount > 0;

  const urgentComplianceItems = complianceItems.filter(
    i => i.computedStatus === "overdue" || (i.computedStatus === "due-soon" && i.daysUntilDue <= 7)
  );

  const periodLabels = { week: "WTD", month: "MTD", quarter: "QTD", year: "YTD" };
  const periodLabel = periodLabels[period];

  const todayFormatted = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const todayDataLoading = stopsLoading || followUpsLoading || overdueLoading || complianceLoading;
  const allClear =
    !todayDataLoading &&
    todayStops.length === 0 &&
    followUpProspects.length === 0 &&
    overdueInvoices.length === 0 &&
    urgentComplianceItems.length === 0;

  if (isLoading) {
    return <div className="flex items-center justify-center h-full animate-pulse text-muted-foreground">Loading dashboard...</div>;
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">

      {/* ── TODAY COMMAND CENTER ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Today</h1>
            <p className="text-sm text-muted-foreground">{todayFormatted}</p>
          </div>
        </div>

        {allClear ? (
          <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-emerald-50 border border-emerald-200">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">You're all caught up</p>
              <p className="text-xs text-emerald-600">No route stops, follow-ups, overdue invoices, or compliance items today.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            {/* Route Stops */}
            <div
              className={cn(
                "rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-shadow",
                todayStops.length > 0
                  ? "bg-blue-50 border-blue-200"
                  : "bg-muted/30 border-border"
              )}
              onClick={() => navigate("/route-planner")}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") navigate("/route-planner"); }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn("p-1.5 rounded-lg", todayStops.length > 0 ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground")}>
                    <Navigation className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">Route Today</span>
                </div>
                <span className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded-full",
                  todayStops.length > 0 ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"
                )}>
                  {todayStops.length} stop{todayStops.length !== 1 ? "s" : ""}
                </span>
              </div>
              {todayStops.length === 0 ? (
                <p className="text-xs text-muted-foreground">No stops scheduled for today</p>
              ) : (
                <div className="space-y-1 mt-2">
                  {todayStops.slice(0, 3).map(stop => (
                    <button
                      key={stop.id}
                      className="w-full flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-blue-100/60 transition-colors text-left"
                      onClick={e => { e.stopPropagation(); navigate("/route-planner"); }}
                    >
                      <MapPin className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {stop.clientName ?? stop.prospectContactName ?? stop.title ?? stop.address}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">{stop.address}</p>
                      </div>
                    </button>
                  ))}
                  {todayStops.length > 3 && (
                    <p className="text-[10px] text-blue-600 font-medium pl-2">+{todayStops.length - 3} more</p>
                  )}
                </div>
              )}
              <div className="mt-3 flex items-center text-[10px] font-semibold text-blue-600">
                Open Route Planner <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </div>

            {/* Follow-up Prospects */}
            <div
              className={cn(
                "rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-shadow",
                followUpProspects.length > 0
                  ? "bg-amber-50 border-amber-200"
                  : "bg-muted/30 border-border"
              )}
              onClick={() => navigate("/prospects")}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") navigate("/prospects"); }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn("p-1.5 rounded-lg", followUpProspects.length > 0 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground")}>
                    <Phone className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">Follow-ups</span>
                </div>
                <span className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded-full",
                  followUpProspects.length > 0 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"
                )}>
                  {followUpProspects.length} due
                </span>
              </div>
              {followUpProspects.length === 0 ? (
                <p className="text-xs text-muted-foreground">No follow-ups due today</p>
              ) : (
                <div className="space-y-1 mt-2">
                  {followUpProspects.slice(0, 3).map(p => (
                    <button
                      key={p.id}
                      className="w-full flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-amber-100/60 transition-colors text-left"
                      onClick={e => { e.stopPropagation(); navigate(`/prospects?openProspect=${p.id}`); }}
                    >
                      <Phone className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {p.contactName ?? p.address}
                        </p>
                        {p.contactName && (
                          <p className="text-[10px] text-muted-foreground truncate">{p.address}</p>
                        )}
                      </div>
                    </button>
                  ))}
                  {followUpProspects.length > 3 && (
                    <p className="text-[10px] text-amber-600 font-medium pl-2">+{followUpProspects.length - 3} more</p>
                  )}
                </div>
              )}
              <div className="mt-3 flex items-center text-[10px] font-semibold text-amber-600">
                Open Prospects <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </div>

            {/* Overdue Invoices */}
            <div
              className={cn(
                "rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-shadow",
                overdueInvoices.length > 0
                  ? "bg-red-50 border-red-200"
                  : "bg-muted/30 border-border"
              )}
              onClick={() => navigate("/accounting")}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") navigate("/accounting"); }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn("p-1.5 rounded-lg", overdueInvoices.length > 0 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground")}>
                    <FileText className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">Overdue Invoices</span>
                </div>
                <span className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded-full",
                  overdueInvoices.length > 0 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"
                )}>
                  {overdueInvoices.length} overdue
                </span>
              </div>
              {overdueInvoices.length === 0 ? (
                <p className="text-xs text-muted-foreground">No overdue invoices</p>
              ) : (
                <div className="space-y-1 mt-2">
                  {overdueInvoices.slice(0, 3).map(inv => (
                    <button
                      key={inv.id}
                      className="w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-red-100/60 transition-colors text-left"
                      onClick={e => { e.stopPropagation(); navigate(`/invoices?openInvoice=${inv.id}`); }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">
                          #{inv.invoiceNumber}{inv.clientName ? ` · ${inv.clientName}` : ""}
                        </p>
                        {inv.dueDate && (
                          <p className="text-[10px] text-red-500 font-medium">Due {inv.dueDate}</p>
                        )}
                      </div>
                      <p className="text-xs font-bold text-red-700 flex-shrink-0">{formatCurrency(inv.total)}</p>
                    </button>
                  ))}
                  {overdueInvoices.length > 3 && (
                    <p className="text-[10px] text-red-600 font-medium pl-2">+{overdueInvoices.length - 3} more</p>
                  )}
                </div>
              )}
              <div className="mt-3 flex items-center text-[10px] font-semibold text-red-600">
                Open Invoices <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </div>

            {/* Compliance Alerts */}
            <div
              className={cn(
                "rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-shadow",
                urgentComplianceItems.length > 0
                  ? "bg-orange-50 border-orange-200"
                  : "bg-muted/30 border-border"
              )}
              onClick={() => navigate("/accounting?tab=tax-calendar")}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") navigate("/accounting?tab=tax-calendar"); }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn("p-1.5 rounded-lg", urgentComplianceItems.length > 0 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground")}>
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">Compliance</span>
                </div>
                <span className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded-full",
                  urgentComplianceItems.length > 0 ? "bg-orange-100 text-orange-700" : "bg-emerald-100 text-emerald-700"
                )}>
                  {urgentComplianceItems.length > 0 ? `${urgentComplianceItems.length} urgent` : "All clear"}
                </span>
              </div>
              {complianceLoading ? (
                <p className="text-xs text-muted-foreground animate-pulse">Loading…</p>
              ) : urgentComplianceItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">No filings due within 7 days</p>
              ) : (
                <div className="space-y-1 mt-2">
                  {urgentComplianceItems.slice(0, 3).map(item => (
                    <button
                      key={item.id}
                      className="w-full flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-orange-100/60 transition-colors text-left"
                      onClick={e => { e.stopPropagation(); navigate("/accounting?tab=tax-calendar"); }}
                    >
                      <p className="text-xs font-medium text-foreground truncate flex-1">{item.title}</p>
                      <span className={cn(
                        "text-[10px] font-bold flex-shrink-0",
                        item.computedStatus === "overdue" ? "text-red-600" : "text-orange-600"
                      )}>
                        {item.computedStatus === "overdue" ? "Overdue" : `${item.daysUntilDue}d`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center text-[10px] font-semibold text-orange-600">
                Open Compliance <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ── BUSINESS OVERVIEW ── */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-display font-bold text-foreground">Business Overview</h2>
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
          <MetricCard title={`Collected (${periodLabel})`} value={formatCurrency(stats.totalRevenue)} icon={DollarSign} href="/accounting" />
          <MetricCard title={`Total Expenses (${periodLabel})`} value={formatCurrency(stats.totalExpenses)} icon={Receipt} href="/expenses" />
          <MetricCard title="Active Jobs" value={stats.activeJobs.toString()} icon={Briefcase} href="/jobs" />
          <MetricCard title="Overdue Invoices" value={stats.overdueInvoices.toString()} icon={AlertTriangle} isAlert={stats.overdueInvoices > 0} href="/accounting" />
        </div>
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

      {/* Compliance Summary Widget */}
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

      {/* Due for Revisit widget */}
      {dueSoonClients.length > 0 && (
        <Card className="shadow-md border-border/50 border-l-4 border-l-amber-400">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
                  <CalendarClock className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">Due for Revisit</p>
                  <p className="text-xs text-muted-foreground">{dueSoonClients.length} client{dueSoonClients.length !== 1 ? "s" : ""} due within 90 days</p>
                </div>
              </div>
              <Link href={`${BASE}/clients`} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="space-y-2">
              {dueSoonClients.map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    {(c.address || c.city) && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        {[c.address, c.city, c.state].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="text-right ml-3 flex-shrink-0">
                    <p className={cn(
                      "text-xs font-semibold",
                      c._dueDate < now ? "text-red-600" :
                      Math.round((c._dueDate.getTime() - now.getTime()) / 86400000) <= 14 ? "text-amber-600" :
                      "text-muted-foreground"
                    )}>
                      {formatDueDate(c._dueDate)}
                    </p>
                    {c.serviceIntervalMonths && (
                      <p className="text-[10px] text-muted-foreground">every {c.serviceIntervalMonths}mo</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
