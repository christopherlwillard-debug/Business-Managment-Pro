import React, { useState, useEffect } from "react";
import type { AccountingTab } from "../Accounting";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, DollarSign, MapPin, AlertCircle, CheckCircle2,
  AlertTriangle, Calendar, ExternalLink, ChevronDown, CheckCircle,
  Plus, Pencil, Trash2, X, PieChart, ChevronRight, Upload, Eye, EyeOff, Wallet,
  PiggyBank, Shield, RefreshCw,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useBusiness } from "@/contexts/BusinessContext";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { useGoogleAuth } from "@/contexts/GoogleAuth";
import { openDrivePicker } from "@/lib/googleDrivePicker";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function downloadCSV(records: any[], year: number) {
  const OWENSBORO_OCC_RATE = 0.0139;
  const headers = ["Type", "Invoice #", "Date", "Client / Source", "Description", "City", "State", "Subtotal", "Est. Occ. Tax", "Total", "Status", "Payment Method"];
  const rows = records.map((r: any) => {
    const isOwensboro = (r.city ?? "").trim().toLowerCase() === "owensboro";
    const estOccTax = isOwensboro ? ((r.total ?? 0) * OWENSBORO_OCC_RATE) : 0;
    return [
      r.type === "other_income" ? "Other Income" : "Invoice",
      r.invoiceNumber ?? "", r.issueDate ?? "", r.clientName ?? "",
      r.jobTitle ?? "",
      r.city ?? "", r.state ?? "",
      r.subtotal?.toFixed(2) ?? "0.00", estOccTax.toFixed(2),
      r.total?.toFixed(2) ?? "0.00", r.status ?? "",
      r.paymentMethod ?? "",
    ];
  });
  const csvContent = [headers, ...rows].map(row =>
    row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
  ).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `tax-records-${year}.csv`; a.click();
  URL.revokeObjectURL(url);
}

const OTHER_INCOME_API = `${BASE}/api/other-income`;
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash", check: "Check", bank_transfer: "Bank Transfer", other: "Other",
};

function useOtherIncome(year: number, businessLine?: string) {
  return useQuery<any[]>({
    queryKey: ["other-income", year, businessLine ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate: `${year}-01-01`, endDate: `${year}-12-31` });
      if (businessLine) params.set("businessLine", businessLine);
      const res = await fetch(`${OTHER_INCOME_API}?${params}`);
      if (!res.ok) throw new Error("Failed to load other income");
      return res.json();
    },
  });
}

function useCreateOtherIncome(year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(OTHER_INCOME_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["other-income", year] }); qc.invalidateQueries({ queryKey: ["accounting", year] }); qc.invalidateQueries({ queryKey: ["profit-loss", year] }); },
  });
}

function useUpdateOtherIncome(year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await fetch(`${OTHER_INCOME_API}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["other-income", year] }); qc.invalidateQueries({ queryKey: ["accounting", year] }); qc.invalidateQueries({ queryKey: ["profit-loss", year] }); },
  });
}

function useDeleteOtherIncome(year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => { const res = await fetch(`${OTHER_INCOME_API}/${id}`, { method: "DELETE" }); if (!res.ok && res.status !== 204) throw new Error("Failed to delete"); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["other-income", year] }); qc.invalidateQueries({ queryKey: ["accounting", year] }); qc.invalidateQueries({ queryKey: ["profit-loss", year] }); },
  });
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


// ─── Tax Spend Planner ────────────────────────────────────────────────────────
function TaxSpendPlanner({ netProfit, estimatedTaxes }: {
  netProfit: number;
  estimatedTaxes: { owensboroOccTax: number; kyStateTax: number; federalSETax: number; totalEstimated: number };
}) {
  const KY_RATE = 0.04;
  const FED_RATE = 0.9235 * 0.153;
  const COMBINED_RATE = KY_RATE + FED_RATE;

  const currentIncomeTax = estimatedTaxes.kyStateTax + estimatedTaxes.federalSETax;
  const [targetTax, setTargetTax] = useState(String(Math.round(currentIncomeTax * 0.5)));

  const target = Math.max(0, parseFloat(targetTax) || 0);
  const clampedTarget = Math.max(target, 0);

  const targetNetProfit = COMBINED_RATE > 0 ? clampedTarget / COMBINED_RATE : 0;
  const spendingNeeded = Math.max(0, netProfit - targetNetProfit);
  const taxSavings = Math.max(0, currentIncomeTax - clampedTarget);

  return (
    <div className="bg-card border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-amber-50/80 border-b border-amber-200 flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-amber-600" />
        <span className="font-semibold text-sm text-amber-900">Tax Spend Planner</span>
        <span className="text-xs text-amber-700/70 ml-1">— KY State + Federal SE tax only</span>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-muted/30 rounded-xl p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">KY + Federal Tax</p>
            <p className="text-xl font-bold text-amber-700">{formatCurrency(currentIncomeTax)}</p>
          </div>
          <div className="bg-muted/30 rounded-xl p-3">
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">I want to owe</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">$</span>
              <input
                type="number"
                min="0"
                step="100"
                value={targetTax}
                onChange={e => setTargetTax(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 border border-border rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 bg-background"
              />
            </div>
          </div>
        </div>

        {spendingNeeded < 1 ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 font-medium">
            You're already at or below your target. Your current deductible expenses have your tax bill where you want it.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs text-blue-700 font-semibold uppercase tracking-wider mb-1">Additional Deductible Spending Needed</p>
              <p className="text-3xl font-black text-blue-800">{formatCurrency(spendingNeeded)}</p>
              <p className="text-xs text-blue-600 mt-1">Spend this on deductible business expenses to bring your KY + Federal tax from {formatCurrency(currentIncomeTax)} down to {formatCurrency(clampedTarget)}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-muted/40 rounded-lg p-2">
                <p className="text-muted-foreground">Tax savings</p>
                <p className="font-bold text-emerald-700">{formatCurrency(taxSavings)}</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-2">
                <p className="text-muted-foreground">SE + KY rate</p>
                <p className="font-bold text-foreground">{(COMBINED_RATE * 100).toFixed(1)}¢/dollar</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-2">
                <p className="text-muted-foreground">Income tax left</p>
                <p className="font-bold text-foreground">{formatCurrency(currentIncomeTax - taxSavings)}</p>
              </div>
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground italic">Estimate only. Every deductible dollar you spend reduces net profit, saving ~{(COMBINED_RATE * 100).toFixed(1)} cents in federal SE + KY state tax. Consult a tax professional for your specific situation.</p>
      </div>
    </div>
  );
}

// ─── Reserve Summary Hook ─────────────────────────────────────────────────────
function useReserveSummary(year: number) {
  return useQuery<{
    months: { month: string; revenue: number; subLaborCost: number; ownerShare: number; taxReserve: number; growthFund: number; takeHome: number }[];
    ytd: { revenue: number; subLaborCost: number; ownerShare: number; taxReserve: number; growthFund: number; takeHome: number };
  }>({
    queryKey: ["reserve-summary", year],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/reports/reserve-summary?year=${year}`);
      if (!res.ok) throw new Error("Failed to load reserve summary");
      return res.json();
    },
  });
}

// ─── Growth Fund Deployments Hooks ────────────────────────────────────────────
type GrowthFundDeployment = { id: number; date: string; description: string; notes?: string | null; amount: number; createdAt: string };

function useGrowthFundDeployments(year: number) {
  return useQuery<GrowthFundDeployment[]>({
    queryKey: ["growth-fund-deployments", year],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/reports/growth-fund-deployments?year=${year}`);
      if (!res.ok) throw new Error("Failed to load growth fund investments");
      return res.json();
    },
  });
}

function useCreateGrowthFundDeployment(year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { date: string; description: string; amount: string; notes?: string }) => {
      const res = await fetch(`${BASE}/api/reports/growth-fund-deployments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save investment");
      return json;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["growth-fund-deployments", year] }); },
  });
}

function useDeleteGrowthFundDeployment(year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/reports/growth-fund-deployments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete investment");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["growth-fund-deployments", year] }); },
  });
}

// ─── Business Reserve Dashboard ──────────────────────────────────────────────
interface BusinessReserveData {
  estimatedTaxes: number;
  taxBreakdown: { federalSE: number; kyState: number; occ: number };
  growthFundAvailable: number;
  growthFundIncluded: boolean;
  annualOverhead: number;
  monthlyRecurring: number;
  operatingReserve: number;
  operatingReserveMode: string;
  operatingReserveCustom: number | null;
  requiredReserve: number;
  checkingBalance: number | null;
  balanceCachedAt: string | null;
  availableToSpend: number | null;
  reserveHealth: "funded" | "low" | "below" | null;
  overheadCoverageDays: number | null;
  overheadCoverageMonths: number | null;
  plaidConnected: boolean;
}

