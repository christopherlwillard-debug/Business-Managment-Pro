import React, { useEffect, useState } from "react";
import { useGetDashboardStats, useListClients, useGetSettings } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBusiness, type Business } from "@/contexts/BusinessContext";
import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from "recharts";
import {
  Briefcase, DollarSign, Receipt, AlertTriangle, ArrowRight, ShieldAlert,
  CheckCircle2, Clock, TrendingUp, TrendingDown, CalendarClock, MapPin,
  Navigation, Phone, FileText, Sparkles, HardHat, Wallet, Plus, Camera,
  Bell, Activity, Route,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import DashboardTasksWidget from "./dashboard/DashboardTasksWidget";

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
  const revenueDateBasis = stats.revenueDateBasis;
  return (
    <div className={`rounded-xl border ${colors.border} overflow-hidden`}>
      <div className={`px-4 py-2.5 ${colors.header}`}>
        <p className={`font-semibold text-sm ${colors.text}`}>{business.name}</p>
      </div>
      <div className="p-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Revenue</p>
          <p className="font-bold text-foreground text-sm">{formatCurrency(stats.totalRevenue)}</p>
          {revenueDateBasis && (
            <Link
              href={`/invoices?tab=audit&businessLine=${encodeURIComponent(business.slug)}`}
              className="mt-1 block text-[10px] font-semibold text-primary hover:underline"
            >
              {revenueDateBasis.verifiedDeliveryCount} verified · {revenueDateBasis.issueDateFallbackCount} fallback
            </Link>
          )}
        </div>
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

function useDashboardToday(businessId?: number | null) {
  const today = getTodayStr();
  return useQuery<DashboardToday>({
    queryKey: ["dashboard-today", today, businessId ?? "all"],
    queryFn: async () => {
      const params = businessId != null ? `?businessId=${businessId}` : "";
      const res = await fetch(`${BASE}/api/dashboard/today${params}`);
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

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-display font-bold text-foreground">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

// ─── Quick Actions (original — preserved) ─────────────────────────────────────
interface QuickAction {
  icon: React.ElementType;
  label: string;
  description: string;
  onClick: () => void;
  color: string;
  iconBg: string;
}

function QuickActions({ onNavigate }: {
  onNavigate: (path: string) => void;
}) {
  const actions: QuickAction[] = [
    {
      icon: Camera,
      label: "Scan Receipt",
      description: "AI scans & logs the expense",
      onClick: () => onNavigate("/expenses?scan=1"),
      color: "border-violet-200/70 hover:border-violet-300 hover:bg-violet-50/60",
      iconBg: "bg-violet-100 text-violet-700",
    },
    {
      icon: Briefcase,
      label: "New Job",
      description: "Create a new job",
      onClick: () => onNavigate("/jobs"),
      color: "border-amber-200/70 hover:border-amber-300 hover:bg-amber-50/60",
      iconBg: "bg-amber-100 text-amber-700",
    },
  ];

  return (
    <div>
      <SectionHeader title="Quick Actions" />
      <div className="grid grid-cols-2 gap-3">
        {actions.map(action => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={cn(
              "flex flex-col items-start gap-2 rounded-2xl border bg-card p-4 text-left transition-all active:scale-[0.98] shadow-sm",
              action.color,
            )}
          >
            <div className={cn("p-2.5 rounded-xl", action.iconBg)}>
              <action.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground leading-tight">{action.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{action.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Combined Profit Card ─────────────────────────────────────────────────────
function CombinedProfitCard({ operationalNetProfit, subContractorRemaining, ownerProfit, excludedFromProfit, formulaExcludedFromProfit, excludedCount, periodLabel }: {
  operationalNetProfit: number;
  subContractorRemaining: number;
  ownerProfit?: number;
  excludedFromProfit: number;
  formulaExcludedFromProfit: number;
  excludedCount: number;
  periodLabel: string;
}) {
  const isPositive = operationalNetProfit >= 0;
  const actualPositive = (ownerProfit ?? operationalNetProfit) >= 0;

  return (
    <Card className={`shadow-md border-border/50 border-l-4 ${isPositive ? "border-l-emerald-500" : "border-l-red-500"}`}>
      <CardContent className="p-6 space-y-4">

        {/* Operational Profit row */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Operational Profit ({periodLabel})</p>
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
            {formulaExcludedFromProfit > 0 && (
              <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">
                Including write-offs would be <span className="font-semibold">{formatCurrency(operationalNetProfit - formulaExcludedFromProfit)}</span>
              </p>
            )}
          </div>
          <div className={cn("p-3 rounded-xl flex-shrink-0", isPositive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
            {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          </div>
        </div>

        {/* Actual Profit breakdown — only when ownerProfit is available */}
        {ownerProfit !== undefined && (
          <>
            {/* Less Sub Payments row */}
            <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground">Less Outstanding Subcontractor Payments</p>
              <p className={cn("text-sm font-bold flex-shrink-0 ml-4", subContractorRemaining > 0 ? "text-amber-600" : "text-muted-foreground")}>
                {subContractorRemaining > 0 ? `-${formatCurrency(subContractorRemaining)}` : formatCurrency(0)}
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-border/60" />

            {/* Actual Profit row */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">Actual Profit ({periodLabel})</p>
                <p className={cn("text-2xl font-display font-bold tracking-tight mt-1", actualPositive ? "text-emerald-600" : "text-red-600")}>
                  {formatCurrency(ownerProfit)}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1.5 italic">
                  Actual Profit represents Operational Profit after all unpaid subcontractor obligations have been paid.
                </p>
              </div>
              <div className={cn("p-3 rounded-xl flex-shrink-0", actualPositive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
                <Wallet className="w-5 h-5" />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── V2 Hooks ─────────────────────────────────────────────────────────────────

interface ContinueWorkingData {
  jobId: number;
  title: string;
  clientName: string | null;
  coverPhotoPath: string | null;
  checklistDone: number;
  checklistTotal: number;
  percentComplete: number;
  invoiceStatus: string | null;
  crewNames: string[];
}

function useContinueWorking(businessId?: number | null) {
  return useQuery<ContinueWorkingData | null>({
    queryKey: ["dashboard-continue-working", businessId ?? "all"],
    queryFn: async () => {
      const params = businessId != null ? `?businessId=${businessId}` : "";
      const res = await fetch(`${BASE}/api/dashboard/continue-working${params}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });
}

interface ActivityEvent {
  type: string;
  icon: string;
  description: string;
  amount?: number;
  date: string;
  relativeTime: string;
  linkPath: string;
}

function useRecentActivity(businessId?: number | null) {
  return useQuery<ActivityEvent[]>({
    queryKey: ["dashboard-recent-activity", businessId ?? "all"],
    queryFn: async () => {
      const params = businessId != null ? `?businessId=${businessId}` : "";
      const res = await fetch(`${BASE}/api/dashboard/recent-activity${params}`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });
}

interface CashFlowData {
  checkingBalance: number | null;
  estimatedTaxes: number;
  growthFundAvailable: number;
  availableToSpend: number | null;
  plaidConnected: boolean;
}

function useCashFlow() {
  return useQuery<CashFlowData>({
    queryKey: ["dashboard-cash-flow"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/reports/business-reserve`);
      if (!res.ok) return { checkingBalance: null, estimatedTaxes: 0, growthFundAvailable: 0, availableToSpend: null, plaidConnected: false };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── V2 Components ─────────────────────────────────────────────────────────────

function DashboardHeader({ companyName, todayFormatted }: { companyName: string; todayFormatted: string }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = companyName.split(/\s+/)[0] ?? companyName;
  return (
    <div className="flex items-center justify-between pt-1">
      <div>
        <h1 className="text-xl font-display font-bold text-foreground">{greeting}, {firstName} 👋</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{todayFormatted}</p>
      </div>
      <div className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center">
        <Bell className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );
}

function HeroCard({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <button
      onClick={() => onNavigate("/expenses?scan=1")}
      className="w-full rounded-2xl overflow-hidden shadow-md active:scale-[0.98] transition-transform text-left"
      style={{ background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.75) 100%)" }}
    >
      <div className="px-5 py-5 flex items-center justify-between">
        <div>
          <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-primary-foreground/60 bg-primary-foreground/10 px-2.5 py-0.5 rounded-full mb-2">
            AI Powered
          </span>
          <p className="text-xl font-display font-bold text-primary-foreground leading-tight">Scan Receipt</p>
          <p className="text-xs text-primary-foreground/70 mt-1">AI reads and logs it instantly</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-primary-foreground/15 flex-shrink-0">
          <Camera className="w-8 h-8 text-primary-foreground" />
        </div>
      </div>
    </button>
  );
}

function QuickActionsV2({ onNavigate, onRecordPay }: {
  onNavigate: (path: string) => void;
  onRecordPay: () => void;
}) {
  const actions = [
    { icon: Briefcase, label: "New Job",    onClick: () => onNavigate("/jobs"),          color: "border-amber-200/70 hover:bg-amber-50/60",    iconBg: "bg-amber-100 text-amber-700"    },
    { icon: Route,     label: "Route Plan", onClick: () => onNavigate("/route-planner"), color: "border-blue-200/70 hover:bg-blue-50/60",      iconBg: "bg-blue-100 text-blue-700"      },
    { icon: Wallet,    label: "Owner Withdrawal", onClick: onRecordPay,                  color: "border-emerald-200/70 hover:bg-emerald-50/60", iconBg: "bg-emerald-100 text-emerald-700" },
    { icon: HardHat,   label: "Open Jobs",  onClick: () => onNavigate("/jobs"),          color: "border-violet-200/70 hover:bg-violet-50/60",  iconBg: "bg-violet-100 text-violet-700"  },
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {actions.map(a => (
        <button
          key={a.label}
          onClick={a.onClick}
          className={cn("flex flex-col items-center gap-2 rounded-2xl border bg-card p-3 transition-all active:scale-[0.97] shadow-sm", a.color)}
        >
          <div className={cn("p-2 rounded-xl", a.iconBg)}><a.icon className="w-4 h-4" /></div>
          <p className="text-[11px] font-semibold text-foreground leading-tight text-center">{a.label}</p>
        </button>
      ))}
    </div>
  );
}

function ContinueWorkingCard({ onNavigate, businessId }: { onNavigate: (p: string) => void; businessId?: number | null }) {
  const { data: job, isLoading } = useContinueWorking(businessId);
  if (isLoading) return <div className="h-24 rounded-2xl bg-muted/30 animate-pulse" />;
  if (!job) return null;
  const invColors: Record<string, string> = { sent: "text-blue-600", paid: "text-emerald-600", overdue: "text-red-600", draft: "text-muted-foreground" };
  return (
    <div>
      <SectionHeader title="Continue Working" />
      <div className="rounded-2xl border border-border bg-card shadow-sm p-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <HardHat className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-foreground text-sm truncate">{job.title}</p>
            {job.clientName && <p className="text-xs text-muted-foreground">{job.clientName}</p>}
            {job.checklistTotal > 0 && (
              <div className="mt-2">
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">{job.checklistDone}/{job.checklistTotal} tasks</span>
                  <span className="text-[10px] font-semibold">{job.percentComplete}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${job.percentComplete}%` }} />
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 mt-1.5">
              {job.invoiceStatus && job.invoiceStatus !== "none" && (
                <span className={cn("text-[10px] font-semibold capitalize", invColors[job.invoiceStatus] ?? "text-muted-foreground")}>
                  Invoice: {job.invoiceStatus}
                </span>
              )}
              {job.crewNames.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {job.crewNames.slice(0, 2).join(", ")}{job.crewNames.length > 2 ? ` +${job.crewNames.length - 2}` : ""}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => onNavigate(`/jobs?openJob=${job.jobId}`)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            Continue <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TodayScheduleCard({ stops, onNavigate }: {
  stops: DashboardToday["routeStops"];
  onNavigate: (p: string) => void;
}) {
  if (!stops.length) return null;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-display font-bold text-foreground">Today's Schedule</h2>
        <button onClick={() => onNavigate("/route-planner")} className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline">
          View <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      <div className="space-y-2">
        {stops.slice(0, 4).map(stop => (
          <button
            key={stop.id}
            onClick={() => onNavigate("/route-planner")}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors text-left"
          >
            <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {stop.clientName ?? stop.prospectContactName ?? stop.title ?? stop.address}
              </p>
              {stop.address && <p className="text-[11px] text-muted-foreground truncate">{stop.address}</p>}
            </div>
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0",
              stop.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
            )}>
              {stop.status === "completed" ? "Done" : "Stop"}
            </span>
          </button>
        ))}
        {stops.length > 4 && (
          <button onClick={() => onNavigate("/route-planner")} className="w-full text-center text-xs text-primary font-semibold py-1 hover:underline">
            +{stops.length - 4} more stops
          </button>
        )}
      </div>
    </div>
  );
}

function NeedsAttentionCard({ subContractorOwed, pendingInvoices, overdueCount, complianceCount, taxAlertCount, followUpCount, onNavigate, onLogTaxPayment }: {
  subContractorOwed: number;
  pendingInvoices: number;
  overdueCount: number;
  complianceCount: number;
  taxAlertCount: number;
  followUpCount: number;
  onNavigate: (p: string) => void;
  onLogTaxPayment?: () => void;
}) {
  const rows = [
    { label: "Subs Need Paid",       badge: subContractorOwed > 0 ? formatCurrency(subContractorOwed) : null, extra: null,                                                      dot: "bg-amber-500",  href: "/people",                      show: subContractorOwed > 0,   isTax: false },
    { label: "Outstanding Invoices", badge: pendingInvoices > 0 ? formatCurrency(pendingInvoices) : null,     extra: overdueCount > 0 ? `${overdueCount} overdue` : null,       dot: overdueCount > 0 ? "bg-red-500" : "bg-blue-400", href: "/accounting", show: pendingInvoices > 0 || overdueCount > 0, isTax: false },
    { label: "Compliance Items",     badge: complianceCount > 0 ? `${complianceCount} urgent` : null,         extra: null,                                                      dot: "bg-orange-500", href: "/accounting?tab=tax-calendar", show: complianceCount > 0,                   isTax: false },
    { label: "Tax Payments Due",     badge: taxAlertCount > 0 ? `${taxAlertCount} due` : null,                extra: null,                                                      dot: "bg-red-500",    href: "/accounting?tab=tax-calendar", show: taxAlertCount > 0,                     isTax: true  },
    { label: "Follow-ups Due",       badge: followUpCount > 0 ? `${followUpCount} due` : null,               extra: null,                                                      dot: "bg-purple-500", href: "/prospects",                   show: followUpCount > 0,                     isTax: false },
  ].filter(r => r.show);

  if (!rows.length) {
    return (
      <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-emerald-50 border border-emerald-200">
        <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600"><Sparkles className="w-4 h-4" /></div>
        <div>
          <p className="text-sm font-semibold text-emerald-800">All caught up!</p>
          <p className="text-xs text-emerald-600">No items need your attention right now.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title="Needs Attention" />
      <Card className="shadow-sm border-border/50 overflow-hidden">
        <CardContent className="p-0">
          {rows.map((row, i) => (
            row.isTax && onLogTaxPayment ? (
              // Tax row: split into navigate area + secondary Log action (avoids nested buttons)
              <div
                key={row.label}
                className={cn("w-full flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-border/40")}
              >
                <button
                  onClick={() => onNavigate(row.href)}
                  className="flex items-center gap-3 flex-1 text-left min-w-0"
                >
                  <span className={cn("w-2 h-2 rounded-full flex-shrink-0", row.dot)} />
                  <span className="flex-1 text-sm font-medium text-foreground">{row.label}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {row.badge && <span className="text-sm font-bold text-foreground">{row.badge}</span>}
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </button>
                <button
                  onClick={onLogTaxPayment}
                  className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors"
                >
                  Log
                </button>
              </div>
            ) : (
              <button
                key={row.label}
                onClick={() => onNavigate(row.href)}
                className={cn("w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors", i > 0 && "border-t border-border/40")}
              >
                <span className={cn("w-2 h-2 rounded-full flex-shrink-0", row.dot)} />
                <span className="flex-1 text-sm font-medium text-foreground">{row.label}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {row.extra && <span className="text-xs text-red-600 font-semibold">{row.extra}</span>}
                  {row.badge && <span className="text-sm font-bold text-foreground">{row.badge}</span>}
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </button>
            )
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function BusinessScoreGauge({ score, label }: { score: number; label: string }) {
  const sz = 88, sw = 9, r = (sz - sw) / 2;
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.75;
  const filled = arc * (Math.min(Math.max(score, 0), 100) / 100);
  const color = score >= 90 ? "#10b981" : score >= 70 ? "#3b82f6" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Business Score</p>
      <div className="relative" style={{ width: sz, height: sz }}>
        <svg width={sz} height={sz} style={{ transform: "rotate(135deg)" }}>
          <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={sw}
            strokeDasharray={`${arc} ${circ - arc}`} strokeLinecap="round" />
          <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke={color} strokeWidth={sw}
            strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.5s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingTop: 8 }}>
          <span className="text-[22px] font-black leading-none" style={{ color }}>{score}</span>
          <span className="text-[9px] text-muted-foreground mt-0.5">/ 100</span>
        </div>
      </div>
      <span className="text-[11px] font-bold" style={{ color }}>{label}</span>
    </div>
  );
}

function BusinessHealthCard({ stats, period, onPeriodChange, businessLine, businesses, activeBusiness, localBLFilter, showWillardsDivisionFilter, onLocalBLFilterChange, complianceItems, onNavigate }: {
  stats: any;
  period: "week" | "month" | "quarter" | "year";
  onPeriodChange: (p: "week" | "month" | "quarter" | "year") => void;
  businessLine: string;
  businesses: Business[];
  activeBusiness: Business | null;
  localBLFilter: string;
  showWillardsDivisionFilter: boolean;
  onLocalBLFilterChange: (v: string) => void;
  complianceItems: any[];
  onNavigate: (p: string) => void;
}) {
  const TABS = [{ v: "week", l: "WTD" }, { v: "month", l: "MTD" }, { v: "quarter", l: "QTD" }, { v: "year", l: "YTD" }] as const;

  const rev = stats.totalRevenue ?? 0;
  const profit = stats.operationalNetProfit ?? 0;
  const pending = stats.pendingInvoices ?? 0;
  const margin = rev > 0 ? profit / rev : 0;
  const marginScore = Math.min(Math.max(margin, 0) / 0.25, 1) * 40;
  const totalIssued = rev + pending;
  const collectionScore = totalIssued > 0 ? (rev / totalIssued) * 40 : 40;
  const urgentCount = complianceItems.filter((i: any) => i.computedStatus === "overdue" || (i.computedStatus === "due-soon" && i.daysUntilDue <= 7)).length;
  const complianceScore = Math.max(0, 20 - urgentCount * 5);
  const businessScore = Math.round(marginScore + collectionScore + complianceScore);
  const scoreLabel = businessScore >= 90 ? "Excellent" : businessScore >= 70 ? "Good" : businessScore >= 50 ? "Fair" : "Needs Attention";

  const chartData = (stats.monthlyRevenue ?? []).map((m: any) => ({
    mo: m.month.slice(5),
    rev: m.revenue,
    exp: m.expenses,
    pft: m.profit ?? (m.revenue - m.expenses),
    out: m.outstanding ?? 0,
  }));
  const auditHref = `/invoices?tab=audit${businessLine ? `&businessLine=${encodeURIComponent(businessLine)}` : ""}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-display font-bold text-foreground">Business Health</h2>
        <div className="flex gap-0.5 bg-muted/40 rounded-lg p-1">
          {TABS.map(t => (
            <button key={t.v} onClick={() => onPeriodChange(t.v as any)}
              className={cn("px-2 py-0.5 rounded text-xs font-medium transition-colors", period === t.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      <Card className="shadow-sm border-border/50">
        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Revenue",     val: rev,                                              color: "text-foreground",                                    href: "/accounting", tinted: false },
              { label: "Expenses",    val: (stats as any).businessExpenses ?? 0,             color: "text-foreground",                                    href: "/expenses",   tinted: false },
              { label: "Net Profit",  val: profit,                                           color: profit >= 0 ? "text-emerald-600" : "text-red-600",    href: "/accounting", tinted: true  },
              { label: "Outstanding", val: pending,                                          color: "text-blue-600",                                      href: "/accounting", tinted: false },
            ].map(k => (
              <button key={k.label} onClick={() => onNavigate(k.href)}
                className={cn("text-left p-3 rounded-xl hover:bg-muted/50 transition-colors",
                  k.tinted && profit >= 0 ? "bg-emerald-50/60" : k.tinted ? "bg-red-50/60" : "bg-muted/30")}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</p>
                <p className={cn("text-base font-bold mt-0.5", k.color)}>{formatCurrency(k.val)}</p>
              </button>
            ))}
          </div>
          {stats.revenueDateBasis && (
            <div
              data-testid="dashboard-revenue-date-basis"
              className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-800">
                  Paid invoice revenue dates
                </p>
                <p className="mt-0.5 text-xs text-blue-900">
                  {stats.revenueDateBasis.verifiedDeliveryCount} verified delivery
                  {" · "}
                  {stats.revenueDateBasis.issueDateFallbackCount} issue-date fallback
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(auditHref)}
                className="inline-flex items-center gap-1 self-start text-xs font-semibold text-primary hover:underline sm:self-auto"
              >
                Review revenue date audit
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Chart + Score */}
          <div className="flex gap-4 items-start">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">6-Month Trend</p>
              <div style={{ height: 150 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="mo" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} dy={4} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => `$${v >= 1000 ? (v/1000).toFixed(0)+"k" : v}`} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 2px 12px rgba(0,0,0,.12)", fontSize: 11 }} formatter={(v: number, n: string) => [formatCurrency(v), n]} />
                    <Line type="monotone" dataKey="rev" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Revenue" />
                    <Line type="monotone" dataKey="exp" stroke="#f59e0b" strokeWidth={2} dot={false} name="Expenses" />
                    <Line type="monotone" dataKey="pft" stroke="#10b981" strokeWidth={2} dot={false} name="Profit" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="out" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="Outstanding" strokeDasharray="5 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <BusinessScoreGauge score={businessScore} label={scoreLabel} />
          </div>

          {/* Per-business-line rows (All mode) */}
          {!businessLine && stats.byBusinessLine && stats.byBusinessLine.length > 0 && (
            <div className="pt-3 border-t border-border/50 space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">By Business Line</p>
              {stats.byBusinessLine.map((bl: any) => (
                <div key={bl.businessLine} className="flex items-center justify-between py-1">
                  <span className="text-xs font-medium text-foreground">{bl.label ?? bl.businessLine}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{formatCurrency(bl.totalRevenue ?? 0)}</span>
                    <span className={cn("text-xs font-bold", (bl.operationalNetProfit ?? 0) >= 0 ? "text-emerald-600" : "text-red-500")}>
                      {(bl.operationalNetProfit ?? 0) >= 0 ? "+" : ""}{formatCurrency(bl.operationalNetProfit ?? 0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Business line filter (All mode) */}
          {(activeBusiness === null && businesses.length > 1 || showWillardsDivisionFilter) && (
            <div className="pt-2 border-t border-border/50 flex gap-2 flex-wrap">
              {(showWillardsDivisionFilter
                ? [
                    { value: "", label: "All Willard's" },
                    { value: "general_contracting", label: "General Contracting" },
                    { value: "asphalt_sealing", label: "Asphalt Sealing" },
                  ]
                : [{ value: "", label: "All" }, ...businesses.map(b => ({ value: b.slug, label: b.name }))]).map(opt => (
                <button key={opt.value} onClick={() => onLocalBLFilterChange(opt.value)}
                  className={cn("px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors",
                    businessLine === opt.value ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-muted-foreground hover:border-primary/40")}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CashFlowCard() {
  const { data: cf, isLoading } = useCashFlow();
  if (isLoading) return <div className="h-20 rounded-2xl bg-muted/30 animate-pulse" />;
  if (!cf) return null;
  const rows = [
    { label: "Checking Balance",  val: cf.checkingBalance,     color: "text-foreground",  show: cf.plaidConnected, bold: false },
    { label: "Tax Reserve",       val: cf.estimatedTaxes,      color: "text-amber-600",   show: true,              bold: false },
    { label: "Growth Fund",       val: cf.growthFundAvailable, color: "text-purple-600",  show: true,              bold: false },
    { label: "Available Cash",    val: cf.availableToSpend,    color: "text-emerald-600", show: true,              bold: true  },
  ].filter(r => r.show);
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-display font-bold text-foreground">Cash Flow</h2>
        <Link href="/accounting?tab=reserve" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
          Details <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <Card className="shadow-sm border-border/50">
        <CardContent className="p-0">
          {rows.map((row, i) => (
            <div key={row.label} className={cn("flex items-center justify-between px-4 py-3", i < rows.length - 1 && "border-b border-border/40", row.bold && "bg-muted/20")}>
              <span className={cn("text-sm", row.bold ? "font-bold text-foreground" : "text-muted-foreground")}>{row.label}</span>
              <span className={cn("text-sm font-bold", row.color)}>{row.val != null ? formatCurrency(row.val) : "—"}</span>
            </div>
          ))}
          {!cf.plaidConnected && (
            <div className="px-4 pb-2.5 pt-1.5 border-t border-border/30">
              <p className="text-[10px] text-muted-foreground">Connect Plaid banking to see live checking balance</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const ACTIVITY_ICON_MAP: Record<string, React.ElementType> = {
  expense:     Receipt,
  invoice:     FileText,
  sub_payment: HardHat,
  owner_pay:   Wallet,
};
const ACTIVITY_COLOR_MAP: Record<string, string> = {
  expense:     "bg-amber-100 text-amber-700",
  invoice:     "bg-blue-100 text-blue-700",
  sub_payment: "bg-orange-100 text-orange-700",
  owner_pay:   "bg-emerald-100 text-emerald-700",
};

function RecentActivityCard({ onNavigate, businessId }: { onNavigate: (p: string) => void; businessId?: number | null }) {
  const { data: events = [], isLoading } = useRecentActivity(businessId);
  if (isLoading) return <div className="h-32 rounded-2xl bg-muted/30 animate-pulse" />;
  if (!events.length) return null;
  return (
    <div>
      <h2 className="text-lg font-display font-bold text-foreground mb-3">Recent Activity</h2>
      <Card className="shadow-sm border-border/50">
        <CardContent className="p-0">
          {events.map((ev: ActivityEvent, i: number) => {
            const Icon = ACTIVITY_ICON_MAP[ev.type] ?? Activity;
            return (
              <button
                key={i}
                onClick={() => onNavigate(ev.linkPath)}
                className={cn("w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors", i > 0 && "border-t border-border/30")}
              >
                <div className={cn("p-1.5 rounded-lg flex-shrink-0", ACTIVITY_COLOR_MAP[ev.type] ?? "bg-muted text-muted-foreground")}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{ev.description}</p>
                  <p className="text-[10px] text-muted-foreground">{ev.relativeTime}</p>
                </div>
                {ev.amount != null && ev.amount > 0 && (
                  <span className="text-sm font-bold text-foreground flex-shrink-0">{formatCurrency(ev.amount)}</span>
                )}
              </button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [period, setPeriod] = useState<"week" | "month" | "quarter" | "year">("month");
  const { activeBusiness, hasSelection, businesses } = useBusiness();
  const [localBLFilter, setLocalBLFilter] = useState<string>("");
  useEffect(() => {
    setLocalBLFilter("");
  }, [activeBusiness?.id]);
  const selectedBusiness = activeBusiness;
  const businessId = selectedBusiness ? (selectedBusiness.legalBusinessId ?? selectedBusiness.id) : null;
  const isLegalBusinessSelection = !!selectedBusiness
    && (selectedBusiness.legalBusinessId ?? selectedBusiness.id) === selectedBusiness.id;
  const businessLine = selectedBusiness
    ? (isLegalBusinessSelection ? localBLFilter : selectedBusiness.slug)
    : localBLFilter;
  const willardsDivisions = selectedBusiness && isLegalBusinessSelection
    ? businesses.filter((business) =>
        (business.legalBusinessId ?? business.id) === selectedBusiness.id,
      )
    : [];
  const showWillardsDivisionFilter = willardsDivisions.some((business) => business.id !== selectedBusiness?.id)
    && willardsDivisions.some((business) => business.slug === "asphalt_sealing");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: stats, isLoading } = useGetDashboardStats({
    period,
    businessId: businessId ?? undefined,
    businessLine: (businessLine || undefined) as any,
  });
  const { data: todayData } = useDashboardToday(businessId);
  const complianceItems = todayData?.complianceItems ?? [];
  const todayStops = todayData?.routeStops ?? [];
  const followUpProspects = todayData?.followUpProspects ?? [];
  const overdueInvoices = todayData?.overdueInvoices ?? [];
  const { data: taxAlerts = [] } = useTaxAlerts();
  const { data: appSettings } = useGetSettings();
  const annualOnly = (appSettings as any)?.taxFilingFrequency === "annual";

  // drawOpen controls the Owner Withdrawal dialog via the dashboard card.
  const [drawOpen, setDrawOpen] = useState(false);

  // Quick-log tax payment dialog
  const [logTaxOpen, setLogTaxOpen] = useState(false);
  const [logTaxAmount, setLogTaxAmount] = useState("");
  const [logTaxDate, setLogTaxDate] = useState(getTodayStr());
  const [logTaxSaving, setLogTaxSaving] = useState(false);
  const firstDueTaxQuarter = taxAlerts[0] ?? null;

  async function handleQuickLogTax(e: React.FormEvent) {
    e.preventDefault();
    if (!firstDueTaxQuarter || !logTaxAmount) return;
    setLogTaxSaving(true);
    try {
      const year = new Date().getFullYear();
      const res = await fetch(`${BASE}/api/estimated-tax-payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          quarter: firstDueTaxQuarter.quarter,
          level: "federal",
          amountPaid: parseFloat(logTaxAmount),
          paidDate: logTaxDate,
          paymentMethod: "other",
          notes: "Logged from dashboard",
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      queryClient.invalidateQueries({ queryKey: ["tax-alerts-dashboard"] });
      setLogTaxOpen(false);
      setLogTaxAmount("");
    } catch {
      // non-critical — user can retry in Tax Calendar
    } finally {
      setLogTaxSaving(false);
    }
  }

  const now = new Date();
  const todayFormatted = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const urgentComplianceItems = complianceItems.filter(
    i => i.computedStatus === "overdue" || (i.computedStatus === "due-soon" && i.daysUntilDue <= 7)
  );

  // keep queryClient in scope — used implicitly via MyPayCard callbacks
  void queryClient;

  if (isLoading) {
    return <div className="flex items-center justify-center h-full animate-pulse text-muted-foreground">Loading dashboard...</div>;
  }
  if (!stats) return null;

  return (
    <div className="space-y-6">

      {/* ── 1. HEADER ── */}
      <DashboardHeader companyName={appSettings?.companyName ?? "Business"} todayFormatted={todayFormatted} />

      {/* ── 2. HERO: SCAN RECEIPT ── */}
      <HeroCard onNavigate={navigate} />

      {/* ── 3. QUICK ACTIONS ── */}
      <div>
        <SectionHeader title="Quick Actions" />
        <QuickActionsV2 onNavigate={navigate} onRecordPay={() => setDrawOpen(true)} />
      </div>

      {/* ── 4. CONTINUE WORKING ── */}
      <ContinueWorkingCard onNavigate={navigate} businessId={businessId} />

      {/* ── 5. TODAY'S SCHEDULE ── */}
      <TodayScheduleCard stops={todayStops} onNavigate={navigate} />

      {/* ── 6. NEEDS ATTENTION ── */}
      <NeedsAttentionCard
        subContractorOwed={stats.subContractorOwed ?? 0}
        pendingInvoices={stats.pendingInvoices ?? 0}
        overdueCount={overdueInvoices.length}
        complianceCount={urgentComplianceItems.length}
        taxAlertCount={annualOnly ? 0 : taxAlerts.length}
        followUpCount={followUpProspects.length}
        onNavigate={navigate}
        onLogTaxPayment={!annualOnly && taxAlerts.length > 0 ? () => { setLogTaxDate(getTodayStr()); setLogTaxOpen(true); } : undefined}
      />

      {/* Quick-log tax payment dialog */}
      {firstDueTaxQuarter && (
        <Dialog open={logTaxOpen} onOpenChange={setLogTaxOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Log Tax Payment — {firstDueTaxQuarter.label}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleQuickLogTax} className="space-y-4">
              <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quarter</span>
                  <span className="font-semibold">{firstDueTaxQuarter.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Due</span>
                  <span className="font-semibold">{firstDueTaxQuarter.federalDueDateLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recommended</span>
                  <span className="font-bold text-amber-700">{formatCurrency(firstDueTaxQuarter.recommendedTotal)}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="log-tax-amount">Amount Paid ($)</Label>
                <Input
                  id="log-tax-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={String(firstDueTaxQuarter.recommendedTotal.toFixed(2))}
                  value={logTaxAmount}
                  onChange={e => setLogTaxAmount(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="log-tax-date">Payment Date</Label>
                <Input
                  id="log-tax-date"
                  type="date"
                  value={logTaxDate}
                  onChange={e => setLogTaxDate(e.target.value)}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setLogTaxOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={logTaxSaving || !logTaxAmount}>
                  {logTaxSaving ? "Saving…" : "Log Payment"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* ── 7. MY TO-DO LIST ── */}
      <DashboardTasksWidget />

      {/* ── 8. BUSINESS HEALTH ── */}
      <BusinessHealthCard
        stats={stats}
        period={period}
        onPeriodChange={setPeriod}
        businessLine={businessLine}
        businesses={businesses}
        activeBusiness={activeBusiness}
        localBLFilter={localBLFilter}
        showWillardsDivisionFilter={showWillardsDivisionFilter}
        onLocalBLFilterChange={setLocalBLFilter}
        complianceItems={complianceItems}
        onNavigate={navigate}
      />

      {/* ── 8. CASH FLOW ── */}
      {businessId == null && <CashFlowCard />}

      {/* ── 9. OWNER PAY ── */}
      <div>
        <SectionHeader title="Owner Withdrawals" />
        <MyPayCard businessId={businessId} externalDialogOpen={drawOpen} onExternalDialogChange={setDrawOpen} />
      </div>

      {/* ── 10. RECENT ACTIVITY ── */}
      <RecentActivityCard onNavigate={navigate} businessId={businessId} />

    </div>
  );
}

// ─── Distributions Card ───────────────────────────────────────────────────────
function DistributionsCard({ businessLine, periodLabel }: { businessLine: string; periodLabel: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["distributions", businessLine],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (businessLine) params.set("businessLine", businessLine);
      const res = await fetch(`${BASE}/api/reports/distributions?${params.toString()}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <div className="animate-pulse h-24 rounded-2xl bg-muted" />;
  if (!data) return null;

  return (
    <Card className="shadow-md border-border/50">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <DollarSign className="w-4 h-4 text-primary" />
          </div>
          <p className="text-sm font-bold text-foreground">Distributions ({periodLabel})</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/40 rounded-xl p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Total Out</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(data.totalDistributions ?? 0)}</p>
          </div>
          <div className="bg-muted/40 rounded-xl p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Count</p>
            <p className="text-lg font-bold text-foreground">{data.count ?? 0}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Net Profit Card ──────────────────────────────────────────────────────────
function NetProfitCard({ value, label, isPositive }: { value: number; label: string; isPositive: boolean }) {
  return (
    <Card className={`shadow-md border-border/50 border-l-4 ${isPositive ? "border-l-emerald-500" : "border-l-red-500"}`}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={cn("text-2xl font-display font-bold", isPositive ? "text-emerald-600" : "text-red-600")}>
          {formatCurrency(value)}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-foreground",
  iconBg = "bg-muted",
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  iconBg?: string;
  href?: string;
}) {
  const inner = (
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
          <p className={cn("text-xl font-display font-bold", color)}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className={cn("p-2.5 rounded-xl flex-shrink-0", iconBg)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      {href && (
        <div className="mt-3 flex items-center text-xs font-semibold text-primary">
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

// ─── Owner Withdrawals Card ───────────────────────────────────────────────────
function MyPayCard({ businessId, externalDialogOpen, onExternalDialogChange }: {
  businessId: number | null;
  externalDialogOpen?: boolean;
  onExternalDialogChange?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);
  const dialogOpen = externalDialogOpen ?? internalDialogOpen;
  function setDialogOpen(open: boolean) {
    if (onExternalDialogChange) onExternalDialogChange(open);
    else setInternalDialogOpen(open);
  }
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(getTodayStr());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["owner-pay-summary", businessId ?? "all"],
    queryFn: () => fetch(
      `${BASE}/api/reports/owner-pay-summary${businessId != null ? `?businessId=${businessId}` : ""}`,
      { credentials: "include" },
    ).then(r => r.json()),
    enabled: true,
  });

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr("Enter a valid amount"); return; }
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`${BASE}/api/owner-capital`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ businessId, type: "withdrawal", description: "Owner Withdrawal", amount: amt, date }),
      });
      if (!res.ok) throw new Error("Failed");
      setDialogOpen(false);
      setAmount("");
      setDate(getTodayStr());
      setErr("");
      qc.invalidateQueries({ queryKey: ["owner-pay-summary", businessId ?? "all"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["/api/owner-capital"] });
    } catch {
      setErr("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <div className="animate-pulse h-40 rounded-2xl bg-muted" />;

  const totalEarned    = data?.totalEarned    ?? 0;
  const totalWithdrawn = data?.totalWithdrawn ?? 0;
  const remaining      = data?.remaining      ?? 0;

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
               <p className="text-sm font-bold text-foreground">Owner Withdrawals</p>
               <p className="text-xs text-muted-foreground">Money withdrawn from the business</p>
              </div>
            </div>
            <button
              onClick={() => setDialogOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
               <Plus className="w-3.5 h-3.5" /> Record Owner Withdrawal
            </button>
          </div>

          {/* Summary totals */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-muted/40 rounded-xl p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Earned</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(totalEarned)}</p>
              <p className="text-[10px] text-muted-foreground">from completed and active jobs</p>
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

          {/* View Full History link */}
          <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-end">
            <Link href="/accounting" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              View Full History <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </CardContent>
      </Card>

       {/* Record Owner Withdrawal dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={() => { setDialogOpen(false); setAmount(""); setDate(getTodayStr()); setErr(""); }}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700"><Wallet className="w-4 h-4" /></div>
               <h2 className="text-base font-bold text-foreground">Record Owner Withdrawal</h2>
              <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => { setDialogOpen(false); setAmount(""); setDate(getTodayStr()); setErr(""); }}>✕</button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
               Log money withdrawn from the business.{" "}
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

    </>
  );
}
