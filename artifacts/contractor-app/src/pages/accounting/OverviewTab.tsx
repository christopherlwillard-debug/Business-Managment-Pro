import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, DollarSign, MapPin, AlertCircle, CheckCircle2,
  AlertTriangle, Calendar, ExternalLink, ChevronDown, CheckCircle,
  Plus, Pencil, Trash2, X, PieChart, ChevronRight, Upload, Eye, EyeOff,
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

// ─── Overview Dashboard ──────────────────────────────────────────────────────

function OverviewTab({ data, year, setActiveTab }: { data: any; year: number; setActiveTab: (tab: AccountingTab) => void }) {
  const { activeBusiness } = useBusiness();
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

  const pendingAmt = (s.grossRevenue ?? 0) - (s.paidRevenue ?? 0);

  return (
    <div className="space-y-6">
      {s.pendingRevenue > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{formatCurrency(s.pendingRevenue)} pending (sent/overdue) — not yet counted in net profit.</span>
        </div>
      )}

      {/* ── Estimated Tax Owed — hero card ── */}
      {data.estimatedTaxes && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl overflow-hidden shadow-md">
          <div className="px-5 py-3 bg-amber-100 border-b border-amber-300 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0" />
              <span className="font-bold text-sm text-amber-900">Estimated Tax Owed — {year} YTD</span>
            </div>
            <span className="text-xs text-amber-700/80">Based on net profit after expenses &amp; mileage</span>
          </div>
          <div className="p-5 space-y-4">
            <div className="text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 mb-1">Total Estimated Tax Liability</p>
              <p className="text-5xl font-black text-amber-800 leading-none">{formatCurrency(data.estimatedTaxes.totalEstimated)}</p>
            </div>
            <div className={`grid gap-3 ${data.estimatedTaxes.owensboroOccTax > 0 ? "grid-cols-3" : "grid-cols-2"}`}>
              <div className="bg-white/80 rounded-xl p-3 text-center border border-amber-200 shadow-sm">
                <p className="text-[10px] uppercase font-semibold text-amber-700 mb-1">Federal SE Tax</p>
                <p className="text-xl font-bold text-amber-800">{formatCurrency(data.estimatedTaxes.federalSETax)}</p>
                <p className="text-[10px] text-amber-600 mt-0.5">15.3% × 92.35% of net profit</p>
              </div>
              <div className="bg-white/80 rounded-xl p-3 text-center border border-amber-200 shadow-sm">
                <p className="text-[10px] uppercase font-semibold text-amber-700 mb-1">KY State Tax</p>
                <p className="text-xl font-bold text-amber-800">{formatCurrency(data.estimatedTaxes.kyStateTax)}</p>
                <p className="text-[10px] text-amber-600 mt-0.5">4.0% flat rate on net profit</p>
              </div>
              {data.estimatedTaxes.owensboroOccTax > 0 && (
                <div className="bg-white/80 rounded-xl p-3 text-center border border-amber-200 shadow-sm">
                  <p className="text-[10px] uppercase font-semibold text-amber-700 mb-1">Owensboro Occ Tax</p>
                  <p className="text-xl font-bold text-amber-800">{formatCurrency(data.estimatedTaxes.owensboroOccTax)}</p>
                  <p className="text-[10px] text-amber-600 mt-0.5">{((data.estimatedTaxes.owensboroOccRate ?? 0.0139) * 100).toFixed(2)}% of Owensboro gross</p>
                </div>
              )}
            </div>
            <p className="text-[11px] text-amber-700/70 italic text-center">Estimates only — consult a tax professional for your exact figures before filing.</p>
          </div>
        </div>
      )}

      {/* ── Net Profit hero + secondary stat tiles ── */}
      <div className="space-y-3">
        <div className={`rounded-2xl p-5 border-l-4 shadow-sm border border-border ${netProfit >= 0 ? "bg-emerald-50 border-l-emerald-500" : "bg-red-50 border-l-red-500"}`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Est. Net Profit — {year}</p>
              <p className={`text-4xl font-display font-black leading-none ${netProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{formatCurrency(netProfit)}</p>
              <p className="text-xs text-muted-foreground mt-1.5">Collected − Business Expenses − Mileage Deduction</p>
            </div>
            {netProfit >= 0
              ? <TrendingUp className="w-12 h-12 text-emerald-300 flex-shrink-0" />
              : <TrendingDown className="w-12 h-12 text-red-300 flex-shrink-0" />}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border border-l-4 border-l-emerald-500 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0"><DollarSign className="w-3.5 h-3.5" /></div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Collected</p>
            </div>
            <p className="text-xl font-display font-bold text-foreground">{formatCurrency(s.paidRevenue)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{otherIncomeTotal > 0 ? "Invoices + other income" : "Paid invoices only"}</p>
          </div>
          <div className="bg-card border border-border border-l-4 border-l-blue-500 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0"><TrendingUp className="w-3.5 h-3.5" /></div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Total Invoiced</p>
            </div>
            <p className="text-xl font-display font-bold text-foreground">{formatCurrency(s.grossRevenue)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{pendingAmt > 0 ? `${formatCurrency(pendingAmt)} outstanding` : "All collected"}</p>
          </div>
          <div className="bg-card border border-border border-l-4 border-l-red-500 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-6 h-6 rounded-lg bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0"><TrendingDown className="w-3.5 h-3.5" /></div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Expenses</p>
            </div>
            <p className="text-xl font-display font-bold text-foreground">{formatCurrency(s.businessExpenses ?? s.totalExpenses)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">+{formatCurrency(s.mileageDeduction ?? 0)} mileage</p>
          </div>
        </div>
      </div>

      {/* ── Partner Profit Split (50/50) ── */}
      {(() => {
        const profitToSplit = netProfit;
        const ownerDraw = s.ownerDrawTotal ?? 0;
        const subPaid = s.totalSubPayments ?? 0;
        const subs1099 = Array.isArray(data.subcontractor1099) ? data.subcontractor1099 : [];
        const subName: string =
          subs1099.length > 0 && typeof subs1099[0]?.name === "string"
            ? subs1099[0].name
            : "Your Sub";
        const eachShare = profitToSplit > 0 ? profitToSplit / 2 : 0;
        const willardBalance = eachShare - ownerDraw;
        const subBalance = eachShare - subPaid;

        return (
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center gap-2 flex-wrap">
              <PieChart className="w-4 h-4 text-violet-600 flex-shrink-0" />
              <span className="font-semibold text-sm text-foreground">Partner Profit Split — {year}</span>
              <span className="text-xs text-muted-foreground">50/50 after all business expenses</span>
            </div>
            {profitToSplit <= 0 ? (
              <div className="p-6 text-center space-y-1">
                <p className="text-sm font-medium text-muted-foreground">No profit to split yet for {year}.</p>
                <p className="text-xs text-muted-foreground">Once collected revenue exceeds business expenses, the 50/50 split will appear here.</p>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 mb-0.5">Profit to Split</p>
                    <p className="text-xs text-violet-600">Collected revenue after expenses &amp; mileage</p>
                  </div>
                  <p className="text-2xl font-black text-violet-800">{formatCurrency(profitToSplit)}</p>
                </div>

                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Person</th>
                        <th className="px-4 py-2.5 text-right">Owed (50%)</th>
                        <th className="px-4 py-2.5 text-right">Paid Out</th>
                        <th className="px-4 py-2.5 text-right">Still Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {([
                        { label: "You (Willard)", paid: ownerDraw, balance: willardBalance },
                        { label: subName, paid: subPaid, balance: subBalance },
                      ] as { label: string; paid: number; balance: number }[]).map(({ label, paid, balance }) => (
                        <tr key={label} className="hover:bg-muted/20 transition-colors">
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
                        <td className="px-4 py-2.5 text-right text-emerald-600">{formatCurrency(ownerDraw + subPaid)}</td>
                        <td className="px-4 py-2.5 text-right text-amber-600">
                          {formatCurrency(Math.max(0, willardBalance) + Math.max(0, subBalance))} remaining
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {willardBalance <= 0 && subBalance <= 0 && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <p className="text-sm font-semibold text-emerald-700">All settled — both partners are fully paid out for {year}.</p>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  "Paid out" to you is your owner draw total. "Paid out" to {subName} is the total recorded in subcontractor payment records.
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
        {data.incomeByCity.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-20" />
            No invoices with city data yet. Add a city to your invoices to track local tax obligations.
          </div>
        ) : (
          <>
          {data.incomeByCity.length === 1 && data.incomeByCity[0]?.city === "Unspecified" && (
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
                  const sorted = [...data.incomeByCity].sort((a: any, b: any) => {
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
                  <td className="px-5 py-3 text-right">{formatCurrency(data.incomeByCity.reduce((a: number, r: any) => a + r.gross, 0))}</td>
                  <td className="px-5 py-3 text-right text-emerald-600">{formatCurrency(data.incomeByCity.reduce((a: number, r: any) => a + r.paid, 0))}</td>
                  <td className="px-5 py-3 text-right text-amber-600">{formatCurrency(data.incomeByCity.reduce((a: number, r: any) => a + (r.estOccTax ?? 0), 0))}</td>
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
              <div className="flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg border border-border w-fit">
                <button type="button" onClick={() => setOiForm(f => f ? { ...f, businessLine: "" } : f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${!oiForm.businessLine ? "bg-white text-gray-800 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Untagged</button>
                <button type="button" onClick={() => setOiForm(f => f ? { ...f, businessLine: "general_contracting" } : f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${oiForm.businessLine === "general_contracting" ? "bg-blue-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>General Contracting</button>
                <button type="button" onClick={() => setOiForm(f => f ? { ...f, businessLine: "asphalt_sealing" } : f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${oiForm.businessLine === "asphalt_sealing" ? "bg-amber-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Asphalt Sealing</button>
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

      <p className="text-xs text-muted-foreground text-center pb-2">
        Auto-generated from your invoices, expenses, mileage logs, and subcontractor records. Always verify with your accountant before filing.
      </p>
    </div>
  );
}


export default OverviewTab;
