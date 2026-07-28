import React, { useState } from "react";
import { useGetDashboardStats, useListClients, useGetSettings } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBusiness, type Business } from "@/contexts/BusinessContext";
import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  Briefcase, DollarSign, Receipt, AlertTriangle, ArrowRight, ShieldAlert,
  CheckCircle2, Clock, TrendingUp, TrendingDown, CalendarClock, MapPin,
  Navigation, Phone, FileText, Sparkles, HardHat, Wallet, Plus,
} from "lucide-react";
import { Link, useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CARD_COLORS: Record<string, { border: string; header: string; text: string }> = {
  general_contracting: { border: "border-blue-200",    header: "bg-blue-50",    text: "text-blue-700"    },
  asphalt_sealing:     { border: "border-amber-200",   header: "bg-amber-50",   text: "text-amber-700"   },
  real_estate:         { border: "border-emerald-200", header: "bg-emerald-50", text: "text-emerald-700" },
};
const DEFAULT_CARD_COLORS = { border: "border-gray-200", header: "bg-gray-50", text: "text-gray-700" };

function BusinessStatsCard({ business, period }: { business: Business; period: "week"|"month"|"quarter"|"year" }) {
  const { data: stats, isLoading } = useGetDashboardStats({ period, businessLine: business.slug as any });
  const colors = CARD_COLORS[business.type] ?? CARD_COLORS[business.slug] ?? DEFAULT_CARD_COLORS;
  if (isLoading) return <div className={`rounded-xl border ${colors.border} overflow-hidden animate-pulse h-40`} />;
  if (!stats) return null;
  const net = (stats as any).operationalNetProfit ?? (stats.totalRevenue - stats.totalExpenses);
  return (
    <div className={`rounded-xl border ${colors.border} overflow-hidden`}>
      <div className={`px-4 py-2.5 ${colors.header}`}>
        <p className={`font-semibold text-sm ${colors.text}`}>{business.name}</p>
      </div>
      <div className="p-4 grid grid-cols-2 gap-3">
        <div><p className="text-xs text-muted-foreground mb-0.5">Revenue</p><p className="font-bold text-foreground text-sm">{formatCurrency(stats.totalRevenue)}</p></div>
        <div><p className="text-xs text-muted-foreground mb-0.5">Expenses</p><p className="font-bold text-foreground text-sm">{formatCurrency((stats as any).businessExpenses ?? stats.totalExpenses)}</p></div>
        <div><p className="text-xs text-muted-foreground mb-0.5">Active Jobs</p><p className="font-bold text-foreground text-sm">{stats.activeJobs}</p></div>
        <div><p className="text-xs text-muted-foreground mb-0.5">Net Profit</p><p className={`font-bold text-sm ${net >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatCurrency(net)}</p></div>
      </div>
    </div>
  );
}

function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface DashboardToday {
  complianceItems: Array<{ id: number; title: string; dueDate: string; computedStatus: string; daysUntilDue: number }>;
  routeStops: Array<{ id: number; title: string | null; address: string; status: string; clientName: string | null; prospectContactName: string | null }>;
  followUpProspects: Array<{ id: number; address: string; contactName: string | null; contactPhone: string | null; followUpDate: string | null; status: string }>;
  overdueInvoices: Array<{ id: number; invoiceNumber: string; clientName: string | null; dueDate: string | null; total: number }>;
}

function useDashboardToday() {
  const today = getTodayStr();
  return useQuery<DashboardToday>({
    queryKey: ["dashboard-today", today],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/dashboard/today`);
      if (!res.ok) throw new Error("Failed to load dashboard data");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

interface TaxAlertQuarter {
  quarter: number;
  label: string;
  period: string;
  federalDueDate: string;
  federalDueDateLabel: string;
  safeHarborTotal: number;
  recommendedTotal: number;
  totalPaid: number;
  status: "paid" | "partial" | "due" | "overdue";
}

function useTaxAlerts() {
  const year = new Date().getFullYear();
  return useQuery({
    queryKey: ["tax-alerts-dashboard", year],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/estimated-tax-payments?year=${year}`);
      if (!res.ok) throw new Error("Failed to load tax data");
      const data = await res.json() as { quarters: TaxAlertQuarter[] };
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const in14 = new Date(today);
      in14.setDate(in14.getDate() + 14);
      return data.quarters.filter(q => {
        if (q.status === "paid") return false;
        const due = new Date(q.federalDueDate + "T00:00:00");
        return due <= in14;
      });
    },
    staleTime: 10 * 60 * 1000,
  });
}

export default function Dashboard() {
  const [period, setPeriod] = useState<"week" | "month" | "quarter" | "year">("month");
  const { activeBusiness, hasSelection, businesses } = useBusiness();
  const [localBLFilter, setLocalBLFilter] = useState<string>("");
  const businessLine = activeBusiness ? activeBusiness.slug : localBLFilter;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: stats, isLoading } = useGetDashboardStats({ period, businessLine: (businessLine || undefined) as any });
  const { data: todayData, isLoading: todayLoading } = useDashboardToday();
  const complianceItems = todayData?.complianceItems ?? [];
  const todayStops = todayData?.routeStops ?? [];
  const followUpProspects = todayData?.followUpProspects ?? [];
  const overdueInvoices = todayData?.overdueInvoices ?? [];
  const { data: allClients = [] } = useListClients();
  const { data: taxAlerts = [], isLoading: taxAlertsLoading } = useTaxAlerts();
  const { data: appSettings } = useGetSettings();
  const annualOnly = (appSettings as any)?.taxFilingFrequency === "annual";

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

  const todayDataLoading = todayLoading || taxAlertsLoading;
  const allClear =
    !todayDataLoading &&
    todayStops.length === 0 &&
    followUpProspects.length === 0 &&
    overdueInvoices.length === 0 &&
    urgentComplianceItems.length === 0 &&
    (annualOnly || taxAlerts.length === 0);

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

            {/* Route Stops — only shown when there are stops today */}
            {todayStops.length > 0 && (
            <div
              className="rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-shadow bg-blue-50 border-blue-200"
              onClick={() => navigate("/route-planner")}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") navigate("/route-planner"); }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                    <Navigation className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">Route Today</span>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  {todayStops.length} stop{todayStops.length !== 1 ? "s" : ""}
                </span>
              </div>
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
              <div className="mt-3 flex items-center text-[10px] font-semibold text-blue-600">
                Open Route Planner <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </div>
            )}

            {/* Follow-up Prospects — only shown when there are follow-ups due */}
            {followUpProspects.length > 0 && (
            <div
              className="rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-shadow bg-amber-50 border-amber-200"
              onClick={() => navigate("/prospects")}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") navigate("/prospects"); }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700">
                    <Phone className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">Follow-ups</span>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {followUpProspects.length} due
                </span>
              </div>
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
              <div className="mt-3 flex items-center text-[10px] font-semibold text-amber-600">
                Open Prospects <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </div>
            )}

            {/* Overdue Invoices — only shown when there are overdue invoices */}
            {overdueInvoices.length > 0 && (
            <div
              className="rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-shadow bg-red-50 border-red-200"
              onClick={() => navigate("/accounting")}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") navigate("/accounting"); }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-red-100 text-red-700">
                    <FileText className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">Overdue Invoices</span>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  {overdueInvoices.length} overdue
                </span>
              </div>
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
              <div className="mt-3 flex items-center text-[10px] font-semibold text-red-600">
                Open Invoices <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </div>
            )}

            {/* Compliance Alerts — only shown when there are urgent items */}
            {urgentComplianceItems.length > 0 && (
            <div
              className="rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-shadow bg-orange-50 border-orange-200"
              onClick={() => navigate("/accounting?tab=tax-calendar")}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") navigate("/accounting?tab=tax-calendar"); }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-orange-100 text-orange-700">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">Compliance</span>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                  {urgentComplianceItems.length} urgent
                </span>
              </div>
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
              <div className="mt-3 flex items-center text-[10px] font-semibold text-orange-600">
                Open Compliance <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </div>
            )}

            {/* Tax Payment Alerts — hidden in annual filing mode */}
            {!annualOnly && taxAlerts.length > 0 && (() => {
              const hasOverdue = taxAlerts.some(q => q.status === "overdue");
              const colorScheme = hasOverdue
                ? { bg: "bg-red-50", border: "border-red-200", iconBg: "bg-red-100", iconText: "text-red-700", badgeBg: "bg-red-100", badgeText: "text-red-700", rowHover: "hover:bg-red-100/60", amountText: "text-red-700", linkText: "text-red-600", mutedText: "text-red-500" }
                : { bg: "bg-amber-50", border: "border-amber-200", iconBg: "bg-amber-100", iconText: "text-amber-700", badgeBg: "bg-amber-100", badgeText: "text-amber-700", rowHover: "hover:bg-amber-100/60", amountText: "text-amber-700", linkText: "text-amber-600", mutedText: "text-amber-500" };
              return (
                <div
                  className={cn("rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-shadow", colorScheme.bg, colorScheme.border)}
                  onClick={() => navigate("/accounting?tab=tax-calendar")}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") navigate("/accounting?tab=tax-calendar"); }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={cn("p-1.5 rounded-lg", colorScheme.iconBg, colorScheme.iconText)}>
                        <CalendarClock className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-semibold text-foreground">Est. Tax Payments</span>
                    </div>
                    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", colorScheme.badgeBg, colorScheme.badgeText)}>
                      {taxAlerts.length} due
                    </span>
                  </div>
                  <div className="space-y-1 mt-2">
                    {taxAlerts.slice(0, 3).map(q => {
                      const isOverdue = q.status === "overdue";
                      const dueMs = new Date(q.federalDueDate + "T00:00:00").getTime() - now.getTime();
                      const daysAway = Math.ceil(dueMs / 86400000);
                      const dueLabel = isOverdue ? "Overdue" : daysAway === 0 ? "Due today" : `Due in ${daysAway}d`;
                      const amount = q.safeHarborTotal > 0 ? q.safeHarborTotal : q.recommendedTotal;
                      return (
                        <div
                          key={q.quarter}
                          className={cn("w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5", colorScheme.rowHover, "transition-colors")}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground">
                              {q.label} ({q.period}) — Federal + KY State
                            </p>
                            <p className={cn("text-[10px] font-medium", isOverdue ? "text-red-500" : colorScheme.mutedText)}>
                              {dueLabel} · {q.federalDueDateLabel}
                            </p>
                          </div>
                          <p className={cn("text-xs font-bold flex-shrink-0", colorScheme.amountText)}>
                            {formatCurrency(amount)}
                          </p>
                        </div>
                      );
                    })}
                    {taxAlerts.length > 3 && (
                      <p className={cn("text-[10px] font-medium pl-2", colorScheme.linkText)}>
                        +{taxAlerts.length - 3} more
                      </p>
                    )}
                  </div>
                  <div className={cn("mt-3 flex items-center text-[10px] font-semibold", colorScheme.linkText)}>
                    Go to Tax Payments <ArrowRight className="w-3 h-3 ml-1" />
                  </div>
                </div>
              );
            })()}

          </div>
        )}
      </div>

      {/* ── BUSINESS OVERVIEW ── */}
      <div>
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
          {/* Business-line filter — only shown in All Businesses mode */}
          {activeBusiness === null && (
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              {([{ value: "", label: "All" }, ...businesses.map(b => ({ value: b.slug, label: b.name }))]).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setLocalBLFilter(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    businessLine === opt.value
                      ? "bg-primary border-primary text-primary-foreground shadow-sm"
                      : "bg-background border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {businessLine === "asphalt_sealing" ? "Asphalt Sealing" : businessLine === "general_contracting" ? "General Contracting" : "All Businesses"}
              {" \u2014 "}
              {period === "week" ? "This Week" : period === "month" ? "This Month" : period === "quarter" ? "This Quarter" : "This Year"}
            </span>
          </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard title={`Collected (${periodLabel})`} value={formatCurrency(stats.totalRevenue)} icon={DollarSign} href="/accounting" />
          <MetricCard title={`Total Expenses (${periodLabel})`} value={formatCurrency((stats as any).businessExpenses ?? stats.totalExpenses)} icon={Receipt} href="/expenses" />
          <MetricCard title="Active Jobs" value={stats.activeJobs.toString()} icon={Briefcase} href="/jobs" />
          <MetricCard title="Overdue Invoices" value={stats.overdueInvoices.toString()} icon={AlertTriangle} isAlert={stats.overdueInvoices > 0} href="/accounting" />
        </div>
      </div>

      {/* Business comparison grid — visible only in All Businesses mode */}
      {hasSelection && !activeBusiness && businesses.length > 0 && (
        <div>
          <h2 className="text-base font-display font-bold text-foreground mb-3">By Business</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {businesses.map(b => (
              <BusinessStatsCard key={b.id} business={b} period={period} />
            ))}
          </div>
        </div>
      )}

      {/* Operational Net Profit card */}
      {stats.operationalNetProfit !== undefined && (
        <NetProfitCard
          operationalNetProfit={stats.operationalNetProfit}
          excludedFromProfit={stats.excludedFromProfit ?? 0}
          formulaExcludedFromProfit={stats.formulaExcludedFromProfit ?? stats.excludedFromProfit ?? 0}
          excludedCount={stats.excludedExpenseCount ?? 0}
          periodLabel={periodLabel}
        />
      )}

      {/* My Pay running balance */}
      <MyPayCard />

      {/* Subcontractor Pay section — only shown when there are sub expenses */}
      {((stats.subContractorOwed ?? 0) > 0 || (stats.subContractorPaid ?? 0) > 0) && (
        <div className="space-y-3">
          {/* Three compact sub metric cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="shadow-sm border-amber-200/60 bg-amber-50/40">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700">
                    <HardHat className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Sub Owed</p>
                </div>
                <p className="text-lg font-display font-bold text-amber-800">
                  {(stats.subContractorOwed ?? 0) > 0 ? formatCurrency(stats.subContractorOwed!) : "—"}
                </p>
                <p className="text-[10px] text-amber-600/70 mt-0.5">unpaid jobs</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-emerald-200/60 bg-emerald-50/40">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">Sub Paid</p>
                </div>
                <p className="text-lg font-display font-bold text-emerald-800">
                  {(stats.subContractorPaid ?? 0) > 0 ? formatCurrency(stats.subContractorPaid!) : "—"}
                </p>
                <p className="text-[10px] text-emerald-600/70 mt-0.5">settled jobs</p>
              </CardContent>
            </Card>
            <Card className={`shadow-sm ${(stats.subContractorRemaining ?? 0) > 0 ? "border-orange-200/60 bg-orange-50/40" : "border-border/50"}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded-lg ${(stats.subContractorRemaining ?? 0) > 0 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>
                    <Receipt className="w-3.5 h-3.5" />
                  </div>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${(stats.subContractorRemaining ?? 0) > 0 ? "text-orange-700" : "text-muted-foreground"}`}>Remaining</p>
                </div>
                <p className={`text-lg font-display font-bold ${(stats.subContractorRemaining ?? 0) > 0 ? "text-orange-800" : "text-foreground"}`}>
                  {formatCurrency(stats.subContractorRemaining ?? 0)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">still owed</p>
              </CardContent>
            </Card>
          </div>

          {/* Your Actual Profit */}
          {stats.ownerProfit !== undefined && (
            <Card className={`shadow-md border-border/50 border-l-4 ${(stats.ownerProfit ?? 0) >= 0 ? "border-l-emerald-500" : "border-l-red-500"}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">Your Actual Profit ({periodLabel})</p>
                    <p className={cn("text-3xl font-display font-bold tracking-tight mt-1", (stats.ownerProfit ?? 0) >= 0 ? "text-emerald-600" : "text-red-600")}>
                      {formatCurrency(stats.ownerProfit!)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Net Profit minus unpaid sub obligations
                      {(stats.subContractorRemaining ?? 0) > 0 && (
                        <span className="ml-1 text-amber-600 font-medium">
                          · {formatCurrency(stats.subContractorRemaining!)} still owed to subs
                        </span>
                      )}
                    </p>
                  </div>
                  <div className={cn("p-3 rounded-xl flex-shrink-0", (stats.ownerProfit ?? 0) >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
                    <Wallet className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Profit by Business panel — only shown when viewing "All" */}
      {!businessLine && stats.byBusinessLine && stats.byBusinessLine.length > 0 && (
        <Card className="shadow-md border-border/50">
          <CardHeader className="pb-3 pt-5 px-5">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/10">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <CardTitle className="text-sm font-bold text-foreground">Profit by Business ({periodLabel})</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {stats.byBusinessLine.map(bl => {
              const isAsphalt = bl.businessLine === "asphalt_sealing";
              const isUnattributed = bl.businessLine === "unattributed";
              const profitPositive = bl.operationalNetProfit >= 0;
              const rowStyle = isUnattributed
                ? "bg-muted/30 border-border/50"
                : isAsphalt
                  ? "bg-amber-50/60 border-amber-200/70"
                  : "bg-primary/5 border-primary/15";
              const badgeStyle = isUnattributed
                ? "bg-muted text-muted-foreground"
                : isAsphalt
                  ? "bg-amber-100 text-amber-700"
                  : "bg-primary/10 text-primary";
              return (
                <div key={bl.businessLine} className={`rounded-xl border p-4 ${rowStyle}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeStyle}`}>
                      {bl.label}
                    </span>
                    {!isUnattributed && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${bl.activeJobs > 0 ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"}`}>
                        {bl.activeJobs} active job{bl.activeJobs !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Revenue</p>
                      <p className="text-sm font-bold text-foreground mt-0.5">{formatCurrency(bl.totalRevenue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Expenses</p>
                      <p className="text-sm font-bold text-foreground mt-0.5">{formatCurrency((bl as any).businessExpenses ?? bl.totalExpenses)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Net Profit</p>
                      <p className={`text-sm font-bold mt-0.5 ${profitPositive ? "text-emerald-600" : "text-red-500"}`}>
                        {formatCurrency(bl.operationalNetProfit)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Mileage deduction reconciliation row — shows why total ≠ sum of business lines */}
            {(stats.periodMileageDeduction ?? 0) > 0 && (
              <div className="rounded-xl border border-dashed border-border/60 px-4 py-3 flex items-center justify-between bg-muted/10">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Mileage Deduction ({periodLabel})</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">Deducted from Operating Profit · not tied to a single business line</p>
                </div>
                <p className="text-sm font-bold text-red-500 flex-shrink-0">-{formatCurrency(stats.periodMileageDeduction ?? 0)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Compliance Summary Widget */}
      <Card
        role="button"
        tabIndex={0}
        onClick={() => navigate("/accounting?tab=tax-calendar")}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/accounting?tab=tax-calendar"); }}
        className={`shadow-md border-border/50 cursor-pointer transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          todayLoading ? "border-l-4 border-l-muted-foreground/40" :
          hasComplianceIssues ? "border-l-4 border-l-amber-400" :
          "border-l-4 border-l-emerald-400"
        }`}
      >
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${
                todayLoading ? "bg-muted text-muted-foreground" :
                hasComplianceIssues ? "bg-amber-100 text-amber-700" :
                "bg-emerald-100 text-emerald-700"
              }`}>
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Compliance Status</p>
                {todayLoading ? (
                  <p className="text-xs text-muted-foreground mt-0.5 animate-pulse">Loading…</p>
                ) : hasComplianceIssues ? (
                  <p className="text-xs text-muted-foreground mt-0.5">Action needed — check your compliance items</p>
                ) : (
                  <p className="text-xs text-emerald-600 font-medium mt-0.5">All clear — no issues requiring attention</p>
                )}
              </div>
            </div>
            {!todayLoading && (
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
            {todayLoading && (
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

function RecordDrawDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(getTodayStr());
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function resetForm() { setAmount(""); setDate(getTodayStr()); setDescription(""); setError(""); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) { setError("Enter a valid amount."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/api/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim() || "Owner Withdrawal",
          amount: parseFloat(amount),
          category: "Owner Draw",
          date,
          excludeFromNetProfit: true,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      resetForm();
      onSaved();
      onClose();
    } catch {
      setError("Failed to save draw. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={() => { resetForm(); onClose(); }}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-5">
          <div className="p-2 rounded-xl bg-violet-100 text-violet-700">
            <Wallet className="w-4 h-4" />
          </div>
          <h2 className="text-base font-bold text-foreground">Record Owner Draw</h2>
          <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => { resetForm(); onClose(); }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
              <input
                type="number" step="0.01" min="0.01" required
                value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-violet-300 outline-none text-sm"
                autoFocus
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date *</label>
            <input
              type="date" required
              value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-violet-300 outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input
              type="text"
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Weekly draw, transfer"
              className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-violet-300 outline-none text-sm"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => { resetForm(); onClose(); }}
              className="flex-1 px-4 py-2 rounded-xl font-medium text-sm text-muted-foreground hover:bg-muted transition-colors border border-border"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 px-4 py-2 rounded-xl font-semibold text-sm bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-60"
            >
              {saving ? "Saving…" : "Record Draw"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DistributionsCard({ operationalNetProfit, ownerDrawTotal, undrawnBalance, periodLabel, onRecordDraw }: {
  operationalNetProfit: number;
  ownerDrawTotal: number;
  undrawnBalance: number;
  periodLabel: string;
  onRecordDraw: () => void;
}) {
  const profitPositive = operationalNetProfit >= 0;

  // "Overdrawn" only applies when draws exceed profit. When profit is negative
  // and no draws were taken, the business is simply at a loss — not overdrawn.
  const balanceColor =
    undrawnBalance < 0 ? "text-red-600" :
    undrawnBalance <= 500 ? "text-emerald-600" :
    "text-amber-600";
  const balanceLabel =
    undrawnBalance < 0 && ownerDrawTotal === 0 ? "business at a loss" :
    undrawnBalance < 0 ? "overdrawn" :
    undrawnBalance <= 500 ? "well distributed" :
    "building up";

  return (
    <Card className="shadow-md border-border/50 border-l-4 border-l-violet-400">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-violet-100 text-violet-700">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Owner Distributions ({periodLabel})</p>
              <p className="text-[10px] text-muted-foreground">Profit earned vs. personal draws taken</p>
            </div>
          </div>
          <button
            onClick={onRecordDraw}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Record Draw
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className={cn("border rounded-xl p-3 text-center", profitPositive ? "bg-emerald-50/60 border-emerald-100" : "bg-red-50/60 border-red-100")}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Operating Profit</p>
            <p className={cn("text-lg font-display font-bold", profitPositive ? "text-emerald-600" : "text-red-600")}>{formatCurrency(operationalNetProfit)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Revenue − expenses</p>
          </div>
          <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3 text-center">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Draws Taken</p>
            <p className="text-lg font-display font-bold text-amber-600">{formatCurrency(ownerDrawTotal)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Personal distributions</p>
          </div>
          <div className="bg-muted/30 border border-border/50 rounded-xl p-3 text-center">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Undrawn Balance</p>
            <p className={cn("text-lg font-display font-bold", balanceColor)}>{formatCurrency(undrawnBalance)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{balanceLabel}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NetProfitCard({ operationalNetProfit, excludedFromProfit, formulaExcludedFromProfit, excludedCount, periodLabel }: {
  operationalNetProfit: number;
  excludedFromProfit: number;
  formulaExcludedFromProfit: number;
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
                <span className="ml-1 text-muted-foreground/70">· Before mileage &amp; tax write-offs — see Tax page for adjusted figure</span>
              )}
            </p>
          </div>
          <div className={cn("p-3 rounded-xl flex-shrink-0", isPositive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
            {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          </div>
        </div>
        {formulaExcludedFromProfit > 0 && (
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
            Total expenses including write-offs would be <span className="font-semibold">{formatCurrency(operationalNetProfit - formulaExcludedFromProfit)}</span> net profit
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

// ─── My Pay Card ─────────────────────────────────────────────────────────────
type PayJob = { jobId: number; jobNumber: number | null; title: string; status: string; ownerPayIncluded: boolean; revenue: number; takeHome: number };

function MyPayCard() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(getTodayStr());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  // Optimistic toggle state: jobId → override value while saving
  const [toggling, setToggling] = useState<Record<number, boolean>>({});
  const [jobsOpen, setJobsOpen] = useState(false);
  const [equityDialogOpen, setEquityDialogOpen] = useState(false);
  const [equityAmount, setEquityAmount] = useState("");
  const [equityDate, setEquityDate] = useState(getTodayStr());
  const [equitySaving, setEquitySaving] = useState(false);
  const [equityErr, setEquityErr] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["owner-pay-summary"],
    queryFn: () => fetch(`${BASE}/api/reports/owner-pay-summary`).then(r => r.json()),
  });

  async function handleToggle(job: PayJob) {
    const newVal = !job.ownerPayIncluded;
    setToggling(prev => ({ ...prev, [job.jobId]: true }));
    try {
      await fetch(`${BASE}/api/jobs/${job.jobId}/owner-pay-included`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ included: newVal }),
      });
      qc.invalidateQueries({ queryKey: ["owner-pay-summary"] });
    } finally {
      setToggling(prev => { const n = { ...prev }; delete n[job.jobId]; return n; });
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr("Enter a valid amount"); return; }
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`${BASE}/api/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Owner Pay", amount: amt, category: "Owner Compensation", date, excludeFromNetProfit: true }),
      });
      if (!res.ok) throw new Error("Failed");
      setDialogOpen(false);
      setAmount("");
      setDate(getTodayStr());
      setErr("");
      qc.invalidateQueries({ queryKey: ["owner-pay-summary"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch {
      setErr("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEquityWithdraw(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(equityAmount);
    if (!amt || amt <= 0) { setEquityErr("Enter a valid amount"); return; }
    setEquitySaving(true);
    setEquityErr("");
    try {
      const res = await fetch(`${BASE}/api/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Owner Withdrawal", amount: amt, category: "Owner Withdrawal", date: equityDate, excludeFromNetProfit: true }),
      });
      if (!res.ok) throw new Error("Failed");
      setEquityDialogOpen(false);
      setEquityAmount("");
      setEquityDate(getTodayStr());
      setEquityErr("");
      qc.invalidateQueries({ queryKey: ["owner-pay-summary"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch {
      setEquityErr("Failed to save. Try again.");
    } finally {
      setEquitySaving(false);
    }
  }

  if (isLoading) return <div className="animate-pulse h-40 rounded-2xl bg-muted" />;

  const totalEarned    = data?.totalEarned    ?? 0;
  const totalWithdrawn = data?.totalWithdrawn ?? 0;
  const remaining      = data?.remaining      ?? 0;
  const jobs: PayJob[] = data?.jobs ?? [];
  const withdrawals: Array<{ id: string; date: string; amount: number; description: string }> = data?.withdrawals ?? [];

  return (
    <>
      <Card className="shadow-md border-border/50">
        <CardContent className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">My Pay</p>
                <p className="text-xs text-muted-foreground">What the business owes you</p>
              </div>
            </div>
            <button
              onClick={() => setDialogOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Record Owner Pay
            </button>
          </div>

          {/* Summary totals */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-muted/40 rounded-xl p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Earned</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(totalEarned)}</p>
              <p className="text-[10px] text-muted-foreground">from selected jobs</p>
            </div>
            <div className="bg-muted/40 rounded-xl p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Taken Out</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(totalWithdrawn)}</p>
              <p className="text-[10px] text-muted-foreground">withdrawn</p>
            </div>
            <div className={cn("rounded-xl p-3", remaining > 0.01 ? "bg-emerald-50 border border-emerald-200/60" : "bg-muted/40")}>
              <p className={cn("text-[10px] font-semibold uppercase tracking-wide mb-1", remaining > 0.01 ? "text-emerald-700" : "text-muted-foreground")}>Owed to You</p>
              <p className={cn("text-lg font-bold", remaining > 0.01 ? "text-emerald-700" : "text-foreground")}>{formatCurrency(remaining)}</p>
              <p className={cn("text-[10px]", remaining > 0.01 ? "text-emerald-600/70" : "text-muted-foreground")}>still owed</p>
            </div>
          </div>

          {/* Per-job breakdown — accordion */}
          {jobs.length > 0 && (
            <div className="border border-border/60 rounded-xl overflow-hidden">
              {/* Accordion header — always visible */}
              <button
                onClick={() => setJobsOpen(o => !o)}
                className="w-full px-3 py-2 bg-muted/30 flex items-center justify-between hover:bg-muted/50 transition-colors"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {jobs.length} Job{jobs.length !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-2">
                  {!jobsOpen && (
                    <p className="text-[10px] text-muted-foreground">
                      {jobs.filter(j => j.ownerPayIncluded).length} included
                    </p>
                  )}
                  <svg className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", jobsOpen && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Collapsible job rows */}
              {jobsOpen && jobs.map((job, i) => {
                const isIncluded = job.ownerPayIncluded;
                const isSaving   = !!toggling[job.jobId];
                return (
                  <div key={job.jobId} className={cn("flex items-center gap-3 px-3 py-2.5 transition-colors border-t border-border/40", isIncluded ? "bg-card" : "bg-muted/20")}>
                    {/* Toggle */}
                    <button
                      disabled={isSaving}
                      onClick={() => handleToggle(job)}
                      className={cn(
                        "relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50",
                        isIncluded ? "bg-emerald-500" : "bg-border"
                      )}
                      aria-label={isIncluded ? "Exclude from My Pay" : "Include in My Pay"}
                    >
                      <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all", isIncluded ? "left-[18px]" : "left-0.5")} />
                    </button>

                    {/* Job info */}
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-semibold truncate", isIncluded ? "text-foreground" : "text-muted-foreground")}>
                        {job.jobNumber ? `#${job.jobNumber} · ` : ""}{job.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground capitalize">{job.status}</p>
                    </div>

                    {/* Take-home */}
                    <p className={cn("text-xs font-bold shrink-0", isIncluded ? "text-emerald-700" : "text-muted-foreground line-through")}>
                      {job.takeHome > 0 ? formatCurrency(job.takeHome) : "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent withdrawals */}
          {withdrawals.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/60">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Recent Owner Pay</p>
              <div className="space-y-1.5">
                {withdrawals.slice(0, 3).map(w => (
                  <div key={w.id} className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground w-16 shrink-0">
                      {w.date ? new Date(w.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                    </span>
                    <span className="text-foreground flex-1 px-2 truncate">{w.description}</span>
                    <span className="font-semibold text-foreground shrink-0">{formatCurrency(w.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Equity withdrawal link — rare manual action, de-emphasized */}
      <div className="mt-2 text-center">
        <button
          onClick={() => setEquityDialogOpen(true)}
          className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Record equity withdrawal (rare — not from a job)
        </button>
      </div>

      {/* Record Owner Pay dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={() => { setDialogOpen(false); setAmount(""); setDate(getTodayStr()); setErr(""); }}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700"><Wallet className="w-4 h-4" /></div>
              <h2 className="text-base font-bold text-foreground">Record Owner Pay</h2>
              <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => { setDialogOpen(false); setAmount(""); setDate(getTodayStr()); setErr(""); }}>✕</button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Log a payment from the business to you for completed job work.{" "}
              <span className="font-semibold text-emerald-700">{formatCurrency(remaining)}</span> still owed to you.
            </p>
            <form onSubmit={handleWithdraw} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                  <input type="number" step="0.01" min="0.01" required autoFocus
                    value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date *</label>
                <input type="date" required value={date} onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              {err && <p className="text-xs text-destructive">{err}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setDialogOpen(false); setAmount(""); setDate(getTodayStr()); setErr(""); }}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground border border-border hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                  {saving ? "Saving…" : "Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Equity Withdrawal dialog — for manual equity pulls not tied to a job */}
      {equityDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={() => { setEquityDialogOpen(false); setEquityAmount(""); setEquityDate(getTodayStr()); setEquityErr(""); }}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl bg-orange-100 text-orange-700"><Wallet className="w-4 h-4" /></div>
              <h2 className="text-base font-bold text-foreground">Record Equity Withdrawal</h2>
              <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => { setEquityDialogOpen(false); setEquityAmount(""); setEquityDate(getTodayStr()); setEquityErr(""); }}>✕</button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              For manually pulling business equity <span className="font-semibold">not connected to any completed job</span> — this is rare. For normal job pay, use "Record Owner Pay" instead.
            </p>
            <form onSubmit={handleEquityWithdraw} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                  <input type="number" step="0.01" min="0.01" required autoFocus
                    value={equityAmount} onChange={e => setEquityAmount(e.target.value)} placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-orange-300" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date *</label>
                <input type="date" required value={equityDate} onChange={e => setEquityDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              {equityErr && <p className="text-xs text-destructive">{equityErr}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setEquityDialogOpen(false); setEquityAmount(""); setEquityDate(getTodayStr()); setEquityErr(""); }}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground border border-border hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={equitySaving}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-60 transition-colors">
                  {equitySaving ? "Saving…" : "Record Withdrawal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