// ─── Take-Home Dashboard ─────────────────────────────────────────────────────
// Reads from owner-pay-summary (the My Pay ledger) so it always matches the
// My Pay card on the Dashboard — one source of truth, no duplicate calculations.
function TakeHomeDashboard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();

  // Full summary including individual withdrawal records for edit/delete
  const { data, isLoading } = useQuery<{
    totalEarned: number;
    totalWithdrawn: number;
    remaining: number;
    monthlyPaid: { month: string; paid: number }[];
    withdrawals: { id: string; date: string | null; amount: number; description: string }[];
  }>({
    queryKey: ["owner-pay-summary"],
    queryFn: () => fetch(`${BASE}/api/reports/owner-pay-summary`, { credentials: "include" }).then(r => r.json()),
  });

  // Dialog state — used for both new entries and edits
  const [dialog, setDialog] = useState<{
    open: boolean;
    editId: string | null; // "exp-123" or null for new
    amount: string;
    date: string;
    description: string;
    saving: boolean;
    error: string;
  }>({ open: false, editId: null, amount: "", date: "", description: "", saving: false, error: "" });

  // Month that's expanded to show individual entries (YYYY-MM key)
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  function openNew() {
    const today = new Date();
    const defaultDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setDialog({ open: true, editId: null, amount: "", date: defaultDate, description: "Owner Pay", saving: false, error: "" });
  }

  function openEdit(w: { id: string; date: string | null; amount: number; description: string }) {
    setDialog({
      open: true,
      editId: w.id,
      amount: String(w.amount),
      date: w.date ?? new Date().toISOString().slice(0, 10),
      description: w.description ?? "Owner Pay",
      saving: false,
      error: "",
    });
  }

  function closeDialog() {
    setDialog(d => ({ ...d, open: false, error: "" }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(dialog.amount);
    if (!amt || amt <= 0) { setDialog(d => ({ ...d, error: "Enter a valid amount" })); return; }
    setDialog(d => ({ ...d, saving: true, error: "" }));

    try {
      if (dialog.editId) {
        // Edit existing expense
        const expenseId = dialog.editId.replace("exp-", "");
        const res = await fetch(`${BASE}/api/expenses/${expenseId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ amount: amt, date: dialog.date, description: dialog.description, category: "Owner Compensation" }),
        });
        if (!res.ok) throw new Error();
        toast({ title: "Entry updated" });
      } else {
        // New entry
        const res = await fetch(`${BASE}/api/expenses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ description: dialog.description || "Owner Pay", amount: amt, category: "Owner Compensation", date: dialog.date, excludeFromNetProfit: true }),
        });
        if (!res.ok) throw new Error();
        toast({ title: "Owner pay recorded", description: `${formatCurrency(amt)} logged` });
      }
      qc.invalidateQueries({ queryKey: ["owner-pay-summary"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      closeDialog();
    } catch {
      setDialog(d => ({ ...d, error: "Failed to save. Try again.", saving: false }));
      return;
    }
    setDialog(d => ({ ...d, saving: false }));
  }

  async function handleDelete(w: { id: string; amount: number }) {
    if (!confirm(`Delete this $${w.amount.toFixed(2)} owner pay entry?`)) return;
    const expenseId = w.id.replace("exp-", "");
    try {
      const res = await fetch(`${BASE}/api/expenses/${expenseId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ["owner-pay-summary"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({ title: "Entry deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  }

  if (isLoading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (!data) return null;

  const monthlyPaid    = data.monthlyPaid ?? [];
  const withdrawals    = data.withdrawals ?? [];
  const totalPaid      = data.totalWithdrawn ?? 0;
  const paidMonths     = monthlyPaid.filter(m => m.paid > 0).length;
  const avgMonthly     = paidMonths > 0 ? totalPaid / paidMonths : 0;

  // Build full 12-month grid for current year, newest first
  const allMonths: { month: string; paid: number }[] = [];
  for (let mo = 12; mo >= 1; mo--) {
    const key = `${currentYear}-${String(mo).padStart(2, "0")}`;
    const found = monthlyPaid.find(m => m.month === key);
    allMonths.push({ month: key, paid: found?.paid ?? 0 });
  }

  // Index withdrawals by YYYY-MM for the expanded row
  const withdrawalsByMonth = new Map<string, typeof withdrawals>();
  for (const w of withdrawals) {
    if (!w.date) continue;
    const key = w.date.slice(0, 7);
    if (!withdrawalsByMonth.has(key)) withdrawalsByMonth.set(key, []);
    withdrawalsByMonth.get(key)!.push(w);
  }

  // Last month that has a payment (for "Last Month" stat)
  const lastPaidMonth = [...monthlyPaid].sort((a, b) => b.month.localeCompare(a.month)).find(m => m.paid > 0);

  return (
    <>
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="px-5 py-3 bg-emerald-700 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-200 flex-shrink-0" />
            <span className="font-bold text-sm text-white">Owner Pay Dashboard</span>
            <span className="hidden sm:inline text-[10px] text-emerald-200">Actual payments from the business to you</span>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Record Pay
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Three summary stats */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Paid YTD</p>
              <p className="text-2xl font-black text-emerald-700">{formatCurrency(totalPaid)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Avg / Month</p>
              <p className="text-xl font-bold text-foreground">{paidMonths > 0 ? formatCurrency(avgMonthly) : "—"}</p>
              {paidMonths > 0 && <p className="text-[10px] text-muted-foreground">across {paidMonths} month{paidMonths !== 1 ? "s" : ""}</p>}
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Last Paid</p>
              <p className="text-xl font-bold text-foreground">
                {lastPaidMonth
                  ? new Date(lastPaidMonth.month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" })
                  : "—"}
              </p>
              {lastPaidMonth && <p className="text-[10px] text-emerald-700 font-semibold">{formatCurrency(lastPaidMonth.paid)}</p>}
            </div>
          </div>

          {/* Full 12-month grid */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="bg-muted/30 px-4 py-2 border-b border-border flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>{currentYear} — Month by Month</span>
              <span>Paid to You</span>
            </div>
            <div className="divide-y divide-border/30">
              {allMonths.map(m => {
                const label     = new Date(m.month + "-01").toLocaleDateString("en-US", { month: "long" });
                const entries   = withdrawalsByMonth.get(m.month) ?? [];
                const isExpanded = expandedMonth === m.month && entries.length > 0;
                const isFuture  = m.month > new Date().toISOString().slice(0, 7);

                return (
                  <React.Fragment key={m.month}>
                    <div
                      className={`px-4 py-2.5 flex items-center gap-2 text-sm
                        ${m.paid > 0 ? "cursor-pointer hover:bg-muted/30 transition-colors" : ""}
                        ${isFuture ? "opacity-35" : ""}`}
                      onClick={() => m.paid > 0 && setExpandedMonth(isExpanded ? null : m.month)}
                    >
                      <span className={`font-semibold flex-1 ${m.paid === 0 && !isFuture ? "text-muted-foreground" : "text-foreground"}`}>
                        {label}
                      </span>
                      {m.paid > 0 ? (
                        <>
                          <span className="text-emerald-700 font-bold">{formatCurrency(m.paid)}</span>
                          {entries.length > 1 && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                              {entries.length}
                            </span>
                          )}
                          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </>
                      ) : (
                        <span className={`text-xs ${isFuture ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                          {isFuture ? "—" : "$0"}
                        </span>
                      )}
                    </div>

                    {/* Expanded: individual entries for this month */}
                    {isExpanded && entries.map(w => (
                      <div key={w.id} className="px-6 py-2 flex items-center gap-2 bg-muted/20 text-xs border-t border-border/20">
                        <span className="text-muted-foreground w-20 flex-shrink-0">
                          {w.date ? new Date(w.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                        </span>
                        <span className="flex-1 text-foreground truncate">{w.description}</span>
                        <span className="font-semibold text-emerald-700">{formatCurrency(w.amount)}</span>
                        <button
                          onClick={e => { e.stopPropagation(); openEdit(w); }}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(w); }}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground italic">
            Actual payments made to you — tap any month to see individual entries.
          </p>
        </div>
      </div>

      {/* Record / Edit dialog */}
      {dialog.open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
          onClick={closeDialog}
        >
          <div
            className="bg-card rounded-[20px] shadow-2xl w-full max-w-sm p-6 border border-border"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700"><Wallet className="w-4 h-4" /></div>
              <h2 className="text-base font-bold text-foreground">
                {dialog.editId ? "Edit Pay Entry" : "Record Owner Pay"}
              </h2>
              <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={closeDialog}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4 ml-10">
              {dialog.editId ? "Update this payment entry." : "Log a payment you took from the business."}
            </p>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                  <input
                    type="number" step="0.01" min="0.01" required autoFocus
                    value={dialog.amount}
                    onChange={e => setDialog(d => ({ ...d, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date *</label>
                <input
                  type="date" required
                  value={dialog.date}
                  onChange={e => setDialog(d => ({ ...d, date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={dialog.description}
                  onChange={e => setDialog(d => ({ ...d, description: e.target.value }))}
                  placeholder="Owner Pay"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {dialog.error && <p className="text-xs text-destructive">{dialog.error}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="button" onClick={closeDialog}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground border border-border hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={dialog.saving}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-60 transition-colors"
                >
                  {dialog.saving ? "Saving…" : dialog.editId ? "Update" : "Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Business Overview ────────────────────────────────────────────────────────
function BusinessOverview({ s, year, netProfit, otherIncomeTotal }: { s: any; year: number; netProfit: number; otherIncomeTotal: number }) {
  const pendingAmt = (s.grossRevenue ?? 0) - (s.paidRevenue ?? 0);
  const profitMargin = (s.paidRevenue ?? 0) > 0 ? (netProfit / (s.paidRevenue as number)) * 100 : 0;
  const outstandingPct = (s.grossRevenue ?? 0) > 0 ? (pendingAmt / (s.grossRevenue as number)) * 100 : 0;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span className="font-semibold text-sm text-foreground">Business Overview</span>
          <span className="text-xs text-muted-foreground">Year to date overview</span>
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{year} YTD</span>
      </div>
      <div className="p-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* Est. Net Profit */}
        <div className={`rounded-xl border p-3 ${netProfit >= 0 ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40"}`}>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Est. Net Profit</p>
          <p className={`text-xl font-bold mt-0.5 leading-tight ${netProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{formatCurrency(netProfit)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{profitMargin.toFixed(1)}% margin</p>
        </div>
        {/* Collected */}
        <div className="rounded-xl border border-border p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Collected</p>
          <p className="text-xl font-bold mt-0.5 leading-tight text-foreground">{formatCurrency(s.paidRevenue ?? 0)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{otherIncomeTotal > 0 ? "Invoices + other income" : "Paid invoices only"}</p>
        </div>
        {/* Total Invoiced */}
        <div className="rounded-xl border border-border p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Total Invoiced</p>
          <p className="text-xl font-bold mt-0.5 leading-tight text-foreground">{formatCurrency(s.grossRevenue ?? 0)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{pendingAmt > 0 ? `${formatCurrency(pendingAmt)} outstanding` : "All collected"}</p>
        </div>
        {/* Expenses */}
        <div className="rounded-xl border border-border p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Expenses</p>
          <p className="text-xl font-bold mt-0.5 leading-tight text-red-600">{formatCurrency(s.businessExpenses ?? s.totalExpenses ?? 0)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">+{formatCurrency(s.mileageDeduction ?? 0)} mileage</p>
        </div>
        {/* Outstanding */}
        <div className={`rounded-xl border p-3 ${pendingAmt > 0 ? "border-amber-200 bg-amber-50/40" : "border-border"}`}>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Outstanding</p>
          <p className={`text-xl font-bold mt-0.5 leading-tight ${pendingAmt > 0 ? "text-amber-700" : "text-muted-foreground"}`}>{formatCurrency(pendingAmt)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{outstandingPct > 0 ? `${outstandingPct.toFixed(1)}% of invoiced` : "All collected"}</p>
        </div>
        {/* Profit Margin */}
        <div className={`rounded-xl border p-3 ${profitMargin >= 0 ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40"}`}>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Profit Margin</p>
          <p className={`text-xl font-bold mt-0.5 leading-tight ${profitMargin >= 0 ? "text-emerald-700" : "text-red-600"}`}>{profitMargin.toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">of collected revenue</p>
        </div>
      </div>
    </div>
  );
}

function BusinessReserveDashboard() {
  const year = new Date().getFullYear();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<BusinessReserveData>({
    queryKey: ["business-reserve"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/reports/business-reserve`);
      if (!res.ok) throw new Error("Failed to load business reserve");
      return res.json();
    },
  });

  const { data: reserveSummary } = useReserveSummary(year);
  const { data: deployments = [] } = useGrowthFundDeployments(year);
  const createDeployment = useCreateGrowthFundDeployment(year);
  const deleteDeployment = useDeleteGrowthFundDeployment(year);

  const [expanded, setExpanded] = useState<"taxes" | "overhead" | "buffer" | "growth" | null>(null);
  const [localMode, setLocalMode] = useState<string | null>(null);
  const [operatingCustom, setOperatingCustom] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [showInvestmentForm, setShowInvestmentForm] = useState(false);
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formDesc, setFormDesc] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function refreshBalance() {
    setRefreshingBalance(true);
    try {
      await fetch(`${BASE}/api/plaid/balance?force=true`, { credentials: "include" });
      await qc.invalidateQueries({ queryKey: ["plaid-balance"] });
      await qc.invalidateQueries({ queryKey: ["business-reserve"] });
    } finally {
      setRefreshingBalance(false);
    }
  }

  async function saveSettings(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      await qc.invalidateQueries({ queryKey: ["business-reserve"] });
    } finally { setSaving(false); }
  }

  async function handleSaveInvestment() {
    setFormError(null);
    if (!formDate || !formDesc.trim() || !formAmount) { setFormError("All fields are required."); return; }
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) { setFormError("Enter a valid amount greater than $0."); return; }
    try {
      await createDeployment.mutateAsync({ date: formDate, description: formDesc.trim(), amount: formAmount, notes: formNotes.trim() || undefined });
      setShowInvestmentForm(false);
      setFormDesc(""); setFormAmount(""); setFormNotes(""); setFormError(null);
      toast({ title: "Investment logged" });
    } catch (err: any) {
      setFormError(err.message ?? "Failed to save investment");
    }
  }

  if (isLoading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (!data) return null;

  const {
    estimatedTaxes, taxBreakdown, growthFundAvailable, growthFundIncluded,
    annualOverhead, monthlyRecurring, operatingReserve,
    operatingReserveMode, operatingReserveCustom,
    requiredReserve, checkingBalance, balanceCachedAt, availableToSpend,
    reserveHealth, overheadCoverageMonths,
    plaidConnected,
  } = data;

  const effectiveMode = localMode ?? operatingReserveMode;

  const ytd = reserveSummary?.ytd ?? { taxReserve: 0, growthFund: 0, ownerShare: 0, takeHome: 0, revenue: 0, subLaborCost: 0 };
  const totalInvested = deployments.reduce((s, d) => s + d.amount, 0);
  const growthAvailable = Math.max(0, ytd.growthFund - totalInvested);
  const overUnder = ytd.taxReserve - estimatedTaxes;

  const toggle = (key: "taxes" | "overhead" | "buffer" | "growth") =>
    setExpanded(v => v === key ? null : key);

  const healthConfig = {
    funded: { label: "Fully Funded", badgeCls: "bg-emerald-100 text-emerald-800" },
    low:    { label: "Getting Low",  badgeCls: "bg-amber-100 text-amber-800" },
    below:  { label: "Below Reserve", badgeCls: "bg-red-100 text-red-800" },
  };
  const health = reserveHealth ? healthConfig[reserveHealth] : null;

  return (
    <div id="business-reserve-dashboard" className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-3 bg-slate-800 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <PiggyBank className="w-4 h-4 text-slate-300" />
          <span className="font-bold text-sm text-white">Business Reserve Dashboard</span>
          <span className="text-[10px] text-slate-400 hidden sm:inline">Cash planning at a glance</span>
        </div>
        <div className="flex items-center gap-2">
          {balanceCachedAt && (
            <span className="text-[10px] text-slate-400">
              Updated {new Date(balanceCachedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })},{" "}
              {new Date(balanceCachedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={refreshBalance}
            disabled={refreshingBalance}
            className="text-slate-400 hover:text-white disabled:opacity-40 transition-colors"
            title="Refresh balance from bank"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingBalance ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Two-column hero */}
        <div className="grid grid-cols-[1fr_auto] gap-3">
          {/* Left — Keep in Checking */}
          <div className="rounded-xl bg-slate-900 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Keep in Business Checking</p>
            <p className="text-3xl font-black text-white leading-none">{formatCurrency(requiredReserve)}</p>
            <p className="text-[10px] text-slate-400 mt-1.5">Minimum that should remain in your checking account today</p>
          </div>

          {/* Right — Balance + Difference */}
          <div className="rounded-xl border border-border p-3 min-w-[140px] space-y-2.5 flex flex-col justify-between">
            <div>
              <p className="text-[9px] text-muted-foreground uppercase font-semibold tracking-wide">Current Checking Balance</p>
              {plaidConnected && checkingBalance != null ? (
                <p className="font-bold text-foreground text-sm mt-0.5">{formatCurrency(checkingBalance)}</p>
              ) : (
                <p className="text-sm text-muted-foreground mt-0.5 italic text-xs">Connect bank</p>
              )}
            </div>
            {availableToSpend != null ? (
              <div>
                <p className="text-[9px] text-muted-foreground uppercase font-semibold tracking-wide">Reserve Difference</p>
                <p className={`font-bold text-sm mt-0.5 ${availableToSpend >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {availableToSpend >= 0 ? formatCurrency(availableToSpend) : `−${formatCurrency(Math.abs(availableToSpend))}`}
                </p>
                <span className={`inline-block mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${availableToSpend >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  {availableToSpend >= 0 ? (health?.label ?? "Healthy") : "Short Reserve"}
                </span>
              </div>
            ) : health ? (
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${health.badgeCls}`}>{health.label}</span>
            ) : null}
          </div>
        </div>

        {/* Reserve Breakdown — single-column accordion */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Reserve Breakdown</p>
          <div className="space-y-2">

            {/* ── Estimated Taxes ── */}
            <div className="rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => toggle("taxes")}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <DollarSign className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">Estimated Taxes</p>
                  <p className="text-[10px] text-muted-foreground">YTD estimated liability</p>
                </div>
                <span className="text-sm font-bold text-amber-700 shrink-0">{formatCurrency(estimatedTaxes)}</span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded === "taxes" ? "rotate-180" : ""}`} />
              </button>
              {expanded === "taxes" && (
                <div className="border-t border-border p-4 bg-amber-50/40 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-white border border-amber-200 p-2 text-center">
                      <p className="text-[9px] uppercase font-semibold text-amber-700">Federal SE</p>
                      <p className="text-xs font-bold text-amber-800">{formatCurrency(taxBreakdown.federalSE)}</p>
                      <p className="text-[9px] text-amber-600">15.3% × 92.35%</p>
                    </div>
                    <div className="rounded-lg bg-white border border-amber-200 p-2 text-center">
                      <p className="text-[9px] uppercase font-semibold text-amber-700">KY State</p>
                      <p className="text-xs font-bold text-amber-800">{formatCurrency(taxBreakdown.kyState)}</p>
                      <p className="text-[9px] text-amber-600">4.0% flat</p>
                    </div>
                    <div className="rounded-lg bg-white border border-amber-200 p-2 text-center">
                      <p className="text-[9px] uppercase font-semibold text-amber-700">OCC Tax</p>
                      <p className="text-xs font-bold text-amber-800">{formatCurrency(taxBreakdown.occ)}</p>
                      <p className="text-[9px] text-amber-600">1.39% Owensboro</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Tax Reserve vs. Liability</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-center">
                        <p className="text-[9px] uppercase font-semibold text-amber-700">Reserved (25%)</p>
                        <p className="text-xs font-bold text-amber-800">{formatCurrency(ytd.taxReserve)}</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 border border-blue-200 p-2 text-center">
                        <p className="text-[9px] uppercase font-semibold text-blue-700">Est. Liability</p>
                        <p className="text-xs font-bold text-blue-800">{formatCurrency(estimatedTaxes)}</p>
                      </div>
                      <div className={`rounded-lg p-2 text-center border ${overUnder >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                        <p className={`text-[9px] uppercase font-semibold ${overUnder >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                          {overUnder >= 0 ? "Over" : "Under"}
                        </p>
                        <p className={`text-xs font-bold ${overUnder >= 0 ? "text-emerald-800" : "text-red-800"}`}>
                          {overUnder >= 0 ? "+" : "−"}{formatCurrency(Math.abs(overUnder))}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Business Overhead ── */}
            <div className="rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => toggle("overhead")}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">Business Overhead</p>
                  <p className="text-[10px] text-muted-foreground">Estimated annual recurring expenses</p>
                </div>
                <span className="text-sm font-bold text-purple-700 shrink-0">{formatCurrency(annualOverhead)}</span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded === "overhead" ? "rotate-180" : ""}`} />
              </button>
              {expanded === "overhead" && (
                <div className="border-t border-border p-4 bg-purple-50/40 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-purple-700">Annual overhead</span>
                    <span className="font-semibold text-purple-800">{formatCurrency(annualOverhead)}</span>
                  </div>
                  {overheadCoverageMonths != null && overheadCoverageMonths > 0 ? (
                    <p className="text-[10px] text-purple-600">
                      Reserve covers approximately {overheadCoverageMonths} month{overheadCoverageMonths !== 1 ? "s" : ""} of expenses
                    </p>
                  ) : monthlyRecurring === 0 ? (
                    <p className="text-[10px] text-muted-foreground">No active recurring expenses configured yet.</p>
                  ) : null}
                </div>
              )}
            </div>

            {/* ── Growth Fund ── */}
            <div className={`rounded-xl border overflow-hidden ${growthFundIncluded ? "border-border" : "border-dashed border-muted-foreground/40"}`}>
              <button
                onClick={() => toggle("growth")}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${growthFundIncluded ? "bg-emerald-100" : "bg-muted/40"}`}>
                  <TrendingUp className={`w-4 h-4 ${growthFundIncluded ? "text-emerald-600" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold leading-tight ${growthFundIncluded ? "text-foreground" : "text-muted-foreground"}`}>Growth Fund</p>
                  <p className="text-[10px] text-muted-foreground">5% investment reserve</p>
                </div>
                <span className={`text-sm font-bold shrink-0 ${growthFundIncluded ? "text-emerald-700" : "text-muted-foreground"}`}>{formatCurrency(growthFundAvailable)}</span>
                {/* Inline include-in-reserve toggle */}
                <button
                  disabled={saving}
                  onClick={e => { e.stopPropagation(); saveSettings({ includeGrowthFundInReserve: !growthFundIncluded }); }}
                  className={`relative w-8 h-4 rounded-full transition-colors shrink-0 disabled:opacity-50 ${growthFundIncluded ? "bg-emerald-500" : "bg-muted"}`}
                  title={growthFundIncluded ? "Remove from reserve" : "Include in reserve"}
                >
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${growthFundIncluded ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                </button>
                <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded === "growth" ? "rotate-180" : ""}`} />
              </button>
              {expanded === "growth" && (
                <div className="border-t border-border p-4 space-y-3">
                  {/* Accumulated / Invested / Available */}
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-blue-600">Accumulated (5% of revenue)</span>
                      <span className="text-xs font-semibold text-blue-800">{formatCurrency(ytd.growthFund)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-blue-600">Invested</span>
                      <span className="text-xs font-semibold text-blue-700">− {formatCurrency(totalInvested)}</span>
                    </div>
                    <div className="border-t border-blue-200 pt-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-blue-700">Available in Reserve</span>
                      <span className="text-sm font-black text-blue-900">{formatCurrency(growthAvailable)}</span>
                    </div>
                  </div>
                  {/* Investment log */}
                  <div className="rounded-lg border border-blue-200 bg-blue-50/40 overflow-hidden">
                    <div className="px-3 py-2 bg-blue-100/60 border-b border-blue-200 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Investments Made</span>
                      {!showInvestmentForm && (
                        <button onClick={() => setShowInvestmentForm(true)}
                          className="flex items-center gap-1 text-[10px] font-semibold text-blue-700 hover:text-blue-900">
                          <Plus className="w-3 h-3" /> Add Investment
                        </button>
                      )}
                    </div>
                    {showInvestmentForm && (
                      <div className="p-3 border-b border-blue-200 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground block mb-0.5">Date</label>
                            <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                              className="w-full text-xs border border-border rounded-md px-2 py-1 bg-background" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground block mb-0.5">Amount ($)</label>
                            <input type="number" min="0.01" step="0.01" placeholder="0.00" value={formAmount}
                              onChange={e => setFormAmount(e.target.value)}
                              className="w-full text-xs border border-border rounded-md px-2 py-1 bg-background" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Description</label>
                          <input type="text" placeholder="e.g. New pressure washer" value={formDesc}
                            onChange={e => setFormDesc(e.target.value)}
                            className="w-full text-xs border border-border rounded-md px-2 py-1 bg-background" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Notes <span className="text-muted-foreground/60">(optional)</span></label>
                          <textarea placeholder="e.g. Invoice #1042" value={formNotes}
                            onChange={e => setFormNotes(e.target.value)} rows={2}
                            className="w-full text-xs border border-border rounded-md px-2 py-1 bg-background resize-none" />
                        </div>
                        {formError && <p className="text-[10px] text-red-600 font-medium">{formError}</p>}
                        <div className="flex gap-2">
                          <button onClick={handleSaveInvestment} disabled={createDeployment.isPending}
                            className="flex-1 text-xs font-semibold bg-blue-600 text-white rounded-md py-1.5 hover:bg-blue-700 disabled:opacity-50">
                            {createDeployment.isPending ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => { setShowInvestmentForm(false); setFormError(null); setFormDesc(""); setFormAmount(""); setFormNotes(""); }}
                            className="flex-1 text-xs font-semibold border border-border rounded-md py-1.5 text-muted-foreground hover:bg-muted/40">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {deployments.length === 0 && !showInvestmentForm && (
                      <p className="text-[10px] text-muted-foreground text-center py-3 px-3">
                        No investments logged yet. Tap "Add Investment" when you deploy growth fund money.
                      </p>
                    )}
                    {deployments.length > 0 && (
                      <div className="divide-y divide-blue-100">
                        {deployments.map(d => {
                          const label = new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
                          return (
                            <div key={d.id} className="px-3 py-2 flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{d.description}</p>
                                <p className="text-[10px] text-muted-foreground">{label}</p>
                                {d.notes && <p className="text-[10px] text-muted-foreground/80 italic truncate">{d.notes}</p>}
                              </div>
                              <span className="text-xs font-semibold text-blue-800 shrink-0">{formatCurrency(d.amount)}</span>
                              <button onClick={() => deleteDeployment.mutate(d.id)} disabled={deleteDeployment.isPending}
                                className="shrink-0 text-muted-foreground hover:text-red-600 disabled:opacity-40" title="Remove investment">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Operating Buffer ── */}
            <div className="rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => toggle("buffer")}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">Operating Buffer</p>
                  <p className="text-[10px] text-muted-foreground">
                    {operatingReserveMode === "0" ? "Emergency cash reserve"
                      : operatingReserveMode === "custom" ? "Custom amount"
                      : `${operatingReserveMode} month${operatingReserveMode !== "1" ? "s" : ""} of overhead`}
                  </p>
                </div>
                <span className="text-sm font-bold text-blue-700 shrink-0">{formatCurrency(operatingReserve)}</span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded === "buffer" ? "rotate-180" : ""}`} />
              </button>
              {expanded === "buffer" && (
                <div className="border-t border-border px-4 py-4 bg-muted/30 space-y-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Buffer amount</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(["0", "1", "2", "3", "custom"] as const).map(opt => (
                      <button
                        key={opt}
                        disabled={saving}
                        onClick={() => {
                          setLocalMode(opt);
                          if (opt !== "custom") {
                            saveSettings({ operatingReserveMode: opt, operatingReserveCustom: null });
                          }
                        }}
                        className={`text-xs font-semibold py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                          effectiveMode === opt ? "bg-blue-600 text-white border-blue-600" : "border-border hover:bg-muted/60"
                        }`}
                      >
                        {opt === "0" ? "None" : opt === "custom" ? "Custom" : `${opt}mo`}
                      </button>
                    ))}
                  </div>
                  {effectiveMode === "custom" && (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                        <input
                          type="number" min="0" step="1" placeholder="0.00"
                          value={operatingCustom || (operatingReserveCustom != null ? String(operatingReserveCustom) : "")}
                          onChange={e => setOperatingCustom(e.target.value)}
                          className="w-full pl-6 pr-3 py-1.5 border border-border rounded-lg text-xs bg-background focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                      <button
                        disabled={saving}
                        onClick={() => {
                          const rawValue = operatingCustom !== ""
                            ? operatingCustom
                            : operatingReserveCustom != null ? String(operatingReserveCustom) : "";
                          const parsed = parseFloat(rawValue);
                          if (!rawValue || isNaN(parsed)) return;
                          saveSettings({ operatingReserveMode: "custom", operatingReserveCustom: parsed });
                        }}
                        className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>

        <p className="text-[11px] text-muted-foreground italic">
          Cash-flow planning only · Not based on taxable income · Reserve amounts come from paid jobs this year.
        </p>
      </div>
    </div>
  );
}

// ─── Overview Dashboard ──────────────────────────────────────────────────────

function OverviewTab({ data, year, setActiveTab }: { data: any; year: number; setActiveTab: (tab: AccountingTab) => void }) {
  const { activeBusiness, businesses } = useBusiness();
  const [, navigate] = useLocation();
  const s = data?.summary ?? {};
  const netProfit = s.netProfit ?? 0;
  const otherIncomeTotal: number = s.otherIncomeTotal ?? 0;

  const { data: otherIncomeRows = [], isLoading: oiLoading } = useOtherIncome(year, activeBusiness?.slug);
  const createOI = useCreateOtherIncome(year);
  const updateOI = useUpdateOtherIncome(year);
  const deleteOI = useDeleteOtherIncome(year);
  const [oiForm, setOiForm] = useState<null | Partial<{ id: number; amount: string; date: string; description: string; source: string; paymentMethod: string; city: string; state: string; notes: string; businessLine: string; clientId: number | null }>>(null);
  const [oiSaving, setOiSaving] = useState(false);
  const [expandedCity, setExpandedCity] = useState<string | null>(null);
  const [pendingEditId, setPendingEditId] = useState<number | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("editId");
    return editId ? parseInt(editId, 10) : null;
  });
  const [pendingNewEntry, setPendingNewEntry] = useState<{ clientId: number | null } | null>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("newEntry") === "true") {
      const clientIdRaw = params.get("clientId");
      const clientIdParsed = clientIdRaw ? parseInt(clientIdRaw, 10) : NaN;
      return { clientId: Number.isFinite(clientIdParsed) ? clientIdParsed : null };
    }
    return null;
  });
  // ── Owner Capital Recovery ──────────────────────────────────────────────────
  const qc = useQueryClient();
  const { toast } = useToast();
  const capitalBizId = activeBusiness?.id ?? null;
  const { data: capitalEntries = [], isLoading: capitalLoading } = useQuery<{ id: number; businessId: number | null; date: string; description: string; amount: number; createdAt: string }[]>({
    queryKey: ["owner-capital", capitalBizId],
    queryFn: () => fetch(`${BASE}/api/owner-capital${capitalBizId != null ? `?businessId=${capitalBizId}` : ""}`).then(r => r.json()),
  });
  const { data: allSubsForSplit = [] } = useQuery<any[]>({
    queryKey: ["subcontractors"],
    queryFn: () => fetch(`${BASE}/api/subcontractors`).then(r => r.json()),
  });
  const [capitalForm, setCapitalForm] = useState<{ date: string; description: string; amount: string; type: "injection" | "withdrawal" } | null>(null);
  const [capitalSaving, setCapitalSaving] = useState(false);
  const createCapitalEntry = useMutation({
    mutationFn: async (payload: { date: string; description: string; amount: number; businessId: number | null }) => {
      const res = await fetch(`${BASE}/api/owner-capital`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save entry");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-capital", capitalBizId] }),
  });
  const deleteCapitalEntry = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/owner-capital/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-capital", capitalBizId] }),
  });

  const { data: ownerDrawExpenses = [] } = useQuery<{id: number; description: string; date: string; amount: string}[]>({
    queryKey: ["owner-draw-expenses", year],
    queryFn: () => fetch(`${BASE}/api/expenses?startDate=${year}-01-01&endDate=${year}-12-31&category=Owner+Draw`).then(r => r.json()),
  });
  const deleteOwnerDraw = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete owner draw");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner-draw-expenses", year] });
      qc.invalidateQueries({ queryKey: ["accounting", year] });
      qc.invalidateQueries({ queryKey: ["profit-loss", year] });
    },
  });

  const { data: clientsList = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["clients-list-oi"],
    queryFn: () => fetch(`${BASE}/api/clients`).then(r => r.json()),
  });

  const { canEdit } = useUserPermissions();

  useEffect(() => {
    if (pendingEditId == null || oiLoading) return;
    const clearParams = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("module");
      url.searchParams.delete("editId");
      url.searchParams.delete("year");
      window.history.replaceState({}, "", url.toString());
    };
    const row = otherIncomeRows.find((r: any) => r.id === pendingEditId);
    if (row) {
      openEditOI(row);
    }
    setPendingEditId(null);
    clearParams();
  }, [pendingEditId, oiLoading, otherIncomeRows]);

  useEffect(() => {
    if (pendingNewEntry == null) return;
    const clearParams = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("module");
      url.searchParams.delete("newEntry");
      url.searchParams.delete("clientId");
      window.history.replaceState({}, "", url.toString());
    };
    if (canEdit("invoices")) {
      setOiForm({ amount: "", date: new Date().toISOString().split("T")[0], description: "", source: "", paymentMethod: "cash", city: "", state: "", notes: "", businessLine: activeBusiness?.slug ?? "", clientId: pendingNewEntry.clientId });
    }
    setPendingNewEntry(null);
    clearParams();
  }, [pendingNewEntry, canEdit]);

  function openAddOI() {
    setOiForm({ amount: "", date: new Date().toISOString().split("T")[0], description: "", source: "", paymentMethod: "cash", city: "", state: "", notes: "", businessLine: activeBusiness?.slug ?? "", clientId: null });
  }
  function openEditOI(row: any) {
    setOiForm({ id: row.id, amount: String(row.amount), date: row.date, description: row.description, source: row.source ?? "", paymentMethod: row.paymentMethod ?? "cash", city: row.city ?? "", state: row.state ?? "", notes: row.notes ?? "", businessLine: row.businessLine ?? "", clientId: row.clientId ?? null });
  }
  async function handleSaveOI(e: React.FormEvent) {
    e.preventDefault();
    if (!oiForm) return;
    setOiSaving(true);
    try {
      const payload = { amount: oiForm.amount, date: oiForm.date, description: oiForm.description, source: oiForm.source || null, paymentMethod: oiForm.paymentMethod || "other", city: oiForm.city || null, state: oiForm.state || null, notes: oiForm.notes || null, businessLine: oiForm.businessLine || null, clientId: oiForm.clientId ?? null };
      if (oiForm.id) { await updateOI.mutateAsync({ id: oiForm.id, ...payload }); }
      else { await createOI.mutateAsync(payload); }
      setOiForm(null);
    } catch { } finally { setOiSaving(false); }
  }
  async function handleDeleteOI(id: number) {
    if (!confirm("Delete this income entry?")) return;
    await deleteOI.mutateAsync(id);
  }

  return (
    <div className="space-y-6">
      {s.pendingRevenue > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{formatCurrency(s.pendingRevenue)} pending (sent/overdue) — not yet counted in net profit.</span>
        </div>
      )}

      <BusinessReserveDashboard />

      <TakeHomeDashboard />

      <BusinessOverview s={s} year={year} netProfit={netProfit} otherIncomeTotal={otherIncomeTotal} />

      {/* ── Owner Capital Recovery ── */}
      {(() => {
        const ownerDraws = s.ownerDrawTotal ?? 0;
        const totalInjected = capitalEntries.filter(e => e.amount > 0).reduce((acc, e) => acc + e.amount, 0);
        const totalWithdrawn = capitalEntries.filter(e => e.amount < 0).reduce((acc, e) => acc + Math.abs(e.amount), 0);
        const netCapitalInvested = totalInjected - totalWithdrawn;
        const totalEquity = netCapitalInvested + netProfit;
        const businessOwesYou = totalEquity - ownerDraws;
        return (
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-violet-600 flex-shrink-0" />
                <span className="font-semibold text-sm text-foreground">Owner Capital — {year}</span>
              </div>
              <button
                onClick={() => setCapitalForm({ date: new Date().toISOString().split("T")[0], description: "", amount: "", type: "injection" })}
                className="flex items-center gap-1 text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-violet-700 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add Entry
              </button>
            </div>
            <div className="p-5 space-y-4">

              {/* Ledger */}
              {capitalLoading ? (
                <div className="h-12 rounded-xl bg-muted/40 animate-pulse" />
              ) : capitalEntries.length === 0 ? (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  No entries yet.{" "}
                  <button
                    onClick={() => setCapitalForm({ date: new Date().toISOString().split("T")[0], description: "", amount: "", type: "injection" })}
                    className="font-semibold text-violet-600 hover:underline"
                  >Add Entry</button>{" "}
                  to log your first capital contribution.
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="bg-muted/30 px-4 py-2 grid grid-cols-[90px_1fr_80px_28px] gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                    <span>Date</span>
                    <span>Description</span>
                    <span className="text-right">Amount</span>
                    <span />
                  </div>
                  <div className="divide-y divide-border/50">
                    {[...capitalEntries].sort((a, b) => b.date.localeCompare(a.date)).map(entry => (
                      <div key={entry.id} className="px-4 py-2.5 grid grid-cols-[90px_1fr_80px_28px] gap-2 items-center">
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                        </span>
                        <span className="text-xs text-foreground truncate">{entry.description}</span>
                        <span className={`text-xs font-bold text-right ${entry.amount >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                          {entry.amount >= 0 ? "+" : "−"}{formatCurrency(Math.abs(entry.amount))}
                        </span>
                        <button
                          onClick={() => { if (confirm("Delete this entry?")) deleteCapitalEntry.mutate(entry.id); }}
                          className="text-muted-foreground hover:text-red-600 transition-colors justify-self-end"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Equity summary — step by step */}
              <div className="border-t border-border pt-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Total Injected</p>
                    <p className="text-[10px] text-muted-foreground">Money you've put into the business</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-700">+{formatCurrency(totalInjected)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">− Total Withdrawn</p>
                    <p className="text-[10px] text-muted-foreground">Capital returned to you (not operating draws)</p>
                  </div>
                  <span className="text-sm font-bold text-foreground">−{formatCurrency(totalWithdrawn)}</span>
                </div>

                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-violet-50 border border-violet-200">
                  <div>
                    <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">= Net Capital Invested</p>
                    <p className="text-[10px] text-violet-600">Your skin in the game</p>
                  </div>
                  <span className="text-sm font-bold text-violet-700">{formatCurrency(netCapitalInvested)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {netProfit >= 0 ? "+ Business Net Profit (YTD)" : "− Business Net Loss (YTD)"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Revenue minus all business expenses</p>
                  </div>
                  <span className={`text-sm font-bold ${netProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {netProfit >= 0 ? `+${formatCurrency(netProfit)}` : `−${formatCurrency(Math.abs(netProfit))}`}
                  </span>
                </div>

                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-blue-50 border border-blue-200">
                  <div>
                    <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">= Total Equity</p>
                    <p className="text-[10px] text-blue-600">Net capital + business performance</p>
                  </div>
                  <span className="text-sm font-bold text-blue-700">{formatCurrency(totalEquity)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">− Job Pay &amp; Owner Draws</p>
                    <p className="text-[10px] text-muted-foreground">Profit distributions taken from jobs — does not reduce Net Capital Invested</p>
                  </div>
                  <span className="text-sm font-bold text-foreground">−{formatCurrency(ownerDraws)}</span>
                </div>
                {ownerDrawExpenses.length > 0 && (
                  <div className="rounded-xl border border-border/60 overflow-hidden ml-2">
                    <div className="divide-y divide-border/40">
                      {[...ownerDrawExpenses].sort((a, b) => b.date.localeCompare(a.date)).map(e => (
                        <div key={e.id} className="px-3 py-2 grid grid-cols-[80px_1fr_72px_24px] gap-2 items-center">
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(e.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                          </span>
                          <span className="text-[11px] text-foreground truncate">{e.description}</span>
                          <span className="text-[11px] font-semibold text-right text-red-600">−{formatCurrency(parseFloat(String(e.amount)))}</span>
                          <button
                            onClick={() => { if (confirm("Delete this owner draw?")) deleteOwnerDraw.mutate(e.id); }}
                            className="text-muted-foreground hover:text-red-600 transition-colors justify-self-end"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-border" />

                <div className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 ${businessOwesYou >= 0 ? "border-violet-300 bg-violet-50" : "border-red-300 bg-red-50"}`}>
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-wide ${businessOwesYou >= 0 ? "text-violet-700" : "text-red-700"}`}>
                      {businessOwesYou >= 0 ? "= Business Owes You" : "= Still in the Hole"}
                    </p>
                    <p className={`text-[10px] mt-0.5 ${businessOwesYou >= 0 ? "text-violet-600" : "text-red-500"}`}>
                      {businessOwesYou >= 0
                        ? "Your equity minus draws already paid out"
                        : "Business hasn't earned back your investment yet"}
                    </p>
                  </div>
                  <span className={`text-xl font-black ${businessOwesYou >= 0 ? "text-violet-700" : "text-red-600"}`}>{formatCurrency(Math.abs(businessOwesYou))}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Add Capital Entry Dialog ── */}
      {capitalForm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setCapitalForm(null); }}>
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-sm border border-border">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-base">Add Capital Entry</h3>
              <button onClick={() => setCapitalForm(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!capitalForm) return;
                setCapitalSaving(true);
                try {
                  const raw = parseFloat(capitalForm.amount);
                  if (isNaN(raw) || raw <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
                  const finalAmount = capitalForm.type === "withdrawal" ? -raw : raw;
                  await createCapitalEntry.mutateAsync({ date: capitalForm.date, description: capitalForm.description.trim(), amount: finalAmount, businessId: capitalBizId });
                  setCapitalForm(null);
                } catch {
                  toast({ title: "Error", description: "Could not save entry.", variant: "destructive" });
                } finally {
                  setCapitalSaving(false);
                }
              }}
              className="p-5 space-y-4"
            >
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCapitalForm(f => f ? { ...f, type: "injection" } : f)}
                  className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${capitalForm.type === "injection" ? "bg-emerald-600 text-white border-emerald-600" : "bg-muted text-muted-foreground border-border hover:bg-muted/80"}`}
                >
                  + Put In
                </button>
                <button
                  type="button"
                  onClick={() => setCapitalForm(f => f ? { ...f, type: "withdrawal" } : f)}
                  className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${capitalForm.type === "withdrawal" ? "bg-red-600 text-white border-red-600" : "bg-muted text-muted-foreground border-border hover:bg-muted/80"}`}
                >
                  − Take Out
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Date</label>
                <input
                  type="date"
                  required
                  value={capitalForm.date}
                  onChange={e => setCapitalForm(f => f ? { ...f, date: e.target.value } : f)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Description</label>
                <input
                  type="text"
                  required
                  placeholder={capitalForm.type === "injection" ? "e.g. Put in from personal checking" : "e.g. Returned to personal savings"}
                  value={capitalForm.description}
                  onChange={e => setCapitalForm(f => f ? { ...f, description: e.target.value } : f)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={capitalForm.amount}
                    onChange={e => setCapitalForm(f => f ? { ...f, amount: e.target.value } : f)}
                    className="w-full pl-7 pr-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setCapitalForm(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={capitalSaving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  {capitalSaving ? "Saving…" : "Save Entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Direct Job Costs vs Overhead ── */}
      {(() => {
        const revenue = s.paidRevenue ?? 0;
        const directJobCosts: number = s.directJobCosts ?? 0;
        const overheadCosts: number = s.overheadCosts ?? 0;
        const grossMargin: number = s.grossMargin ?? (revenue - directJobCosts);
        const directCats: { category: string; amount: number; count: number }[] = Array.isArray(data.directJobCostsByCategory) ? data.directJobCostsByCategory : [];
        const overheadCats: { category: string; amount: number; count: number }[] = Array.isArray(data.overheadByCategory) ? data.overheadByCategory : [];
        const grossMarginPct = revenue > 0 ? (grossMargin / revenue) * 100 : 0;
        const netProfitForCard = s.netProfit ?? 0;

        return (
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center gap-2">
              <PieChart className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span className="font-semibold text-sm text-foreground">Cost Breakdown — {year}</span>
              <span className="text-xs text-muted-foreground ml-1">Job costs vs overhead</span>
            </div>
            <div className="p-5 space-y-3">

              {/* Revenue row */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Revenue Collected</span>
                <span className="text-sm font-bold text-emerald-700">{formatCurrency(revenue)}</span>
              </div>

              {/* Direct Job Costs */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">− Direct Job Costs</p>
                    <p className="text-[10px] text-blue-600 mt-0.5">Materials, subs &amp; supplies tied to specific jobs</p>
                  </div>
                  <span className="text-sm font-bold text-blue-800">−{formatCurrency(directJobCosts)}</span>
                </div>
                {directCats.length > 0 && (
                  <div className="border-t border-blue-200 divide-y divide-blue-100">
                    {directCats.map(c => (
                      <div key={c.category} className="flex items-center justify-between px-4 py-1.5">
                        <span className="text-xs text-blue-700">{c.category} <span className="text-blue-400">({c.count})</span></span>
                        <span className="text-xs font-semibold text-blue-800">{formatCurrency(c.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {directCats.length === 0 && (
                  <div className="px-4 py-2 border-t border-blue-200 text-xs text-blue-500 italic">
                    No job-linked expenses yet — link expenses to jobs to track direct costs
                  </div>
                )}
              </div>

              {/* Gross Margin */}
              <div className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 ${grossMargin >= 0 ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wide ${grossMargin >= 0 ? "text-emerald-700" : "text-red-700"}`}>= Gross Margin</p>
                  <p className={`text-[10px] mt-0.5 ${grossMargin >= 0 ? "text-emerald-600" : "text-red-500"}`}>Revenue minus direct job costs · {grossMarginPct.toFixed(0)}% margin</p>
                </div>
                <span className={`text-lg font-black ${grossMargin >= 0 ? "text-emerald-700" : "text-red-600"}`}>{formatCurrency(grossMargin)}</span>
              </div>

              {/* Overhead */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">− Overhead</p>
                    <p className="text-[10px] text-amber-600 mt-0.5">Fixed costs not tied to a specific job</p>
                  </div>
                  <span className="text-sm font-bold text-amber-800">−{formatCurrency(overheadCosts)}</span>
                </div>
                {overheadCats.length > 0 && (
                  <div className="border-t border-amber-200 divide-y divide-amber-100">
                    {overheadCats.map(c => (
                      <div key={c.category} className="flex items-center justify-between px-4 py-1.5">
                        <span className="text-xs text-amber-700">{c.category} <span className="text-amber-400">({c.count})</span></span>
                        <span className="text-xs font-semibold text-amber-800">{formatCurrency(c.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {overheadCats.length === 0 && (
                  <div className="px-4 py-2 border-t border-amber-200 text-xs text-amber-500 italic">
                    No overhead expenses yet
                  </div>
                )}
              </div>

              {/* Net Profit */}
              <div className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 ${netProfitForCard >= 0 ? "border-emerald-400 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wide ${netProfitForCard >= 0 ? "text-emerald-700" : "text-red-700"}`}>= Net Profit</p>
                  <p className={`text-[10px] mt-0.5 ${netProfitForCard >= 0 ? "text-emerald-600" : "text-red-500"}`}>Gross margin minus overhead</p>
                </div>
                <span className={`text-lg font-black ${netProfitForCard >= 0 ? "text-emerald-700" : "text-red-600"}`}>{formatCurrency(netProfitForCard)}</span>
              </div>

              <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                Direct job costs = expenses linked to a specific job. Overhead = business costs not tied to any job (insurance, tools, advertising, etc.). Link expenses to jobs when logging to keep this split accurate.
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── Partner Profit Split (member-aware) ── */}
      {(() => {
        const memberSubList = (allSubsForSplit as any[]).filter(s => s.role === 'member');
        const totalShares = memberSubList.length + 1;
        const profitToSplit = netProfit;
        const ownerDraw = s.ownerDrawTotal ?? 0;

        if (memberSubList.length === 0) {
          return (
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center gap-2 flex-wrap">
                <PieChart className="w-4 h-4 text-violet-600 flex-shrink-0" />
                <span className="font-semibold text-sm text-foreground">Partner Profit Split — {year}</span>
              </div>
              <div className="p-5 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No member subs configured yet.</p>
                <p className="text-xs text-muted-foreground">Open a subcontractor's profile and set their Role to <strong>Member</strong> to enable the member-aware profit split.</p>
              </div>
            </div>
          );
        }

        const eachShare = profitToSplit > 0 ? profitToSplit / totalShares : 0;
        const participants = [
          { id: "owner", label: "You (Owner)", paid: ownerDraw, balance: eachShare - ownerDraw },
          ...memberSubList.map((ms: any) => ({
            id: String(ms.id),
            label: ms.name,
            paid: ms.ytdPayments ?? 0,
            balance: eachShare - (ms.ytdPayments ?? 0),
          })),
        ];
        const totalPaid = participants.reduce((s, p) => s + p.paid, 0);
        const totalRemaining = participants.reduce((s, p) => s + Math.max(0, p.balance), 0);

        return (
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center gap-2 flex-wrap">
              <PieChart className="w-4 h-4 text-violet-600 flex-shrink-0" />
              <span className="font-semibold text-sm text-foreground">Partner Profit Split — {year}</span>
              <span className="text-xs text-muted-foreground">Even split · 1 owner + {memberSubList.length} member{memberSubList.length !== 1 ? "s" : ""}</span>
            </div>
            {profitToSplit <= 0 ? (
              <div className="p-6 text-center space-y-1">
                <p className="text-sm font-medium text-muted-foreground">No profit to split yet for {year}.</p>
                <p className="text-xs text-muted-foreground">Once collected revenue exceeds business expenses, the partner split will appear here.</p>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 mb-0.5">Profit to Split</p>
                    <p className="text-xs text-violet-600">Collected revenue after all business expenses</p>
                  </div>
                  <p className="text-2xl font-black text-violet-800">{formatCurrency(profitToSplit)}</p>
                </div>

                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Partner</th>
                        <th className="px-4 py-2.5 text-right">Share ({Math.round(100 / totalShares)}%)</th>
                        <th className="px-4 py-2.5 text-right">Paid Out</th>
                        <th className="px-4 py-2.5 text-right">Still Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {participants.map(({ id, label, paid, balance }) => (
                        <tr key={id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-semibold text-foreground">{label}</td>
                          <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(eachShare)}</td>
                          <td className="px-4 py-3 text-right text-emerald-600 font-medium">{formatCurrency(paid)}</td>
                          <td className="px-4 py-3 text-right font-bold">
                            {balance <= 0 ? (
                              <span className="text-emerald-600">
                                {balance < -0.005 ? `${formatCurrency(-balance)} ahead` : "Fully paid"}
                              </span>
                            ) : (
                              <span className="text-amber-600">{formatCurrency(balance)} due</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30 border-t border-border text-xs font-semibold">
                      <tr>
                        <td className="px-4 py-2.5 text-muted-foreground">Totals</td>
                        <td className="px-4 py-2.5 text-right text-foreground">{formatCurrency(profitToSplit)}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-600">{formatCurrency(totalPaid)}</td>
                        <td className="px-4 py-2.5 text-right text-amber-600">{formatCurrency(totalRemaining)} remaining</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {participants.every(p => p.balance <= 0) && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <p className="text-sm font-semibold text-emerald-700">All settled — every partner is fully paid out for {year}.</p>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  "Paid out" to you is your owner draw total. "Paid out" to each member is their YTD subcontractor payment total for {year}.
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Revenue by City — always visible ── */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="font-semibold text-sm text-foreground">Revenue by City</span>
          <span className="text-xs text-muted-foreground ml-1">— track for occupational license &amp; tax filings</span>
        </div>
        {(data.incomeByCity ?? []).length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-20" />
            No invoices with city data yet. Add a city to your invoices to track local tax obligations.
          </div>
        ) : (
          <>
          {(data.incomeByCity ?? []).length === 1 && data.incomeByCity[0]?.city === "Unspecified" && (
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                All of your invoices are missing a city. Edit each invoice and add a city so revenue is tracked correctly for local tax purposes.
              </p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                <tr>
                  <th className="px-5 py-3 text-left">City</th>
                  <th className="px-5 py-3 text-left">ST</th>
                  <th className="px-5 py-3 text-right">Items</th>
                  <th className="px-5 py-3 text-right">Gross Income</th>
                  <th className="px-5 py-3 text-right">Collected</th>
                  <th className="px-5 py-3 text-right">Est. Occ. Tax</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const sorted = [...(data.incomeByCity ?? [])].sort((a: any, b: any) => {
                    if (a.city === "Unspecified") return 1;
                    if (b.city === "Unspecified") return -1;
                    if (a.city?.toLowerCase() === "owensboro") return -1;
                    if (b.city?.toLowerCase() === "owensboro") return 1;
                    return b.gross - a.gross;
                  });
                  const onlyUnspecified = sorted.length === 1 && sorted[0].city === "Unspecified";
                  return sorted.map((row: any) => {
                  const isOwensboro = row.city?.toLowerCase() === "owensboro";
                  const isUnspecified = row.city === "Unspecified";
                  const cityKey = `${row.city}||${row.state}`;
                  const isExpanded = expandedCity === cityKey;

                  const cityRecords: any[] = (data.invoiceRecords ?? []).filter((r: any) => {
                    const rCity = (r.city ?? "").trim();
                    const rState = (r.state ?? "").trim();
                    if (isUnspecified) {
                      return r.type === "invoice" && !rCity;
                    }
                    return rCity.toLowerCase() === (row.city ?? "").toLowerCase() &&
                           rState.toLowerCase() === (row.state ?? "").toLowerCase();
                  });

                  return (
                    <React.Fragment key={cityKey}>
                      <tr
                        onClick={() => setExpandedCity(isExpanded ? null : cityKey)}
                        className={`cursor-pointer border-b border-border/50 transition-colors ${
                          isOwensboro ? "bg-amber-50/50 hover:bg-amber-50" :
                          isUnspecified ? "bg-muted/20 hover:bg-muted/40" :
                          "hover:bg-muted/20"
                        }`}
                      >
                        <td className="px-5 py-3 font-semibold text-foreground">
                          <span className="flex items-center gap-1.5">
                            {isExpanded
                              ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            }
                            {isUnspecified
                              ? <span className="text-muted-foreground font-normal italic">No city set</span>
                              : row.city
                            }
                            {isOwensboro && <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-800">Occ Tax</span>}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{row.state || "—"}</td>
                        <td className="px-5 py-3 text-right text-muted-foreground">{row.invoiceCount}</td>
                        <td className="px-5 py-3 text-right font-medium">{formatCurrency(row.gross)}</td>
                        <td className="px-5 py-3 text-right text-emerald-600 font-medium">{formatCurrency(row.paid)}</td>
                        <td className="px-5 py-3 text-right text-amber-600 font-medium">{row.estOccTax > 0 ? formatCurrency(row.estOccTax) : <span className="text-muted-foreground">—</span>}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-border/50">
                          <td colSpan={6} className="px-0 py-0 bg-muted/10">
                            {cityRecords.length === 0 ? (
                              <div className="px-8 py-4 text-sm text-muted-foreground italic">
                                {isUnspecified
                                  ? "Invoices without a city set land here. Edit each invoice to assign a city."
                                  : "No individual records found for this city."}
                              </div>
                            ) : (
                              <table className="w-full text-xs border-t border-border/30">
                                <thead>
                                  <tr className="bg-muted/30 text-muted-foreground uppercase font-semibold">
                                    <th className="px-6 py-2 text-left">Date</th>
                                    <th className="px-4 py-2 text-left">Invoice # / Type</th>
                                    <th className="px-4 py-2 text-left">Client / Source</th>
                                    <th className="px-4 py-2 text-right">Amount</th>
                                    <th className="px-4 py-2 text-right">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30">
                                  {cityRecords.map((r: any, i: number) => {
                                    const statusStyles: Record<string, string> = {
                                      paid: "bg-emerald-100 text-emerald-700",
                                      sent: "bg-blue-100 text-blue-700",
                                      overdue: "bg-red-100 text-red-700",
                                      draft: "bg-muted text-muted-foreground",
                                    };
                                    const statusLabel = r.status === "paid" ? "Paid" : r.status === "sent" ? "Sent" : r.status === "overdue" ? "Overdue" : r.status === "draft" ? "Draft" : r.status;
                                    const isInvoice = r.type === "invoice";
                                    return (
                                      <tr
                                        key={isInvoice ? `inv-${r.id ?? i}` : `oi-${r.issueDate}-${i}`}
                                        onClick={isInvoice && r.id ? () => navigate(`/invoices?openInvoice=${r.id}`) : undefined}
                                        title={isInvoice && r.id ? `Open invoice ${r.invoiceNumber}` : undefined}
                                        className={`transition-colors ${isInvoice && r.id ? "cursor-pointer hover:bg-primary/5 group" : "hover:bg-muted/20"}`}
                                      >
                                        <td className="px-6 py-2.5 text-muted-foreground whitespace-nowrap">
                                          {r.issueDate ? new Date(r.issueDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                                        </td>
                                        <td className="px-4 py-2.5 font-medium">
                                          {isInvoice
                                            ? <span className="flex items-center gap-1 text-foreground font-mono">
                                                {r.invoiceNumber}
                                                <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                              </span>
                                            : <span className="text-teal-700">{r.jobTitle || "Other Income"}</span>
                                          }
                                        </td>
                                        <td className="px-4 py-2.5 text-muted-foreground">{r.clientName || "—"}</td>
                                        <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(r.total ?? 0)}</td>
                                        <td className="px-4 py-2.5 text-right">
                                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${statusStyles[r.status] ?? "bg-muted text-muted-foreground"}`}>
                                            {statusLabel}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                  });
                })()}
              </tbody>
              <tfoot className="bg-muted/30 border-t border-border font-semibold text-sm">
                <tr>
                  <td colSpan={3} className="px-5 py-3 text-foreground">Totals</td>
                  <td className="px-5 py-3 text-right">{formatCurrency((data.incomeByCity ?? []).reduce((a: number, r: any) => a + r.gross, 0))}</td>
                  <td className="px-5 py-3 text-right text-emerald-600">{formatCurrency((data.incomeByCity ?? []).reduce((a: number, r: any) => a + r.paid, 0))}</td>
                  <td className="px-5 py-3 text-right text-amber-600">{formatCurrency((data.incomeByCity ?? []).reduce((a: number, r: any) => a + (r.estOccTax ?? 0), 0))}</td>
                </tr>
              </tfoot>
            </table>
            <div className="px-5 py-2.5 bg-blue-50/60 border-t border-blue-100 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800">
                Cities with revenue may require an occupational license and local tax filing. Owensboro occ. tax is tracked automatically. For other cities, check with that city's revenue office.
              </p>
            </div>
          </div>
          </>
        )}
      </div>

      {/* ── Other Income — always visible ── */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-teal-600 flex-shrink-0" />
            <span className="font-semibold text-sm text-foreground">Other Income</span>
            {otherIncomeTotal > 0 && <span className="text-sm font-bold text-teal-600">{formatCurrency(otherIncomeTotal)}</span>}
            <span className="text-xs text-muted-foreground">Cash jobs, pre-app payments, retainers</span>
          </div>
          {canEdit("invoices") && !oiForm && (
            <button onClick={openAddOI} className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Entry
            </button>
          )}
        </div>
        {oiForm && (
          <form onSubmit={handleSaveOI} className="px-5 py-4 border-b border-border bg-muted/20 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">{oiForm.id ? "Edit Entry" : "New Other Income"}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Amount *</label>
                <input type="number" step="0.01" min="0" required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="0.00" value={oiForm.amount ?? ""} onChange={e => setOiForm(f => f ? { ...f, amount: e.target.value } : f)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Date *</label>
                <input type="date" required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={oiForm.date ?? ""} onChange={e => setOiForm(f => f ? { ...f, date: e.target.value } : f)} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Description *</label>
              <input type="text" required
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="e.g. Cash payment for fence repair" value={oiForm.description ?? ""} onChange={e => setOiForm(f => f ? { ...f, description: e.target.value } : f)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Client <span className="font-normal">(optional)</span></label>
              <select className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                value={oiForm.clientId ?? ""} onChange={e => setOiForm(f => f ? { ...f, clientId: e.target.value ? parseInt(e.target.value) : null } : f)}>
                <option value="">— No client —</option>
                {clientsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Received From</label>
                <input type="text" className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="Client or payer name (optional)" value={oiForm.source ?? ""} onChange={e => setOiForm(f => f ? { ...f, source: e.target.value } : f)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Payment Method</label>
                <select className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={oiForm.paymentMethod ?? "cash"} onChange={e => setOiForm(f => f ? { ...f, paymentMethod: e.target.value } : f)}>
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">City</label>
                <input type="text" className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="e.g. Lexington (optional)" value={oiForm.city ?? ""} onChange={e => setOiForm(f => f ? { ...f, city: e.target.value } : f)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">State</label>
                <input type="text" maxLength={2} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="e.g. KY (optional)" value={oiForm.state ?? ""} onChange={e => setOiForm(f => f ? { ...f, state: e.target.value.toUpperCase() } : f)} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Notes</label>
              <input type="text" className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="Optional notes" value={oiForm.notes ?? ""} onChange={e => setOiForm(f => f ? { ...f, notes: e.target.value } : f)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Business Line <span className="font-normal">(optional)</span></label>
              <div className="flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg border border-border flex-wrap">
                <button type="button" onClick={() => setOiForm(f => f ? { ...f, businessLine: "" } : f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${!oiForm.businessLine ? "bg-white text-gray-800 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Untagged</button>
                {businesses.map(b => (
                  <button key={b.id} type="button" onClick={() => setOiForm(f => f ? { ...f, businessLine: b.slug } : f)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${oiForm.businessLine === b.slug ? "bg-blue-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setOiForm(null)}
                className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button type="submit" disabled={oiSaving}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-60 shadow">
                {oiSaving ? "Saving…" : oiForm.id ? "Save Changes" : "Add Entry"}
              </button>
            </div>
          </form>
        )}
        {oiLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">Loading…</div>
        ) : otherIncomeRows.length === 0 && !oiForm ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-20" />
            No other income entries for {year}. Click "Add Entry" to record cash jobs, pre-app payments, etc.
          </div>
        ) : otherIncomeRows.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Description</th>
                    <th className="px-4 py-3 text-left">From</th>
                    <th className="px-4 py-3 text-left">City, ST</th>
                    <th className="px-4 py-3 text-left">Method</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    {canEdit("invoices") && <th className="px-4 py-3 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(otherIncomeRows as any[]).map((row: any) => (
                    <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{row.date}</td>
                      <td className="px-4 py-2.5 font-medium text-foreground">{row.description}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {row.clientId ? (clientsList.find(c => c.id === row.clientId)?.name ?? row.source ?? "—") : (row.source || "—")}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {row.city && row.state ? `${row.city}, ${row.state}` : row.city || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                          {PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-teal-700">{formatCurrency(parseFloat(row.amount))}</td>
                      {canEdit("invoices") && (
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEditOI(row)} title="Edit"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteOI(row.id)} title="Delete"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 border-t border-border font-semibold text-sm">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-foreground">{otherIncomeRows.length} entr{otherIncomeRows.length !== 1 ? "ies" : "y"}</td>
                    <td className="px-4 py-3 text-right text-teal-700">{formatCurrency(otherIncomeTotal)}</td>
                    {canEdit("invoices") && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
            {canEdit("invoices") && !oiForm && (
              <div className="px-4 py-2.5 border-t border-border">
                <button onClick={openAddOI} className="flex items-center gap-1.5 text-xs text-teal-600 font-semibold hover:underline">
                  <Plus className="w-3.5 h-3.5" /> Add another entry
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* ── Outstanding Sub Payments ── */}
      {(() => {
        const outstanding: any[] = data.outstandingSubPayments ?? [];
        const total: number = data.outstandingSubTotal ?? 0;
        if (outstanding.length === 0) return null;
        return (
          <div className="bg-card border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-amber-50/80 border-b border-amber-200 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="font-semibold text-sm text-amber-900">Outstanding Sub Payments</span>
                <span className="text-sm font-bold text-amber-700">{formatCurrency(total)}</span>
              </div>
              <span className="text-xs text-amber-700/80">Subs not yet marked paid</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-amber-50/60 text-amber-800 text-xs uppercase font-semibold border-b border-amber-100">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Subcontractor</th>
                    <th className="px-4 py-2.5 text-left">Job</th>
                    <th className="px-4 py-2.5 text-left">Type</th>
                    <th className="px-4 py-2.5 text-right">Amount Owed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100/60">
                  {outstanding.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-amber-50/40 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">{row.subName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{row.jobTitle || "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700">
                          {row.compensationType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-amber-700">
                        {row.amount != null ? formatCurrency(row.amount) : <span className="text-muted-foreground italic">TBD</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-amber-50/60 border-t border-amber-200 font-semibold text-sm">
                  <tr>
                    <td colSpan={3} className="px-4 py-2.5 text-amber-800">{outstanding.length} unpaid sub{outstanding.length !== 1 ? "s" : ""}</td>
                    <td className="px-4 py-2.5 text-right text-amber-700">{formatCurrency(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-5 py-2.5 bg-amber-50/40 border-t border-amber-100 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                These amounts are not in your expense totals yet. Go to the job card and click <strong>Mark Paid</strong> to record the payment and add it to your books.
              </p>
            </div>
          </div>
        );
      })()}

      <p className="text-xs text-muted-foreground text-center pb-2">
        Auto-generated from your invoices, expenses, mileage logs, and subcontractor records. Always verify with your accountant before filing.
      </p>
    </div>
  );
}


export default OverviewTab;
